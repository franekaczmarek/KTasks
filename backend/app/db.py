from collections.abc import Iterator
from typing import Any

from sqlalchemy import Connection, create_engine, text

from app.config import get_settings


def _url() -> str:
    url = get_settings().database_url
    return url.replace("postgresql://", "postgresql+psycopg://", 1)


# Supabase session pooler caps client connections; keep the pool small.
engine = create_engine(_url(), pool_size=5, max_overflow=5, pool_pre_ping=True, pool_recycle=300)


def get_db() -> Iterator[Connection]:
    """FastAPI dependency: one transaction per request, committed on success."""
    with engine.begin() as conn:
        yield conn


def fetch_all(conn: Connection, sql: str, **params: Any) -> list[dict[str, Any]]:
    return [dict(r) for r in conn.execute(text(sql), params).mappings()]


def fetch_one(conn: Connection, sql: str, **params: Any) -> dict[str, Any] | None:
    row = conn.execute(text(sql), params).mappings().first()
    return dict(row) if row else None


def execute(conn: Connection, sql: str, **params: Any) -> None:
    conn.execute(text(sql), params)
