"""Loading issues together with their computed SLA/blocker metrics."""
from collections import defaultdict
from typing import Any

from sqlalchemy import Connection

from app.db import fetch_all
from app.services.sla import compute_metrics

ISSUE_SELECT = """
    select i.*, c.name as creator_name, l.name as lead_name,
           cb.name as closed_by_name, rb.name as resolved_by_name, jb.name as rejected_by_name
    from public.issues i
    join public.users c on c.id = i.creator_id
    left join public.users l on l.id = i.lead_id
    left join public.users cb on cb.id = i.closed_by_user_id
    left join public.users rb on rb.id = i.resolved_by_user_id
    left join public.users jb on jb.id = i.rejected_by_user_id
"""


def blockers_by_issue(conn: Connection, ids: list[int]) -> dict[int, list[dict[str, Any]]]:
    rows = fetch_all(
        conn,
        """select b.*, u.name as created_by_name from public.blockers b
           left join public.users u on u.id = b.created_by_user_id
           where b.issue_id = any(:ids) order by b.created_at""",
        ids=ids,
    )
    out: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        out[r["issue_id"]].append(r)
    return out


def task_counts_by_issue(conn: Connection, ids: list[int]) -> dict[int, dict[str, int]]:
    rows = fetch_all(
        conn,
        "select issue_id, status, count(*) as n from public.tasks where issue_id = any(:ids) group by 1, 2",
        ids=ids,
    )
    out: dict[int, dict[str, int]] = defaultdict(dict)
    for r in rows:
        out[r["issue_id"]][r["status"]] = r["n"]
    return out


def load_issues(conn: Connection, where: str = "true", order: str = "i.created_at desc", **params: Any):
    issues = fetch_all(conn, f"{ISSUE_SELECT} where {where} order by {order}", **params)
    ids = [i["id"] for i in issues]
    blockers = blockers_by_issue(conn, ids) if ids else {}
    counts = task_counts_by_issue(conn, ids) if ids else {}
    for issue in issues:
        issue["metrics"] = compute_metrics(issue, blockers.get(issue["id"], []), counts.get(issue["id"]))
        issue["blockers"] = blockers.get(issue["id"], [])
    return issues


def load_issue(conn: Connection, issue_id: int) -> dict[str, Any] | None:
    rows = load_issues(conn, "i.id = :id", id=issue_id)
    return rows[0] if rows else None
