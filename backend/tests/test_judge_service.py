"""Judge service tests."""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


async def test_judge_output_returns_structured_score(monkeypatch) -> None:
    from services import gemini_client, judge_service

    async def _stub_call(*, model, prompt, response_schema, grounded=False, temperature=0.4):
        return (
            {
                "clarity": 8.0,
                "factual_grounding": 7.5,
                "anti_slop": 9.0,
                "coherence": 8.5,
                "schema_adherence": 9.5,
                "rationale": "Solid output.",
            },
            100,
            50,
            False,
        )

    monkeypatch.setattr(gemini_client, "call_gemini_structured", _stub_call, raising=False)

    score = await judge_service.judge_output(
        agent_name="market_research",
        idea_text="A fintech idea.",
        output_dict={"some": "data"},
    )
    assert 0.0 <= score.clarity <= 10.0
    assert 0.0 <= score.overall <= 10.0
    assert score.agent_name == "market_research"
    # Overall is mean of the 5 axes.
    expected = (8.0 + 7.5 + 9.0 + 8.5 + 9.5) / 5.0
    assert abs(score.overall - round(expected, 3)) < 1e-6


async def test_judge_output_falls_back_on_blocked(monkeypatch) -> None:
    from services import gemini_client, judge_service

    async def _blocked(**_kw):
        return {}, 0, 0, True

    monkeypatch.setattr(gemini_client, "call_gemini_structured", _blocked, raising=False)
    score = await judge_service.judge_output("agent", "idea", {})
    assert score.overall == 5.0  # neutral fallback


async def test_score_session_aggregates(monkeypatch) -> None:
    from services import gemini_client, judge_service

    async def _call(*, model, prompt, response_schema, grounded=False, temperature=0.4):
        return (
            {
                "clarity": 8.0,
                "factual_grounding": 8.0,
                "anti_slop": 8.0,
                "coherence": 8.0,
                "schema_adherence": 8.0,
                "rationale": "ok",
            },
            10,
            5,
            False,
        )

    monkeypatch.setattr(gemini_client, "call_gemini_structured", _call, raising=False)

    session = {
        "session_id": "s1",
        "idea_text": "An idea",
        "outputs": {"market_research": {}, "competitive_analysis": {}},
        "coherence_score": 0.8,
    }
    out = await judge_service.score_session(session)
    assert out.session_id == "s1"
    assert "market_research" in out.per_agent
    assert "competitive_analysis" in out.per_agent
    assert 0.0 <= out.aggregate <= 10.0


async def test_compare_returns_winner(monkeypatch) -> None:
    from services import gemini_client, judge_service

    flip = {"n": 0}

    async def _call(*, model, prompt, response_schema, grounded=False, temperature=0.4):
        flip["n"] += 1
        score = 9.0 if flip["n"] > 1 else 5.0  # second session scores higher
        return (
            {
                "clarity": score,
                "factual_grounding": score,
                "anti_slop": score,
                "coherence": score,
                "schema_adherence": score,
                "rationale": "x",
            },
            10,
            5,
            False,
        )

    monkeypatch.setattr(gemini_client, "call_gemini_structured", _call, raising=False)

    a = {"session_id": "a", "idea_text": "i", "outputs": {"agent1": {}}, "coherence_score": 0.5}
    b = {"session_id": "b", "idea_text": "i", "outputs": {"agent1": {}}, "coherence_score": 0.5}
    report = await judge_service.compare(a, b)
    assert report.winner in {"a", "b", "tie"}
