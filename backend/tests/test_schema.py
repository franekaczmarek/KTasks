"""Step 1: verify the migrated Supabase schema, constraints, storage bucket and lockdown."""
import httpx
import psycopg
import pytest

from app.config import get_settings

TABLES = {
    "users", "area_leads", "issues", "attachments", "blockers", "tasks", "task_templates",
    "comments", "issue_participants", "notifications", "activity_log",
}


@pytest.fixture(scope="module")
def conn():
    with psycopg.connect(get_settings().database_url) as c:
        yield c


def test_all_tables_exist_with_rls(conn):
    rows = conn.execute(
        "select tablename, rowsecurity from pg_tables where schemaname = 'public'"
    ).fetchall()
    found = dict(rows)
    assert TABLES <= found.keys()
    assert all(found[t] for t in TABLES), "RLS must be enabled on every app table"


def test_spec_columns_present(conn):
    cols = {
        r[0] for r in conn.execute(
            "select column_name from information_schema.columns "
            "where table_schema = 'public' and table_name = 'issues'"
        )
    }
    assert {"title", "summary", "area", "priority", "effort", "root_cause", "status", "created_at",
            "start_date", "expected_end_date", "creator_id", "lead_id", "closed_by_user_id",
            "closed_at", "resolved_at"} <= cols


@pytest.mark.parametrize("column,value", [
    ("status", "Bogus"), ("priority", "Urgent"), ("area", "HR"), ("effort", "Huge"),
])
def test_issue_enum_checks(conn, column, value):
    with pytest.raises(psycopg.errors.CheckViolation), conn.transaction(force_rollback=True):
        conn.execute(
            "insert into auth.users (id, email) values (gen_random_uuid(), 'chk@test.local') returning id"
        )
        uid = conn.execute("select id from auth.users where email = 'chk@test.local'").fetchone()[0]
        conn.execute("insert into public.users (id, email, name) values (%s, 'chk@test.local', 'Chk')", (uid,))
        values = {"area": "Process", "priority": "Low", "effort": "Low", "status": "New", column: value}
        conn.execute(
            "insert into public.issues (title, area, priority, effort, status, creator_id) "
            "values ('t', %(area)s, %(priority)s, %(effort)s, %(status)s, %(uid)s)",
            {**values, "uid": uid},
        )


def test_task_templates_seeded(conn):
    titles = [r[0] for r in conn.execute("select title from public.task_templates order by sort")]
    assert titles[:3] == ["Root cause analysis", "Fix implementation", "Fix testing"]
    assert "SOP update" in titles


def test_trigram_extension_and_index(conn):
    assert conn.execute("select 1 from pg_extension where extname = 'pg_trgm'").fetchone()
    assert conn.execute("select 1 from pg_indexes where indexname = 'issues_title_trgm_idx'").fetchone()


def test_due_date_request_kinds(conn):
    names = {r[0] for r in conn.execute(
        "select conname from pg_constraint where conrelid = 'public.due_date_requests'::regclass")}
    assert {"due_date_requests_kind_check", "due_date_requests_from_date_kind_check"} <= names
    nullable = conn.execute(
        "select is_nullable from information_schema.columns where table_schema = 'public' "
        "and table_name = 'due_date_requests' and column_name = 'from_date'").fetchone()[0]
    assert nullable == "YES"


def test_storage_bucket_private(conn):
    row = conn.execute("select public from storage.buckets where id = 'issue-attachments'").fetchone()
    assert row is not None and row[0] is False


def test_data_api_cannot_read_tables():
    s = get_settings()
    r = httpx.get(
        f"{s.supabase_url}/rest/v1/issues?select=id",
        headers={"apikey": s.supabase_publishable_key},
        timeout=15,
    )
    # Privileges revoked for anon -> 401/403/404 depending on PostgREST version; never 200 with data.
    assert r.status_code != 200, r.text
