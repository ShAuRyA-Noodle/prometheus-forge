"""Share-view pixel — HTTP-triggered Cloud Function.

Returns a 1x1 transparent PNG. Records a view event so InvestorAnalytics can
count actual viewers without depending on JS execution. Useful for emailed
deck links and embed scenarios.

Endpoint::

    GET /pixel?token=<share_token>

CORS open, cache headers force no-store. Token is verified server-side; if
invalid we still return the pixel (so adversaries can't probe), but we don't
record a view.
"""
from __future__ import annotations

import base64
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

import functions_framework
from flask import Request, make_response

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("share_view_pixel")


PROJECT_ID = os.environ.get("PROJECT_ID", "")
SHARE_TOKEN_SECRET = os.environ.get("SHARE_TOKEN_SECRET", "")


# 1x1 transparent PNG, base64 encoded
_PIXEL_PNG = base64.b64decode(
    b"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


@functions_framework.http
def handle(request: Request) -> Any:
    token = request.args.get("token", "")
    response = _pixel_response()

    if not token:
        return response

    claims = _verify(token)
    if claims is None:
        return response

    try:
        _record_view(claims, request)
    except Exception as e:  # noqa: BLE001
        log.warning("share_view_pixel.record_failed", extra={"err": str(e)})

    return response


def _pixel_response() -> Any:
    resp = make_response(_PIXEL_PNG, 200)
    resp.headers["Content-Type"] = "image/png"
    resp.headers["Content-Length"] = str(len(_PIXEL_PNG))
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


# ─── Token verification (HS256, mirrors share_token_service) ─────────────────


def _verify(token: str) -> dict[str, Any] | None:
    import hashlib
    import hmac
    import time
    from base64 import urlsafe_b64decode

    parts = token.split(".")
    if len(parts) != 3:
        return None

    h, p, s = parts
    secret = (SHARE_TOKEN_SECRET or "dev-only-change-me").encode("utf-8")
    expected = hmac.new(secret, f"{h}.{p}".encode("ascii"), hashlib.sha256).digest()
    pad = "=" * (-len(s) % 4)
    actual = urlsafe_b64decode((s + pad).encode("ascii"))
    if not hmac.compare_digest(expected, actual):
        return None

    try:
        pad2 = "=" * (-len(p) % 4)
        payload = json.loads(urlsafe_b64decode((p + pad2).encode("ascii")))
    except Exception:  # noqa: BLE001
        return None

    if int(payload.get("exp", 0)) < int(time.time()):
        return None
    return payload


def _record_view(claims: dict[str, Any], request: Request) -> None:
    from google.cloud import firestore  # type: ignore[import-not-found]

    view_id = claims.get("view_id")
    if not view_id:
        return

    db = firestore.Client(project=PROJECT_ID or None)
    ref = db.collection("shares").document(view_id)
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip()
    ua = request.headers.get("User-Agent", "")[:300]
    referrer = request.headers.get("Referer", "")[:300]
    country = request.headers.get("X-AppEngine-Country") or request.headers.get("CF-IPCountry") or ""

    ref.set(
        {
            "session_id": claims.get("session_id"),
            "scope": claims.get("scope"),
            "first_viewed_at": datetime.now(timezone.utc),
        },
        merge=True,
    )
    ref.collection("views").add(
        {
            "viewed_at": datetime.now(timezone.utc),
            "ip": ip,
            "user_agent": ua,
            "referrer": referrer,
            "country": country,
            "is_bot": _looks_like_bot(ua),
            "via": "pixel",
        }
    )
    ref.update({"view_count": firestore.Increment(1)})


def _looks_like_bot(ua: str) -> bool:
    if not ua:
        return True
    needles = ("bot", "spider", "crawler", "slurp", "facebookexternalhit", "linkedin", "twitterbot")
    low = ua.lower()
    return any(n in low for n in needles)
