"""Diff two sessions for the BranchingView compare panel.

Per agent we classify: ``same | changed | added | removed``.
For ``changed`` agents:
  - prose strings get a unified-diff text
  - structured dicts get a deep dict-diff (paths to leaves that differ)
"""
from __future__ import annotations

import asyncio
import difflib
import json
from datetime import datetime, timezone
from typing import Any, Literal

import structlog
from pydantic import BaseModel, Field

log = structlog.get_logger(__name__)


# ─── Models ──────────────────────────────────────────────────────────────────


DiffStatus = Literal["same", "changed", "added", "removed"]


class FieldDiff(BaseModel):
    path: str
    a: Any
    b: Any


class AgentDiff(BaseModel):
    agent_name: str
    status: DiffStatus
    text_diff: str | None = None  # unified diff if prose
    field_diffs: list[FieldDiff] = Field(default_factory=list)  # if structured


class BranchDiff(BaseModel):
    parent_session_id: str
    child_session_id: str
    agents: list[AgentDiff]
    summary: dict[str, int]  # counts per status
    diffed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ─── Helpers ─────────────────────────────────────────────────────────────────


def _is_prose_dict(d: dict[str, Any]) -> bool:
    """Heuristic: object holding a single long-string field is treated as prose."""
    if not isinstance(d, dict):
        return False
    string_fields = [v for v in d.values() if isinstance(v, str) and len(v) > 200]
    return len(string_fields) >= 1 and len(d) <= 5


def _flatten(o: Any, prefix: str = "") -> dict[str, Any]:
    """Flatten nested dict/list to ``{ "a.b.0.c": value }``."""
    out: dict[str, Any] = {}
    if isinstance(o, dict):
        for k, v in o.items():
            out.update(_flatten(v, f"{prefix}.{k}" if prefix else str(k)))
    elif isinstance(o, list):
        for i, v in enumerate(o):
            out.update(_flatten(v, f"{prefix}.{i}" if prefix else str(i)))
    else:
        out[prefix] = o
    return out


def _dict_diff(a: dict[str, Any], b: dict[str, Any]) -> list[FieldDiff]:
    """Path-level diff between two dicts."""
    fa, fb = _flatten(a), _flatten(b)
    keys = set(fa) | set(fb)
    diffs: list[FieldDiff] = []
    for k in sorted(keys):
        va, vb = fa.get(k, ...), fb.get(k, ...)
        if va == vb:
            continue
        diffs.append(FieldDiff(path=k, a=None if va is ... else va, b=None if vb is ... else vb))
    return diffs


def _text_unified(a: str, b: str, label_a: str = "parent", label_b: str = "child") -> str:
    return "\n".join(
        difflib.unified_diff(
            a.splitlines(),
            b.splitlines(),
            fromfile=label_a,
            tofile=label_b,
            lineterm="",
            n=2,
        )
    )


# ─── API ─────────────────────────────────────────────────────────────────────


async def diff_sessions(parent_id: str, child_id: str) -> BranchDiff:
    """Read both sessions' agent_outputs subcollections and produce a BranchDiff."""
    parent_outs, child_outs = await asyncio.gather(
        _read_outputs(parent_id), _read_outputs(child_id)
    )
    keys = sorted(set(parent_outs) | set(child_outs))
    agents: list[AgentDiff] = []
    summary: dict[str, int] = {"same": 0, "changed": 0, "added": 0, "removed": 0}

    for k in keys:
        a, b = parent_outs.get(k), child_outs.get(k)
        if a is None and b is not None:
            agents.append(AgentDiff(agent_name=k, status="added"))
            summary["added"] += 1
            continue
        if a is not None and b is None:
            agents.append(AgentDiff(agent_name=k, status="removed"))
            summary["removed"] += 1
            continue
        if a == b:
            agents.append(AgentDiff(agent_name=k, status="same"))
            summary["same"] += 1
            continue
        # changed
        if isinstance(a, dict) and isinstance(b, dict) and _is_prose_dict(a):
            text_a = json.dumps(a, indent=2, ensure_ascii=False, sort_keys=True)
            text_b = json.dumps(b, indent=2, ensure_ascii=False, sort_keys=True)
            agents.append(
                AgentDiff(agent_name=k, status="changed", text_diff=_text_unified(text_a, text_b))
            )
        else:
            agents.append(
                AgentDiff(
                    agent_name=k,
                    status="changed",
                    field_diffs=_dict_diff(a or {}, b or {}),
                )
            )
        summary["changed"] += 1

    log.info(
        "branch_diff.complete",
        parent=parent_id,
        child=child_id,
        same=summary["same"],
        changed=summary["changed"],
        added=summary["added"],
        removed=summary["removed"],
    )
    return BranchDiff(
        parent_session_id=parent_id,
        child_session_id=child_id,
        agents=agents,
        summary=summary,
    )


async def _read_outputs(sid: str) -> dict[str, Any]:
    def _r() -> dict[str, Any]:
        from services.firestore_service import _get_db  # type: ignore[attr-defined]

        db = _get_db()
        col = db.collection("sessions").document(sid).collection("agent_outputs")
        out: dict[str, Any] = {}
        for snap in col.stream():
            d = snap.to_dict() or {}
            out[snap.id] = d.get("payload") or {}
        return out

    return await asyncio.to_thread(_r)


__all__ = ["AgentDiff", "BranchDiff", "FieldDiff", "diff_sessions"]
