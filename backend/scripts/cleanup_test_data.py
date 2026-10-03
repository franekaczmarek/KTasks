"""Delete issues whose title starts with a test tag (cascades to all child rows) plus their stored files.

Usage: python scripts/cleanup_test_data.py "[e2e]"
"""
import sys
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import get_settings  # noqa: E402
from app.services import storage  # noqa: E402


def cleanup(tag: str) -> int:
    pattern = tag.replace("[", r"\[").replace("]", r"\]") + "%"
    with psycopg.connect(get_settings().database_url) as conn:
        paths = [r[0] for r in conn.execute(
            "select a.storage_path from public.attachments a join public.issues i on i.id = a.issue_id "
            "where i.title like %s", (pattern,))]
        deleted = conn.execute("delete from public.issues where title like %s", (pattern,)).rowcount
        conn.execute("update public.users set is_absent = false")
    storage.remove(paths)
    return deleted


if __name__ == "__main__":
    print(f"deleted {cleanup(sys.argv[1] if len(sys.argv) > 1 else '[e2e]')} test issues")
