from functools import cache

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app

LEAD = "anna.lead@ktasks.dev"
LEAD2 = "marek.lead@ktasks.dev"
EMPLOYEE = "kasia@ktasks.dev"
EMPLOYEE2 = "piotr@ktasks.dev"


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
