"""Issue status workflow: task-driven auto-sync, resolution and closure."""
from datetime import datetime, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy import Connection

from app.config import get_settings
from app.db import execute, fetch_all, fetch_one
from app.services.business_days import add_business_days
from app.services.activity import log_activity
from app.services.notifications import issue_audience, notify
from app.services.sla import now

OPEN_TASK_SQL = "select count(*) as n from public.tasks where issue_id = :i and status in ('ToDo', 'InProgress')"


def open_task_count(conn: Connection, issue_id: int) -> int:
    return fetch_one(conn, OPEN_TASK_SQL, i=issue_id)["n"]


def start_issue(conn: Connection, issue: dict[str, Any], user_id, reason: str) -> bool:
    """New -> In Progress, stamping start_date. Returns True if the status changed."""
    if issue["status"] != "New":
        return False
    execute(conn, "update public.issues set status = 'In Progress', start_date = coalesce(start_date, :t) "
                  "where id = :id", t=now(), id=issue["id"])
    log_activity(conn, issue["id"], user_id, "status_changed", **{"from": "New", "to": "In Progress", "auto": reason})
    notify(conn, [issue["creator_id"]], "status_changed",
           f"Work started on KT-{issue['id']}: {issue['title']}", issue_id=issue["id"],
           link=f"/issues?issue={issue['id']}", exclude=user_id)
    return True


def on_task_moved(conn: Connection, issue: dict[str, Any], user_id, new_status: str) -> dict[str, Any]:
    """Auto-sync after a task changes column. Returns workflow flags for the client."""
    started = False
    if new_status in ("InProgress", "Done"):
        started = start_issue(conn, issue, user_id, "first task started")
    status = "In Progress" if started else issue["status"]
    completion_prompt = new_status == "Done" and status == "In Progress" and open_task_count(conn, issue["id"]) == 0
    return {"issue_status": status, "issue_started": started, "completion_prompt": completion_prompt}


def resolve_issue(conn: Connection, issue: dict[str, Any], user: dict[str, Any], root_cause: str) -> None:
    if issue["status"] != "In Progress":
        raise HTTPException(409, f"Only issues In Progress can be resolved (current: {issue['status']})")
    if open_task_count(conn, issue["id"]):
        raise HTTPException(409, "All tasks must be Done before resolving")
    execute(
        conn,
        "update public.issues set status = 'Resolved', root_cause = :rc, resolved_at = :t, "
        "resolved_by_user_id = :u where id = :id",
        rc=root_cause, t=now(), u=user["id"], id=issue["id"],
    )
    log_activity(conn, issue["id"], user["id"], "resolved", root_cause=root_cause)
    notify(conn, [issue["creator_id"]], "verification_request",
           f"KT-{issue['id']} was resolved: please confirm the resolution of \"{issue['title']}\"",
           issue_id=issue["id"], link=f"/issues?issue={issue['id']}")


def confirm_resolution(conn: Connection, issue: dict[str, Any], user: dict[str, Any], background=None) -> None:
    """Stage 2: the reporting employee confirms -> Closed, with accountability fields."""
    if str(issue["creator_id"]) != str(user["id"]):
        raise HTTPException(403, "Only the employee who reported the issue can confirm its resolution")
    if issue["status"] != "Resolved":
        raise HTTPException(409, f"Only Resolved issues can be confirmed (current: {issue['status']})")
    execute(conn, "update public.issues set status = 'Closed', closed_by_user_id = :u, closed_at = :t where id = :id",
            u=user["id"], t=now(), id=issue["id"])
    log_activity(conn, issue["id"], user["id"], "closed", confirmed_by=user["name"])
    notify(conn, [issue["lead_id"]], "resolution_confirmed",
           f"{user['name']} confirmed the resolution of KT-{issue['id']}: {issue['title']}",
           issue_id=issue["id"], link=f"/issues?issue={issue['id']}", exclude=user["id"],
           email_leads=True, background=background, subject=f"[KTasks] KT-{issue['id']} closed: resolution confirmed")


