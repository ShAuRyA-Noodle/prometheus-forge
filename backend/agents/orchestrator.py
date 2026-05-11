"""Pipeline orchestrator.

`build_orchestrator(state)` returns a runnable wrapper that mirrors ADK's
SequentialAgent(ParallelAgent(...)) topology with explicit gate calls between waves.
The worker calls `run_pipeline(session_id, idea_text)`.

Topology
--------
    Pre-wave:   idea_parser → articulation
    Wave 1:     parallel( market_research, competitive_analysis, business_model,
                          brand_identity, risk_analysis, tech_architecture )
    Gate 1:     wave_1_gate(state)
    Wave 2:     parallel( financial_model, landing_page, legal_documents, go_to_market )
    Gate 2:     wave_2_gate(state)
    Wave 3:     parallel( pitch_deck, executive_summary )
    Gate 3:     wave_3_gate(state)

Each agent writes its output into session state under `agent.output_key`. Downstream
agents read via `state[key]`. Cost telemetry is aggregated. On gate rejection, the
session is marked PARTIAL and the offending issues are persisted; downstream waves
are skipped.
"""
from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime
from typing import Any, Awaitable, Callable

import structlog
from pydantic import BaseModel

from config import settings
from models.session_models import (
    AgentName,
    AgentRecord,
    AgentStatusValue,
    Session,
    SessionStatus,
    Wave,
)

from .articulation_agent import articulation_agent
from .base import (
    AgentResult,
    CostBudgetExceeded,
    GateRejectedError,
    PrometheusAgent,
    PrometheusError,
)
from .brand_identity_agent import brand_identity_agent
from .business_model_agent import business_model_agent
from .competitive_analysis_agent import competitive_analysis_agent
from .executive_summary_agent import executive_summary_agent
from .financial_model_agent import financial_model_agent
from .gates import GateResult, wave_1_gate, wave_2_gate, wave_3_gate
from .go_to_market_agent import go_to_market_agent
from .idea_parser_agent import idea_parser_agent
from .landing_page_agent import landing_page_agent
from .legal_documents_agent import legal_documents_agent
from .market_research_agent import market_research_agent
from .pitch_deck_agent import pitch_deck_agent
from .risk_analysis_agent import risk_analysis_agent
from .tech_architecture_agent import tech_architecture_agent

log = structlog.get_logger("prometheus.orchestrator")


# ─── Wave grouping ───────────────────────────────────────────────────────────

PRE_WAVE: tuple[PrometheusAgent[Any], ...] = (
    idea_parser_agent,
    articulation_agent,
)

WAVE_1: tuple[PrometheusAgent[Any], ...] = (
    market_research_agent,
    competitive_analysis_agent,
    business_model_agent,
    brand_identity_agent,
    risk_analysis_agent,
    tech_architecture_agent,
)

WAVE_2: tuple[PrometheusAgent[Any], ...] = (
    financial_model_agent,
    landing_page_agent,
    legal_documents_agent,
    go_to_market_agent,
)

WAVE_3: tuple[PrometheusAgent[Any], ...] = (
    pitch_deck_agent,
    executive_summary_agent,
)


# ─── Orchestrator object ─────────────────────────────────────────────────────


