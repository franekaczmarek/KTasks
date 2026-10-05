"""Agreed due date: set once by the Lead, later changes only with the reporter's approval."""
from datetime import date, timedelta

from tests.conftest import EMPLOYEE, EMPLOYEE2, LEAD, LEAD2, auth
from tests.test_issues import actions, notifications_for

D1 = (date.today() + timedelta(days=30)).isoformat()
D2 = (date.today() + timedelta(days=60)).isoformat()


def set_date(client, iid, d=D1, who=LEAD):
    return client.patch(f"/issues/{iid}", json={"expected_end_date": d}, headers=auth(who))


def request(client, iid, to=D2, reason="No spare technician until next month", who=LEAD):
    return client.post(f"/issues/{iid}/due-date-requests", json={"to_date": to, "reason": reason}, headers=auth(who))


def test_due_date_is_set_once_and_drives_sla(client, make_issue, db):
    iid = make_issue(title="Due once", priority="Critical")["id"]
    assert set_date(client, iid, who=EMPLOYEE).status_code == 403
    assert set_date(client, iid, d=(date.today() - timedelta(days=1)).isoformat()).status_code == 422
    r = set_date(client, iid)
    assert r.status_code == 200 and r.json()["expected_end_date"] == D1
    assert r.json()["metrics"]["sla_basis"] == "agreed" and r.json()["metrics"]["sla_state"] == "on_track"
    assert any("set the due date" in m for m in notifications_for(db, EMPLOYEE, iid))

    # Changing or clearing an agreed date directly is refused.
    assert set_date(client, iid, d=D2).status_code == 409
    assert set_date(client, iid, d=None).status_code == 409
    assert client.get(f"/issues/{iid}", headers=auth(EMPLOYEE)).json()["expected_end_date"] == D1


def test_change_needs_reason_and_reporter_acceptance(client, make_issue, db):
    iid = make_issue(title="Due change accepted")["id"]
    assert request(client, iid).status_code == 409                       # nothing agreed yet
    set_date(client, iid)
    assert request(client, iid, reason="no").status_code == 422          # reason too short
    assert request(client, iid, to=D1).status_code == 422                # same date
    assert request(client, iid, who=EMPLOYEE).status_code == 403         # Leads request changes

    r = request(client, iid)
    assert r.status_code == 201
    pending = r.json()["pending_due_date_request"]
    assert pending["from_date"] == D1 and pending["to_date"] == D2 and pending["requested_by_name"] == "Anna Nowak"
    assert r.json()["expected_end_date"] == D1                           # not applied until accepted
    assert request(client, iid, to=(date.today() + timedelta(days=90)).isoformat()).status_code == 409  # one pending
    assert any("asks to move the due date" in m for m in notifications_for(db, EMPLOYEE, iid))

    rid = pending["id"]
    assert client.post(f"/due-date-requests/{rid}/accept", headers=auth(LEAD)).status_code == 403
    assert client.post(f"/due-date-requests/{rid}/accept", headers=auth(EMPLOYEE2)).status_code == 403
    r = client.post(f"/due-date-requests/{rid}/accept", headers=auth(EMPLOYEE))
    assert r.status_code == 200 and r.json()["expected_end_date"] == D2
    assert r.json()["pending_due_date_request"] is None
    assert r.json()["due_date_history"][0]["status"] == "accepted"
    assert client.post(f"/due-date-requests/{rid}/decline", json={}, headers=auth(EMPLOYEE)).status_code == 409
    assert any("accepted the due date change" in m for m in notifications_for(db, LEAD, iid))
    assert actions(client, iid)[-3:] == ["due_date_set", "due_date_change_requested", "due_date_change_accepted"]


def test_decline_and_withdraw_keep_the_date(client, make_issue):
    iid = make_issue(title="Due change declined")["id"]
    set_date(client, iid)
    rid = request(client, iid).json()["pending_due_date_request"]["id"]
    r = client.post(f"/due-date-requests/{rid}/decline", json={"note": "Too late for us"}, headers=auth(EMPLOYEE))
    assert r.status_code == 200 and r.json()["expected_end_date"] == D1
    assert r.json()["due_date_history"][0]["decision_note"] == "Too late for us"

    rid = request(client, iid).json()["pending_due_date_request"]["id"]
    assert client.post(f"/due-date-requests/{rid}/withdraw", headers=auth(EMPLOYEE)).status_code == 403
    assert client.post(f"/due-date-requests/{rid}/withdraw", headers=auth(LEAD2)).status_code == 403
    r = client.post(f"/due-date-requests/{rid}/withdraw", headers=auth(LEAD))
    assert r.status_code == 200 and r.json()["expected_end_date"] == D1 and r.json()["pending_due_date_request"] is None
    assert actions(client, iid)[-4:] == ["due_date_change_requested", "due_date_change_declined",
                                        "due_date_change_requested", "due_date_change_withdrawn"]


def test_lead_reporting_own_issue_is_self_approved(client, make_issue):
    iid = make_issue(email=LEAD, title="Due self approved")["id"]
    set_date(client, iid)
    r = request(client, iid)
    assert r.status_code == 201 and r.json()["expected_end_date"] == D2
    assert r.json()["pending_due_date_request"] is None


def test_pending_request_is_withdrawn_when_issue_is_rejected(client, make_issue, db):
    iid = make_issue(title="Due rejected")["id"]
    set_date(client, iid)
    rid = request(client, iid).json()["pending_due_date_request"]["id"]
    client.post(f"/issues/{iid}/reject", json={"reason": "Out of scope"}, headers=auth(LEAD))
    status = db.execute("select status from public.due_date_requests where id = %s", (rid,)).fetchone()[0]
    assert status == "withdrawn"
    assert client.post(f"/due-date-requests/{rid}/accept", headers=auth(EMPLOYEE)).status_code == 409
    assert request(client, iid).status_code == 409                      # terminal issues are locked
