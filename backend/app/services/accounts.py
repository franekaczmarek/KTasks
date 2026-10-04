"""Account management via the Supabase Auth Admin API (server-side, secret key)."""
import secrets
import string
from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy import Connection

from app.config import get_settings
from app.db import execute, fetch_one

BAN_FOREVER = "876000h"  # ~100 years; Supabase has no explicit "disabled" flag


def admin_client() -> httpx.Client:
    s = get_settings()
    return httpx.Client(
        base_url=f"{s.supabase_url}/auth/v1/admin",
        headers={"apikey": s.supabase_secret_key, "Authorization": f"Bearer {s.supabase_secret_key}"},
        timeout=20,
    )


def generate_password(length: int = 14) -> str:
    alphabet = string.ascii_letters + string.digits
    # Guarantee a mix of character classes.
    core = [secrets.choice(string.ascii_lowercase), secrets.choice(string.ascii_uppercase),
            secrets.choice(string.digits), secrets.choice("!@#$%*")]
    core += [secrets.choice(alphabet) for _ in range(length - len(core))]
    secrets.SystemRandom().shuffle(core)
    return "".join(core)


def check_signup_domain(email: str) -> None:
    allowed = [d.strip().lower().lstrip("@") for d in get_settings().allowed_signup_domains.split(",") if d.strip()]
    if allowed and email.rsplit("@", 1)[-1].lower() not in allowed:
        raise HTTPException(403, f"Registration is limited to: {', '.join('@' + d for d in allowed)}")


def _raise_auth_error(r: httpx.Response) -> None:
    if r.status_code < 400:
        return
    try:
        body = r.json()
        msg = body.get("msg") or body.get("message") or body.get("error_description") or r.text
        code = body.get("error_code") or body.get("code")
    except ValueError:
        msg, code = r.text, None
    if code in ("email_exists", "user_already_exists") or "already been registered" in str(msg):
        raise HTTPException(409, "An account with this email already exists")
    if code == "weak_password" or "password" in str(msg).lower():
        raise HTTPException(422, f"Password rejected: {msg}")
    raise HTTPException(502, f"Auth provider error: {msg}")


def create_account(conn: Connection, email: str, name: str, role: str, password: str) -> dict[str, Any]:
    """Creates the Supabase Auth user (pre-confirmed) and the KTasks profile in one step."""
    email = email.strip().lower()
    if fetch_one(conn, "select 1 from public.users where lower(email) = :e", e=email):
        raise HTTPException(409, "An account with this email already exists")
    with admin_client() as client:
        r = client.post("/users", json={"email": email, "password": password, "email_confirm": True,
                                        "user_metadata": {"name": name}})
        _raise_auth_error(r)
        user_id = r.json()["id"]
    try:
        return fetch_one(
            conn,
            "insert into public.users (id, email, name, role) values (:id, :e, :n, :r) "
            "returning id, email, name, role, backup_lead_id, is_absent, is_active",
            id=user_id, e=email, n=name.strip(), r=role,
        )
    except Exception:
        # Keep Auth and profiles consistent if the profile insert fails.
        with admin_client() as client:
            client.delete(f"/users/{user_id}")
        raise


def update_auth_user(user_id: str, **fields: Any) -> None:
    with admin_client() as client:
        _raise_auth_error(client.put(f"/users/{user_id}", json=fields))


def set_active(conn: Connection, user_id: str, active: bool) -> None:
    update_auth_user(str(user_id), ban_duration="none" if active else BAN_FOREVER)
    execute(conn, "update public.users set is_active = :a where id = :id", a=active, id=user_id)


def verify_password(email: str, password: str) -> bool:
    """Checks a user's current password against Supabase Auth (password grant)."""
    s = get_settings()
    r = httpx.post(f"{s.supabase_url}/auth/v1/token", params={"grant_type": "password"},
                   headers={"apikey": s.supabase_publishable_key},
                   json={"email": email, "password": password}, timeout=20)
    if r.status_code == 200:
        return True
    if r.status_code in (400, 401):
        return False
    raise HTTPException(502, "Could not verify the current password, please try again")
