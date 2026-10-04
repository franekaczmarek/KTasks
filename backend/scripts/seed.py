"""Create demo accounts (Supabase Auth + public.users) and area-lead routing. Idempotent."""
import sys
from pathlib import Path

import httpx
import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import get_settings  # noqa: E402
from app.services.accounts import admin_client  # noqa: E402

USERS = [
    # email, name, role, backup (by email)
    ("anna.lead@ktasks.dev", "Anna Nowak", "lead", "marek.lead@ktasks.dev"),
    ("marek.lead@ktasks.dev", "Marek Wilk", "lead", "anna.lead@ktasks.dev"),
    ("kasia@ktasks.dev", "Kasia Zielinska", "employee", None),
    ("piotr@ktasks.dev", "Piotr Lewandowski", "employee", None),
    ("ola@ktasks.dev", "Ola Kaminska", "employee", None),
]
AREA_LEADS = {
    "Operations": "anna.lead@ktasks.dev",
    "Process": "anna.lead@ktasks.dev",
    "Improvements": "marek.lead@ktasks.dev",
}


def ensure_auth_user(client: httpx.Client, existing: dict[str, str], email: str, name: str) -> str:
    if email in existing:
        return existing[email]
    r = client.post("/users", json={
        "email": email,
        "password": get_settings().seed_password,
        "email_confirm": True,
        "user_metadata": {"name": name},
    })
    r.raise_for_status()
    return r.json()["id"]


def main() -> None:
    s = get_settings()
    if not s.seed_password:
        sys.exit("SEED_PASSWORD must be set in .env")
    with admin_client() as client:
        r = client.get("/users", params={"per_page": 1000})
        r.raise_for_status()
        existing = {u["email"]: u["id"] for u in r.json()["users"]}
        ids = {email: ensure_auth_user(client, existing, email, name) for email, name, _, _ in USERS}

    with psycopg.connect(s.database_url) as conn:
        for email, name, role, _ in USERS:
            conn.execute(
                "insert into public.users (id, email, name, role) values (%s, %s, %s, %s) "
                "on conflict (id) do update set email = excluded.email, name = excluded.name, role = excluded.role",
                (ids[email], email, name, role),
            )
        for email, _, _, backup in USERS:
            if backup:
                conn.execute("update public.users set backup_lead_id = %s where id = %s", (ids[backup], ids[email]))
        for area, email in AREA_LEADS.items():
            conn.execute(
                "insert into public.area_leads (area, lead_id) values (%s, %s) "
                "on conflict (area) do update set lead_id = excluded.lead_id",
                (area, ids[email]),
            )
    for email, name, role, _ in USERS:
        print(f"{role:9} {name:20} {email}")


if __name__ == "__main__":
    main()