class Orchestrator:
    """Runnable wrapper. Drives waves sequentially; each wave's agents in parallel.

    Mirrors ADK's `SequentialAgent[ParallelAgent[...]]` topology but with explicit
    validation gate calls between waves.
    """

    def __init__(self, state: dict[str, Any]) -> None:
        self.state = state
        self.session: Session = state["session"]
        self._on_agent_update: Callable[[AgentRecord], Awaitable[None]] | None = (
            state.get("_on_agent_update")
        )
        self._on_gate_result: Callable[[GateResult], Awaitable[None]] | None = (
            state.get("_on_gate_result")
        )
        self.gate_results: list[GateResult] = []

    # ----------------- public entrypoint -----------------

    async def run(self) -> Session:
        self.session.status = SessionStatus.RUNNING
        self.session.started_at = datetime.now(UTC)
        mode = str(self.session.metadata.get("mode", "full"))

        try:
            # Pre-wave: idea_parser → articulation (sequential).
            await self._run_sequential(PRE_WAVE)

            # Wave 1.
            await self._run_parallel(WAVE_1)
            gate_1 = await self._run_gate("wave_1", wave_1_gate)
            if not gate_1.passed:
                return self._finalize_partial(gate_1)

            # Quick mode: 3-agent preview. Stop after Wave 1 + Gate 1 PASS.
            # User gets brand + market + business model + risk in ~30s.
            if mode == "quick":
                self.session.status = SessionStatus.COMPLETED
                self.session.metadata["mode_completed_at_wave"] = "wave_1"
                log.info("orchestrator.quick_mode_complete", session_id=self.session.session_id)
                return self.session

            # Wave 2.
            await self._run_parallel(WAVE_2)
            gate_2 = await self._run_gate("wave_2", wave_2_gate)
            if not gate_2.passed:
                return self._finalize_partial(gate_2)

            # Wave 3.
            await self._run_parallel(WAVE_3)
            gate_3 = await self._run_gate("wave_3", wave_3_gate)
            if not gate_3.passed:
                return self._finalize_partial(gate_3)

            self.session.status = SessionStatus.COMPLETED
            self.session.metadata["mode_completed_at_wave"] = "wave_3"

            # Deep mode: after full pipeline, auto-enqueue marketplace human-review jobs.
            # The user gets the full deck immediately AND a 24-hour expert pass.
            if mode == "deep":
                await self._enqueue_deep_review_jobs()

        except CostBudgetExceeded as exc:
            log.error("orchestrator.budget_exceeded", error=str(exc))
            self.session.status = SessionStatus.BUDGET_EXCEEDED
            self.session.error_code = exc.code
            self.session.error_message = str(exc)
        except PrometheusError as exc:
            log.exception("orchestrator.prometheus_error")
            self.session.status = SessionStatus.ERROR
            self.session.error_code = exc.code
            self.session.error_message = str(exc)
        except Exception as exc:  # noqa: BLE001
            log.exception("orchestrator.unexpected")
            self.session.status = SessionStatus.ERROR
            self.session.error_code = "UNEXPECTED"
            self.session.error_message = str(exc)
        finally:
            self.session.completed_at = datetime.now(UTC)
            await self._post_wave_cleanup()

        return self.session

    # ----------------- wave runners -----------------

    async def _run_sequential(self, agents: tuple[PrometheusAgent[Any], ...]) -> None:
        for agent in agents:
            await self._execute_agent(agent)

    async def _run_parallel(self, agents: tuple[PrometheusAgent[Any], ...]) -> None:
        tasks = [
            asyncio.create_task(self._execute_agent(agent), name=agent.name.value)
            for agent in agents
        ]
        # `gather` with return_exceptions=False because `_execute_agent` already
        # converts agent failures into AgentResult(status=ERROR). Real exceptions
        # here would be infrastructural (cancelled task, etc.) — we let them surface.
        await asyncio.gather(*tasks)

    async def _execute_agent(self, agent: PrometheusAgent[Any]) -> AgentResult[Any]:
        record = self.session.agents.get(agent.name) or AgentRecord(
            name=agent.name, wave=agent.wave
        )
        record.status = AgentStatusValue.RUNNING
        record.started_at = datetime.now(UTC)
        self.session.agents[agent.name] = record
        await self._notify_agent(record)

        # Cost guardrail: if we're already at/above the cap, skip the agent.
        if self.session.cost.total_cost_usd >= settings.max_cost_usd_per_session:
            log.warning(
                "orchestrator.budget_skip",
                agent=agent.name.value,
                cost_so_far=self.session.cost.total_cost_usd,
            )
            record.status = AgentStatusValue.SKIPPED
            record.completed_at = datetime.now(UTC)
            record.duration_ms = int(
                (record.completed_at - record.started_at).total_seconds() * 1000
            )
            await self._notify_agent(record)
            raise CostBudgetExceeded(
                f"max_cost_usd_per_session={settings.max_cost_usd_per_session} reached"
            )

        # Pre-articulation: surface polished_idea convenience key for downstream agents.
        if agent.name == AgentName.MARKET_RESEARCH:
            self._populate_polished_idea()

        result: AgentResult[Any] = await agent.run(self.state)

        # Persist into shared state via output_key (ADK semantics).
        if result.output is not None and result.status == AgentStatusValue.COMPLETED:
            self.state[agent.output_key] = result.output

        # Update record + telemetry.
        record.status = result.status
        record.completed_at = datetime.now(UTC)
        record.duration_ms = result.duration_ms
        record.input_tokens = result.input_tokens
        record.output_tokens = result.output_tokens
        record.cost_usd = result.cost_usd
        record.retry_count = result.retry_count
        record.error_message = result.error_message

        self.session.cost.total_input_tokens += result.input_tokens
        self.session.cost.total_output_tokens += result.output_tokens
        self.session.cost.total_cost_usd = round(
            self.session.cost.total_cost_usd + result.cost_usd, 6
        )

        if agent.requires_grounding:
            self.session.cost.grounding_calls += 1

        await self._notify_agent(record)

        # Side-effect: capture company_name onto session if produced.
        if agent.name == AgentName.BRAND_IDENTITY and result.output is not None:
            try:
                self.session.company_name = result.output.company_name  # type: ignore[union-attr]
            except AttributeError:
                pass

        # Post-budget check after each agent.
        if self.session.cost.total_cost_usd > settings.max_cost_usd_per_session:
            raise CostBudgetExceeded(
                f"total_cost_usd={self.session.cost.total_cost_usd:.4f} > "
                f"cap={settings.max_cost_usd_per_session}"
            )

        return result

    # ----------------- gates -----------------

    async def _run_gate(
        self,
        wave_name: str,
        gate_fn: Callable[[dict[str, Any]], Awaitable[GateResult]],
    ) -> GateResult:
        started = time.perf_counter()
        gate_result = await gate_fn(self.state)
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        log.info(
            "orchestrator.gate",
            wave=wave_name,
            passed=gate_result.passed,
            issues=len(gate_result.issues),
            warnings=len(gate_result.warnings),
            elapsed_ms=elapsed_ms,
        )
        self.gate_results.append(gate_result)
        if self._on_gate_result is not None:
            try:
                await self._on_gate_result(gate_result)
            except Exception:  # noqa: BLE001
                log.exception("orchestrator.gate_callback_failed")
        return gate_result

    # ----------------- helpers -----------------

    def _populate_polished_idea(self) -> None:
        """Convenience: copy ArticulationOutput.polished_idea to top-level state key."""
        if "polished_idea" in self.state:
            return
        articulation = self.state.get("articulation")
        if articulation is None:
            return
        try:
            polished = (
                articulation.polished_idea
                if hasattr(articulation, "polished_idea")
                else articulation.get("polished_idea", "")  # type: ignore[union-attr]
            )
        except Exception:  # noqa: BLE001
            polished = ""
        self.state["polished_idea"] = polished

    async def _notify_agent(self, record: AgentRecord) -> None:
        if self._on_agent_update is None:
            return
        try:
            await self._on_agent_update(record)
        except Exception:  # noqa: BLE001
            log.exception("orchestrator.notify_failed", agent=record.name.value)

    def _finalize_partial(self, gate: GateResult) -> Session:
        log.warning(
            "orchestrator.gate_failed",
            wave=gate.wave,
            issues=[(i.code, i.agent, i.message) for i in gate.issues],
        )
        self.session.status = SessionStatus.PARTIAL
        self.session.error_code = "GATE_REJECTED"
        self.session.error_message = (
            f"{gate.wave} gate failed: "
            + "; ".join(f"{i.code}({i.agent})" for i in gate.issues[:5])
        )
        # Mark un-run agents as SKIPPED.
        for agent in (*WAVE_1, *WAVE_2, *WAVE_3):
            if agent.name not in self.session.agents:
                self.session.agents[agent.name] = AgentRecord(
                    name=agent.name,
                    wave=agent.wave,
                    status=AgentStatusValue.SKIPPED,
                )
        self.session.completed_at = datetime.now(UTC)
        return self.session

    async def _enqueue_deep_review_jobs(self) -> None:
        """Deep mode: auto-create marketplace jobs for human expert review.

        Lawyer reviews the generated ToS/Privacy, fractional CFO reviews the
        financial model, brand designer polishes the logo+palette. All three
        jobs are queued at standard marketplace prices; the user can decline
        or upgrade individual ones from the ResultsPage marketplace tab.
        """
        try:
            from services import billing_service, firestore_service, notification_service

            company_id = self.session.company_id or self.session.session_id
            for job_type in ("lawyer_review", "cfo_review", "brand_polish"):
                try:
                    await billing_service.create_marketplace_job(
                        uid=self.session.user_uid,
                        company_id=company_id,
                        job_type=job_type,
                        session_id=self.session.session_id,
                        status="pending_payment",
                    )
                except Exception:  # noqa: BLE001
                    log.exception("orchestrator.deep_review_job_create_failed", job_type=job_type)

            try:
                await firestore_service.update_session_metadata(
                    self.session.session_id,
                    {"deep_mode_jobs_enqueued_at": datetime.now(UTC).isoformat()},
                )
            except Exception:  # noqa: BLE001
                log.exception("orchestrator.deep_metadata_write_failed")

            try:
                await notification_service.send_deep_mode_review_pending(
                    uid=self.session.user_uid,
                    session_id=self.session.session_id,
                )
            except Exception:  # noqa: BLE001
                log.exception("orchestrator.deep_notification_failed")
        except Exception:  # noqa: BLE001
            log.exception("orchestrator.enqueue_deep_review_unexpected")

    async def _post_wave_cleanup(self) -> None:
        """Post-wave cleanup callback. Persists the final session if a sync hook
        is registered, and triggers any best-effort housekeeping in services.
        """
        callback: Callable[[Session], Awaitable[None]] | None = self.state.get(
            "_on_pipeline_complete"
        )
        if callback is not None:
            try:
                await callback(self.session)
            except Exception:  # noqa: BLE001
                log.exception("orchestrator.cleanup_callback_failed")


