from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.db import execute, fetch_all, fetch_one
from app.deps import DB, CurrentUser, LeadUser
from app.routers.issues import add_participant, can_manage, issue_or_404
from app.services.activity import log_activity
from app.services.issue_queries import load_issue
from app.services.notifications import notify
from app.services.workflow import on_task_moved, open_task_count, resolve_issue

router = APIRouter(tags=["tasks"])

TaskStatus = Literal["ToDo", "InProgress", "Done"]
RootCause = Literal["Procedure", "Human Error", "IT/Equipment", "Training", "Vendor", "Other"]

_TASK_SELECT = """
    select t.*, a.name as assignee_name, i.title as issue_title, i.status as issue_status,
           i.priority as issue_priority,
           exists(select 1 from public.blockers b where b.issue_id = i.id and b.is_active) as issue_blocked
    from public.tasks t
    join public.issues i on i.id = t.issue_id
    left join public.users a on a.id = t.assignee_id
"""


class TaskIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    summary: str = Field("", max_length=2000)
    assignee_id: UUID | None = None


class TaskPatch(BaseModel):
    title: str | None = Field(None, min_length=2, max_length=200)
    summary: str | None = Field(None, max_length=2000)
    assignee_id: UUID | None = None


class TaskMove(BaseModel):
    status: TaskStatus
    position: float | None = None
    assignee_id: UUID | None = None  # set when dropped into another swimlane


class ResolveIn(BaseModel):
    root_cause: RootCause


class TemplatesIn(BaseModel):
    template_ids: list[int] | None = None


def task_or_404(db, task_id: int):
    task = fetch_one(db, "select * from public.tasks where id = :id", id=task_id)
    if task is None:
        raise HTTPException(404, "Task not found")
    return task


def ensure_open(issue):
    if issue["status"] in ("Resolved", "Closed", "Rejected"):
        raise HTTPException(409, f"Issue KT-{issue['id']} is {issue['status']}; tasks are locked")


def ensure_assignee(db, assignee_id):
    if assignee_id is not None and not fetch_one(db, "select 1 from public.users where id = :id", id=assignee_id):
        raise HTTPException(422, "Assignee not found")


def can_work_on(user, issue, task) -> bool:
    return can_manage(user, issue) or (task["assignee_id"] is not None and str(task["assignee_id"]) == str(user["id"]))


def load_task(db, task_id: int):
    return fetch_one(db, f"{_TASK_SELECT} where t.id = :id", id=task_id)


@router.get("/tasks")
def list_tasks(db: DB, _: CurrentUser, issue_id: int | None = None, include_closed: bool = False):
    where = ["true"]
    if issue_id is not None:
        where.append("t.issue_id = :issue_id")
    elif not include_closed:
        where.append("i.status not in ('Closed', 'Rejected')")
    return fetch_all(db, f"{_TASK_SELECT} where {' and '.join(where)} order by t.position, t.id", issue_id=issue_id)


@router.get("/task-templates")
def task_templates(db: DB, _: CurrentUser):
    return fetch_all(db, "select id, title, summary from public.task_templates order by sort, id")


@router.post("/issues/{issue_id}/tasks", status_code=201)
def create_task(issue_id: int, body: TaskIn, db: DB, user: CurrentUser):
    issue = issue_or_404(db, issue_id, lock=True)
    if not can_manage(user, issue):
        raise HTTPException(403, "Only the creator or a Lead can add tasks")
    ensure_open(issue)
    ensure_assignee(db, body.assignee_id)
    row = fetch_one(
        db,
        """insert into public.tasks (issue_id, title, summary, assignee_id, position)
           values (:i, :t, :s, :a, coalesce((select max(position) + 1 from public.tasks where issue_id = :i), 0))
           returning id""",
        i=issue_id, t=body.title.strip(), s=body.summary.strip(), a=body.assignee_id,
    )
    log_activity(db, issue_id, user["id"], "task_created", task_id=row["id"], title=body.title.strip())
    if body.assignee_id:
        add_participant(db, issue_id, body.assignee_id)
        notify(db, [body.assignee_id], "task_assigned", f"You were assigned \"{body.title.strip()}\" on KT-{issue_id}",
               issue_id=issue_id, link=f"/work?issue={issue_id}", exclude=user["id"])
    return load_task(db, row["id"])


@router.post("/issues/{issue_id}/tasks/from-templates", status_code=201)
def apply_templates(issue_id: int, body: TemplatesIn, db: DB, user: LeadUser):
    issue = issue_or_404(db, issue_id, lock=True)
    ensure_open(issue)
    rows = fetch_all(
        db,
        """insert into public.tasks (issue_id, title, summary, position)
           select :i, tt.title, tt.summary,
                  coalesce((select max(position) from public.tasks where issue_id = :i), -1) + row_number() over (order by tt.sort)
           from public.task_templates tt
           where (cast(:ids as bigint[]) is null or tt.id = any(cast(:ids as bigint[])))
             and not exists (select 1 from public.tasks t where t.issue_id = :i and t.title = tt.title)
           returning id""",
        i=issue_id, ids=body.template_ids,
    )
    if rows:
        log_activity(db, issue_id, user["id"], "templates_applied", count=len(rows))
    return fetch_all(db, f"{_TASK_SELECT} where t.issue_id = :i order by t.position, t.id", i=issue_id)


