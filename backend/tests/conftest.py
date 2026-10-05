import os
from functools import cache

import httpx
import pytest
from fastapi.testclient import TestClient

os.environ["KTASKS_DISABLE_SCHEDULER"] = "1"

from app.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402

LEAD = "anna.lead@ktasks.dev"
LEAD2 = "marek.lead@ktasks.dev"
EMPLOYEE = "kasia@ktasks.dev"
EMPLOYEE2 = "piotr@ktasks.dev"
EMPLOYEE3 = "ola@ktasks.dev"
DIRECTOR = "director@ktasks.dev"


@cache
def access_token(email: str) -> str:
    s = get_settings()
    r = httpx.post(
        f"{s.supabase_url}/auth/v1/token",
        params={"grant_type": "password"},
        headers={"apikey": s.supabase_publishable_key},
        json={"email": email, "password": s.seed_password},
        timeout=20,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def auth(email: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token(email)}"}


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def users(client):
    """email -> user dict, as seen by the API."""
    r = client.get("/users", headers=auth(LEAD))
    r.raise_for_status()
    return {u["email"]: u for u in r.json()}


TEST_TAG = "[pytest]"
TEST_ACCOUNT_PREFIX = "pytest+"


@pytest.fixture(autouse=True)
def sent_emails(monkeypatch):
    """Capture outgoing emails instead of calling Resend."""
    sent: list[dict] = []

    def fake_send(to, subject, body, link=None):
        sent.append({"to": to, "subject": subject, "body": body, "link": link})
        return True

    monkeypatch.setattr("app.services.email.send_email", fake_send)
    return sent


@pytest.fixture(scope="session", autouse=True)
def cleanup_test_issues():
    """Delete every issue created by tests (cascades to child rows) plus stored files."""
    from scripts.cleanup_test_data import cleanup, cleanup_accounts

    cleanup(TEST_TAG)
    cleanup_accounts(TEST_ACCOUNT_PREFIX)
    yield
    cleanup(TEST_TAG)
    cleanup_accounts(TEST_ACCOUNT_PREFIX)


@pytest.fixture
def make_issue(client):
    def _make(email=EMPLOYEE, files=None, **fields):
        data = {"title": "Something broke", "area": "Operations", "priority": "Medium", "effort": "Low",
                "summary": "details", **fields}
        data["title"] = f"{TEST_TAG} {data['title']}"
        r = client.post("/issues", data=data, files=files or [], headers=auth(email))
        assert r.status_code == 201, r.text
        return r.json()
    return _make


@pytest.fixture(scope="session")
def db():
    import psycopg
    with psycopg.connect(get_settings().database_url, autocommit=True) as conn:
        yield conn
