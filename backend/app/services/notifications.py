"""In-app notifications (+ optional email to Leads via Resend, sent after the response)."""
from collections.abc import Iterable
from uuid import UUID

from fastapi import BackgroundTasks
from sqlalchemy import Connection

from app.db import execute, fetch_all
from app.services import email
from app.services.access import involved_sql


def notify(
    conn: Connection,
    user_ids: Iterable[UUID | str | None],
    type_: str,
    message: str,
    *,
    issue_id: int | None = None,
    link: str | None = None,
    exclude: UUID | str | None = None,
    email_leads: bool = False,
    background: BackgroundTasks | None = None,
    subject: str | None = None,
) -> list[str]:
    """Creates one notification per distinct recipient (minus `exclude`). Returns recipient ids."""
    recipients = sorted({str(u) for u in user_ids if u is not None} - ({str(exclude)} if exclude else set()))
    for uid in recipients:
        execute(
            conn,
            "insert into public.notifications (user_id, issue_id, type, message, link) "
            "values (:uid, :issue_id, :type, :message, :link)",
            uid=uid, issue_id=issue_id, type=type_, message=message, link=link,
        )
    if email_leads and background is not None and recipients:
        # Lead mail goes to staff and to acting backups (users standing in for an absent owner).
        leads = fetch_all(
            conn, """select u.email from public.users u where u.id = any(cast(:ids as uuid[]))
                     and (u.role in ('lead', 'director') or exists (
                         select 1 from public.users o where o.backup_lead_id = u.id and o.is_absent))""",
            ids=recipients,
        )
        if leads:
            background.add_task(email.send_email, [r["email"] for r in leads], subject or message, message, link)
    return recipients


def issue_audience(conn: Connection, issue_id: int) -> list[str]:
    """Creator, current Lead and all thread participants of an issue - minus anyone who can't see it (hidden)."""
    rows = fetch_all(
        conn,
        f"""with audience as (
               select creator_id as id from public.issues where id = :id
               union select lead_id from public.issues where id = :id and lead_id is not null
               union select user_id from public.issue_participants where issue_id = :id)
           select u.id from audience a join public.users u on u.id = a.id
           join public.issues i on i.id = :id
           where u.role in ('lead', 'director') or {involved_sql("u.id")}""",
        id=issue_id,
    )
    return [str(r["id"]) for r in rows]
