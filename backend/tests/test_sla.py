"""Unit tests for SLA states, blocker metrics and the Red Alert rule."""
from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.services.sla import compute_metrics

WAW = ZoneInfo("Europe/Warsaw")
MON = datetime(2026, 10, 5, 9, tzinfo=WAW)


def at(day, hour=9):
    return datetime(2026, 10, day, hour, tzinfo=WAW)


def issue(**kw):
    return {"created_at": MON, "start_date": None, "resolved_at": None, "closed_at": None,
            "status": "New", "priority": "High", **kw}  # High = 5 business days


def test_on_track_at_risk_breached_by_business_days():
    assert compute_metrics(issue(), [], at=at(7))["sla_state"] == "on_track"       # 2 days = 40%
    assert compute_metrics(issue(), [], at=at(9))["sla_state"] == "at_risk"        # 4 days = 80%
    m = compute_metrics(issue(), [], at=at(13))                                     # Tue next week = 6 days
    assert m["sla_state"] == "breached" and m["lead_time_days"] == 6


def test_weekend_does_not_consume_sla():
    # Fri 9:00 -> Mon 9:00 is only 1 business day even though 3 calendar days passed.
    m = compute_metrics(issue(created_at=at(9)), [], at=at(12))
    assert m["lead_time_days"] == 1


def test_resolved_freezes_clock_and_reports_met():
    m = compute_metrics(issue(status="Resolved", start_date=at(6), resolved_at=at(8)), [], at=at(30))
    assert m["sla_state"] == "met"
    assert m["lead_time_days"] == 3 and m["cycle_time_days"] == 2


def test_blocker_time_and_active_work():
    blockers = [
        {"created_at": at(6), "resolved_at": at(7), "is_active": False},             # 1 day
        {"created_at": at(6, 21), "resolved_at": at(7, 3), "is_active": False},      # overlaps -> merged
        {"created_at": at(8), "resolved_at": None, "is_active": True},               # still blocking
    ]
    m = compute_metrics(issue(status="In Progress", start_date=at(6)), blockers, at=at(9))
    assert m["is_blocked"] is True
    assert m["blocker_time_days"] == 2           # Tue->Wed + Thu->Fri(now)
    assert m["cycle_time_days"] == 3
    assert m["active_work_days"] == 1


def test_red_alert_rule():
    in_progress = issue(status="In Progress", start_date=at(6))
    assert compute_metrics(in_progress, [], {"Done": 3}, at=at(7))["red_alert"] is True
    assert compute_metrics(in_progress, [], {"Done": 3, "ToDo": 1}, at=at(7))["red_alert"] is False
    assert compute_metrics(in_progress, [], {"Done": 2, "InProgress": 1}, at=at(7))["red_alert"] is False
    assert compute_metrics(in_progress, [], {}, at=at(7))["red_alert"] is False   # no tasks yet
    assert compute_metrics(issue(status="Resolved", resolved_at=at(7)), [], {"Done": 3},
                           at=at(7))["red_alert"] is False


def test_agreed_due_date_replaces_priority_target():
    # Critical (2 bd target) agreed for Fri 16.10: the deadline is the end of that day = 10 business days.
    agreed = issue(priority="Critical", expected_end_date=date(2026, 10, 16))
    m = compute_metrics(agreed, [], at=at(8))                                       # 3 bd used of 10
    assert m["sla_basis"] == "agreed" and m["sla_target_days"] == 9.6 and m["sla_state"] == "on_track"
    assert m["sla_deadline"] == datetime(2026, 10, 17, tzinfo=WAW)
    assert compute_metrics(agreed, [], at=at(15))["sla_state"] == "at_risk"        # 8 bd of 9.6
    assert compute_metrics(agreed, [], at=at(19))["sla_state"] == "breached"       # the Monday after
    done = issue(priority="Critical", expected_end_date=date(2026, 10, 16), status="Resolved", resolved_at=at(16, 20))
    assert compute_metrics(done, [], at=at(30))["sla_state"] == "met"


def test_priority_basis_reports_its_deadline():
    m = compute_metrics(issue(), [], at=at(6))
    assert m["sla_basis"] == "priority" and m["sla_target_days"] == 5
    assert m["sla_deadline"] == at(12)                                              # Mon + 5 bd = next Mon 9:00


def test_due_date_on_creation_day_never_divides_by_zero():
    m = compute_metrics(issue(expected_end_date=date(2026, 10, 3)), [], at=at(6))   # a Saturday before creation
    assert m["sla_state"] == "breached"
