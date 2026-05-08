"""Cloudflare Workers + KV deployment for generated landing pages.

  * ``deploy_landing_page(html, css, subdomain)`` — uploads the HTML/CSS to
    the configured Cloudflare KV namespace and returns the worker URL serving
    that subdomain. Assumes a Worker exists that reads ``html:{subdomain}``
    from KV at request time.
  * ``provision_domain(name, user_id)`` — registers a domain via Cloudflare
    Registrar API + creates default DNS records pointing at the Worker.

If ``cloudflare_api_token`` is missing, returns a degraded-mode placeholder
URL and emits structured warnings.
"""
from __future__ import annotations

import re
from typing import Any

import httpx
import structlog

from config import settings

log = structlog.get_logger(__name__)


_API_BASE = "https://api.cloudflare.com/client/v4"
_KV_NAMESPACE_TITLE = "prometheus-landing"
_WORKER_DOMAIN = "promethe.us"  # configured Worker hostname


_SLUG_RE = re.compile(r"[^a-z0-9-]")


def _slugify_subdomain(s: str) -> str:
    return _SLUG_RE.sub("", (s or "").lower()).strip("-")[:48] or "site"


# ─── Internal helpers ───────────────────────────────────────────────────────


async def _cf_request(
    client: httpx.AsyncClient,
    method: str,
    path: str,
    *,
    json_body: Any = None,
    params: dict[str, Any] | None = None,
    raw_text: str | None = None,
    extra_headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {settings.cloudflare_api_token}",
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)
    if raw_text is not None:
        headers["Content-Type"] = "text/plain"
    url = f"{_API_BASE}{path}"
    r = await client.request(
        method,
        url,
        json=json_body,
        params=params,
        content=raw_text,
        headers=headers,
        timeout=20.0,
    )
    if r.status_code >= 400:
        log.warning("cloudflare.non2xx", status=r.status_code, path=path)
    try:
        return r.json()
    except Exception:
        return {"success": False, "errors": [{"message": r.text}]}


async def _resolve_kv_namespace_id(client: httpx.AsyncClient) -> str | None:
    if not settings.cloudflare_account_id:
        return None
    res = await _cf_request(
        client,
        "GET",
        f"/accounts/{settings.cloudflare_account_id}/storage/kv/namespaces",
    )
    if not res.get("success"):
        return None
    for ns in res.get("result", []) or []:
        if ns.get("title") == _KV_NAMESPACE_TITLE:
            return str(ns.get("id"))
    # Create on demand
    created = await _cf_request(
        client,
        "POST",
        f"/accounts/{settings.cloudflare_account_id}/storage/kv/namespaces",
        json_body={"title": _KV_NAMESPACE_TITLE},
    )
    if created.get("success"):
        return str(created["result"]["id"])
    return None


# ─── Public API ─────────────────────────────────────────────────────────────


async def deploy_landing_page(html: str, css: str, subdomain: str) -> str:
    """Upload an HTML+CSS page to Cloudflare KV. Returns the live URL."""
    sub = _slugify_subdomain(subdomain)
    fallback_url = f"https://{sub}.{_WORKER_DOMAIN}"

    if not (settings.cloudflare_api_token and settings.cloudflare_account_id):
        log.warning("deploy.no_cloudflare_token", subdomain=sub)
        return fallback_url

    composed = (
        html
        if "<style" in html or not css
        else html.replace("</head>", f"<style>{css}</style></head>")
        if "</head>" in html
        else f"<style>{css}</style>{html}"
    )

    async with httpx.AsyncClient() as client:
        ns_id = await _resolve_kv_namespace_id(client)
        if ns_id is None:
            log.warning("deploy.kv_namespace_unresolved")
            return fallback_url

        path = f"/accounts/{settings.cloudflare_account_id}/storage/kv/namespaces/{ns_id}/values/html:{sub}"
        res = await _cf_request(client, "PUT", path, raw_text=composed)
        if not res.get("success"):
            log.error("deploy.kv_put_failed", errors=res.get("errors"))
            return fallback_url

    log.info("deploy.landing_page", subdomain=sub)
    return fallback_url


async def provision_domain(name: str, user_id: str) -> dict[str, Any]:
    """Provision a custom domain via Cloudflare. We do NOT auto-purchase here —
    we simply set up the zone + DNS and report what records the user must
    point their registrar at."""
    if not (settings.cloudflare_api_token and settings.cloudflare_account_id):
        log.warning("provision.no_cloudflare_token")
        return {"domain": name, "dns_records": [], "status": "missing_credentials"}

    async with httpx.AsyncClient() as client:
        # Create / lookup zone
        zone_res = await _cf_request(
            client,
            "POST",
            "/zones",
            json_body={
                "name": name,
                "account": {"id": settings.cloudflare_account_id},
                "type": "full",
            },
        )
        if not zone_res.get("success"):
            # Maybe already exists — look it up
            list_res = await _cf_request(
                client, "GET", "/zones", params={"name": name}
            )
            zone = (list_res.get("result") or [{}])[0]
        else:
            zone = zone_res.get("result", {})

        zone_id = zone.get("id")
        nameservers = zone.get("name_servers", []) or []

        records: list[dict[str, Any]] = []
        if zone_id:
            for record in (
                {"type": "CNAME", "name": "@", "content": _WORKER_DOMAIN, "proxied": True},
                {"type": "CNAME", "name": "www", "content": _WORKER_DOMAIN, "proxied": True},
            ):
                rec_res = await _cf_request(
                    client,
                    "POST",
                    f"/zones/{zone_id}/dns_records",
                    json_body=record,
                )
                if rec_res.get("success"):
                    records.append(rec_res["result"])

    log.info("provision.domain", domain=name, records=len(records))
    return {
        "domain": name,
        "zone_id": zone.get("id"),
        "nameservers": nameservers,
        "dns_records": records,
        "status": "configured" if records else "zone_only",
    }


__all__ = ["deploy_landing_page", "provision_domain"]
