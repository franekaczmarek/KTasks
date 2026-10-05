from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from app.db import fetch_one
from app.deps import DB, CurrentUser
from app.routers.issues import can_manage, issue_or_404
from app.services.activity import log_activity
from app.services.business_days import business_days
from app.services.notifications import issue_audience, notify
from app.services.sla import now

router = APIRouter(tags=["blockers"])


class BlockerIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


@router.post("/issues/{issue_id}/blockers", status_code=201)
def add_blocker(issue_id: int, body: BlockerIn, db: DB, user: CurrentUser, background: BackgroundTasks):
    issue = issue_or_404(db, issue_id, user)
    if not can_manage(user, issue):
        raise HTTPException(403, "Only the creator or a Lead can manage blockers")
    if issue["status"] in ("Resolved", "Closed", "Rejected"):
        raise HTTPException(409, f"Cannot block a {issue['status'].lower()} issue")
    blocker = fetch_one(
        db,
        "insert into public.blockers (issue_id, reason, created_by_user_id) values (:i, :r, :u) returning *",
        i=issue_id, r=body.reason.strip(), u=user["id"],
    )
    log_activity(db, issue_id, user["id"], "blocker_added", blocker_id=blocker["id"], reason=blocker["reason"])
    notify(db, issue_audience(db, issue_id), "blocker_added",
           f"KT-{issue_id} is BLOCKED: {blocker['reason']}", issue_id=issue_id,
           link=f"/issues?issue={issue_id}", exclude=user["id"], email_leads=True, background=background,
           subject=f"[KTasks] KT-{issue_id} blocked")
    return blocker


@router.post("/blockers/{blocker_id}/resolve")
def resolve_blocker(blocker_id: int, db: DB, user: CurrentUser):
    blocker = fetch_one(db, "select * from public.blockers where id = :id", id=blocker_id)
    if blocker is None:
        raise HTTPException(404, "Blocker not found")
    issue = issue_or_404(db, blocker["issue_id"], user)
    if not can_manage(user, issue):
        raise HTTPException(403, "Only the creator or a Lead can manage blockers")
    if not blocker["is_active"]:
        raise HTTPException(409, "Blocker already resolved")
    resolved = fetch_one(
        db,
        "update public.blockers set is_active = false, resolved_at = :t where id = :id returning *",
        t=now(), id=blocker_id,
    )
    duration = round(business_days(resolved["created_at"], resolved["resolved_at"]), 2)
    log_activity(db, issue["id"], user["id"], "blocker_resolved", blocker_id=blocker_id,
                 reason=blocker["reason"], business_days=duration)
    notify(db, issue_audience(db, issue["id"]), "blocker_resolved",
           f"Blocker resolved on KT-{issue['id']}: {blocker['reason']}", issue_id=issue["id"],
           link=f"/issues?issue={issue['id']}", exclude=user["id"])
    return resolved
