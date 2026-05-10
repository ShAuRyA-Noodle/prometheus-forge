"""Vertex AI Safety wrapper.

Thin async ``check_text(text)`` API used by gates + pipeline pre-filter.

Behaviour
---------
* When ``settings.vertex_safety_enabled`` is False, returns
  ``{"blocked": False, "categories": []}`` (graceful no-op so dev/CI never
  needs Vertex creds).
* Otherwise runs a 0-token Gemini-Flash classification call via
  ``google-cloud-aiplatform``/``google-genai`` and reads back ``safety_ratings``
  with threshold ``BLOCK_MEDIUM_AND_ABOVE``.
* Caches recent verdicts in an LRU keyed by sha256(text); each entry expires
  after 60 seconds (cheap defence against duplicate requests at high QPS).
* Never logs the raw text — always the sha256 prefix.
"""
from __future__ import annotations

import asyncio
import hashlib
import time
from typing import Any

import structlog

from config import settings

log = structlog.get_logger(__name__)


# ─── Categories we evaluate ─────────────────────────────────────────────────

HARM_CATEGORIES: tuple[str, ...] = (
    "HARM_CATEGORY_DANGEROUS_CONTENT",
    "HARM_CATEGORY_HARASSMENT",
    "HARM_CATEGORY_HATE_SPEECH",
    "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    # Vertex sometimes uses the simpler suffix form — accept both.
    "HARM_CATEGORY_DANGEROUS",
    "HARASSMENT",
    "HATE_SPEECH",
    "SEXUAL",
)


_BLOCK_THRESHOLDS: dict[str, float] = {
    # PROBABILITY enum maps roughly to severity score.
    "NEGLIGIBLE": 0.0,
    "LOW": 0.25,
    "MEDIUM": 0.5,
    "HIGH": 0.85,
}


# ─── 60-second LRU cache ────────────────────────────────────────────────────

_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_CACHE_TTL_SECONDS = 60.0
_CACHE_MAX_SIZE = 512
_cache_lock = asyncio.Lock()


def _hash(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8", errors="ignore")).hexdigest()


async def _cache_get(key: str) -> dict[str, Any] | None:
    async with _cache_lock:
        entry = _CACHE.get(key)
        if entry is None:
            return None
        ts, value = entry
        if (time.monotonic() - ts) > _CACHE_TTL_SECONDS:
            _CACHE.pop(key, None)
            return None
        return value


async def _cache_put(key: str, value: dict[str, Any]) -> None:
    async with _cache_lock:
        if len(_CACHE) >= _CACHE_MAX_SIZE:
            # Drop oldest 10% to make room.
            ordered = sorted(_CACHE.items(), key=lambda kv: kv[1][0])
            for k, _ in ordered[: max(1, _CACHE_MAX_SIZE // 10)]:
                _CACHE.pop(k, None)
        _CACHE[key] = (time.monotonic(), value)


# ─── Vertex call ────────────────────────────────────────────────────────────


def _normalize_category(name: str) -> str:
    return str(name).rsplit(".", 1)[-1].upper()


def _severity(probability: str) -> float:
    return _BLOCK_THRESHOLDS.get(str(probability).upper(), 0.0)


def _eval_safety_ratings(ratings: list[Any]) -> tuple[bool, list[str]]:
    """Threshold = BLOCK_MEDIUM_AND_ABOVE → severity >= 0.5 blocks."""
    blocked = False
    categories: list[str] = []
    for r in ratings:
        cat = _normalize_category(getattr(r, "category", ""))
        prob = getattr(r, "probability", "")
        sev = _severity(prob)
        if sev >= 0.5 and cat:
            blocked = True
            categories.append(cat)
    return blocked, categories


async def _vertex_check(text: str) -> dict[str, Any]:
    """Run the underlying Vertex Gemini Safety call. Failure → returns
    ``{"blocked": False, "categories": [], "error": str}`` (best-effort)."""
    try:
        from google.genai import types as gtypes  # type: ignore[import-not-found]
    except Exception as e:  # noqa: BLE001
        log.warning("vertex_safety.genai_missing", err=str(e))
        return {"blocked": False, "categories": [], "error": "genai_missing"}

    try:
        # Lazy import to avoid hard dep at module load.
        from services.gemini_client import _get_client  # type: ignore[attr-defined]
    except Exception as e:  # noqa: BLE001
        log.warning("vertex_safety.client_missing", err=str(e))
        return {"blocked": False, "categories": [], "error": "client_missing"}

    try:
        client = _get_client()
    except Exception as e:  # noqa: BLE001
        log.warning("vertex_safety.client_init_failed", err=str(e))
        return {"blocked": False, "categories": [], "error": "client_init_failed"}

    cfg = gtypes.GenerateContentConfig(
        temperature=0.0,
        response_mime_type="text/plain",
        max_output_tokens=4,
    )

    def _call() -> dict[str, Any]:
        resp = client.models.generate_content(
            model=settings.model_flash,
            contents=f"Classify the safety of this snippet. Respond OK.\n\n{text[:4000]}",
            config=cfg,
        )
        # Aggregate ratings across candidates + prompt_feedback.
        all_ratings: list[Any] = []
        for cand in (getattr(resp, "candidates", None) or []):
            all_ratings.extend(getattr(cand, "safety_ratings", None) or [])

        prompt_blocked = False
        prompt_block_reason: str | None = None
        pf = getattr(resp, "prompt_feedback", None)
        if pf is not None:
            br = str(getattr(pf, "block_reason", "") or "").upper()
            if br and br not in ("BLOCK_REASON_UNSPECIFIED", "0"):
                prompt_blocked = True
                prompt_block_reason = br
            all_ratings.extend(getattr(pf, "safety_ratings", None) or [])

        blocked, cats = _eval_safety_ratings(all_ratings)
        if prompt_blocked:
            blocked = True
            if prompt_block_reason:
                cats.append(f"PROMPT_BLOCKED_{prompt_block_reason}")
        return {"blocked": blocked, "categories": sorted(set(cats))}

    try:
        return await asyncio.to_thread(_call)
    except Exception as e:  # noqa: BLE001
        log.warning("vertex_safety.call_failed", err=str(e))
        return {"blocked": False, "categories": [], "error": str(e)}


# ─── Public API ─────────────────────────────────────────────────────────────


async def check_text(text: str) -> dict[str, Any]:
    """Returns ``{"blocked": bool, "categories": list[str]}``.

    No-op (returns blocked=False) when ``settings.vertex_safety_enabled`` is
    False so dev / unit tests never need real credentials.
    """
    if text is None:
        return {"blocked": False, "categories": []}

    if not settings.vertex_safety_enabled:
        return {"blocked": False, "categories": []}

    key = _hash(text)
    cached = await _cache_get(key)
    if cached is not None:
        return cached

    verdict = await _vertex_check(text)
    # Strip non-public diagnostic fields for caller.
    public = {
        "blocked": bool(verdict.get("blocked", False)),
        "categories": list(verdict.get("categories", []) or []),
    }
    await _cache_put(key, public)
    log.info(
        "vertex_safety.check",
        blocked=public["blocked"],
        categories=public["categories"],
        text_hash_prefix=key[:8],
    )
    return public


__all__ = ["HARM_CATEGORIES", "check_text"]
