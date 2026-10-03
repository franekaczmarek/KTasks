"""Step 2: authentication, RBAC, backup-lead routing, command-palette search."""
from tests.conftest import EMPLOYEE, LEAD, LEAD2, auth


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_requires_token(client):
    assert client.get("/me").status_code == 401


def test_rejects_forged_token(client):
    r = client.get("/me", headers={"Authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.e30.x"})
    assert r.status_code == 401


def test_me_returns_profile(client):
    r = client.get("/me", headers=auth(EMPLOYEE))
    assert r.status_code == 200
    assert r.json()["role"] == "employee" and r.json()["email"] == EMPLOYEE


def test_employee_cannot_change_users(client, users):
    r = client.patch(f"/users/{users[LEAD]['id']}", json={"is_absent": True}, headers=auth(EMPLOYEE))
    assert r.status_code == 403


def test_employee_cannot_reassign_area_lead(client, users):
    r = client.put("/area-leads/Process", json={"lead_id": users[LEAD2]["id"]}, headers=auth(EMPLOYEE))
    assert r.status_code == 403


def test_area_lead_must_be_lead(client, users):
    r = client.put("/area-leads/Process", json={"lead_id": users[EMPLOYEE]["id"]}, headers=auth(LEAD))
    assert r.status_code == 422


def test_backup_must_be_lead(client, users):
    r = client.patch(f"/users/{users[LEAD]['id']}", json={"backup_lead_id": users[EMPLOYEE]["id"]},
                     headers=auth(LEAD))
    assert r.status_code == 422


def test_absent_lead_routes_to_backup(client, users):
    anna, marek = users[LEAD], users[LEAD2]
    try:
        r = client.patch(f"/users/{anna['id']}", json={"is_absent": True}, headers=auth(LEAD))
        assert r.status_code == 200 and r.json()["is_absent"] is True
        rows = {a["area"]: a for a in client.get("/area-leads", headers=auth(EMPLOYEE)).json()}
        assert rows["Operations"]["lead_id"] == anna["id"]
        assert rows["Operations"]["effective_lead_id"] == marek["id"]
        assert rows["Improvements"]["effective_lead_id"] == marek["id"]
    finally:
        client.patch(f"/users/{anna['id']}", json={"is_absent": False}, headers=auth(LEAD))
    rows = {a["area"]: a for a in client.get("/area-leads", headers=auth(EMPLOYEE)).json()}
    assert rows["Operations"]["effective_lead_id"] == anna["id"]


def test_search_shape(client):
    r = client.get("/search", params={"q": "anything"}, headers=auth(EMPLOYEE))
    assert r.status_code == 200
    assert set(r.json()) == {"issues", "tasks", "discussions"}


def test_search_requires_auth(client):
    assert client.get("/search", params={"q": "x"}).status_code == 401
