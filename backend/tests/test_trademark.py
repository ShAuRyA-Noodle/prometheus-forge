"""Trademark service tests."""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


async def test_check_uspto_returns_list(monkeypatch) -> None:
    from services import trademark_service

    async def _stub_q_uspto(client, name):
        return [
            trademark_service.ConflictEntry(mark="Tally", owner="Tally LLC", source="uspto_tsdr")
        ]

    async def _stub_q_justia(client, name):
        return []

    monkeypatch.setattr(trademark_service, "_query_uspto_tsdr", _stub_q_uspto, raising=False)
    monkeypatch.setattr(trademark_service, "_query_justia", _stub_q_justia, raising=False)
    monkeypatch.setattr(
        trademark_service.settings, "uspto_api_key", "test_key", raising=False
    )

    # Bust cache.
    trademark_service._cache.clear()
    result = await trademark_service.check_uspto("Tally")
    assert isinstance(result, list)
    assert len(result) == 1
    assert result[0].mark == "Tally"


async def test_check_uspto_cache(monkeypatch) -> None:
    from services import trademark_service

    calls = {"n": 0}

    async def _stub(client, name):
        calls["n"] += 1
        return [trademark_service.ConflictEntry(mark="Tally", source="justia")]

    monkeypatch.setattr(trademark_service, "_query_justia", _stub, raising=False)
    monkeypatch.setattr(trademark_service.settings, "uspto_api_key", "", raising=False)
    trademark_service._cache.clear()

    a = await trademark_service.check_uspto("Tally")
    b = await trademark_service.check_uspto("tally")  # case-insensitive cache key
    assert calls["n"] == 1
    assert len(a) == len(b) == 1


async def test_check_uspto_empty_name() -> None:
    from services.trademark_service import check_uspto

    assert await check_uspto("") == []
    assert await check_uspto("   ") == []


async def test_check_uspto_filters_irrelevant(monkeypatch) -> None:
    from services import trademark_service

    async def _stub(client, name):
        return [
            trademark_service.ConflictEntry(mark="CompletelyUnrelatedMark", source="x"),
            trademark_service.ConflictEntry(mark="Tally", source="x"),
        ]

    monkeypatch.setattr(trademark_service, "_query_justia", _stub, raising=False)
    monkeypatch.setattr(trademark_service.settings, "uspto_api_key", "", raising=False)
    trademark_service._cache.clear()

    result = await trademark_service.check_uspto("Tally")
    assert len(result) == 1
    assert result[0].mark == "Tally"
