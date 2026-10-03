"""Issue status workflow: task-driven auto-sync, resolution and closure."""
from typing import Any

from fastapi import HTTPException
from sqlalchemy import Connection

from app.db import execute, fetch_one
from app.services.activity import log_activity
from app.services.notifications import notify
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
