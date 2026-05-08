"""Third-party market data wrappers: Crunchbase, Statista, SimilarWeb.

Each function returns a list of ``DataPoint`` with ``Citation``. If the
relevant API key is missing or the call fails, returns ``[]`` and emits a
structured warning. We **NEVER** fabricate data here — graceful empty.
"""
from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

import httpx
import structlog
from cachetools import TTLCache

from config import settings
from models.agent_schemas import Citation, DataPoint

log = structlog.get_logger(__name__)


_cache: TTLCache[str, list[DataPoint]] = TTLCache(maxsize=4096, ttl=12 * 60 * 60)


def _make_citation(url: str, publisher: str, text: str) -> Citation:
    from datetime import datetime, timezone

    return Citation(
        text=text,
        source_url=url,
        publisher=publisher,
        accessed_at=datetime.now(timezone.utc).isoformat(),
    )


# ─── Crunchbase ──────────────────────────────────────────────────────────────


async def crunchbase_company(name: str) -> list[DataPoint]:
    """Returns funding/employees/category if Crunchbase finds the company.

    Crunchbase's REST API requires a paid key. If unavailable → [].
    """
    key = settings.crunchbase_api_key
    if not key or not name:
        if not key:
            log.warning("market_data.crunchbase.no_key")
        return []
    cache_key = f"cb:{name.lower()}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return list(cached)

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                "https://api.crunchbase.com/api/v4/searches/organizations",
                params={"user_key": key},
                json={
                    "field_ids": [
                        "identifier",
                        "categories",
                        "num_employees_enum",
                        "funding_total",
                    ],
                    "query": [
                        {
                            "type": "predicate",
                            "field_id": "name",
                            "operator_id": "contains",
                            "values": [name],
                        }
                    ],
                    "limit": 1,
                },
            )
            if r.status_code != 200:
                log.warning("market_data.crunchbase.non200", status=r.status_code)
                return []
            data = r.json()
    except Exception as e:  # noqa: BLE001
        log.warning("market_data.crunchbase.err", err=str(e))
        return []

    entities = data.get("entities", []) or []
    if not entities:
        return []
    e0 = entities[0].get("properties", {}) or {}
    permalink = entities[0].get("identifier", {}).get("permalink", "")
    url = f"https://www.crunchbase.com/organization/{permalink}" if permalink else "https://www.crunchbase.com"

    out: list[DataPoint] = []
    funding = e0.get("funding_total", {}) or {}
    if funding:
        amount = funding.get("value_usd")
        if amount is not None:
            out.append(
                DataPoint(
                    label=f"Total funding raised by {name}",
                    value=float(amount),
                    unit="USD",
                    confidence="sourced",
                    source=_make_citation(url, "Crunchbase", "Crunchbase profile"),
                )
            )
    headcount_enum = e0.get("num_employees_enum")
    if headcount_enum:
        out.append(
            DataPoint(
                label=f"{name} headcount range",
                value=str(headcount_enum),
                confidence="sourced",
                source=_make_citation(url, "Crunchbase", "Crunchbase headcount band"),
            )
        )
    _cache[cache_key] = out
    return out


# ─── Statista ────────────────────────────────────────────────────────────────


async def statista_search(query: str, max_results: int = 5) -> list[DataPoint]:
    """Statista API is partner-only. We accept ``settings.statista_api_key`` and
    POST to their statistics search endpoint."""
    key = settings.statista_api_key
    if not key or not query:
        if not key:
            log.warning("market_data.statista.no_key")
        return []
    cache_key = f"st:{query.lower()}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return list(cached)

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            r = await client.get(
                "https://api.statista.com/api/v1/statistics",
                params={"q": query, "limit": max_results},
                headers={"X-API-Key": key, "Accept": "application/json"},
            )
            if r.status_code != 200:
                log.warning("market_data.statista.non200", status=r.status_code)
                return []
            data = r.json()
    except Exception as e:  # noqa: BLE001
        log.warning("market_data.statista.err", err=str(e))
        return []

    out: list[DataPoint] = []
    for item in data.get("results", [])[:max_results]:
        title = item.get("title", "")
        url = item.get("url") or "https://www.statista.com"
        # Pull the headline value when present
        value = item.get("value") or item.get("headline_value")
        unit = item.get("unit") or "USD"
        if value is None:
            continue
        try:
            value = float(value)
        except (TypeError, ValueError):
            value = str(value)
        out.append(
            DataPoint(
                label=title or query,
                value=value,
                unit=unit if isinstance(value, float) else None,
                confidence="sourced",
                source=_make_citation(url, "Statista", title or query),
            )
        )
    _cache[cache_key] = out
    return out


# ─── SimilarWeb ─────────────────────────────────────────────────────────────


async def similarweb_traffic(domain: str) -> list[DataPoint]:
    """Get total monthly visits for a domain."""
    key = settings.similarweb_api_key
    if not key or not domain:
        if not key:
            log.warning("market_data.similarweb.no_key")
        return []
    cache_key = f"sw:{domain.lower()}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return list(cached)

    parsed = urlparse(domain if "://" in domain else f"https://{domain}")
    host = parsed.netloc or domain
    if host.startswith("www."):
        host = host[4:]

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f"https://api.similarweb.com/v1/website/{host}/total-traffic-and-engagement/visits",
                params={
                    "api_key": key,
                    "start_date": "2025-01",
                    "end_date": "2025-03",
                    "main_domain_only": "true",
                    "granularity": "monthly",
                },
            )
            if r.status_code != 200:
                log.warning("market_data.similarweb.non200", status=r.status_code)
                return []
            data = r.json()
    except Exception as e:  # noqa: BLE001
        log.warning("market_data.similarweb.err", err=str(e))
        return []

    visits = data.get("visits") or []
    if not visits:
        return []
    most_recent = visits[-1]
    value = most_recent.get("visits")
    if value is None:
        return []
    try:
        value = float(value)
    except (TypeError, ValueError):
        return []
    out = [
        DataPoint(
            label=f"Monthly visits to {host}",
            value=value,
            unit="visits/month",
            confidence="sourced",
            source=_make_citation(
                f"https://www.similarweb.com/website/{host}",
                "SimilarWeb",
                "SimilarWeb traffic API",
            ),
        )
    ]
    _cache[cache_key] = out
    return out


__all__ = ["crunchbase_company", "similarweb_traffic", "statista_search"]