# ─── Public API ──────────────────────────────────────────────────────────────


def build_orchestrator(state: dict[str, Any]) -> Orchestrator:
    """Construct an Orchestrator bound to the given state dict.

    The state dict MUST contain `session` (Session). Optional callback keys:
      - `_on_agent_update(record)` — called whenever an agent's state changes.
      - `_on_gate_result(gate_result)` — called after each gate.
      - `_on_pipeline_complete(session)` — called when the pipeline finishes.
    """
    if "session" not in state:
        raise ValueError("state must contain 'session' (a Session model instance)")
    if "idea_text" not in state:
        # Mirror Session.idea_text for prompt rendering.
        state["idea_text"] = state["session"].idea_text
    return Orchestrator(state)


async def run_pipeline(session_id: str, idea_text: str) -> Session:
    """Worker entry-point.

    Builds a Session, runs the orchestrator, returns the finalized Session.
    Persistence (Firestore writes, SSE events, etc.) is the worker's job — done
    via the optional `_on_*` callbacks the worker can attach before invoking.
    """
    from hashlib import sha256

    idea_hash = sha256(idea_text.encode("utf-8")).hexdigest()
    session = Session(
        session_id=session_id,
        user_uid="",  # worker overwrites before invocation in real use
        idempotency_key=session_id,
        idea_text_hash=idea_hash,
        idea_text=idea_text,
        created_at=datetime.now(UTC),
    )
    state: dict[str, Any] = {"session": session, "idea_text": idea_text}
    orch = build_orchestrator(state)
    return await orch.run()


__all__ = ["Orchestrator", "build_orchestrator", "run_pipeline"]
