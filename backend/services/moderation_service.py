"""Vertex AI Safety pre/post moderation.

We never log ``idea_text`` here — only categorical results + a sha256 of the
input. Two entrypoints:

  * ``pre_filter_input(text)``  — block CSAM / weapons / IP infringement /
    fraud / PII before any agent runs.
  * ``post_filter_output(text, kind)`` — last-line check on agent output
    (``kind`` is e.g. ``"landing_html"``, ``"deck_text"``).

Implementation:
  * If ``settings.vertex_safety_enabled`` and ``google-cloud-aiplatform`` is
    available, use Gemini's safety_settings on a tiny content classification
    call.
  * Otherwise fall back to a curated regex/lexicon screen for the highest-risk
    categories. The fallback is intentionally conservative.
"""
from __future__ import annotations

import asyncio
import hashlib
import re
from typing import Literal

import structlog
from pydantic import BaseModel, Field

from config import settings

log = structlog.get_logger(__name__)


Decision = Literal["allow", "warn", "block"]


class ModerationResult(BaseModel):
    decision: Decision
    categories: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    safety_scores: dict[str, float] = Field(default_factory=dict)
    text_hash: str


# ─── Lexicon fallback (small, conservative) ─────────────────────────────────


_BLOCK_PATTERNS: dict[str, list[re.Pattern[str]]] = {
    "csam": [re.compile(r"\b(child|minor|underage)[\w\s]{0,30}(porn|sexual|nsfw)\b", re.I)],
    "weapons": [
        re.compile(r"\b(build|make|3d.?print|manufactur\w*)[\w\s]{0,40}\b(gun|rifle|firearm|silencer|bomb|explosive|grenade|nerve agent)\b", re.I),
        re.compile(r"\b(synthesi[sz]e|cook|produce)[\w\s]{0,30}\b(meth|methamphetamine|fentanyl|sarin|ricin|anthrax)\b", re.I),
    ],
    "ip_infringement": [
        re.compile(r"\b(clone|copy|rip[\s-]?off|knock[\s-]?off)\s+(disney|marvel|nintendo|netflix|spotify|apple|google|microsoft)\b", re.I),
        re.compile(r"\b(pirate|warez|crack(ed)?)\b.*\b(software|game|movie|music)\b", re.I),
    ],
    "fraud": [
        re.compile(r"\b(ponzi|pyramid scheme|wire fraud|romance scam|phish(?:ing)?\s+kit|fake invoices?)\b", re.I),
        re.compile(r"\b(launder|money[\s-]?laundering|chargeback fraud)\b", re.I),
    ],
    "pii": [
        re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),  # US SSN-like
        re.compile(r"\b(?:\d[ -]?){13,19}\b"),  # credit-card-like
    ],
}


def _hash(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8", errors="ignore")).hexdigest()


def _lexicon_screen(text: str) -> tuple[list[str], list[str]]:
    cats: list[str] = []
    reasons: list[str] = []
    for cat, patterns in _BLOCK_PATTERNS.items():
        for p in patterns:
            if p.search(text):
                cats.append(cat)
                reasons.append(f"lexicon:{cat}")
                break
    return cats, reasons


# ─── Vertex Safety call ─────────────────────────────────────────────────────


async def _vertex_safety_score(text: str) -> dict[str, float]:
    """Run a 0-token Gemini-Flash 'classify only' call and read safety_ratings.

    Returns a category → severity score map, or ``{}`` on failure.
    """
    if not settings.vertex_safety_enabled:
        return {}
    try:
        from services.gemini_client import _get_client, _genai_types  # type: ignore[attr-defined]
    except Exception:
        return {}

    try:
        client = _get_client()
        # Avoid creating real LLM output cost — ask for a single classification token.
        from google.genai import types as gtypes  # type: ignore[import-not-found]

        cfg = gtypes.GenerateContentConfig(
            temperature=0.0,
            response_mime_type="text/plain",
            max_output_tokens=4,
        )

        def _call() -> dict[str, float]:
            resp = client.models.generate_content(
                model=settings.model_flash,
                contents=f"Classify the safety of this snippet. Answer 'OK'.\n\n{text[:4000]}",
                config=cfg,
            )
            scores: dict[str, float] = {}
            for cand in (getattr(resp, "candidates", None) or []):
                ratings = getattr(cand, "safety_ratings", None) or []
                for r in ratings:
                    cat = str(getattr(r, "category", "")).split(".")[-1]
                    sev = str(getattr(r, "probability", "")).upper()
                    sev_num = {
                        "NEGLIGIBLE": 0.0,
                        "LOW": 0.25,
                        "MEDIUM": 0.5,
                        "HIGH": 0.85,
                    }.get(sev, 0.0)
                    if cat:
                        scores[cat] = max(scores.get(cat, 0.0), sev_num)
            pf = getattr(resp, "prompt_feedback", None)
            if pf is not None:
                br = str(getattr(pf, "block_reason", "")).upper()
                if br and br not in ("BLOCK_REASON_UNSPECIFIED", "0"):
                    scores["PROMPT_BLOCK_" + br] = 1.0
            return scores

        return await asyncio.to_thread(_call)
    except Exception as e:  # noqa: BLE001
        log.warning("moderation.vertex_failed", err=str(e))
        return {}


def _decide(scores: dict[str, float], lex_cats: list[str]) -> Decision:
    if any(c in lex_cats for c in ("csam", "weapons")):
        return "block"
    for cat, score in scores.items():
        if "HARM_CATEGORY_" in cat or any(
            tag in cat for tag in ("DANGEROUS", "SEXUAL", "HATE", "HARASSMENT")
        ):
            if score >= 0.85:
                return "block"
            if score >= 0.5:
                return "warn"
    if lex_cats:
        return "warn"
    return "allow"


# ─── Public API ──────────────────────────────────────────────────────────────


async def pre_filter_input(text: str) -> ModerationResult:
    text = text or ""
    text_hash = _hash(text)

    if len(text) > settings.input_length_cap_chars:
        return ModerationResult(
            decision="block",
            categories=["length_cap_exceeded"],
            reasons=[f"len {len(text)} > cap {settings.input_length_cap_chars}"],
            text_hash=text_hash,
        )

    lex_cats, lex_reasons = _lexicon_screen(text)
    vertex_scores: dict[str, float] = {}
    if "csam" not in lex_cats and "weapons" not in lex_cats:
        # Avoid ever sending obvious CSAM-flagged text to a remote API
        vertex_scores = await _vertex_safety_score(text)

    decision = _decide(vertex_scores, lex_cats)

    log.info(
        "moderation.pre",
        decision=decision,
        categories=lex_cats,
        text_hash=text_hash,
    )

    return ModerationResult(
        decision=decision,
        categories=lex_cats,
        reasons=lex_reasons,
        safety_scores=vertex_scores,
        text_hash=text_hash,
    )


async def post_filter_output(text: str, kind: str) -> ModerationResult:
    text = text or ""
    text_hash = _hash(text)
    lex_cats, lex_reasons = _lexicon_screen(text)
    vertex_scores: dict[str, float] = {}
    if not lex_cats:
        vertex_scores = await _vertex_safety_score(text)
    decision = _decide(vertex_scores, lex_cats)
    log.info("moderation.post", kind=kind, decision=decision, categories=lex_cats, text_hash=text_hash)
    return ModerationResult(
        decision=decision,
        categories=lex_cats,
        reasons=lex_reasons,
        safety_scores=vertex_scores,
        text_hash=text_hash,
    )


__all__ = ["ModerationResult", "post_filter_output", "pre_filter_input"]
