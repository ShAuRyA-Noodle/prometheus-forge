"""Outbox service tests."""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


async def test_enqueue_writes_row(monkeypatch) -> None:
    from services import outbox_service as ob

    written: list[dict] = []

    class _Ref:
        def set(self, data):
            written.append(data)

    class _OutboxRef:
        def document(self, _id):
            return _Ref()

    monkeypatch.setattr(ob, "_outbox_ref", lambda sid: _OutboxRef(), raising=False)

    row_id = await ob.enqueue(
        session_id="sess_1",
        op_type=ob.OutboxOpType.CREATE_DOC,
        payload={"foo": "bar"},
        op_key="op-1",
    )
    assert isinstance(row_id, str)
    assert len(written) == 1
    assert written[0]["op_key"] == "op-1"
    assert written[0]["status"] == "pending"


async def test_register_dispatcher_and_dispatch_complete(monkeypatch) -> None:
    from services import outbox_service as ob

    calls = {"dispatched": 0, "complete": 0}

    async def _dispatcher(row):
        calls["dispatched"] += 1
        return {"ok": True}

    ob.register_dispatcher(ob.OutboxOpType.CREATE_DOC, _dispatcher)

    async def _mark_complete(row, result):
        calls["complete"] += 1

    monkeypatch.setattr(ob, "_mark_complete", _mark_complete, raising=False)

    row = ob.OutboxRow(
        session_id="s",
        op_type=ob.OutboxOpType.CREATE_DOC,
        op_key="k1",
        payload={},
    )
    await ob.dispatch(row)
    assert calls["dispatched"] == 1
    assert calls["complete"] == 1


async def test_dispatch_retry_on_failure(monkeypatch) -> None:
    from services import outbox_service as ob

    async def _broken(row):
        raise RuntimeError("api down")

    ob.register_dispatcher(ob.OutboxOpType.SEND_EMAIL, _broken)

    retry_calls: list[str] = []

    async def _mark_retry(row, err):
        retry_calls.append(err)

    monkeypatch.setattr(ob, "_mark_retry", _mark_retry, raising=False)

    row = ob.OutboxRow(
        session_id="s", op_type=ob.OutboxOpType.SEND_EMAIL, op_key="k", payload={}
    )
    await ob.dispatch(row)
    assert retry_calls == ["api down"]


async def test_dispatch_no_dispatcher_marks_failed(monkeypatch) -> None:
    from services import outbox_service as ob

    failed: list[str] = []

    async def _mark_failed(row, err):
        failed.append(err)

    monkeypatch.setattr(ob, "_mark_failed", _mark_failed, raising=False)

    row = ob.OutboxRow(
        session_id="s",
        op_type=ob.OutboxOpType.NOTIFY_FCM,
        op_key="k",
        payload={},
    )
    # Make sure no dispatcher exists
    ob._DISPATCH_REGISTRY.pop(ob.OutboxOpType.NOTIFY_FCM, None)
    await ob.dispatch(row)
    assert failed and "no dispatcher" in failed[0].lower()


async def test_outbox_row_idempotency_key() -> None:
    from services.outbox_service import OutboxOpType, OutboxRow

    row = OutboxRow(
        session_id="s",
        op_type=OutboxOpType.UPLOAD_DRIVE_FILE,
        op_key="explicit-idem-key",
        payload={"x": 1},
    )
    assert row.op_key == "explicit-idem-key"
    assert row.status.value == "pending"
