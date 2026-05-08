"""Wave-3 pre-summarization helper.

Compresses each upstream agent output to ~300 tokens via parallel Flash calls.
Used by Pitch Deck Agent and Executive Summary Agent to keep their context <4K tokens.
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

import structlog
from pydantic import BaseModel

from config import settings

log = structlog.get_logger("prometheus.summarize")

_SUMMARY_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "summarize_for_deck.txt"


def _stringify(value: Any) -> str:
    if value is None:
        return "{}"
    if isinstance(value, BaseModel):
        return value.model_dump_json(indent=2)
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, indent=2, default=str)
    except (TypeError, ValueError):
        return str(value)


async def summarize_for_deck(agent_name: str, raw_output: Any) -> str:
    """Single Flash call. Returns plain-text ≤ ~1500 chars summary."""
    from services.gemini_client import call_gemini_text  # noqa: WPS433

    if raw_output is None:
        return f"({agent_name}: not produced)"

    raw_str = _stringify(raw_output)
    # Hard upper bound on input to the summarizer to control cost.
    if len(raw_str) > 12_000:
        raw_str = raw_str[:12_000] + "\n…(truncated)"

    prompt = _SUMMARY_PROMPT_PATH.read_text(encoding="utf-8").format(
        agent_name=agent_name,
        raw_output=raw_str,
    )

    try:
        text = await asyncio.wait_for(
            call_gemini_text(
                model=settings.model_flash,
                prompt=prompt,
                temperature=0.1,
                max_output_tokens=400,
            ),
            timeout=12,
        )
    except (TimeoutError, Exception) as exc:  # noqa: BLE001
        log.warning("summarize.failed", agent=agent_name, error=str(exc))
        # Fallback: a hard slice of the raw JSON. Crude but keeps the pipeline alive.
        return raw_str[:1500]

    return (text or "").strip()[:2000]


async def summarize_all(state: dict[str, Any], keys: list[str]) -> dict[str, str]:
    """Run summarize_for_deck in parallel for each key in `keys`. Returns dict
    keyed by `f"{key.replace('_result','')}_summary"` (e.g. market_summary).
    """
    tasks = [summarize_for_deck(key, state.get(key)) for key in keys]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    out: dict[str, str] = {}
    for key, result in zip(keys, results, strict=True):
        slug = key.replace("_result", "")
        # Friendly aliases used in templates.
        alias_map = {
            "market_research": "market_summary",
            "competitive_analysis": "competitive_summary",
            "business_model": "business_model_summary",
            "financial_model": "financial_summary",
            "brand_identity": "brand_summary",
            "go_to_market": "gtm_summary",
            "risk_analysis": "risk_summary",
            "tech_architecture": "tech_summary",
            "landing_page": "landing_summary",
            "legal_documents": "legal_summary",
        }
        out_key = alias_map.get(slug, f"{slug}_summary")
        if isinstance(result, Exception):
            log.warning("summarize.exception", key=key, error=str(result))
            out[out_key] = f"({slug}: summary unavailable)"
        else:
            out[out_key] = result
    return out


__all__ = ["summarize_for_deck", "summarize_all"]
