"""Issue rejection by a Lead with a mandatory reason."""
from tests.conftest import EMPLOYEE, EMPLOYEE2, LEAD, auth


def reject(client, iid, reason="Not a quality issue: expected behaviour per SOP-114", who=LEAD):
    return client.post(f"/issues/{iid}/reject", json={"reason": reason}, headers=auth(who))


def test_lead_rejects_with_reason(client, make_issue, users, db):
    iid = make_issue(title="Reject me")["id"]
    client.post(f"/issues/{iid}/join", headers=auth(EMPLOYEE2))
    r = reject(client, iid)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "Rejected"
    assert body["rejected_reason"] == "Not a quality issue: expected behaviour per SOP-114"
    assert body["rejected_by_name"] == "Anna Nowak" and body["rejected_at"]
    assert body["metrics"]["sla_state"] == "n_a"

    log = client.get(f"/issues/{iid}/activity", headers=auth(EMPLOYEE)).json()
    assert log[-1]["action_type"] == "rejected" and log[-1]["user_name"] == "Anna Nowak"
    assert log[-1]["details"]["reason"].startswith("Not a quality issue")

    # Reporter and thread participants are told why; the lead (author) is not.
    notified = {r[0] for r in db.execute(
        "select u.email from public.notifications n join public.users u on u.id = n.user_id "
        "where n.issue_id = %s and n.type = 'issue_rejected'", (iid,))}
    assert notified == {EMPLOYEE, EMPLOYEE2}


def test_reason_required_and_lead_only(client, make_issue):
    iid = make_issue(title="Reject rules")["id"]
    assert reject(client, iid, reason="").status_code == 422
    assert reject(client, iid, reason="nope").status_code == 422          # min 5 chars
    assert client.post(f"/issues/{iid}/reject", json={}, headers=auth(LEAD)).status_code == 422
    assert reject(client, iid, who=EMPLOYEE).status_code == 403          # even the reporter can't
    assert reject(client, 999999999).status_code == 404


def test_rejected_is_terminal_and_hidden_from_open_lists(client, make_issue):
    iid = make_issue(title="Rejected terminal")["id"]
    t = client.post(f"/issues/{iid}/tasks", json={"title": "Check it"}, headers=auth(LEAD)).json()
    b = client.post(f"/issues/{iid}/blockers", json={"reason": "Waiting"}, headers=auth(LEAD)).json()
    assert reject(client, iid).status_code == 200

    assert reject(client, iid).status_code == 409                         # already rejected
    assert client.patch(f"/issues/{iid}", json={"priority": "High"}, headers=auth(LEAD)).status_code == 409
    assert client.patch(f"/tasks/{t['id']}/move", json={"status": "Done"}, headers=auth(LEAD)).status_code == 409
    assert client.post(f"/issues/{iid}/blockers", json={"reason": "again"}, headers=auth(LEAD)).status_code == 409
    assert client.post(f"/issues/{iid}/confirm-resolution", headers=auth(EMPLOYEE)).status_code == 409

    detail = client.get(f"/issues/{iid}", headers=auth(LEAD)).json()
    assert detail["metrics"]["is_blocked"] is False                      # open blocker auto-resolved
    assert detail["blockers"][0]["id"] == b["id"] and detail["blockers"][0]["resolved_at"]

    open_ids = [i["id"] for i in client.get("/issues", params={"status": "open"}, headers=auth(LEAD)).json()]
    assert iid not in open_ids
    rejected = [i["id"] for i in client.get("/issues", params={"status": "Rejected"}, headers=auth(LEAD)).json()]
    assert iid in rejected
    assert iid not in [d["id"] for d in client.get("/discussions", headers=auth(EMPLOYEE)).json()]
    assert iid not in [t["issue_id"] for t in client.get("/tasks", headers=auth(LEAD)).json()]
    hits = client.get("/issues/duplicates", params={"q": "Rejected terminal"}, headers=auth(EMPLOYEE)).json()
    assert iid not in [h["id"] for h in hits]


def test_resolved_issue_cannot_be_rejected(client, make_issue):
    iid = make_issue(title="Too late to reject")["id"]
    t = client.post(f"/issues/{iid}/tasks", json={"title": "Do it"}, headers=auth(LEAD)).json()
    client.patch(f"/tasks/{t['id']}/move", json={"status": "Done"}, headers=auth(LEAD))
    client.post(f"/issues/{iid}/resolve", json={"root_cause": "Other"}, headers=auth(LEAD))
    assert reject(client, iid).status_code == 409


def test_in_progress_issue_can_be_rejected(client, make_issue):
    iid = make_issue(title="Reject in progress")["id"]
    t = client.post(f"/issues/{iid}/tasks", json={"title": "Start"}, headers=auth(LEAD)).json()
    client.patch(f"/tasks/{t['id']}/move", json={"status": "InProgress"}, headers=auth(LEAD))
    r = reject(client, iid, reason="Duplicate of an already fixed issue")
    assert r.status_code == 200 and r.json()["status"] == "Rejected"
    log = client.get(f"/issues/{iid}/activity", headers=auth(LEAD)).json()
    assert log[-1]["details"]["from"] == "In Progress"
