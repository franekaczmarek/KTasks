import re
from datetime import date
from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

from app.db import execute, fetch_all, fetch_one
from app.deps import DB, CurrentUser, LeadUser
from app.schemas.users import Area
from app.services import storage
from app.services.activity import log_activity
from app.services.issue_queries import load_issue, load_issues
from app.services.notifications import notify
from app.services.routing import resolve_lead
from app.services.sla import now

router = APIRouter(prefix="/issues", tags=["issues"])

Priority = Literal["Low", "Medium", "High", "Critical"]
Effort = Literal["Low", "Medium", "High"]
MAX_FILES, MAX_FILE_BYTES = 5, 10 * 1024 * 1024


def issue_or_404(db, issue_id: int, lock: bool = False) -> dict[str, Any]:
    """lock=True takes a row lock so concurrent workflow changes on one issue are serialized."""
    sql = "select * from public.issues where id = :id" + (" for update" if lock else "")
    issue = fetch_one(db, sql, id=issue_id)
    if issue is None:
        raise HTTPException(404, "Issue not found")
    return issue


def can_manage(user: dict[str, Any], issue: dict[str, Any]) -> bool:
    return user["role"] == "lead" or str(user["id"]) == str(issue["creator_id"])


def add_participant(db, issue_id: int, user_id) -> None:
    execute(
        db,
        "insert into public.issue_participants (issue_id, user_id) values (:i, :u) on conflict do nothing",
        i=issue_id, u=user_id,
    )


