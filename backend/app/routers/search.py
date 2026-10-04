import re

from fastapi import APIRouter, Query

from app.db import fetch_all
from app.deps import DB, CurrentUser

router = APIRouter(tags=["search"])


@router.get("/search")
def search(db: DB, _: CurrentUser, q: str = Query(min_length=1, max_length=200), limit: int = Query(6, le=20)):
    """Command-palette search across issues, tasks and discussions."""
    pattern = f"%{q.strip()}%"
    id_match = re.fullmatch(r"(?:kt-?)?#?(\d+)", q.strip(), re.IGNORECASE)
    issue_id = int(id_match.group(1)) if id_match else None
    issues = fetch_all(
        db,
        """select id, title, status, area from public.issues
           where deleted_at is null and (id = :issue_id or title ilike :p or summary ilike :p)
           order by (id = :issue_id) desc nulls last, similarity(title, :q) desc, created_at desc
           limit :limit""",
        issue_id=issue_id, p=pattern, q=q, limit=limit,
    )
    tasks = fetch_all(
        db,
        """select t.id, t.title, t.status, t.issue_id, i.title as issue_title
           from public.tasks t join public.issues i on i.id = t.issue_id
           where i.deleted_at is null and (t.title ilike :p or t.summary ilike :p)
           order by t.updated_at desc limit :limit""",
        p=pattern, limit=limit,
    )
    discussions = fetch_all(
        db,
        """select distinct on (c.issue_id) c.issue_id, i.title as issue_title, c.content as snippet, c.created_at
           from public.comments c join public.issues i on i.id = c.issue_id
           where i.deleted_at is null and c.content ilike :p
           order by c.issue_id, c.created_at desc limit :limit""",
        p=pattern, limit=limit,
    )
    return {"issues": issues, "tasks": tasks, "discussions": discussions}
