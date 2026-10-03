"""Lead routing: Area -> Lead, falling back to the Lead's backup while absent."""
from typing import Any

from sqlalchemy import Connection

from app.db import fetch_all, fetch_one

_AREA_LEADS_SQL = """
    select a.area, a.lead_id, l.name as lead_name, l.is_absent as lead_absent,
           case when l.is_absent and b.id is not null then b.id else l.id end as effective_lead_id,
           case when l.is_absent and b.id is not null then b.name else l.name end as effective_lead_name
    from public.area_leads a
    join public.users l on l.id = a.lead_id
    left join public.users b on b.id = l.backup_lead_id
"""


def area_leads(conn: Connection) -> list[dict[str, Any]]:
    return fetch_all(conn, _AREA_LEADS_SQL + " order by a.area")


def resolve_lead(conn: Connection, area: str) -> dict[str, Any] | None:
    """Returns the area_leads row incl. effective_lead_id, or None if the area has no lead."""
    return fetch_one(conn, _AREA_LEADS_SQL + " where a.area = :area", area=area)
