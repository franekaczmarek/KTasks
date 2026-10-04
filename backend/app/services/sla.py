"""Per-issue SLA, lead/cycle time, blocker metrics and alert flags."""
from datetime import UTC, datetime
from typing import Any

from app.config import get_settings
from app.services.business_days import DAY_SECONDS, add_business_days, business_seconds, business_seconds_union


def now() -> datetime:
    return datetime.now(UTC)


def _days(seconds: float) -> float:
    return round(seconds / DAY_SECONDS, 2)


def compute_metrics(
    issue: dict[str, Any],
    blockers: list[dict[str, Any]],
    task_counts: dict[str, int] | None = None,
    at: datetime | None = None,
) -> dict[str, Any]:
    """
    lead time   = created_at -> resolved_at (or now): the SLA clock
    cycle time  = start_date -> resolved_at (or now)
    blocker     = union of blocker intervals (active ones run until now), clipped to the lead window
    active work = cycle time minus blocked time inside the cycle
    """
    s = get_settings()
    current = at or now()
    end = issue.get("resolved_at") or issue.get("closed_at") or issue.get("rejected_at") or current
    created, started = issue["created_at"], issue.get("start_date")

    intervals = [(b["created_at"], b["resolved_at"] or current) for b in blockers]
    lead_s = business_seconds(created, end)
    cycle_s = business_seconds(started, end) if started else 0.0
    blocked_s = business_seconds_union(intervals, created, end)
    blocked_in_cycle_s = business_seconds_union(intervals, started, end) if started else 0.0

    target = s.sla_targets[issue["priority"]]
    ratio = lead_s / (target * DAY_SECONDS)
    finished = issue["status"] in ("Resolved", "Closed")
    if issue["status"] == "Rejected":
        sla_state = "n_a"  # rejected issues are excluded from SLA compliance
    elif finished:
        sla_state = "met" if ratio <= 1 else "breached"
    elif ratio > 1:
        sla_state = "breached"
    elif ratio >= s.sla_at_risk_ratio:
        sla_state = "at_risk"
    else:
        sla_state = "on_track"

    counts = task_counts or {}
    total_tasks = sum(counts.values())
    open_tasks = counts.get("ToDo", 0) + counts.get("InProgress", 0)

    return {
        "lead_time_days": _days(lead_s),
        "cycle_time_days": _days(cycle_s) if started else None,
        "blocker_time_days": _days(blocked_s),
        "active_work_days": _days(max(cycle_s - blocked_in_cycle_s, 0.0)) if started else None,
        "sla_target_days": target,
        "sla_used_pct": round(ratio * 100, 1),
        "sla_state": sla_state,
        "is_blocked": any(b["is_active"] for b in blockers),
        "task_counts": {"ToDo": counts.get("ToDo", 0), "InProgress": counts.get("InProgress", 0),
                        "Done": counts.get("Done", 0)},
        # Red Alert: work is "In Progress" but nothing is scheduled (all tasks Done, none To Do).
        "red_alert": issue["status"] == "In Progress" and total_tasks > 0 and open_tasks == 0,
        # Two-stage closure: when an unconfirmed resolution closes automatically.
        "auto_close_at": (add_business_days(issue["resolved_at"], s.auto_close_business_days)
                          if issue["status"] == "Resolved" and issue.get("resolved_at") else None),
    }
