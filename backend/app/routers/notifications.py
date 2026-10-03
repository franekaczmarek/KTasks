from fastapi import APIRouter, HTTPException, Query

from app.db import execute, fetch_all, fetch_one
from app.deps import DB, CurrentUser

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
def list_notifications(db: DB, user: CurrentUser, limit: int = Query(20, ge=1, le=100), unread_only: bool = False):
    items = fetch_all(
        db,
        f"""select id, type, message, link, issue_id, read_status, created_at from public.notifications
            where user_id = :me {"and not read_status" if unread_only else ""}
            order by created_at desc, id desc limit :limit""",
        me=user["id"], limit=limit,
    )
    unread = fetch_one(db, "select count(*) as n from public.notifications where user_id = :me and not read_status",
                       me=user["id"])["n"]
    return {"items": items, "unread_count": unread}


@router.post("/{notification_id}/read", status_code=204)
def mark_read(notification_id: int, db: DB, user: CurrentUser):
    row = fetch_one(db, "update public.notifications set read_status = true where id = :id and user_id = :me "
                        "returning id", id=notification_id, me=user["id"])
    if row is None:  # also hides other users' notifications
        raise HTTPException(404, "Notification not found")


@router.post("/read-all", status_code=204)
def mark_all_read(db: DB, user: CurrentUser):
    execute(db, "update public.notifications set read_status = true where user_id = :me and not read_status",
            me=user["id"])
