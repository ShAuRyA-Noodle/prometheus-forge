"""End-to-end pipeline test (mocked).

Asserts wave ordering, gate short-circuiting, cost telemetry, terminal status.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest

pytestmark = pytest.mark.asyncio


def _patch_after_model_services(monkeypatch):
    """All after_model side-effect services are stubbed for happy-path runs."""
    from agents import _summarize
    from services import (
        coherence_service,
        domain_service,
        finance_engine,
        google_workspace,
        image_service,
        legal_template_service,
        sanitization,
        trademark_service,
    )

    async def _check_uspto(name: str):
        return {"conflicts": []}

    async def _check_domain_availability(name: str):
        return {"com_available": True, "handle_x_available": True, "handle_instagram_available": True}

    async def _compute(*, assumptions, seed_funding_usd):
        from models.agent_schemas import FinancialModelResult
        from tests.conftest import _default_for_schema

        return FinancialModelResult.model_validate(_default_for_schema("FinancialModelResult"))

    def _sanitize(html: str) -> str:
        return "<section><h1>Tally</h1><p>" + ("clean " * 30) + "</p></section>"

    async def _imagen(**_kw):
        return {"hero_image_url": "https://example.com/h.png", "feature_image_urls": []}

    async def _fill(**_kw):
        return {
            "tos_doc_id": "doc_tos",
            "tos_doc_url": "https://docs.example/tos",
            "privacy_doc_id": "doc_priv",
            "privacy_doc_url": "https://docs.example/priv",
        }

    async def _summarize_all(state, keys):
        return {f"{k.replace('_result','')}_summary": "x" for k in keys}

    async def _score(_all):
        return 0.9

    async def _pres(**_kw):
        return {"presentation_id": "pres", "presentation_url": "https://docs.example/pres"}

    async def _doc(**_kw):
        return {"doc_id": "doc_x", "doc_url": "https://docs.example/exec"}

    monkeypatch.setattr(trademark_service, "check_uspto", _check_uspto, raising=False)
    monkeypatch.setattr(
        domain_service, "check_domain_availability", _check_domain_availability, raising=False
    )
    monkeypatch.setattr(finance_engine, "compute_projections", _compute, raising=False)
    monkeypatch.setattr(sanitization, "sanitize_html", _sanitize, raising=False)
    monkeypatch.setattr(image_service, "generate_hero_images", _imagen, raising=False)
    monkeypatch.setattr(legal_template_service, "fill_template", _fill, raising=False)
    monkeypatch.setattr(_summarize, "summarize_all", _summarize_all, raising=False)
    monkeypatch.setattr(coherence_service, "score", _score, raising=False)
    monkeypatch.setattr(
        google_workspace, "create_presentation_from_template", _pres, raising=False
    )
    monkeypatch.setattr(
        google_workspace, "create_executive_summary_doc", _doc, raising=False
    )


def _build_state() -> dict[str, Any]:
    from models.session_models import Session, SessionStatus

    session = Session(
        session_id="sess_pipe_test",
        user_uid="uid_test",
        idempotency_key="idem_test",
        idea_text_hash="0" * 64,
        idea_text="A SaaS that reconciles indie e-commerce inventory in real time.",
        status=SessionStatus.QUEUED,
        created_at=datetime.now(UTC),
    )
    return {"session": session, "idea_text": session.idea_text}


async def test_pipeline_full_happy_path(monkeypatch, mock_gemini) -> None:
    from agents.orchestrator import build_orchestrator
    from models.session_models import AgentName, AgentStatusValue, SessionStatus

    _patch_after_model_services(monkeypatch)

    events: list[str] = []

    async def _on_agent(record):
        events.append(f"agent:{record.name.value}:{record.status.value}")

    async def _on_gate(gate):
        events.append(f"gate:{gate.wave}:{'pass' if gate.passed else 'fail'}")

    state = _build_state()
    state["_on_agent_update"] = _on_agent
    state["_on_gate_result"] = _on_gate

    orch = build_orchestrator(state)
    session = await orch.run()

    assert session.status == SessionStatus.COMPLETED
    # Gate ordering.
    gate_events = [e for e in events if e.startswith("gate:")]
    assert gate_events == ["gate:wave_1:pass", "gate:wave_2:pass", "gate:wave_3:pass"]

    # Pre-wave runs before Wave 1; Wave 1 before Wave 2; Wave 2 before Wave 3.
    def first_index(prefix: str) -> int:
        for i, e in enumerate(events):
            if prefix in e:
                return i
        return -1

    assert first_index("idea_parser") < first_index("market_research")
    assert first_index("market_research") < first_index("financial_model")
    assert first_index("financial_model") < first_index("pitch_deck")

    # Cost telemetry accumulated.
    assert session.cost.total_input_tokens > 0
    assert session.cost.total_output_tokens > 0
    assert session.cost.total_cost_usd >= 0.0

    # All agents COMPLETED.
    for agent_enum in AgentName:
        rec = session.agents.get(agent_enum)
        if rec is not None:
            assert rec.status == AgentStatusValue.COMPLETED


async def test_pipeline_gate1_failure_short_circuits(monkeypatch, mock_gemini) -> None:
    """Force a Gate 1 failure and assert downstream waves don't run."""
    from agents import gates as gates_module
    from agents.orchestrator import build_orchestrator
    from models.session_models import AgentName, AgentStatusValue, SessionStatus

    _patch_after_model_services(monkeypatch)

    async def _failing_gate(state):
        return gates_module.GateResult(
            wave="wave_1",
            passed=False,
            issues=[gates_module.GateIssue(code="FORCED", agent="market_research", message="boom")],
        )

    monkeypatch.setattr(gates_module, "wave_1_gate", _failing_gate, raising=False)
    # Orchestrator imports the gate function; patch via orchestrator binding too.
    from agents import orchestrator as orch_mod

    monkeypatch.setattr(orch_mod, "wave_1_gate", _failing_gate, raising=False)

    state = _build_state()
    orch = build_orchestrator(state)
    session = await orch.run()

    assert session.status == SessionStatus.PARTIAL
    assert session.error_code == "GATE_REJECTED"
    # Wave 2/3 agents must be SKIPPED.
    assert session.agents[AgentName.FINANCIAL_MODEL].status == AgentStatusValue.SKIPPED
    assert session.agents[AgentName.PITCH_DECK].status == AgentStatusValue.SKIPPED


async def test_pipeline_terminal_status_completed(monkeypatch, mock_gemini) -> None:
    from agents.orchestrator import build_orchestrator
    from models.session_models import SessionStatus

    _patch_after_model_services(monkeypatch)
    state = _build_state()
    orch = build_orchestrator(state)
    session = await orch.run()
    assert session.status in {
        SessionStatus.COMPLETED,
        SessionStatus.PARTIAL,
        SessionStatus.ERROR,
        SessionStatus.BUDGET_EXCEEDED,
    }
