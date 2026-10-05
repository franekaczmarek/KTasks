"""Director role: Management area routing, Lead-level work, and who may manage Director accounts."""
from tests.conftest import DIRECTOR, EMPLOYEE, LEAD, auth
from tests.test_accounts import new_email


def test_management_issue_routes_to_director(client, users, make_issue, sent_emails):
    issue = make_issue(title="Budget approval blocked", area="Management")
    assert issue["lead_id"] == users[DIRECTOR]["id"] and issue["lead_name"] == "Dorota Wisniewska"
    assert sent_emails[-1]["to"] == [DIRECTOR]
    leads = {a["area"]: a for a in client.get("/area-leads", headers=auth(EMPLOYEE)).json()}
    assert leads["Management"]["lead_id"] == users[DIRECTOR]["id"]


def test_director_works_like_a_lead(client, users, make_issue):
    iid = make_issue(title="Director works it", area="Management")["id"]
    r = client.patch(f"/issues/{iid}", json={"status": "In Progress", "priority": "High"}, headers=auth(DIRECTOR))
    assert r.status_code == 200 and r.json()["status"] == "In Progress" and r.json()["viewer_can_lead"] is True

    # Leads assign tasks to the Director, who moves them.
    task = client.post(f"/issues/{iid}/tasks", json={"title": "Sign off", "assignee_id": users[DIRECTOR]["id"]},
                       headers=auth(LEAD)).json()
    r = client.patch(f"/tasks/{task['id']}/move", json={"status": "Done"}, headers=auth(DIRECTOR))
    assert r.status_code == 200 and r.json()["completion_prompt"] is True

    # Issues can be reassigned to a Director, and the Director has the admin views.
    other = make_issue(title="Escalate to director")["id"]
    r = client.patch(f"/issues/{other}", json={"lead_id": users[DIRECTOR]["id"]}, headers=auth(LEAD))
    assert r.status_code == 200 and r.json()["lead_name"] == "Dorota Wisniewska"
    assert client.get("/admin/users", headers=auth(DIRECTOR)).status_code == 200


def test_only_a_director_manages_director_accounts(client, users):
    assert client.post("/admin/users", json={"email": new_email(), "name": "Wannabe", "role": "director"},
                       headers=auth(LEAD)).status_code == 403
    uid = client.post("/admin/users", json={"email": new_email(), "name": "Future Director"},
                      headers=auth(LEAD)).json()["user"]["id"]
    assert client.patch(f"/admin/users/{uid}", json={"role": "director"}, headers=auth(LEAD)).status_code == 403
    r = client.patch(f"/admin/users/{uid}", json={"role": "director"}, headers=auth(DIRECTOR))
    assert r.status_code == 200 and r.json()["role"] == "director"

    # A Lead can no longer rename, demote, deactivate or reset a Director.
    for body in ({"name": "Renamed"}, {"role": "lead"}, {"is_active": False}):
        assert client.patch(f"/admin/users/{uid}", json=body, headers=auth(LEAD)).status_code == 403
    assert client.post(f"/admin/users/{uid}/reset-password", json={}, headers=auth(LEAD)).status_code == 403
    assert client.patch(f"/admin/users/{uid}", json={"role": "lead"}, headers=auth(DIRECTOR)).json()["role"] == "lead"

    # Nobody changes their own role.
    me = users[DIRECTOR]["id"]
    assert client.patch(f"/admin/users/{me}", json={"role": "lead"}, headers=auth(DIRECTOR)).status_code == 409


def test_management_area_needs_a_director(client, users):
    r = client.put("/area-leads/Management", json={"lead_id": users[LEAD]["id"]}, headers=auth(LEAD))
    assert r.status_code == 422
    # The Director owns Management: they can't be moved off the Director role while they do.
    r = client.post("/admin/users", json={"email": new_email(), "name": "Second Director"}, headers=auth(LEAD))
    uid = r.json()["user"]["id"]
    client.patch(f"/admin/users/{uid}", json={"role": "director"}, headers=auth(DIRECTOR))
    owner = users[DIRECTOR]["id"]
    assert client.patch(f"/admin/users/{owner}", json={"role": "lead"}, headers=auth(DIRECTOR)).status_code == 409
