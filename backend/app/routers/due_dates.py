"""Agreed due date changes: the Lead proposes, the reporter accepts or declines."""
from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import Connection

from app.db import execute, fetch_one
from app.deps import DB, CurrentUser
from app.routers.issues import get_issue, issue_or_404, require_issue_lead
from app.services.activity import log_activity
from app.services.business_days import local_today
from app.services.notifications import notify
from app.services.sla import now

router = APIRouter(tags=["due dates"])

ACTIVE = ("New", "In Progress")


class ChangeRequestIn(BaseModel):
    to_date: date
    reason: str = Field(min_length=5, max_length=1000)


class DecisionIn(BaseModel):
    note: str | None = Field(None, max_length=1000)


def _active_issue(db: Connection, issue_id: int, user: dict[str, Any]) -> dict[str, Any]:
    issue = issue_or_404(db, issue_id, user, lock=True)
    if issue["status"] not in ACTIVE:
        raise HTTPException(409, f"The due date of a {issue['status']} issue can no longer change")
    return issue


def _apply(db: Connection, request_id: int, status: str, user_id, note: str | None) -> None:
    execute(db, "update public.due_date_requests set status = :s, decided_by_user_id = :u, decided_at = :t, "
                "decision_note = :n where id = :id", s=status, u=user_id, t=now(), n=note, id=request_id)


@router.post("/issues/{issue_id}/due-date-requests", status_code=201)
def request_change(issue_id: int, body: ChangeRequestIn, db: DB, user: CurrentUser):
    issue = _active_issue(db, issue_id, user)
    require_issue_lead(user, issue)
    current = issue["expected_end_date"]
    if current is None:
        raise HTTPException(409, "No due date is agreed yet: set it directly")
    if body.to_date == current:
        raise HTTPException(422, "The new due date is the same as the agreed one")
    if body.to_date < local_today():
        raise HTTPException(422, "The due date cannot be in the past")
    if fetch_one(db, "select 1 from public.due_date_requests where issue_id = :i and status = 'pending'", i=issue_id):
        raise HTTPException(409, "A due date change is already waiting for the reporter")
    reason = body.reason.strip()
    row = fetch_one(
        db, """insert into public.due_date_requests (issue_id, requested_by_user_id, from_date, to_date, reason)
               values (:i, :u, :f, :t, :r) returning id""",
        i=issue_id, u=user["id"], f=current, t=body.to_date, r=reason,
    )
    log_activity(db, issue_id, user["id"], "due_date_change_requested", **{"from": current, "to": body.to_date},
                 reason=reason)
    if str(issue["creator_id"]) == str(user["id"]):
        # The Lead reported this issue: there is no one else to approve, so it applies at once (audited).
        _apply(db, row["id"], "accepted", user["id"], "Self-approved: requester is the reporter")
        execute(db, "update public.issues set expected_end_date = :d where id = :id", d=body.to_date, id=issue_id)
        log_activity(db, issue_id, user["id"], "due_date_change_accepted",
                     **{"from": current, "to": body.to_date}, self_approved=True)
    else:
        notify(db, [issue["creator_id"]], "due_date_change_requested",
               f"{user['name']} asks to move the due date of KT-{issue_id} from {current:%d.%m.%Y} "
               f"to {body.to_date:%d.%m.%Y}: please accept or decline",
               issue_id=issue_id, link=f"/issues?issue={issue_id}")
    return get_issue(issue_id, db, user)


def _pending(db: Connection, request_id: int, user: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    req = fetch_one(db, "select * from public.due_date_requests where id = :id", id=request_id)
    if req is None:
        raise HTTPException(404, "Due date request not found")
    issue = _active_issue(db, req["issue_id"], user)
    req = fetch_one(db, "select * from public.due_date_requests where id = :id for update", id=request_id)
    if req["status"] != "pending":
        raise HTTPException(409, f"This request was already {req['status']}")
    return req, issue


def _decide(db: Connection, request_id: int, user: dict[str, Any], accept: bool, note: str | None):
    req, issue = _pending(db, request_id, user)
    if str(issue["creator_id"]) != str(user["id"]):
        raise HTTPException(403, "Only the reporter can accept or decline a due date change")
    note = (note or "").strip() or None
    status = "accepted" if accept else "declined"
    _apply(db, request_id, status, user["id"], note)
    if accept:
        execute(db, "update public.issues set expected_end_date = :d where id = :id", d=req["to_date"], id=issue["id"])
    log_activity(db, issue["id"], user["id"], f"due_date_change_{status}",
                 **{"from": req["from_date"], "to": req["to_date"]}, note=note)
    notify(db, [req["requested_by_user_id"], issue["lead_id"]], f"due_date_change_{status}",
           f"{user['name']} {status} the due date change of KT-{issue['id']} to {req['to_date']:%d.%m.%Y}"
           + (f": {note}" if note else ""),
           issue_id=issue["id"], link=f"/issues?issue={issue['id']}", exclude=user["id"])
    return get_issue(issue["id"], db, user)


@router.post("/due-date-requests/{request_id}/accept")
def accept(request_id: int, db: DB, user: CurrentUser):
    return _decide(db, request_id, user, True, None)


@router.post("/due-date-requests/{request_id}/decline")
def decline(request_id: int, body: DecisionIn, db: DB, user: CurrentUser):
    return _decide(db, request_id, user, False, body.note)


@router.post("/due-date-requests/{request_id}/withdraw")
def withdraw(request_id: int, db: DB, user: CurrentUser):
    req, issue = _pending(db, request_id, user)
    if str(req["requested_by_user_id"]) != str(user["id"]):
        raise HTTPException(403, "Only the Lead who requested the change can withdraw it")
    _apply(db, request_id, "withdrawn", user["id"], None)
    log_activity(db, issue["id"], user["id"], "due_date_change_withdrawn", to=req["to_date"])
    return get_issue(issue["id"], db, user)
