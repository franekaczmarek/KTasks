"""Step 6: two-stage closure (employee confirmation) and 5-business-day auto-close."""
from datetime import datetime
from zoneinfo import ZoneInfo

from app.db import engine
from app.services.workflow import auto_close_due
from tests.conftest import EMPLOYEE, EMPLOYEE2, LEAD, auth

WAW = ZoneInfo("Europe/Warsaw")


def resolved_issue(client, make_issue, title):
    iid = make_issue(title=title)["id"]
    t = client.post(f"/issues/{iid}/tasks", json={"title": "Do it"}, headers=auth(LEAD)).json()
    client.patch(f"/tasks/{t['id']}/move", json={"status": "Done"}, headers=auth(LEAD))
    r = client.post(f"/issues/{iid}/resolve", json={"root_cause": "Procedure"}, headers=auth(LEAD))
    assert r.status_code == 200 and r.json()["status"] == "Resolved"
    return r.json()


def test_resolved_issue_exposes_auto_close_date(client, make_issue):
    issue = resolved_issue(client, make_issue, "Auto close date")
    assert issue["metrics"]["auto_close_at"] is not None
    open_issue = make_issue(title="Not resolved")
    assert open_issue["metrics"]["auto_close_at"] is None


def test_only_reporter_confirms_and_fields_are_recorded(client, make_issue, users, db, sent_emails):
    issue = resolved_issue(client, make_issue, "Confirm me")
    iid = issue["id"]
    assert client.post(f"/issues/{iid}/confirm-resolution", headers=auth(LEAD)).status_code == 403
    assert client.post(f"/issues/{iid}/confirm-resolution", headers=auth(EMPLOYEE2)).status_code == 403

    r = client.post(f"/issues/{iid}/confirm-resolution", headers=auth(EMPLOYEE))
    assert r.status_code == 200
    closed = r.json()
    assert closed["status"] == "Closed"
    assert closed["closed_by_user_id"] == users[EMPLOYEE]["id"] and closed["closed_by_name"] == "Kasia Zielinska"
    assert closed["closed_at"] is not None

    # Second confirmation is rejected; the audit log attributes the closure.
    assert client.post(f"/issues/{iid}/confirm-resolution", headers=auth(EMPLOYEE)).status_code == 409
    log = client.get(f"/issues/{iid}/activity", headers=auth(LEAD)).json()
    assert log[-1]["action_type"] == "closed" and log[-1]["user_name"] == "Kasia Zielinska"

    # Lead is notified in-app and by email.
    assert db.execute("select count(*) from public.notifications n join public.users u on u.id = n.user_id "
                      "where u.email = %s and n.issue_id = %s and n.type = 'resolution_confirmed'",
                      (LEAD, iid)).fetchone()[0] == 1
    assert sent_emails[-1]["to"] == [LEAD] and "closed" in sent_emails[-1]["subject"]


def test_cannot_confirm_unresolved(client, make_issue):
    iid = make_issue(title="Too early")["id"]
    assert client.post(f"/issues/{iid}/confirm-resolution", headers=auth(EMPLOYEE)).status_code == 409


def test_auto_close_after_exactly_five_business_days(client, make_issue, db):
    iid = resolved_issue(client, make_issue, "Auto close timing")["id"]
    # Resolved on Wednesday 10:00 -> due the following Wednesday 10:00 (weekend skipped).
    resolved_at = datetime(2026, 10, 7, 10, tzinfo=WAW)
    db.execute("update public.issues set resolved_at = %s where id = %s", (resolved_at, iid))

    def run(at):
        with engine.begin() as conn:
            return iid in auto_close_due(conn, at)

    assert not run(datetime(2026, 10, 13, 10, tzinfo=WAW)), "4 business days: still open"
    assert not run(datetime(2026, 10, 14, 9, 59, tzinfo=WAW)), "1 minute early"
    assert run(datetime(2026, 10, 14, 10, 0, tzinfo=WAW)), "5 business days: auto-closed"
    assert not run(datetime(2026, 10, 20, tzinfo=WAW)), "already closed: not processed twice"

    issue = client.get(f"/issues/{iid}", headers=auth(EMPLOYEE)).json()
    assert issue["status"] == "Closed" and issue["closed_by_user_id"] is None and issue["closed_at"]
    log = client.get(f"/issues/{iid}/activity", headers=auth(LEAD)).json()
    assert log[-1]["action_type"] == "auto_closed" and log[-1]["user_id"] is None
    assert log[-1]["details"] == {"business_days": 5}
    kinds = {r[0] for r in db.execute(
        "select u.email from public.notifications n join public.users u on u.id = n.user_id "
        "where n.issue_id = %s and n.type = 'auto_closed'", (iid,))}
    assert kinds == {EMPLOYEE, LEAD}


def test_admin_run_auto_close_is_lead_only(client):
    assert client.post("/admin/run-auto-close", headers=auth(EMPLOYEE)).status_code == 403
    r = client.post("/admin/run-auto-close", headers=auth(LEAD))
    assert r.status_code == 200 and isinstance(r.json()["closed"], list)


def test_scheduler_registers_hourly_job(monkeypatch):
    from app.services import scheduler

    monkeypatch.delenv("KTASKS_DISABLE_SCHEDULER", raising=False)
    monkeypatch.setattr(scheduler, "run_auto_close", lambda: [])
    sched = scheduler.start_scheduler()
    try:
        job = sched.get_job("auto_close")
        assert job is not None and job.next_run_time is not None, "job must not be paused"
        assert job.trigger.interval.total_seconds() == 3600
    finally:
        sched.shutdown(wait=False)
