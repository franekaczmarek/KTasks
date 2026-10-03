"""Step 3: issue creation, routing, duplicates, attachments, blockers, edits and audit log."""
import httpx

from tests.conftest import EMPLOYEE, EMPLOYEE2, LEAD, LEAD2, TEST_TAG, auth


def notifications_for(db, email, issue_id):
    return [r[0] for r in db.execute(
        "select n.message from public.notifications n join public.users u on u.id = n.user_id "
        "where u.email = %s and n.issue_id = %s", (email, issue_id))]


def actions(client, issue_id):
    return [a["action_type"] for a in client.get(f"/issues/{issue_id}/activity", headers=auth(LEAD)).json()]


def test_create_routes_to_area_lead_with_attachment(client, users, make_issue, db, sent_emails):
    issue = make_issue(title="Printer offline", area="Operations", priority="High",
                       files=[("files", ("photo.png", b"\x89PNG fake", "image/png"))])
    assert issue["lead_id"] == users[LEAD]["id"] and issue["lead_name"] == "Anna Nowak"
    assert issue["status"] == "New" and issue["creator_id"] == users[EMPLOYEE]["id"]
    assert issue["metrics"]["sla_state"] == "on_track" and issue["metrics"]["sla_target_days"] == 5

    detail = client.get(f"/issues/{issue['id']}", headers=auth(EMPLOYEE)).json()
    assert [a["filename"] for a in detail["attachments"]] == ["photo.png"]
    assert httpx.get(detail["attachments"][0]["url"]).content == b"\x89PNG fake"
    assert {p["name"] for p in detail["participants"]} == {"Kasia Zielinska", "Anna Nowak"}

    assert actions(client, issue["id"]) == ["created"]
    assert any("New High issue" in m for m in notifications_for(db, LEAD, issue["id"]))
    assert sent_emails and sent_emails[-1]["to"] == [LEAD]
    assert f"KT-{issue['id']}" in sent_emails[-1]["subject"]


def test_absent_lead_routes_to_backup(client, users, make_issue, db):
    client.patch(f"/users/{users[LEAD]['id']}", json={"is_absent": True}, headers=auth(LEAD))
    try:
        issue = make_issue(title="Routing while absent", area="Process")
    finally:
        client.patch(f"/users/{users[LEAD]['id']}", json={"is_absent": False}, headers=auth(LEAD))
    assert issue["lead_id"] == users[LEAD2]["id"]
    assert any("covering for Anna Nowak" in m for m in notifications_for(db, LEAD2, issue["id"]))
    assert notifications_for(db, LEAD, issue["id"]) == []


def test_create_validation(client):
    base = {"title": f"{TEST_TAG} valid", "area": "Operations", "priority": "Low", "effort": "Low"}
    assert client.post("/issues", data={**base, "priority": "Urgent"}, headers=auth(EMPLOYEE)).status_code == 422
    assert client.post("/issues", data={**base, "area": "HR"}, headers=auth(EMPLOYEE)).status_code == 422
    assert client.post("/issues", data={**base, "title": "x"}, headers=auth(EMPLOYEE)).status_code == 422
    assert client.post("/issues", data=base).status_code == 401


def test_duplicate_guard(client, make_issue, db):
    issue = make_issue(title="Label printer jams on packaging line 3")
    hits = client.get("/issues/duplicates", params={"q": "label printer jam"}, headers=auth(EMPLOYEE2)).json()
    assert issue["id"] in [h["id"] for h in hits]
    assert client.get("/issues/duplicates", params={"q": "ab"}, headers=auth(EMPLOYEE2)).json() == []

    db.execute("update public.issues set status = 'Closed', root_cause = 'Other' where id = %s", (issue["id"],))
    hits = client.get("/issues/duplicates", params={"q": "label printer jam"}, headers=auth(EMPLOYEE2)).json()
    assert issue["id"] not in [h["id"] for h in hits], "closed issues are not suggested"


def test_join_existing_thread(client, make_issue, users):
    issue = make_issue(title="Join me")
    r = client.post(f"/issues/{issue['id']}/join", headers=auth(EMPLOYEE2))
    assert r.status_code == 200
    client.post(f"/issues/{issue['id']}/join", headers=auth(EMPLOYEE2))  # idempotent
    detail = client.get(f"/issues/{issue['id']}", headers=auth(EMPLOYEE2)).json()
    assert users[EMPLOYEE2]["id"] in [p["id"] for p in detail["participants"]]
    assert actions(client, issue["id"]).count("joined_thread") == 1


