import json
from typing import Any
from uuid import UUID

from sqlalchemy import Connection

from app.db import execute


def _jsonable(value: Any) -> Any:
    if isinstance(value, UUID):
        return str(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def log_activity(conn: Connection, issue_id: int, user_id: UUID | str | None, action: str, **details: Any) -> None:
    """Append an audit entry. user_id None = system action (e.g. auto-close)."""
    execute(
        conn,
        "insert into public.activity_log (issue_id, user_id, action_type, details) "
        "values (:issue_id, :user_id, :action, cast(:details as jsonb))",
        issue_id=issue_id, user_id=user_id, action=action,
        details=json.dumps({k: _jsonable(v) for k, v in details.items()}),
    )
