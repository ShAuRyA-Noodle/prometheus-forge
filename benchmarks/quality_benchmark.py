"""Quality benchmark — score 50 golden via judge_service. Writes CSV."""
from __future__ import annotations

import argparse
import asyncio
import csv
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(_BACKEND))


async def _run_one(idea: dict, mocked: bool) -> dict:
    from agents.orchestrator import build_orchestrator
    from models.session_models import Session, SessionStatus
    from services import judge_service
    from tests.conftest import _default_for_schema

    if mocked:
        from services import gemini_client

        async def _call(*, model, prompt, response_schema, grounded=False, temperature=0.4):
            return _default_for_schema(response_schema.__name__), 1200, 800, False

        gemini_client.call_gemini_structured = _call  # type: ignore[assignment]

    s = Session(
        session_id=f"sess_q_{idea['id']}",
        user_uid="bench",
        idempotency_key=f"k_{idea['id']}",
        idea_text_hash="0" * 64,
        idea_text=idea["idea"][:1900],
        status=SessionStatus.QUEUED,
        created_at=datetime.now(UTC),
    )
    state = {"session": s, "idea_text": s.idea_text}
    orch = build_orchestrator(state)
    session = await orch.run()

    outputs: dict[str, dict] = {}
    for key in (
        "market_research_result",
        "competitive_analysis_result",
        "business_model_result",
        "brand_identity_result",
    ):
        v = state.get(key)
        if v is not None and hasattr(v, "model_dump"):
            outputs[key.replace("_result", "")] = v.model_dump(mode="json")

    bundle = {
        "session_id": session.session_id,
        "idea_text": s.idea_text,
        "outputs": outputs,
        "coherence_score": 0.85,
    }
    score = await judge_service.score_session(bundle)
    return {
        "idea_id": idea["id"],
        "industry": idea.get("industry", ""),
        "session_status": session.status.value,
        "aggregate": score.aggregate,
        "p99_clarity": score.p99_axis.get("clarity", 0.0),
        "p99_anti_slop": score.p99_axis.get("anti_slop", 0.0),
        "p99_grounding": score.p99_axis.get("factual_grounding", 0.0),
        "p99_coherence": score.p99_axis.get("coherence", 0.0),
        "p99_schema": score.p99_axis.get("schema_adherence", 0.0),
    }


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ideas", default=str(_BACKEND / "tests" / "golden" / "ideas.json"))
    ap.add_argument("--out", default="reports/quality_bench.csv")
    ap.add_argument("--mocked", action="store_true")
    ap.add_argument("--limit", type=int, default=50)
    args = ap.parse_args()

    ideas = json.loads(Path(args.ideas).read_text(encoding="utf-8"))[: args.limit]
    rows: list[dict] = []
    for idea in ideas:
        rows.append(await _run_one(idea, args.mocked))
        print(f"  {idea['id']}: aggregate={rows[-1]['aggregate']:.2f}")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"\nWrote {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
