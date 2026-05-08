"""Domain + handle availability checks.

Domain check: Domainr API (settings.domainr_api_key). Single ``status`` call,
returns a per-tld availability map.

Handle check: HEAD request to public profile URLs. We treat 404 / 410 as
"available" and any 2xx as "taken". Network failures → ``None`` (unknown).

Both are 24h TTL-cached.
"""
from __future__ import annotations

import asyncio
import re
from typing import Any

import httpx
import structlog
from cachetools import TTLCache

from config import settings

log = structlog.get_logger(__name__)


_DOMAINR_URL = "https://api.domainr.com/v2/status"
_DOMAIN_TLDS = ("com", "ai", "app", "io")
_HANDLE_PLATFORMS: dict[str, str] = {
    "x": "https://x.com/{handle}",
    "instagram": "https://www.instagram.com/{handle}/",
    "github": "https://github.com/{handle}",
}

_domain_cache: TTLCache[str, dict[str, bool]] = TTLCache(maxsize=4096, ttl=24 * 60 * 60)
_handle_cache: TTLCache[str, dict[str, bool]] = TTLCache(maxsize=4096, ttl=24 * 60 * 60)
_lock = asyncio.Lock()


_NAME_RE = re.compile(r"[^a-z0-9]")


def _slug(name: str) -> str:
    return _NAME_RE.sub("", (name or "").lower())


# ─── Domains ─────────────────────────────────────────────────────────────────


async def check_domains(name: str) -> dict[str, bool | None]:
    """Returns map of tld → True (available) / False (taken) / None (unknown)."""
    slug = _slug(name)
    if not slug:
        return {tld: None for tld in _DOMAIN_TLDS}

    async with _lock:
        cached = _domain_cache.get(slug)
        if cached is not None:
            return dict(cached)

    domains = [f"{slug}.{tld}" for tld in _DOMAIN_TLDS]

    if not settings.domainr_api_key:
        log.warning("domain.no_key", slug=slug)
        result: dict[str, bool | None] = {tld: None for tld in _DOMAIN_TLDS}
        return result

    async with httpx.AsyncClient(timeout=8.0) as client:
        try:
            r = await client.get(
                _DOMAINR_URL,
                params={
                    "domain": ",".join(domains),
                    "client_id": settings.domainr_api_key,
                },
                headers={"Accept": "application/json"},
            )
            if r.status_code != 200:
                log.warning("domain.domainr.non200", status=r.status_code)
                return {tld: None for tld in _DOMAIN_TLDS}
            data: dict[str, Any] = r.json()
        except Exception as e:  # noqa: BLE001
            log.warning("domain.domainr.error", err=str(e))
            return {tld: None for tld in _DOMAIN_TLDS}

    out: dict[str, bool | None] = {}
    for entry in data.get("status", []):
        domain = str(entry.get("domain", ""))
        status = str(entry.get("status", ""))
        # Per Domainr docs: "undelegated", "inactive" → likely available;
        # "active" / "marketed" / "premium" → taken.
        is_available = "undelegated" in status or "inactive" in status
        is_taken = any(t in status for t in ("active", "marketed", "premium", "parked", "tld"))
        if is_available:
            verdict: bool | None = True
        elif is_taken:
            verdict = False
        else:
            verdict = None
        for tld in _DOMAIN_TLDS:
            if domain.endswith("." + tld):
                out[tld] = verdict

    for tld in _DOMAIN_TLDS:
        out.setdefault(tld, None)

    async with _lock:
        # Only cache fully-resolved entries
        _domain_cache[slug] = {k: bool(v) for k, v in out.items() if v is not None}

    log.info("domain.check", slug=slug, result=out)
    return out


# ─── Social handles ──────────────────────────────────────────────────────────


async def _check_one_handle(client: httpx.AsyncClient, url: str) -> bool | None:
    try:
        # Some platforms reject HEAD; use GET with small range
        r = await client.get(
            url,
            timeout=6.0,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; PrometheusBot/1.0)",
                "Accept": "text/html",
            },
            follow_redirects=True,
        )
    except Exception:
        return None

    if r.status_code in (404, 410):
        return True  # available
    if 200 <= r.status_code < 300:
        # Some platforms render an "user not found" page with 200. Crude fallback:
        body = r.text.lower()[:8000]
        not_found_markers = (
            "user not found",
            "page isn't available",
            "page not found",
            "sorry, this page",
            "doesn't exist",
            "this account doesn",
        )
        if any(m in body for m in not_found_markers):
            return True
        return False
    return None


async def check_handles(name: str) -> dict[str, bool | None]:
    slug = _slug(name)
    if not slug:
        return {p: None for p in _HANDLE_PLATFORMS}

    async with _lock:
        cached = _handle_cache.get(slug)
        if cached is not None:
            return dict(cached)

    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            *[
                _check_one_handle(client, tpl.format(handle=slug))
                for tpl in _HANDLE_PLATFORMS.values()
            ],
            return_exceptions=False,
        )

    out: dict[str, bool | None] = {p: r for p, r in zip(_HANDLE_PLATFORMS.keys(), results)}

    async with _lock:
        _handle_cache[slug] = {k: bool(v) for k, v in out.items() if v is not None}

    log.info("handle.check", slug=slug, result=out)
    return out


__all__ = ["check_domains", "check_handles"]