def _safe_name(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._")[:100] or "file"


def store_attachments(db, issue_id: int, files: list[UploadFile], user_id) -> None:
    files = [f for f in files if f.filename]
    if len(files) > MAX_FILES:
        raise HTTPException(422, f"At most {MAX_FILES} attachments")
    uploaded: list[str] = []
    try:
        for f in files:
            data = f.file.read(MAX_FILE_BYTES + 1)
            if len(data) > MAX_FILE_BYTES:
                raise HTTPException(413, f"{f.filename} exceeds 10 MB")
            path = f"{issue_id}/{uuid4().hex}-{_safe_name(f.filename)}"
            storage.upload(path, data, f.content_type)
            uploaded.append(path)
            execute(
                db,
                "insert into public.attachments (issue_id, storage_path, filename, mime, size, uploaded_by) "
                "values (:i, :p, :n, :m, :s, :u)",
                i=issue_id, p=path, n=f.filename, m=f.content_type, s=len(data), u=user_id,
            )
    except httpx.HTTPError as exc:
        storage.remove(uploaded)
        raise HTTPException(502, f"Attachment upload failed: {exc}") from exc
    except HTTPException:
        storage.remove(uploaded)
        raise


# ---------- list / search ----------

@router.get("")
def list_issues(
    db: DB, user: CurrentUser,
    status: str | None = None, area: Area | None = None,
    scope: Literal["all", "mine", "assigned"] = "all",
):
    where, params = ["true"], {}
    if status == "open":
        where.append("i.status <> 'Closed'")
    elif status:
        where.append("i.status = :status")
        params["status"] = status
    if area:
        where.append("i.area = :area")
        params["area"] = area
    if scope == "mine":
        where.append("i.creator_id = :me")
        params["me"] = user["id"]
    elif scope == "assigned":
        where.append("i.lead_id = :me")
        params["me"] = user["id"]
    return load_issues(db, " and ".join(where), **params)


@router.get("/duplicates")
def duplicates(db: DB, _: CurrentUser, q: str = Query(max_length=200)):
    """Anti-duplicate guard: open issues whose title resembles the draft title."""
    q = q.strip()
    if len(q) < 3:
        return []
    return fetch_all(
        db,
        """select i.id, i.title, i.status, i.area, i.priority, l.name as lead_name,
                  round(similarity(i.title, :q)::numeric, 2) as score
           from public.issues i left join public.users l on l.id = i.lead_id
           where i.status <> 'Closed'
             and (similarity(i.title, :q) > 0.25 or i.title ilike :p or word_similarity(:q, i.title) > 0.5)
           order by similarity(i.title, :q) desc limit 5""",
        q=q, p=f"%{q}%",
    )


# ---------- create ----------

@router.post("", status_code=201)
def create_issue(
    db: DB, user: CurrentUser, background: BackgroundTasks,
    title: Annotated[str, Form(min_length=3, max_length=200)],
    area: Annotated[Area, Form()],
    priority: Annotated[Priority, Form()],
    effort: Annotated[Effort, Form()],
    summary: Annotated[str, Form(max_length=5000)] = "",
    expected_end_date: Annotated[date | None, Form()] = None,
    files: Annotated[list[UploadFile], File()] = [],  # noqa: B006
):
    route = resolve_lead(db, area)
    lead_id = route["effective_lead_id"] if route else None
    row = fetch_one(
        db,
        """insert into public.issues (title, summary, area, priority, effort, expected_end_date, creator_id, lead_id)
           values (:title, :summary, :area, :priority, :effort, :eed, :creator, :lead) returning id""",
        title=title.strip(), summary=summary.strip(), area=area, priority=priority, effort=effort,
        eed=expected_end_date, creator=user["id"], lead=lead_id,
    )
    issue_id = row["id"]
    add_participant(db, issue_id, user["id"])
    if lead_id:
        add_participant(db, issue_id, lead_id)
    store_attachments(db, issue_id, files, user["id"])
    log_activity(db, issue_id, user["id"], "created", title=title.strip(), priority=priority, area=area,
                 lead_id=lead_id, routed_to_backup=bool(route and route["lead_absent"]))
    if lead_id:
        via = f" (covering for {route['lead_name']})" if route["lead_absent"] else ""
        notify(
            db, [lead_id], "issue_assigned",
            f"New {priority} issue KT-{issue_id} in {area}: {title.strip()}{via}",
            issue_id=issue_id, link=f"/issues?issue={issue_id}", exclude=None,
            email_leads=True, background=background, subject=f"[KTasks] New issue KT-{issue_id}: {title.strip()}",
        )
    return load_issue(db, issue_id)


# ---------- detail ----------

@router.get("/{issue_id}")
def get_issue(issue_id: int, db: DB, _: CurrentUser):
    issue = load_issue(db, issue_id)
    if issue is None:
        raise HTTPException(404, "Issue not found")
    attachments = fetch_all(
        db, "select id, storage_path, filename, mime, size, created_at from public.attachments "
            "where issue_id = :id order by created_at", id=issue_id,
    )
    try:
        urls = storage.signed_urls([a["storage_path"] for a in attachments])
    except httpx.HTTPError:
        urls = {}
    for a in attachments:
        a["url"] = urls.get(a.pop("storage_path"))
    issue["attachments"] = attachments
    issue["participants"] = fetch_all(
        db, "select u.id, u.name, u.role from public.issue_participants p join public.users u on u.id = p.user_id "
            "where p.issue_id = :id order by p.joined_at", id=issue_id,
    )
    return issue


@router.get("/{issue_id}/activity")
def get_activity(issue_id: int, db: DB, _: CurrentUser):
    issue_or_404(db, issue_id)
    return fetch_all(
        db,
        """select a.id, a.action_type, a.details, a.created_at, a.user_id, u.name as user_name
           from public.activity_log a left join public.users u on u.id = a.user_id
           where a.issue_id = :id order by a.created_at, a.id""",
        id=issue_id,
    )


@router.post("/{issue_id}/attachments", status_code=201)
def add_attachments(issue_id: int, db: DB, user: CurrentUser, files: Annotated[list[UploadFile], File()]):
    issue = issue_or_404(db, issue_id)
    if not can_manage(user, issue):
        raise HTTPException(403, "Only the creator or a Lead can add attachments")
    store_attachments(db, issue_id, files, user["id"])
    log_activity(db, issue_id, user["id"], "attachments_added", files=[f.filename for f in files])
    return get_issue(issue_id, db, user)


@router.post("/{issue_id}/join")
def join_thread(issue_id: int, db: DB, user: CurrentUser):
    """Anti-duplicate guard: follow an existing issue instead of filing a duplicate."""
    issue_or_404(db, issue_id)
    existing = fetch_one(db, "select 1 from public.issue_participants where issue_id = :i and user_id = :u",
                         i=issue_id, u=user["id"])
    if not existing:
        add_participant(db, issue_id, user["id"])
        log_activity(db, issue_id, user["id"], "joined_thread")
    return {"joined": True, "issue_id": issue_id}


# ---------- update ----------

class IssuePatch(BaseModel):
    title: str | None = Field(None, min_length=3, max_length=200)
    summary: str | None = Field(None, max_length=5000)
    area: Area | None = None
    priority: Priority | None = None
    effort: Effort | None = None
    expected_end_date: date | None = None
    lead_id: UUID | None = None
    status: Literal["New", "In Progress"] | None = None


@router.patch("/{issue_id}")
def update_issue(issue_id: int, body: IssuePatch, db: DB, user: LeadUser, background: BackgroundTasks):
    issue = issue_or_404(db, issue_id, lock=True)
    if issue["status"] == "Closed":
        raise HTTPException(409, "Closed issues cannot be edited")
    changes = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v != issue[k]}
    if "status" in changes and issue["status"] not in ("New", "In Progress"):
        raise HTTPException(409, "Use the resolution workflow to change status from Resolved")
    if "lead_id" in changes:
        new_lead = fetch_one(db, "select id, name, role from public.users where id = :id", id=changes["lead_id"])
        if new_lead is None or new_lead["role"] != "lead":
            raise HTTPException(422, "Issues can only be assigned to Leads")
    if not changes:
        return load_issue(db, issue_id)

    sets = dict(changes)
    if changes.get("status") == "In Progress" and issue["start_date"] is None:
        sets["start_date"] = now()
    execute(db, f"update public.issues set {', '.join(f'{k} = :{k}' for k in sets)} where id = :id",
            id=issue_id, **sets)

    for field, new in changes.items():
        old = issue[field]
        if field == "lead_id":
            log_activity(db, issue_id, user["id"], "reassigned", **{"from": old, "to": new})
            add_participant(db, issue_id, new)
            notify(db, [new], "issue_assigned", f"KT-{issue_id} was reassigned to you: {issue['title']}",
                   issue_id=issue_id, link=f"/issues?issue={issue_id}", exclude=user["id"],
                   email_leads=True, background=background, subject=f"[KTasks] KT-{issue_id} reassigned to you")
        elif field == "expected_end_date":
            log_activity(db, issue_id, user["id"], "date_changed", field=field, **{"from": old, "to": new})
        elif field == "status":
            log_activity(db, issue_id, user["id"], "status_changed", **{"from": old, "to": new})
        else:
            log_activity(db, issue_id, user["id"], "updated", field=field, **{"from": old, "to": new})
    return load_issue(db, issue_id)
