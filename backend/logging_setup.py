"""structlog JSON logging configuration. Used by main.py + workers."""
from __future__ import annotations

import hashlib
import logging
import sys
from typing import Any

import structlog

from config import settings


def _scrub_idea_text(_: Any, __: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    """Hard guarantee: idea_text is never logged in plaintext."""
    if "idea_text" in event_dict:
        raw = event_dict.pop("idea_text")
        if isinstance(raw, str):
            event_dict["idea_text_hash"] = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
    if "raw_text" in event_dict:
        event_dict.pop("raw_text")
    return event_dict


def configure_logging() -> None:
    """Idempotent. Safe to call from main app + workers + tests."""
    level = getattr(logging, settings.log_level.upper(), logging.INFO)

    logging.basicConfig(
        level=level,
        stream=sys.stdout,
        format="%(message)s",
    )

    timestamper = structlog.processors.TimeStamper(fmt="iso", utc=True)

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            timestamper,
            _scrub_idea_text,
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def hash_idea(text: str) -> str:
    """Stable short hash used as the only public reference to idea_text in logs."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
