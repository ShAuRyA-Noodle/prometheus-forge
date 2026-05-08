"""USPTO trademark conflict checker.

Tries the public USPTO TSDR / Marker API first, then falls back to a
trademarks.justia.com HTML scrape. Results cached for 24h via cachetools TTL.

If no key is configured and the network calls fail, returns ``[]`` and emits
a structured warning. Never fabricates conflicts.
"""
from __future__ import annotations

import asyncio
from typing import Any

import httpx
import structlog
from cachetools import TTLCache
from pydantic import BaseModel

from config import settings

log = structlog.get_logger(__name__)


class ConflictEntry(BaseModel):
    mark: str
    owner: str | None = None
    status: str | None = None
    serial_number: str | None = None
    international_class: str | None = None
    source: str
    url: str | None = None


# 24h TTL cache, name-keyed
_cache: TTLCache[str, list[ConflictEntry]] = TTLCache(maxsize=2048, ttl=24 * 60 * 60)
_cache_lock = asyncio.Lock()


_USPTO_TSDR_BASE = "https://tsdrapi.uspto.gov/ts/cd/casestatus"
_JUSTIA_BASE = "https://trademarks.justia.com/search"


async def _query_uspto_tsdr(client: httpx.AsyncClient, name: str) -> list[ConflictEntry]:
    if not settings.uspto_api_key:
        return []
    headers = {
        "USPTO-API-KEY": settings.uspto_api_key,
        "Accept": "application/json",
    }
    # USPTO's TSDR API is case-status by serial; search by mark literal is via
    # the public marker endpoint. We call a search-style endpoint.
    url = f"{_USPTO_TSDR_BASE}/search"
    try:
        r = await client.get(
            url,
            headers=headers,
            params={"searchText": name, "rows": 25},
            timeout=8.0,
        )
        if r.status_code != 200:
            log.warning("trademark.uspto.non200", status=r.status_code)
            return []
        data = r.json()
    except Exception as e:  # noqa: BLE001
        log.warning("trademark.uspto.error", err=str(e))
        return []

    entries: list[ConflictEntry] = []
    for item in data.get("results", []) or data.get("cases", []) or []:
        try:
            entries.append(
                ConflictEntry(
                    mark=str(item.get("markIdentification") or item.get("mark") or ""),
                    owner=item.get("ownerName") or item.get("owner"),
                    status=item.get("statusDescription") or item.get("status"),
                    serial_number=str(item.get("serialNumber") or item.get("serial") or "") or None,
                    international_class=str(item.get("internationalClass") or "") or None,
                    source="uspto_tsdr",
                    url=item.get("link"),
                )
            )
        except Exception:
            continue
    return entries


async def _query_justia(client: httpx.AsyncClient, name: str) -> list[ConflictEntry]:
    """HTML fallback. We deliberately keep parsing minimal — if Justia changes
    layout, return []."""
    try:
        r = await client.get(
            _JUSTIA_BASE,
            params={"q": name},
            timeout=8.0,
            headers={"User-Agent": "Prometheus/1.0 (trademark-check)"},
        )
        if r.status_code != 200:
            return []
    except Exception as e:  # noqa: BLE001
        log.warning("trademark.justia.error", err=str(e))
        return []

    try:
        from bs4 import BeautifulSoup  # type: ignore[import-not-found]
    except Exception:
        return []

    soup = BeautifulSoup(r.text, "lxml")
    out: list[ConflictEntry] = []
    for card in soup.select("li.has-padding-content-block-30, div.search-result")[:20]:
        title_el = card.find("a")
        owner_el = card.find(class_=lambda c: c and "owner" in str(c).lower())
        if not title_el:
            continue
        href = title_el.get("href", "")
        out.append(
            ConflictEntry(
                mark=title_el.get_text(strip=True),
                owner=owner_el.get_text(strip=True) if owner_el else None,
                status=None,
                source="justia",
                url=("https://trademarks.justia.com" + href) if href.startswith("/") else href,
            )
        )
    return out


def _filter_relevance(name: str, entries: list[ConflictEntry]) -> list[ConflictEntry]:
    """Keep only entries whose mark token-overlaps with our candidate."""
    norm = name.strip().lower()
    if not norm:
        return []

    tokens = set(norm.split())
    out: list[ConflictEntry] = []
    for e in entries:
        m = e.mark.strip().lower()
        if not m:
            continue
        if norm == m:
            out.append(e)
            continue
        if norm in m or m in norm:
            out.append(e)
            continue
        if tokens & set(m.split()):
            out.append(e)
    # Dedup by (mark, owner)
    seen: set[tuple[str, str]] = set()
    uniq: list[ConflictEntry] = []
    for e in out:
        key = (e.mark.strip().lower(), (e.owner or "").strip().lower())
        if key in seen:
            continue
        seen.add(key)
        uniq.append(e)
    return uniq[:25]


async def check_uspto(name: str) -> list[ConflictEntry]:
    """Public entrypoint. Returns relevant trademark conflicts for ``name``."""
    norm = (name or "").strip()
    if not norm:
        return []

    cache_key = norm.lower()

    async with _cache_lock:
        cached = _cache.get(cache_key)
        if cached is not None:
            return list(cached)

    async with httpx.AsyncClient() as client:
        primary: list[ConflictEntry] = []
        if settings.uspto_api_key:
            primary = await _query_uspto_tsdr(client, norm)
        if not primary:
            primary = await _query_justia(client, norm)

    filtered = _filter_relevance(norm, primary)

    async with _cache_lock:
        _cache[cache_key] = filtered

    log.info(
        "trademark.check",
        name_chars=len(norm),
        conflicts=len(filtered),
        sources_tried=("uspto+justia" if settings.uspto_api_key else "justia"),
    )
    return filtered


__all__ = ["ConflictEntry", "check_uspto"]
