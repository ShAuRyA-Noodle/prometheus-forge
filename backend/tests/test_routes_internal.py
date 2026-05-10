"""Internal /internal/run route — Cloud Tasks OIDC verification."""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


async def test_internal_run_dev_loopback(client, monkeypatch) -> None:
    """No invoker SA configured + loopback client → accepted."""
    from config import settings
    from workers import pipeline_worker

    monkeypatch.setattr(settings, "cloud_tasks_invoker_sa", "", raising=False)

    called = {"sid": None}

    async def _run(*, session_id, idea_text):
        called["sid"] = session_id

    monkeypatch.setattr(
        pipeline_worker, "run_pipeline_for_task", _run, raising=False
    )

    r = await client.post(
        "/internal/run",
        json={"session_id": "sess_test_1234", "idea_text": "x"},
        headers={"content-type": "application/json"},
    )
    # AsyncClient identifies as "testclient" which the dev guard accepts.
    assert r.status_code == 200
    assert called["sid"] == "sess_test_1234"


async def test_internal_run_missing_oidc(client, monkeypatch) -> None:
    """SA is configured → require Bearer OIDC token."""
    from config import settings

    monkeypatch.setattr(
        settings, "cloud_tasks_invoker_sa", "tasks-sa@example.iam.gserviceaccount.com",
        raising=False,
    )
    r = await client.post(
        "/internal/run",
        json={"session_id": "sess_test_1234", "idea_text": "x"},
        headers={"content-type": "application/json"},
    )
    assert r.status_code == 401


async def test_internal_run_invalid_oidc(client, monkeypatch) -> None:
    from api import routes_internal
    from config import settings

    monkeypatch.setattr(
        settings, "cloud_tasks_invoker_sa", "tasks-sa@example.iam.gserviceaccount.com",
        raising=False,
    )

    def _verify(token):
        raise ValueError("bad_email")

    monkeypatch.setattr(routes_internal, "_verify_oidc", _verify, raising=False)

    r = await client.post(
        "/internal/run",
        json={"session_id": "sess_test_1234", "idea_text": "x"},
        headers={"content-type": "application/json", "authorization": "Bearer fake.token.xyz"},
    )
    assert r.status_code == 401


async def test_internal_run_pipeline_failure(client, monkeypatch) -> None:
    from config import settings
    from workers import pipeline_worker

    monkeypatch.setattr(settings, "cloud_tasks_invoker_sa", "", raising=False)

    async def _broken(*, session_id, idea_text):
        raise RuntimeError("pipeline boom")

    monkeypatch.setattr(pipeline_worker, "run_pipeline_for_task", _broken, raising=False)

    r = await client.post(
        "/internal/run",
        json={"session_id": "sess_test_1234", "idea_text": "x"},
        headers={"content-type": "application/json"},
    )
    assert r.status_code == 500