def auto_close_due(conn: Connection, at: datetime | None = None) -> list[int]:
    """Close Resolved issues whose reporter hasn't confirmed within N business days."""
    at = at or now()
    days = get_settings().auto_close_business_days
    # 5 business days always span at least 5 calendar days: cheap SQL pre-filter, exact check in Python.
    candidates = fetch_all(
        conn,
        "select * from public.issues where status = 'Resolved' and deleted_at is null and resolved_at <= :cutoff "
        "for update skip locked",
        cutoff=at - timedelta(days=days),
    )
    closed = []
    for issue in candidates:
        if add_business_days(issue["resolved_at"], days) > at:
            continue
        execute(conn, "update public.issues set status = 'Closed', closed_at = :t, closed_by_user_id = null "
                      "where id = :id", t=at, id=issue["id"])
        log_activity(conn, issue["id"], None, "auto_closed", business_days=days)
        notify(conn, [issue["creator_id"], issue["lead_id"]], "auto_closed",
               f"KT-{issue['id']} was closed automatically: no confirmation within {days} business days",
               issue_id=issue["id"], link=f"/issues?issue={issue['id']}")
        closed.append(issue["id"])
    return closed


def reject_issue(conn: Connection, issue: dict[str, Any], user: dict[str, Any], reason: str) -> None:
    """A Lead rejects an issue (not a valid problem, out of scope, duplicate...). Terminal state."""
    if issue["status"] not in ("New", "In Progress"):
        raise HTTPException(409, f"Only New or In Progress issues can be rejected (current: {issue['status']})")
    reason = reason.strip()
    at = now()
    execute(conn, "update public.issues set status = 'Rejected', rejected_reason = :r, rejected_at = :t, "
                  "rejected_by_user_id = :u where id = :id", r=reason, t=at, u=user["id"], id=issue["id"])
    # Open blockers stop counting once the issue is rejected.
    execute(conn, "update public.blockers set is_active = false, resolved_at = :t where issue_id = :id and is_active",
            t=at, id=issue["id"])
    log_activity(conn, issue["id"], user["id"], "rejected", reason=reason, **{"from": issue["status"]})
    notify(conn, issue_audience(conn, issue["id"]), "issue_rejected",
           f"KT-{issue['id']} was rejected by {user['name']}: {reason}",
           issue_id=issue["id"], link=f"/issues?issue={issue['id']}", exclude=user["id"])


def delete_issue(conn: Connection, issue: dict[str, Any], user: dict[str, Any], reason: str | None,
                 background=None) -> None:
    """Soft delete by the reporter or the assigned Lead. Hidden everywhere; row kept for audit."""
    if str(user["id"]) not in (str(issue["creator_id"]), str(issue["lead_id"])):
        raise HTTPException(403, "Only the reporter or the Lead assigned to this issue can delete it")
    if issue["status"] == "Closed":
        raise HTTPException(409, "Closed issues are part of the quality record and cannot be deleted")
    reason = (reason or "").strip() or None
    at = now()
    execute(conn, "update public.issues set deleted_at = :t, deleted_by_user_id = :u, deletion_reason = :r "
                  "where id = :id", t=at, u=user["id"], r=reason, id=issue["id"])
    execute(conn, "update public.blockers set is_active = false, resolved_at = :t where issue_id = :id and is_active",
            t=at, id=issue["id"])
    log_activity(conn, issue["id"], user["id"], "deleted", reason=reason, status=issue["status"])
    notify(conn, issue_audience(conn, issue["id"]), "issue_deleted",
           f"KT-{issue['id']} \"{issue['title']}\" was deleted by {user['name']}" + (f": {reason}" if reason else ""),
           issue_id=issue["id"], link=None, exclude=user["id"], email_leads=True, background=background,
           subject=f"[KTasks] KT-{issue['id']} deleted")
