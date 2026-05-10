"""Prompt versioning registry.

Source of truth: ``backend/prompts/{agent}@{semver}.txt`` files on disk +
a Firestore mirror in ``prompt_versions/`` for runtime lookup, audit, and
rollback.

Active version per agent is tracked in ``prompt_active/{agent}`` with a
``semver`` field. ``prompt_registry.get(agent)`` reads the active version.
"""
from __future__ import annotations

import asyncio
import hashlib
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import structlog
from pydantic import BaseModel, Field, field_validator

log = structlog.get_logger(__name__)


# ─── Models ──────────────────────────────────────────────────────────────────


_SEMVER = re.compile(r"^\d+\.\d+\.\d+$")


class PromptVersion(BaseModel):
    agent_name: str
    semver: str
    content: str
    sha256: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = False
    notes: str = ""

    @field_validator("semver")
    @classmethod
    def _check_semver(cls, v: str) -> str:
        if not _SEMVER.match(v):
            raise ValueError(f"semver must match X.Y.Z (got {v!r})")
        return v


# ─── Paths / helpers ─────────────────────────────────────────────────────────


_ROOT = Path("backend") / "prompts"


def _path_for(agent: str, semver: str) -> Path:
    return _ROOT / f"{agent}@{semver}.txt"


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _db() -> Any:
    from services.firestore_service import _get_db  # type: ignore[attr-defined]

    return _get_db()


# ─── Disk readers ────────────────────────────────────────────────────────────


def _scan_disk(agent_name: str) -> list[PromptVersion]:
    if not _ROOT.exists():
        return []
    out: list[PromptVersion] = []
    for p in sorted(_ROOT.glob(f"{agent_name}@*.txt")):
        m = re.match(rf"{re.escape(agent_name)}@(\d+\.\d+\.\d+)\.txt", p.name)
        if not m:
            continue
        content = p.read_text(encoding="utf-8")
        out.append(
            PromptVersion(
                agent_name=agent_name,
                semver=m.group(1),
                content=content,
                sha256=_sha(content),
            )
        )
    out.sort(key=lambda v: tuple(int(x) for x in v.semver.split(".")))
    return out


def _semver_key(s: str) -> tuple[int, int, int]:
    a, b, c = s.split(".")
    return (int(a), int(b), int(c))


# ─── API ─────────────────────────────────────────────────────────────────────


async def get(agent_name: str, version: str | None = None) -> PromptVersion:
    """Return the requested version, or the active one if ``version`` is None.

    Lookup order:
      1. Disk path ``backend/prompts/{agent}@{semver}.txt``
      2. Firestore ``prompt_versions/{agent}__{semver}``
    """
    target_semver = version
    if target_semver is None:
        active = await _read_active(agent_name)
        target_semver = active or _latest_on_disk(agent_name)
    if not target_semver:
        raise FileNotFoundError(f"no prompt registered for agent {agent_name}")

    path = _path_for(agent_name, target_semver)
    if path.exists():
        content = path.read_text(encoding="utf-8")
        return PromptVersion(
            agent_name=agent_name,
            semver=target_semver,
            content=content,
            sha256=_sha(content),
            is_active=(version is None),
        )

    # Fall back to Firestore
    fs_doc = await _read_firestore_version(agent_name, target_semver)
    if fs_doc is None:
        raise FileNotFoundError(f"prompt {agent_name}@{target_semver} not found on disk or Firestore")
    return fs_doc


def _latest_on_disk(agent_name: str) -> str | None:
    versions = _scan_disk(agent_name)
    return versions[-1].semver if versions else None


async def _read_active(agent_name: str) -> str | None:
    def _r() -> str | None:
        snap = _db().collection("prompt_active").document(agent_name).get()
        if not snap.exists:
            return None
        return (snap.to_dict() or {}).get("semver")

    try:
        return await asyncio.to_thread(_r)
    except Exception:  # noqa: BLE001
        return None


async def _read_firestore_version(agent_name: str, semver: str) -> PromptVersion | None:
    def _r() -> dict[str, Any] | None:
        ref = _db().collection("prompt_versions").document(f"{agent_name}__{semver}")
        snap = ref.get()
        if not snap.exists:
            return None
        return snap.to_dict()

    try:
        d = await asyncio.to_thread(_r)
    except Exception:  # noqa: BLE001
        return None
    if d is None:
        return None
    try:
        return PromptVersion.model_validate(d)
    except Exception:  # noqa: BLE001
        return None


async def register(agent_name: str, content: str, semver: str, notes: str = "") -> PromptVersion:
    """Write a new version (disk + Firestore). Refuses to overwrite existing semver."""
    if not _SEMVER.match(semver):
        raise ValueError(f"semver must match X.Y.Z (got {semver!r})")
    path = _path_for(agent_name, semver)
    if path.exists():
        existing = path.read_text(encoding="utf-8")
        if _sha(existing) != _sha(content):
            raise FileExistsError(f"{path} exists with different content; bump semver")

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    pv = PromptVersion(agent_name=agent_name, semver=semver, content=content, sha256=_sha(content), notes=notes)

    def _w() -> None:
        ref = _db().collection("prompt_versions").document(f"{agent_name}__{semver}")
        ref.set(pv.model_dump(mode="json"), merge=True)

    try:
        await asyncio.to_thread(_w)
    except Exception as e:  # noqa: BLE001
        log.warning("prompt_registry.firestore_mirror_failed", agent=agent_name, err=str(e))

    log.info("prompt_registry.register", agent=agent_name, semver=semver, sha=pv.sha256[:8])
    return pv


async def list_versions(agent_name: str) -> list[PromptVersion]:
    """Return every version on disk for ``agent_name``, ordered ascending."""
    return _scan_disk(agent_name)


async def set_active(agent_name: str, semver: str) -> None:
    """Atomic alias write — marks ``prompt_active/{agent} = {semver}``."""
    if not _SEMVER.match(semver):
        raise ValueError(f"semver must match X.Y.Z (got {semver!r})")
    if not _path_for(agent_name, semver).exists():
        raise FileNotFoundError(f"prompt {agent_name}@{semver} not on disk")

    def _w() -> None:
        _db().collection("prompt_active").document(agent_name).set(
            {"semver": semver, "set_at": datetime.now(timezone.utc)}
        )

    await asyncio.to_thread(_w)
    log.info("prompt_registry.set_active", agent=agent_name, semver=semver)


__all__ = [
    "PromptVersion",
    "get",
    "list_versions",
    "register",
    "set_active",
]
