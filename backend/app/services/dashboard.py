"""Dashboard aggregations (shared by the API and the PDF/Excel exporter)."""
from collections import defaultdict
from datetime import timedelta
from statistics import mean
from typing import Any

from sqlalchemy import Connection

from app.db import fetch_all
from app.services.business_days import DAY_SECONDS, business_days, business_seconds_union
from app.services.issue_queries import load_issues
from app.services.sla import now

PRIORITIES = ["Low", "Medium", "High", "Critical"]
EFFORTS = ["Low", "Medium", "High"]
ROOT_CAUSES = ["Procedure", "Human Error", "IT/Equipment", "Training", "Vendor", "Other"]


def scoped_issues(conn: Connection, area: str | None, days: int | None) -> list[dict[str, Any]]:
    where, params = ["true"], {}
    if area:
        where.append("i.area = :area")
        params["area"] = area
    if days:
        where.append("i.created_at >= :since")
        params["since"] = now() - timedelta(days=days)
    return load_issues(conn, " and ".join(where), **params)


def _first_lead_response(conn: Connection, ids: list[int]) -> dict[int, Any]:
    """Earliest action by the issue's lead after creation: comment, task, status change, blocker..."""
    if not ids:
        return {}
    rows = fetch_all(
        conn,
        """select i.id, least(
               (select min(a.created_at) from public.activity_log a
                where a.issue_id = i.id and a.user_id = i.lead_id and a.action_type <> 'created'),
               (select min(c.created_at) from public.comments c where c.issue_id = i.id and c.user_id = i.lead_id)
           ) as responded_at
           from public.issues i where i.id = any(:ids)""",
        ids=ids,
    )
    return {r["id"]: r["responded_at"] for r in rows if r["responded_at"]}


def build_dashboard(conn: Connection, area: str | None = None, days: int | None = None) -> dict[str, Any]:
    issues = scoped_issues(conn, area, days)
    current = now()
    open_issues = [i for i in issues if i["status"] not in ("Closed", "Rejected")]
    finished = [i for i in issues if i["status"] in ("Resolved", "Closed")]

    responses = _first_lead_response(conn, [i["id"] for i in issues])
    response_days = [business_days(i["created_at"], responses[i["id"]]) for i in issues if i["id"] in responses]
    awaiting_response = sum(1 for i in open_issues if i["id"] not in responses and i["lead_id"])

    met = sum(1 for i in finished if i["metrics"]["sla_state"] == "met")
    breached_open = sum(1 for i in open_issues if i["metrics"]["sla_state"] == "breached")

    # Quick Wins Matrix: open issues by Priority (impact) x Effort.
    cells: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for i in open_issues:
        cells[(i["priority"], i["effort"])].append({"id": i["id"], "title": i["title"], "status": i["status"]})
    matrix = [
        {"priority": p, "effort": e, "count": len(cells[(p, e)]), "issues": cells[(p, e)],
         "quick_win": p in ("High", "Critical") and e == "Low"}
        for p in PRIORITIES for e in EFFORTS
    ]

    rc_counts = {rc: 0 for rc in ROOT_CAUSES}
    for i in finished:
        if i["root_cause"]:
            rc_counts[i["root_cause"]] += 1
    root_causes = sorted(({"root_cause": k, "count": v} for k, v in rc_counts.items()), key=lambda r: -r["count"])

    # Blockers: total time lost (business days, union per issue) and top reasons.
    total_blocked = 0.0
    reasons: dict[str, dict[str, Any]] = {}
    active_blockers = 0
    for i in issues:
        bl = i["blockers"]
        if not bl:
            continue
        end = i.get("resolved_at") or i.get("closed_at") or i.get("rejected_at") or current
        total_blocked += business_seconds_union(
            [(b["created_at"], b["resolved_at"] or current) for b in bl], i["created_at"], end)
        for b in bl:
            active_blockers += b["is_active"]
            key = " ".join(b["reason"].lower().split())
            r = reasons.setdefault(key, {"reason": b["reason"], "count": 0, "days": 0.0})
            r["count"] += 1
            r["days"] += business_days(b["created_at"], b["resolved_at"] or current)
    top_reasons = sorted(reasons.values(), key=lambda r: (-r["days"], -r["count"]))[:6]
    for r in top_reasons:
        r["days"] = round(r["days"], 2)

    blocked_issue_days = [i["metrics"]["blocker_time_days"] for i in issues if i["blockers"]]
    return {
        "scope": {"area": area, "days": days, "issue_count": len(issues), "generated_at": current},
        "kpis": {
            "avg_lead_response_days": round(mean(response_days), 2) if response_days else None,
            "responded_count": len(response_days),
            "awaiting_response": awaiting_response,
            "open_issues": len(open_issues),
            "open_blocked": sum(1 for i in open_issues if i["metrics"]["is_blocked"]),
            "open_breached": breached_open,
            "sla_compliance_pct": round(met / len(finished) * 100, 1) if finished else None,
            "sla_finished_count": len(finished),
            "sla_met_count": met,
        },
        "status_counts": {s: sum(1 for i in issues if i["status"] == s) for s in ("New", "In Progress", "Resolved", "Closed", "Rejected")},
        "quick_wins": matrix,
        "root_causes": root_causes,
        "blockers": {
            "total_days": round(total_blocked / DAY_SECONDS, 2),
            "active": active_blockers,
            "avg_days_per_blocked_issue": round(mean(blocked_issue_days), 2) if blocked_issue_days else None,
            "top_reasons": top_reasons,
        },
        "issues": issues,
    }
