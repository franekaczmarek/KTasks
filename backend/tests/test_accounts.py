"""Self-registration (employee) and the Lead admin panel for accounts."""
import uuid

import httpx
import pytest

from app.config import get_settings
from tests.conftest import EMPLOYEE, LEAD, LEAD2, TEST_ACCOUNT_PREFIX, auth


def new_email() -> str:
    return f"{TEST_ACCOUNT_PREFIX}{uuid.uuid4().hex[:10]}@ktasks.dev"


def sign_in(email: str, password: str) -> httpx.Response:
    s = get_settings()
    return httpx.post(f"{s.supabase_url}/auth/v1/token", params={"grant_type": "password"},
                      headers={"apikey": s.supabase_publishable_key},
                      json={"email": email, "password": password}, timeout=20)


def token_headers(email: str, password: str) -> dict[str, str]:
    r = sign_in(email, password)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_self_registration_creates_employee(client):
    email = new_email()
    r = client.post("/auth/register", json={"email": email.upper(), "name": "New Joiner", "password": "Secret#2026"})
    assert r.status_code == 201, r.text
    assert r.json()["role"] == "employee" and r.json()["email"] == email  # normalised to lower case

    me = client.get("/me", headers=token_headers(email, "Secret#2026")).json()
    assert me["name"] == "New Joiner" and me["role"] == "employee" and me["is_active"] is True

    # Same email twice -> conflict; role cannot be smuggled in.
    assert client.post("/auth/register", json={"email": email, "name": "Again", "password": "Secret#2026"}).status_code == 409
    r = client.post("/auth/register", json={"email": new_email(), "name": "Sneaky", "password": "Secret#2026", "role": "lead"})
    assert r.status_code == 201 and r.json()["role"] == "employee"


@pytest.mark.parametrize("payload", [
    {"email": "not-an-email", "name": "X Y", "password": "Secret#2026"},
    {"name": "X Y", "password": "Secret#2026"},
    {"email": "pytest+short@ktasks.dev", "name": "X Y", "password": "short"},
    {"email": "pytest+noname@ktasks.dev", "name": "", "password": "Secret#2026"},
])
def test_registration_validation(client, payload):
    assert client.post("/auth/register", json=payload).status_code == 422


def test_registration_domain_restriction(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "allowed_signup_domains", "astrazeneca.com, @ktasks.dev")
    assert client.post("/auth/register", json={"email": f"{TEST_ACCOUNT_PREFIX}x@gmail.com", "name": "Outsider",
                                               "password": "Secret#2026"}).status_code == 403
    assert client.post("/auth/register", json={"email": new_email(), "name": "Insider",
                                               "password": "Secret#2026"}).status_code == 201


def test_admin_panel_is_lead_only(client):
    assert client.get("/admin/users", headers=auth(EMPLOYEE)).status_code == 403
    assert client.post("/admin/users", json={"email": new_email(), "name": "X Y"}, headers=auth(EMPLOYEE)).status_code == 403
    assert client.get("/admin/users").status_code == 401


def test_admin_creates_user_with_generated_password(client):
    email = new_email()
    r = client.post("/admin/users", json={"email": email, "name": "Created Lead", "role": "lead"}, headers=auth(LEAD))
    assert r.status_code == 201, r.text
    temp = r.json()["temporary_password"]
    assert r.json()["user"]["role"] == "lead" and len(temp) >= 12
    assert client.get("/me", headers=token_headers(email, temp)).json()["role"] == "lead"

    listed = {u["email"]: u for u in client.get("/admin/users", headers=auth(LEAD)).json()}
    assert listed[email]["is_active"] is True
    assert listed[LEAD]["lead_of_areas"] == ["Operations", "Process"]


def test_admin_chosen_password_is_not_echoed(client):
    r = client.post("/admin/users", json={"email": new_email(), "name": "Chosen Pw", "password": "Chosen#Pass1"},
                    headers=auth(LEAD))
    assert r.status_code == 201 and r.json()["temporary_password"] is None and r.json()["user"]["role"] == "employee"


def test_promote_demote_and_deactivate(client, users):
    email = new_email()
    created = client.post("/admin/users", json={"email": email, "name": "Role Change"}, headers=auth(LEAD)).json()
    uid, temp = created["user"]["id"], created["temporary_password"]

    r = client.patch(f"/admin/users/{uid}", json={"role": "lead", "name": "Role Changed"}, headers=auth(LEAD))
    assert r.json()["role"] == "lead" and r.json()["name"] == "Role Changed"
    # Make them Marek's backup, then demote: the backup link is cleared automatically.
    marek = users[LEAD2]["id"]
    try:
        client.patch(f"/users/{marek}", json={"backup_lead_id": uid}, headers=auth(LEAD))
        r = client.patch(f"/admin/users/{uid}", json={"role": "employee"}, headers=auth(LEAD))
        assert r.status_code == 200 and r.json()["role"] == "employee"
        marek_now = next(u for u in client.get("/users", headers=auth(LEAD)).json() if u["id"] == marek)
        assert marek_now["backup_lead_id"] is None
    finally:
        client.patch(f"/users/{marek}", json={"backup_lead_id": users[LEAD]["id"]}, headers=auth(LEAD))

    # Deactivate: API access and Supabase sign-in are both blocked.
    headers = token_headers(email, temp)
    r = client.patch(f"/admin/users/{uid}", json={"is_active": False}, headers=auth(LEAD))
    assert r.status_code == 200 and r.json()["is_active"] is False
    me = client.get("/me", headers=headers)
    assert me.status_code == 403 and "deactivated" in me.json()["detail"]
    assert sign_in(email, temp).status_code == 400  # banned in Supabase Auth

    # Reactivate.
    client.patch(f"/admin/users/{uid}", json={"is_active": True}, headers=auth(LEAD))
    assert sign_in(email, temp).status_code == 200


def test_area_lead_cannot_be_demoted_or_deactivated(client, users):
    marek = users[LEAD2]["id"]  # Lead of Improvements
    r = client.patch(f"/admin/users/{marek}", json={"role": "employee"}, headers=auth(LEAD))
    assert r.status_code == 409 and "Improvements" in r.json()["detail"]
    assert client.patch(f"/admin/users/{marek}", json={"is_active": False}, headers=auth(LEAD)).status_code == 409


def test_cannot_demote_or_deactivate_self(client, users):
    anna = users[LEAD]["id"]
    assert client.patch(f"/admin/users/{anna}", json={"role": "employee"}, headers=auth(LEAD)).status_code == 409
    assert client.patch(f"/admin/users/{anna}", json={"is_active": False}, headers=auth(LEAD)).status_code == 409


def test_reset_password(client):
    email = new_email()
    created = client.post("/admin/users", json={"email": email, "name": "Forgetful"}, headers=auth(LEAD)).json()
    r = client.post(f"/admin/users/{created['user']['id']}/reset-password", json={}, headers=auth(LEAD))
    new_pw = r.json()["temporary_password"]
    assert sign_in(email, created["temporary_password"]).status_code == 400
    assert sign_in(email, new_pw).status_code == 200
    assert client.post(f"/admin/users/{created['user']['id']}/reset-password", json={},
                       headers=auth(EMPLOYEE)).status_code == 403