@router.patch("/tasks/{task_id}")
def update_task(task_id: int, body: TaskPatch, db: DB, user: CurrentUser):
    """Rename / re-describe / reassign a task. Every real change is audited."""
    task = task_or_404(db, task_id)
    issue = issue_or_404(db, task["issue_id"], lock=True)
    task = task_or_404(db, task_id)  # re-read under the issue lock
    if not can_work_on(user, issue, task):
        raise HTTPException(403, "Only the creator, a Lead or the assignee can edit this task")
    ensure_open(issue)
    changes = body.model_dump(exclude_unset=True)
    for key in ("title", "summary"):
        if key in changes:
            if changes[key] is None:
                raise HTTPException(422, f"{key} cannot be null")
            changes[key] = changes[key].strip()
    if "title" in changes and len(changes["title"]) < 2:
        raise HTTPException(422, "Task title must have at least 2 characters")
    changes = {k: v for k, v in changes.items() if str(v) != str(task[k])}  # keep real changes only
    if not changes:
        return load_task(db, task_id)

    if "assignee_id" in changes:
        ensure_assignee(db, changes["assignee_id"])
    execute(db, f"update public.tasks set {', '.join(f'{k} = :{k}' for k in changes)} where id = :id",
            id=task_id, **changes)

    title = changes.get("title", task["title"])
    if "title" in changes:
        log_activity(db, issue["id"], user["id"], "task_renamed", task_id=task_id,
                     **{"from": task["title"], "to": changes["title"]})
    if "summary" in changes:
        log_activity(db, issue["id"], user["id"], "task_updated", task_id=task_id, title=title, field="details")
    if "assignee_id" in changes:
        new = changes["assignee_id"]
        log_activity(db, issue["id"], user["id"], "task_reassigned", task_id=task_id, title=title,
                     **{"from": task["assignee_id"], "to": new})
        if new:
            add_participant(db, issue["id"], new)
            notify(db, [new], "task_assigned", f"You were assigned \"{title}\" on KT-{issue['id']}",
                   issue_id=issue["id"], link=f"/work?issue={issue['id']}", exclude=user["id"])
    return load_task(db, task_id)


@router.patch("/tasks/{task_id}/move")
def move_task(task_id: int, body: TaskMove, db: DB, user: CurrentUser):
    task = task_or_404(db, task_id)
    issue = issue_or_404(db, task["issue_id"], lock=True)
    task = task_or_404(db, task_id)  # re-read under the issue lock
    if not can_work_on(user, issue, task):
        raise HTTPException(403, "Only the creator, a Lead or the assignee can move this task")
    ensure_open(issue)
    sets = {"status": body.status}
    if body.position is not None:
        sets["position"] = body.position
    if "assignee_id" in body.model_fields_set:
        ensure_assignee(db, body.assignee_id)
        sets["assignee_id"] = body.assignee_id
    execute(db, f"update public.tasks set {', '.join(f'{k} = :{k}' for k in sets)} where id = :id", id=task_id, **sets)
    if body.status != task["status"]:
        log_activity(db, issue["id"], user["id"], "task_moved", task_id=task_id, title=task["title"],
                     **{"from": task["status"], "to": body.status})
    flags = on_task_moved(db, issue, user["id"], body.status) if body.status != task["status"] else {
        "issue_status": issue["status"], "issue_started": False, "completion_prompt": False}
    return {"task": load_task(db, task_id), **flags}


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, db: DB, user: CurrentUser):
    task = task_or_404(db, task_id)
    issue = issue_or_404(db, task["issue_id"], lock=True)
    if not can_manage(user, issue):
        raise HTTPException(403, "Only the creator or a Lead can delete tasks")
    ensure_open(issue)
    execute(db, "delete from public.tasks where id = :id", id=task_id)
    log_activity(db, issue["id"], user["id"], "task_deleted", task_id=task_id, title=task["title"])
    # Deleting the last open task of an In Progress issue leaves only Done work: ask whether it's finished.
    remaining = fetch_one(db, "select count(*) as n from public.tasks where issue_id = :i", i=issue["id"])["n"]
    prompt = issue["status"] == "In Progress" and remaining > 0 and open_task_count(db, issue["id"]) == 0
    return {"deleted": task_id, "completion_prompt": prompt}


@router.post("/issues/{issue_id}/resolve")
def resolve(issue_id: int, body: ResolveIn, db: DB, user: CurrentUser):
    """'Are all works on this issue completed?' -> YES (requires a root cause)."""
    issue = issue_or_404(db, issue_id, lock=True)
    is_assignee = fetch_one(db, "select 1 from public.tasks where issue_id = :i and assignee_id = :u",
                            i=issue_id, u=user["id"])
    if user["role"] != "lead" and not is_assignee:
        raise HTTPException(403, "Only a Lead or a task assignee can resolve the issue")
    resolve_issue(db, issue, user, body.root_cause)
    return load_issue(db, issue_id)
