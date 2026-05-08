"""Email notifications: completion, market digest, marketplace updates.

Resend primary, SendGrid fallback. If neither key is set, returns False
silently with a structured warning — never crashes the pipeline.
"""
from __future__ import annotations

from typing import Any

import httpx
import structlog

from config import settings
from models.user_models import User

log = structlog.get_logger(__name__)


_RESEND_URL = "https://api.resend.com/emails"
_SENDGRID_URL = "https://api.sendgrid.com/v3/mail/send"
_FROM = "PROMETHEUS <hello@prometheus.ai>"


# ─── Provider sends ─────────────────────────────────────────────────────────


async def _send_via_resend(to: str, subject: str, html: str, text: str) -> bool:
    if not settings.resend_api_key:
        return False
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                _RESEND_URL,
                headers={
                    "Authorization": f"Bearer {settings.resend_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": _FROM,
                    "to": [to],
                    "subject": subject,
                    "html": html,
                    "text": text,
                },
            )
            if r.status_code in (200, 202):
                return True
            log.warning("notify.resend.non2xx", status=r.status_code)
            return False
    except Exception as e:  # noqa: BLE001
        log.warning("notify.resend.err", err=str(e))
        return False


async def _send_via_sendgrid(to: str, subject: str, html: str, text: str) -> bool:
    if not settings.sendgrid_api_key:
        return False
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                _SENDGRID_URL,
                headers={
                    "Authorization": f"Bearer {settings.sendgrid_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "personalizations": [{"to": [{"email": to}]}],
                    "from": {"email": "hello@prometheus.ai", "name": "PROMETHEUS"},
                    "subject": subject,
                    "content": [
                        {"type": "text/plain", "value": text},
                        {"type": "text/html", "value": html},
                    ],
                },
            )
            if r.status_code in (200, 202):
                return True
            log.warning("notify.sendgrid.non2xx", status=r.status_code)
            return False
    except Exception as e:  # noqa: BLE001
        log.warning("notify.sendgrid.err", err=str(e))
        return False


async def _send(to: str, subject: str, html: str, text: str) -> bool:
    if not to:
        log.warning("notify.no_recipient")
        return False
    sent = await _send_via_resend(to, subject, html, text)
    if not sent:
        sent = await _send_via_sendgrid(to, subject, html, text)
    if not sent:
        log.warning("notify.all_providers_failed")
    return sent


# ─── Templates ──────────────────────────────────────────────────────────────


def _completion_email(user: User, company: dict[str, Any]) -> tuple[str, str, str]:
    name = company.get("name") or "your company"
    deck_url = company.get("deck_url") or "#"
    landing_url = company.get("landing_url") or "#"
    sheets_url = company.get("sheets_url") or "#"

    subject = f"PROMETHEUS — {name} is ready"
    text = (
        f"Hi {user.display_name or 'there'},\n\n"
        f"{name} is ready. Open the dashboard for the full package:\n\n"
        f"  • Pitch Deck: {deck_url}\n"
        f"  • Landing Page: {landing_url}\n"
        f"  • Financial Model: {sheets_url}\n\n"
        f"— PROMETHEUS"
    )
    html = (
        f"<p>Hi {user.display_name or 'there'},</p>"
        f"<p><strong>{name}</strong> is ready. Open the dashboard for the full package:</p>"
        f"<ul>"
        f"<li><a href='{deck_url}'>Pitch Deck</a></li>"
        f"<li><a href='{landing_url}'>Landing Page</a></li>"
        f"<li><a href='{sheets_url}'>Financial Model</a></li>"
        f"</ul>"
        f"<p>— PROMETHEUS</p>"
    )
    return subject, html, text


def _digest_email(user: User, company: dict[str, Any], diffs: list[dict[str, Any]]) -> tuple[str, str, str]:
    name = company.get("name") or "your company"
    subject = f"PROMETHEUS — Weekly market update for {name}"
    text_lines = [f"This week's changes for {name}:\n"]
    html_lines = [f"<p>This week's changes for <strong>{name}</strong>:</p>", "<ul>"]
    for d in diffs:
        line = f"• {d.get('title', 'Update')}: {d.get('summary', '')}"
        text_lines.append(line)
        html_lines.append(f"<li><strong>{d.get('title', '')}</strong>: {d.get('summary', '')}</li>")
    html_lines.append("</ul>")
    return subject, "\n".join(html_lines), "\n".join(text_lines)


# ─── Public API ─────────────────────────────────────────────────────────────


async def send_completion_email(user: User, company: dict[str, Any]) -> bool:
    if not user.email:
        return False
    subject, html, text = _completion_email(user, company)
    return await _send(str(user.email), subject, html, text)


async def send_market_digest(user: User, company: dict[str, Any], diffs: list[dict[str, Any]]) -> bool:
    if not user.email or not diffs:
        return False
    subject, html, text = _digest_email(user, company, diffs)
    return await _send(str(user.email), subject, html, text)


__all__ = ["send_completion_email", "send_market_digest"]
