"""Transactional email via the Resend REST API."""
import html
import logging

import httpx

from app.config import get_settings

log = logging.getLogger("ktasks.email")

RESEND_URL = "https://api.resend.com/emails"


def render(title: str, body: str, link: str | None) -> str:
    s = get_settings()
    button = (
        f'<p style="margin:24px 0 0"><a href="{s.frontend_url}{html.escape(link)}" '
        'style="background:#00205B;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;'
        'font-weight:600">Open in KTasks</a></p>'
        if link else ""
    )
    return (
        '<div style="font-family:Segoe UI,Arial,sans-serif;background:#F4F5F7;padding:24px">'
        '<div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden">'
        '<div style="background:#00205B;color:#fff;padding:16px 24px;font-weight:600">KTasks '
        '<span style="color:#D0006F">·</span> AstraZeneca Pharma</div>'
        f'<div style="padding:24px;color:#1b2233"><h2 style="margin:0 0 12px;color:#00205B;font-size:18px">'
        f'{html.escape(title)}</h2><p style="margin:0;line-height:1.5">{html.escape(body)}</p>{button}</div>'
        "</div></div>"
    )


def send_email(to: list[str], subject: str, body: str, link: str | None = None) -> bool:
    """Best-effort send; never raises (runs as a background task)."""
    s = get_settings()
    if not s.resend_api_key or not to:
        return False
    recipients = [s.email_override_to] if s.email_override_to else to
    try:
        r = httpx.post(
            RESEND_URL,
            headers={"Authorization": f"Bearer {s.resend_api_key}"},
            json={"from": f"KTasks <{s.sender_email}>", "to": recipients, "subject": subject,
                  "html": render(subject, body, link)},
            timeout=15,
        )
        if r.status_code >= 400:
            log.warning("Resend rejected email to %s: %s %s", recipients, r.status_code, r.text[:200])
            return False
        return True
    except httpx.HTTPError as exc:
        log.warning("Resend request failed: %s", exc)
        return False
