"""Branch diff service tests."""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


async def test_diff_same_agents_status_same(monkeypatch) -> None:
    from services import branch_diff_service

    async def _read(sid: str):
        return {"market_research": {"tam": 1_000_000_000}}

    monkeypatch.setattr(branch_diff_service, "_read_outputs", _read, raising=False)

    diff = await branch_diff_service.diff_sessions("p1", "c1")
    assert diff.summary["same"] == 1
    assert diff.summary["changed"] == 0


async def test_diff_changed_agents_returns_field_diff(monkeypatch) -> None:
    from services import branch_diff_service

    async def _read(sid: str):
        if sid == "p":
            return {"business_model": {"revenue_model": "subscription"}}
        return {"business_model": {"revenue_model": "marketplace"}}

    monkeypatch.setattr(branch_diff_service, "_read_outputs", _read, raising=False)

    diff = await branch_diff_service.diff_sessions("p", "c")
    assert diff.summary["changed"] == 1
    agent_diff = diff.agents[0]
    assert agent_diff.status == "changed"
    paths = [fd.path for fd in agent_diff.field_diffs]
    assert any("revenue_model" in p for p in paths)


async def test_diff_added_and_removed(monkeypatch) -> None:
    from services import branch_diff_service

    async def _read(sid: str):
        if sid == "p":
            return {"only_in_parent": {"x": 1}}
        return {"only_in_child": {"y": 2}}

    monkeypatch.setattr(branch_diff_service, "_read_outputs", _read, raising=False)
    diff = await branch_diff_service.diff_sessions("p", "c")
    statuses = {a.agent_name: a.status for a in diff.agents}
    assert statuses["only_in_parent"] == "removed"
    assert statuses["only_in_child"] == "added"
    assert diff.summary["added"] == 1
    assert diff.summary["removed"] == 1


async def test_diff_prose_uses_text_diff(monkeypatch) -> None:
    from services import branch_diff_service

    async def _read(sid: str):
        long = "lorem ipsum " * 60  # > 200 chars
        if sid == "p":
            return {"executive_summary": {"summary_text": long + "alpha"}}
        return {"executive_summary": {"summary_text": long + "beta"}}

    monkeypatch.setattr(branch_diff_service, "_read_outputs", _read, raising=False)
    diff = await branch_diff_service.diff_sessions("p", "c")
    agent_diff = diff.agents[0]
    assert agent_diff.status == "changed"
    assert agent_diff.text_diff is not None