def test_blocker_lifecycle(client, make_issue, db):
    issue = make_issue(title="Blocked by vendor")
    iid = issue["id"]
    # Unrelated employee cannot block someone else's issue.
    assert client.post(f"/issues/{iid}/blockers", json={"reason": "nope"}, headers=auth(EMPLOYEE2)).status_code == 403

    r = client.post(f"/issues/{iid}/blockers", json={"reason": "Waiting for vendor part"}, headers=auth(EMPLOYEE))
    assert r.status_code == 201
    blocker = r.json()
    assert blocker["is_active"] and blocker["resolved_at"] is None

    listed = {i["id"]: i for i in client.get("/issues", headers=auth(LEAD)).json()}
    assert listed[iid]["metrics"]["is_blocked"] is True
    assert any("BLOCKED" in m for m in notifications_for(db, LEAD, iid))

    r = client.post(f"/blockers/{blocker['id']}/resolve", headers=auth(LEAD))
    assert r.status_code == 200 and r.json()["is_active"] is False and r.json()["resolved_at"]
    assert client.post(f"/blockers/{blocker['id']}/resolve", headers=auth(LEAD)).status_code == 409

    detail = client.get(f"/issues/{iid}", headers=auth(LEAD)).json()
    assert detail["metrics"]["is_blocked"] is False
    assert len(detail["blockers"]) == 1
    assert actions(client, iid) == ["created", "blocker_added", "blocker_resolved"]


def test_lead_edits_are_audited(client, make_issue, users, db, sent_emails):
    issue = make_issue(title="Edit me")
    iid = issue["id"]
    assert client.patch(f"/issues/{iid}", json={"priority": "High"}, headers=auth(EMPLOYEE)).status_code == 403
    assert client.patch(f"/issues/{iid}", json={"lead_id": users[EMPLOYEE2]["id"]},
                        headers=auth(LEAD)).status_code == 422

    r = client.patch(f"/issues/{iid}", json={"expected_end_date": "2026-12-01", "priority": "Critical"},
                     headers=auth(LEAD))
    assert r.status_code == 200 and r.json()["priority"] == "Critical"
    r = client.patch(f"/issues/{iid}", json={"lead_id": users[LEAD2]["id"]}, headers=auth(LEAD))
    assert r.json()["lead_name"] == "Marek Wilk"
    assert any("reassigned to you" in m for m in notifications_for(db, LEAD2, iid))
    assert sent_emails[-1]["to"] == [LEAD2]

    r = client.patch(f"/issues/{iid}", json={"status": "In Progress"}, headers=auth(LEAD))
    assert r.json()["status"] == "In Progress" and r.json()["start_date"] is not None

    log = client.get(f"/issues/{iid}/activity", headers=auth(EMPLOYEE)).json()
    kinds = [a["action_type"] for a in log]
    # The two fields of the first PATCH are logged in schema order; the rest are sequential.
    assert kinds[0] == "created" and sorted(kinds[1:3]) == ["date_changed", "updated"]
    assert kinds[3:] == ["reassigned", "status_changed"]
    date_entry = next(a for a in log if a["action_type"] == "date_changed")
    assert date_entry["details"] == {"field": "expected_end_date", "from": None, "to": "2026-12-01"}
    reassigned = next(a for a in log if a["action_type"] == "reassigned")
    assert reassigned["user_name"] == "Anna Nowak"
    assert reassigned["details"] == {"from": users[LEAD]["id"], "to": users[LEAD2]["id"]}

    # No-op patch writes nothing.
    client.patch(f"/issues/{iid}", json={"priority": "Critical"}, headers=auth(LEAD))
    assert len(client.get(f"/issues/{iid}/activity", headers=auth(LEAD)).json()) == 5


def test_list_filters(client, make_issue, users):
    mine = make_issue(title="Filter mine", area="Improvements")
    other = make_issue(email=EMPLOYEE2, title="Filter other", area="Improvements")
    ids = [i["id"] for i in client.get("/issues", params={"scope": "mine"}, headers=auth(EMPLOYEE)).json()]
    assert mine["id"] in ids and other["id"] not in ids
    assigned = client.get("/issues", params={"scope": "assigned"}, headers=auth(LEAD2)).json()
    assert {mine["id"], other["id"]} <= {i["id"] for i in assigned}
    by_area = client.get("/issues", params={"area": "Improvements"}, headers=auth(LEAD)).json()
    assert all(i["area"] == "Improvements" for i in by_area)


def test_unknown_issue_404(client):
    assert client.get("/issues/999999999", headers=auth(EMPLOYEE)).status_code == 404
    assert client.post("/issues/999999999/blockers", json={"reason": "abc"}, headers=auth(LEAD)).status_code == 404
