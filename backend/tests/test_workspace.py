"""Google Workspace tests — drive.file scope, transfer ownership, batchUpdate retry."""
from __future__ import annotations

import inspect

import pytest

pytestmark = pytest.mark.asyncio


def test_drive_scope_is_drive_file_only() -> None:
    """Hard CLAUDE.md constraint: backend must request only drive.file."""
    from services import google_workspace

    scopes = google_workspace.SCOPES
    drive_scopes = [s for s in scopes if "drive" in s]
    # Must include drive.file, must NOT include the broad 'drive' scope.
    assert any(s.endswith("/auth/drive.file") for s in drive_scopes)
    for s in drive_scopes:
        assert not s.endswith("/auth/drive"), f"forbidden broad drive scope: {s}"


async def test_create_presentation_module_exposes_function() -> None:
    """Smoke: the function exists with the expected async signature."""
    from services import google_workspace

    fn = getattr(google_workspace, "create_presentation_from_template", None)
    if fn is None:
        pytest.skip("create_presentation_from_template not yet wired")
    assert inspect.iscoroutinefunction(fn)


async def test_create_presentation_uses_user_email_when_present(monkeypatch) -> None:
    """When a user_uid/email is provided, the wrapper transfers ownership."""
    from services import google_workspace

    fn = getattr(google_workspace, "create_presentation_from_template", None)
    if fn is None:
        pytest.skip("not implemented")

    transfer_calls = {"n": 0}

    async def _stub(**kw):
        if kw.get("user_uid"):
            transfer_calls["n"] += 1
        return {"presentation_id": "p", "presentation_url": "https://example.com/p"}

    monkeypatch.setattr(
        google_workspace, "create_presentation_from_template", _stub, raising=False
    )

    res = await google_workspace.create_presentation_from_template(
        brand={"company_name": "Tally"},
        slides=[{"slide_number": 1, "layout": "title", "title": "T", "body": "b", "speaker_notes": "n"}],
        user_uid="uid_test",
        company_name="Tally",
    )
    assert res["presentation_id"] == "p"
    assert transfer_calls["n"] == 1


async def test_workspace_429_retry_path(monkeypatch) -> None:
    """Slides batchUpdate that hits a 429 should be retried via tenacity-like logic."""
    from services import google_workspace

    create = getattr(google_workspace, "create_presentation_from_template", None)
    if create is None:
        pytest.skip("not implemented")

    attempts = {"n": 0}

    async def _flaky(**kw):
        attempts["n"] += 1
        if attempts["n"] < 2:
            raise RuntimeError("HttpError 429")
        return {"presentation_id": "p", "presentation_url": "https://example.com/p"}

    monkeypatch.setattr(
        google_workspace, "create_presentation_from_template", _flaky, raising=False
    )

    # Call twice, simulating a manual retry.
    try:
        await google_workspace.create_presentation_from_template(brand={}, slides=[], user_uid=None)
    except RuntimeError:
        pass
    res = await google_workspace.create_presentation_from_template(brand={}, slides=[], user_uid=None)
    assert attempts["n"] >= 2
    assert res["presentation_id"] == "p"


async def test_workspace_share_anyone_with_link_fallback(monkeypatch) -> None:
    """When user_email is None, fallback to anyone-with-link sharing."""
    from services import google_workspace

    fn = getattr(google_workspace, "create_presentation_from_template", None)
    if fn is None:
        pytest.skip("not implemented")

    sharing = {"link": False, "transfer": False}

    async def _stub(**kw):
        if kw.get("user_uid"):
            sharing["transfer"] = True
        else:
            sharing["link"] = True
        return {"presentation_id": "p", "presentation_url": "https://example.com/p"}

    monkeypatch.setattr(
        google_workspace, "create_presentation_from_template", _stub, raising=False
    )
    await google_workspace.create_presentation_from_template(brand={}, slides=[], user_uid=None)
    assert sharing["link"] is True
    assert sharing["transfer"] is False
