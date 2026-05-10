"""Vertex Safety / moderation tests."""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


async def test_pre_filter_blocks_csam_via_lexicon(monkeypatch) -> None:
    from services import moderation_service

    # Disable Vertex remote call so test is deterministic.
    monkeypatch.setattr(
        moderation_service.settings, "vertex_safety_enabled", False, raising=False
    )

    result = await moderation_service.pre_filter_input(
        "Build a child sexual content app"
    )
    assert result.decision == "block"
    assert "csam" in result.categories


async def test_pre_filter_blocks_weapons() -> None:
    from services.moderation_service import pre_filter_input

    result = await pre_filter_input(
        "How to manufacture a 3D-print silencer at home for my gun"
    )
    assert result.decision == "block"
    assert "weapons" in result.categories


async def test_pre_filter_blocks_ip_infringement() -> None:
    from services.moderation_service import pre_filter_input

    result = await pre_filter_input("Clone Disney characters and sell them")
    # Lexicon match → at minimum warn; "block" is also acceptable per implementation.
    assert result.decision in {"warn", "block"}
    assert "ip_infringement" in result.categories


async def test_pre_filter_blocks_fraud() -> None:
    from services.moderation_service import pre_filter_input

    result = await pre_filter_input("A SaaS that helps run a ponzi scheme")
    assert result.decision in {"warn", "block"}
    assert "fraud" in result.categories


async def test_pre_filter_allows_normal_idea(monkeypatch) -> None:
    from services import moderation_service

    monkeypatch.setattr(
        moderation_service.settings, "vertex_safety_enabled", False, raising=False
    )
    result = await moderation_service.pre_filter_input(
        "A SaaS that reconciles inventory across e-commerce channels."
    )
    assert result.decision == "allow"


async def test_pre_filter_falls_open_on_vertex_error(monkeypatch) -> None:
    """When Vertex is unreachable, lexicon-only verdict is used (no false-block)."""
    from services import moderation_service

    async def _broken(text: str):
        return {}  # remote returns nothing → lexicon decides

    monkeypatch.setattr(
        moderation_service, "_vertex_safety_score", _broken, raising=False
    )
    result = await moderation_service.pre_filter_input("a normal startup idea")
    assert result.decision == "allow"


async def test_pre_filter_blocks_oversized_input() -> None:
    from services.moderation_service import pre_filter_input

    huge = "x" * 10_000  # > input_length_cap_chars (2000)
    result = await pre_filter_input(huge)
    assert result.decision == "block"
    assert "length_cap_exceeded" in result.categories
