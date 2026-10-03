"""Apply SQL migrations in supabase/migrations in order, once each."""
import sys
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import ROOT_DIR, get_settings  # noqa: E402

MIGRATIONS_DIR = ROOT_DIR / "supabase" / "migrations"


def main() -> None:
    with psycopg.connect(get_settings().database_url, autocommit=False) as conn:
        conn.execute(
            "create table if not exists public.schema_migrations "
            "(name text primary key, applied_at timestamptz not null default now())"
        )
        conn.execute("alter table public.schema_migrations enable row level security")
        applied = {r[0] for r in conn.execute("select name from public.schema_migrations")}
        conn.commit()
        for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
            if path.name in applied:
                print(f"skip   {path.name}")
                continue
            with conn.transaction():
                conn.execute(path.read_text(encoding="utf-8"))
                conn.execute("insert into public.schema_migrations (name) values (%s)", (path.name,))
            print(f"apply  {path.name}")


if __name__ == "__main__":
    main()
