from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.db import execute, fetch_all, fetch_one
from app.deps import DB, CurrentUser
from app.routers.issues import add_participant, issue_or_404
from app.services.notifications import issue_audience, notify
from app.services.sla import now

router = APIRouter(tags=["discussions"])

_COMMENT_SELECT = """
    select c.id, c.issue_id, c.user_id, u.name as user_name, u.role as user_role,
           c.content, c.created_at, c.updated_at, c.is_edited
    from public.comments c join public.users u on u.id = c.user_id
"""


class CommentIn(BaseModel):
    content: str = Field(min_length=1, max_length=5000)


@router.get("/discussions")
def discussions(db: DB, user: CurrentUser, include_closed: bool = False):
    """Inbox: issues ordered by latest activity with last-comment preview and unread count."""
    return fetch_all(
        db,
        f"""
        with last as (
            select distinct on (c.issue_id) c.issue_id, c.content, c.created_at, u.name as user_name
            from public.comments c join public.users u on u.id = c.user_id
            order by c.issue_id, c.created_at desc
        )
        select i.id, i.title, i.status, i.priority, i.area,
               last.content as last_comment, last.user_name as last_comment_by,
               last.created_at as last_comment_at,
               greatest(i.updated_at, coalesce(last.created_at, i.created_at)) as last_activity_at,
               (p.user_id is not null) as is_participant,
               case when p.user_id is null then 0 else (
                   select count(*) from public.comments c
                   where c.issue_id = i.id and c.user_id <> :me and c.created_at > p.last_read_at
               ) end as unread_count
        from public.issues i
        left join last on last.issue_id = i.id
        left join public.issue_participants p on p.issue_id = i.id and p.user_id = :me
        where {"true" if include_closed else "i.status not in ('Closed', 'Rejected')"}
        order by last_activity_at desc
        """,
        me=user["id"],
    )


@router.get("/issues/{issue_id}/comments")
def list_comments(issue_id: int, db: DB, _: CurrentUser):
    issue_or_404(db, issue_id)
    return fetch_all(db, f"{_COMMENT_SELECT} where c.issue_id = :id order by c.created_at, c.id", id=issue_id)


@router.post("/issues/{issue_id}/comments", status_code=201)
def add_comment(issue_id: int, body: CommentIn, db: DB, user: CurrentUser):
    issue = issue_or_404(db, issue_id)
    content = body.content.strip()
    if not content:
        raise HTTPException(422, "Comment cannot be empty")
    row = fetch_one(
        db, "insert into public.comments (issue_id, user_id, content) values (:i, :u, :c) returning id",
        i=issue_id, u=user["id"], c=content,
    )
    add_participant(db, issue_id, user["id"])
    execute(db, "update public.issue_participants set last_read_at = :t where issue_id = :i and user_id = :u",
            t=now(), i=issue_id, u=user["id"])
    preview = content if len(content) <= 120 else content[:117] + "…"
    notify(db, issue_audience(db, issue_id), "comment",
           f"{user['name']} commented on KT-{issue_id} ({issue['title']}): {preview}",
           issue_id=issue_id, link=f"/discussions?issue={issue_id}", exclude=user["id"])
    return fetch_one(db, f"{_COMMENT_SELECT} where c.id = :id", id=row["id"])


@router.patch("/comments/{comment_id}")
def edit_comment(comment_id: int, body: CommentIn, db: DB, user: CurrentUser):
    comment = fetch_one(db, "select user_id, content from public.comments where id = :id", id=comment_id)
    if comment is None:
        raise HTTPException(404, "Comment not found")
    if str(comment["user_id"]) != str(user["id"]):
        raise HTTPException(403, "You can only edit your own comments")
    content = body.content.strip()
    if not content:
        raise HTTPException(422, "Comment cannot be empty")
    if content != comment["content"]:
        execute(db, "update public.comments set content = :c, is_edited = true where id = :id",
                c=content, id=comment_id)
    return fetch_one(db, f"{_COMMENT_SELECT} where c.id = :id", id=comment_id)


@router.post("/issues/{issue_id}/read", status_code=204)
def mark_read(issue_id: int, db: DB, user: CurrentUser):
    issue_or_404(db, issue_id)
    execute(db, "update public.issue_participants set last_read_at = :t where issue_id = :i and user_id = :u",
            t=now(), i=issue_id, u=user["id"])
