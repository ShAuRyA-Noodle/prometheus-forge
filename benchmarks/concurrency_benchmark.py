"""Concurrency benchmark — N concurrent pipelines, find queue lag knee."""
from __future__ import annotations

import argparse
import asyncio
import csv
import statistics
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(_BACKEND))


async def _run_one(idx: int) -> dict:
    from agents.orchestrator import build_orchestrator
    from models.session_models import Session, SessionStatus
    from services import gemini_client
    from tests.conftest import _default_for_schema

    async def _call(*, model, prompt, response_schema, grounded=False, temperature=0.4):
        return _default_for_schema(response_schema.__name__), 1200, 800, False

    gemini_client.call_gemini_structured = _call  # type: ignore[assignment]

    s = Session(
        session_id=f"sess_c_{idx}",
        user_uid="bench",
        idempotency_key=f"k_{idx}",
        idea_text_hash="0" * 64,
        idea_text=f"Idea {idx}: a SaaS that does cool things",
        status=SessionStatus.QUEUED,
        created_at=datetime.now(UTC),
    )
    started = time.perf_counter()
    orch = build_orchestrator({"session": s, "idea_text": s.idea_text})
    sess = await orch.run()
    elapsed = (time.perf_counter() - started) * 1000
    return {"idx": idx, "elapsed_ms": int(elapsed), "status": sess.status.value}


async def _bucket(n: int) -> dict:
    started = time.perf_counter()
    results = await asyncio.gather(*[_run_one(i) for i in range(n)])
    wall = (time.perf_counter() - started) * 1000
    elapsed = sorted(r["elapsed_ms"] for r in results)
    return {
        "concurrent": n,
        "wall_ms": int(wall),
        "p50": int(statistics.median(elapsed)),
        "p95": int(elapsed[int(0.95 * (len(elapsed) - 1))]),
        "p99": int(elapsed[int(0.99 * (len(elapsed) - 1))]),
        "errors": sum(1 for r in results if r["status"] not in {"completed", "partial"}),
    }


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="reports/concurrency.csv")
    ap.add_argument("--levels", default="1,5,10,25,50,100", type=str)
    args = ap.parse_args()

    levels = [int(x) for x in args.levels.split(",")]
    rows: list[dict] = []
    for n in levels:
        print(f"  running {n} concurrent…")
        rows.append(await _bucket(n))
        print(f"    {rows[-1]}")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"\nWrote {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
