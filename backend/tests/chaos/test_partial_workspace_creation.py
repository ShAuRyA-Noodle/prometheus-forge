"""Chaos: partial Workspace presentation creation → outbox queues retries."""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


async def test_partial_slides_creation_retried_via_outbox(monkeypatch) -> None:
    from services import outbox_service as ob

    attempts = {"n": 0, "succeeded_on": None}

    async def _flaky(row):
        attempts["n"] += 1
        if attempts["n"] < 3:
            raise RuntimeError(f"slides_partial_attempt_{attempts['n']}")
        attempts["succeeded_on"] = attempts["n"]
        return {"presentation_id": "pres_x", "presentation_url": "https://example.com/p"}

    ob.register_dispatcher(ob.OutboxOpType.CREATE_PRESENTATION, _flaky)

    retries: list[str] = []
    completes: list[dict] = []

    async def _r(row, err):
        retries.append(err)

    async def _c(row, result):
        completes.append(result)

    monkeypatch.setattr(ob, "_mark_retry", _r, raising=False)
    monkeypatch.setattr(ob, "_mark_complete", _c, raising=False)

    row = ob.OutboxRow(
        session_id="s",
        op_type=ob.OutboxOpType.CREATE_PRESENTATION,
        op_key="ck1",
        payload={},
    )
    # Three calls, third should succeed.
    for _ in range(3):
        await ob.dispatch(row)

    assert attempts["succeeded_on"] == 3
    assert len(retries) == 2
    assert len(completes) == 1
