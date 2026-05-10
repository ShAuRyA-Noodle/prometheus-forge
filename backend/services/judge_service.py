"""Gemini-as-judge for golden regression scoring and prompt iteration.

Scores per-agent outputs along five rubric dimensions:
  - clarity
  - factual_grounding
  - anti_slop
  - coherence
  - schema_adherence

Returns a structured ``JudgeScore`` (0–10 per axis) with a 1-paragraph rationale.
``score_session`` aggregates per-agent scores plus the existing
``coherence_service.coherence_score`` for a single session number.

``compare`` runs A/B pairwise scoring for prompt iteration.
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Literal

import structlog
from pydantic import BaseModel, Field

from config import settings
from services.pii_scrubber import hash_for_log, scrub

log = structlog.get_logger(__name__)


# ─── Rubric ──────────────────────────────────────────────────────────────────


DEFAULT_RUBRIC: dict[str, str] = {
    "clarity": "Is the language precise, specific, free of vague filler?",
    "factual_grounding": "Are numeric/factual claims backed by sources or marked derived/estimated?",
    "anti_slop": "Free of generic placeholders (Acme/Nexus/Flow, John Doe, 99.99%, lorem)?",
    "coherence": "Internally consistent and aligned with the parsed idea / industry?",
    "schema_adherence": "Does the output strictly match its Pydantic schema (no extras, no missing required)?",
}


# ─── Models ──────────────────────────────────────────────────────────────────


class JudgeScore(BaseModel):
    agent_name: str
    clarity: float = Field(..., ge=0.0, le=10.0)
    factual_grounding: float = Field(..., ge=0.0, le=10.0)
    anti_slop: float = Field(..., ge=0.0, le=10.0)
    coherence: float = Field(..., ge=0.0, le=10.0)
    schema_adherence: float = Field(..., ge=0.0, le=10.0)
    overall: float = Field(..., ge=0.0, le=10.0)
    rationale: str
    judged_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    judge_model: str = settings.model_pro


class SessionScore(BaseModel):
    session_id: str
    per_agent: dict[str, JudgeScore]
    coherence_session_score: float
    aggregate: float
    p99_axis: dict[str, float]
    judged_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ComparisonReport(BaseModel):
    session_a: str
    session_b: str
    winner: Literal["a", "b", "tie"]
    margin: float
    per_agent: dict[str, dict[str, float]]
    judged_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ─── Prompt builder ──────────────────────────────────────────────────────────


_JUDGE_SCHEMA = {
    "type": "object",
    "properties": {
        "clarity": {"type": "number", "minimum": 0, "maximum": 10},
        "factual_grounding": {"type": "number", "minimum": 0, "maximum": 10},
        "anti_slop": {"type": "number", "minimum": 0, "maximum": 10},
        "coherence": {"type": "number", "minimum": 0, "maximum": 10},
        "schema_adherence": {"type": "number", "minimum": 0, "maximum": 10},
        "rationale": {"type": "string"},
    },
    "required": [
        "clarity",
        "factual_grounding",
        "anti_slop",
        "coherence",
        "schema_adherence",
        "rationale",
    ],
}


def _build_prompt(
    agent_name: str,
    idea_text: str,
    output_dict: dict[str, Any],
    rubric: dict[str, str],
) -> str:
    rubric_text = "\n".join(f"- **{k}**: {v}" for k, v in rubric.items())
    safe_idea = scrub(idea_text)
    return (
        "You are an impartial judge scoring an LLM agent output against a strict rubric.\n"
        f"Agent: {agent_name}\n"
        f"User idea (PII-scrubbed): {safe_idea}\n\n"
        "Rubric (each axis 0–10, 10 = excellent):\n"
        f"{rubric_text}\n\n"
        "Anti-slop is CRITICAL — generic names like Acme/Nexus/Flow, lorem-ipsum, "
        "John Doe, or '99.99%' suspiciously round numbers must score below 5.\n\n"
        "Agent output JSON:\n"
        f"{json.dumps(output_dict, ensure_ascii=False)[:8000]}\n\n"
        "Return STRICT JSON matching this schema:\n"
        f"{json.dumps(_JUDGE_SCHEMA)}"
    )


# ─── Public API ──────────────────────────────────────────────────────────────


async def judge_output(
    agent_name: str,
    idea_text: str,
    output_dict: dict[str, Any],
    rubric: dict[str, str] | None = None,
) -> JudgeScore:
    """Run Gemini Pro as judge. Returns a ``JudgeScore`` (overall = mean of axes)."""
    rubric = rubric or DEFAULT_RUBRIC
    prompt = _build_prompt(agent_name, idea_text, output_dict, rubric)

    parsed = await _call_judge(prompt)
    overall = sum(
        [
            float(parsed["clarity"]),
            float(parsed["factual_grounding"]),
            float(parsed["anti_slop"]),
            float(parsed["coherence"]),
            float(parsed["schema_adherence"]),
        ]
    ) / 5.0

    score = JudgeScore(
        agent_name=agent_name,
        clarity=float(parsed["clarity"]),
        factual_grounding=float(parsed["factual_grounding"]),
        anti_slop=float(parsed["anti_slop"]),
        coherence=float(parsed["coherence"]),
        schema_adherence=float(parsed["schema_adherence"]),
        overall=round(overall, 3),
        rationale=str(parsed.get("rationale", ""))[:1500],
    )
    log.info(
        "judge.score",
        agent=agent_name,
        overall=score.overall,
        idea_hash=hash_for_log(idea_text),
    )
    return score


async def _call_judge(prompt: str) -> dict[str, Any]:
    """Invoke Gemini structured output. Falls back to a deterministic stub if unavailable."""
    try:
        from services.gemini_client import call_gemini_structured
    except Exception:  # pragma: no cover
        return _stub_score()

    class _JudgeOutput(BaseModel):
        clarity: float
        factual_grounding: float
        anti_slop: float
        coherence: float
        schema_adherence: float
        rationale: str

    try:
        raw, _, _, blocked = await call_gemini_structured(
            model=settings.model_pro,
            prompt=prompt,
            response_schema=_JudgeOutput,
            grounded=False,
            temperature=0.0,
        )
        if blocked or not isinstance(raw, dict):
            return _stub_score()
        return raw
    except Exception as e:  # noqa: BLE001
        log.warning("judge.call_failed", err=str(e))
        return _stub_score()


def _stub_score() -> dict[str, Any]:
    """Deterministic fallback when Gemini is unavailable. Neutral scores, prevents crash."""
    return {
        "clarity": 5.0,
        "factual_grounding": 5.0,
        "anti_slop": 5.0,
        "coherence": 5.0,
        "schema_adherence": 5.0,
        "rationale": "judge_unavailable_fallback",
    }


async def score_session(session: dict[str, Any]) -> SessionScore:
    """Score every agent output found in ``session['outputs']`` and aggregate.

    Expected shape:
      ``{ "session_id": str, "idea_text": str, "outputs": {agent_name: {...}}, "coherence_score": float }``
    """
    sid = session["session_id"]
    idea = session.get("idea_text", "")
    outputs: dict[str, dict[str, Any]] = session.get("outputs", {})
    coherence_score = float(session.get("coherence_score", 0.5))

    tasks = [judge_output(name, idea, out) for name, out in outputs.items()]
    scored = await asyncio.gather(*tasks, return_exceptions=False)
    per_agent = {s.agent_name: s for s in scored}

    # Aggregate per axis
    axes = ["clarity", "factual_grounding", "anti_slop", "coherence", "schema_adherence"]
    p99_axis: dict[str, float] = {}
    for ax in axes:
        vals = sorted(getattr(s, ax) for s in scored)
        if not vals:
            p99_axis[ax] = 0.0
            continue
        idx = max(0, int(len(vals) * 0.99) - 1)
        p99_axis[ax] = float(vals[idx])

    if scored:
        avg_overall = sum(s.overall for s in scored) / len(scored)
    else:
        avg_overall = 0.0

    aggregate = round(avg_overall * 0.7 + coherence_score * 10 * 0.3, 3)

    return SessionScore(
        session_id=sid,
        per_agent=per_agent,
        coherence_session_score=coherence_score,
        aggregate=aggregate,
        p99_axis=p99_axis,
    )


async def compare(session_a: dict[str, Any], session_b: dict[str, Any]) -> ComparisonReport:
    """Pairwise A/B compare two sessions. Returns a per-agent overall delta."""
    sa, sb = await asyncio.gather(score_session(session_a), score_session(session_b))
    per_agent: dict[str, dict[str, float]] = {}
    keys = set(sa.per_agent) | set(sb.per_agent)
    for k in keys:
        a = sa.per_agent.get(k)
        b = sb.per_agent.get(k)
        per_agent[k] = {
            "a": a.overall if a else 0.0,
            "b": b.overall if b else 0.0,
            "delta": (b.overall if b else 0.0) - (a.overall if a else 0.0),
        }
    margin = sb.aggregate - sa.aggregate
    if abs(margin) < 0.05:
        winner: Literal["a", "b", "tie"] = "tie"
    elif margin > 0:
        winner = "b"
    else:
        winner = "a"
    return ComparisonReport(
        session_a=sa.session_id,
        session_b=sb.session_id,
        winner=winner,
        margin=round(margin, 3),
        per_agent=per_agent,
    )


__all__ = [
    "ComparisonReport",
    "DEFAULT_RUBRIC",
    "JudgeScore",
    "SessionScore",
    "compare",
    "judge_output",
    "score_session",
]
