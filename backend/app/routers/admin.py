from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel, Field

from app.deps import DB, CurrentUser, LeadUser
from app.routers.issues import issue_or_404
from app.services.issue_queries import load_issue
from app.services.workflow import auto_close_due, confirm_resolution, reject_issue

router = APIRouter(tags=["closure"])


@router.post("/issues/{issue_id}/confirm-resolution")
def confirm(issue_id: int, db: DB, user: CurrentUser, background: BackgroundTasks):
    issue = issue_or_404(db, issue_id, lock=True)
    confirm_resolution(db, issue, user, background)
    return load_issue(db, issue_id)


class RejectIn(BaseModel):
    reason: str = Field(min_length=5, max_length=1000)


@router.post("/issues/{issue_id}/reject")
def reject(issue_id: int, body: RejectIn, db: DB, user: LeadUser):
    """Lead rejects an issue; a written reason is mandatory."""
    issue = issue_or_404(db, issue_id, lock=True)
    reject_issue(db, issue, user, body.reason)
    return load_issue(db, issue_id)


@router.post("/admin/run-auto-close")
def run_auto_close(db: DB, _: LeadUser):
    """Runs the hourly auto-close job immediately (for Leads / operations)."""
    return {"closed": auto_close_due(db)}
