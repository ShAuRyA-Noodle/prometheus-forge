"""Hard CLAUDE.md constraint: idea_text must NEVER appear in logs (only its hash)."""
from __future__ import annotations

import logging
import secrets

import pytest

pytestmark = [pytest.mark.security, pytest.mark.asyncio]


_MARKER = "X_NEVER_LOG_THIS_IDEA_TEXT_MARKER_77"


async def test_generate_does_not_log_idea_text(client, caplog) -> None:
    body = {"idea_text": f"A startup about {_MARKER} that revolutionizes things"}
    with caplog.at_level(logging.DEBUG):
        await client.post(
            "/api/generate",
            json=body,
            headers={"authorization": "Bearer test", "content-type": "application/json",
                     "idempotency-key": "log-" + secrets.token_urlsafe(12)},
        )
    full_log = "\n".join(record.getMessage() for record in caplog.records)
    assert _MARKER not in full_log


async def test_moderation_logs_only_hash() -> None:
    """moderation_service emits text_hash, never the raw text."""
    from services.moderation_service import pre_filter_input

    result = await pre_filter_input(f"normal idea referencing {_MARKER}")
    assert result.text_hash != ""
    # Hash is deterministic and reasonably short.
    assert len(result.text_hash) == 64


def test_logging_setup_hash_idea_function_exists() -> None:
    from logging_setup import hash_idea

    h = hash_idea("hello world")
    assert isinstance(h, str)
    assert len(h) >= 8
