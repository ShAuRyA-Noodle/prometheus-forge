"""Cost + latency benchmark on the 50 golden ideas.

Runs each idea through the orchestrator with the *real* Gemini client (or a
schema-shaped mock when ``--mocked`` is passed). Captures cost + latency per
agent + total. Writes a CSV.

Usage::

    python benchmarks/cost_benchmark.py --out reports/cost.csv
    python benchmarks/cost_benchmark.py --out reports/cost.csv --mocked
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(_BACKEND))


async def _run_idea(idea: dict, mocked: bool) -> dict:
    from agents.orchestrator import build_orchestrator
    from models.session_models import Session, SessionStatus

    if mocked:
        # Reuse the test mock shaping so this script runs offline.
        from tests.conftest import _default_for_schema  # type: ignore[import-not-found]
        from services import gemini_client

        async def _call(*, model, prompt, response_schema, grounded=False, temperature=0.4):
            return _default_for_schema(response_schema.__name__), 1200, 800, False

        gemini_client.call_gemini_structured = _call  # type: ignore[assignment]

    s = Session(
        session_id=f"sess_bench_{idea['id']}",
        user_uid="bench",
        idempotency_key=f"k_{idea['id']}",
        idea_text_hash="0" * 64,
        idea_text=idea["idea"][:1900],
        status=SessionStatus.QUEUED,
        created_at=datetime.now(UTC),
    )
    started = time.perf_counter()
    orch = build_orchestrator({"session": s, "idea_text": s.idea_text})
    session = await orch.run()
    elapsed = (time.perf_counter() - started) * 1000

    rows: list[dict] = []
    for name, rec in session.agents.items():
        rows.append(
            {
                "idea_id": idea["id"],
                "agent": name.value,
                "status": rec.status.value,
                "duration_ms": rec.duration_ms or 0,
                "cost_usd": round(rec.cost_usd, 6),
                "in_tokens": rec.input_tokens,
                "out_tokens": rec.output_tokens,
            }
        )
    return {
        "idea_id": idea["id"],
        "session_status": session.status.value,
        "total_cost_usd": round(session.cost.total_cost_usd, 6),
        "total_in_tokens": session.cost.total_input_tokens,
        "total_out_tokens": session.cost.total_output_tokens,
        "elapsed_ms": int(elapsed),
        "agent_rows": rows,
    }


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ideas", default=str(_BACKEND / "tests" / "golden" / "ideas.json"))
    ap.add_argument("--out", default="reports/cost_bench.csv")
    ap.add_argument("--mocked", action="store_true")
    ap.add_argument("--limit", type=int, default=50)
    args = ap.parse_args()

    ideas = json.loads(Path(args.ideas).read_text(encoding="utf-8"))[: args.limit]
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    summary_rows: list[dict] = []
    agent_rows: list[dict] = []
    for idea in ideas:
        r = await _run_idea(idea, args.mocked)
        summary_rows.append(
            {k: v for k, v in r.items() if k != "agent_rows"}
        )
        agent_rows.extend(r["agent_rows"])
        print(f"  {idea['id']}: {r['session_status']}  cost={r['total_cost_usd']}  elapsed={r['elapsed_ms']}ms")

    summary_csv = out_path.with_suffix(".summary.csv")
    with summary_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(summary_rows[0].keys()))
        w.writeheader()
        w.writerows(summary_rows)

    agent_csv = out_path.with_suffix(".per_agent.csv")
    with agent_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(agent_rows[0].keys()))
        w.writeheader()
        w.writerows(agent_rows)

    print(f"\nWrote {summary_csv} and {agent_csv}")


if __name__ == "__main__":
    asyncio.run(main())
