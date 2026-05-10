"""Secret rotation helper for Google Secret Manager.

Operations:
  - ``rotate(secret_name)`` adds a new version, disables the old after a grace period.
  - ``audit_age()`` returns the age of the latest enabled version per secret.
  - ``verify_rotation_policy()`` checks that every secret listed in the policy
    file is younger than its mandated cadence.

The policy file lives at ``infrastructure/rotation-policy.yaml``.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import structlog
from pydantic import BaseModel, Field

from config import settings

log = structlog.get_logger(__name__)


# ─── Models ──────────────────────────────────────────────────────────────────


class RotationPolicyEntry(BaseModel):
    secret: str
    cadence_days: int = Field(..., ge=1, le=365)
    description: str = ""


class RotationPolicy(BaseModel):
    policies: list[RotationPolicyEntry]


class RotationViolation(BaseModel):
    secret: str
    cadence_days: int
    age_days: int
    severity: str  # info | warn | critical


class RotationAuditReport(BaseModel):
    audited_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    ages_by_secret: dict[str, int]
    violations: list[RotationViolation]


# ─── Internals ───────────────────────────────────────────────────────────────


def _client() -> Any:
    """Return a Secret Manager client (sync). Caller wraps with to_thread."""
    from google.cloud import secretmanager  # type: ignore[import-not-found]

    return secretmanager.SecretManagerServiceClient()


def _project_path() -> str:
    return f"projects/{settings.google_cloud_project}"


# ─── API ─────────────────────────────────────────────────────────────────────


async def rotate(
    secret_name: str,
    new_payload: bytes,
    disable_after: timedelta = timedelta(hours=24),
) -> str:
    """Add a new version to ``secret_name`` and schedule the previous active version
    to be disabled after ``disable_after``.

    Returns the new version name (e.g., ``projects/.../versions/42``).
    """

    def _do() -> tuple[str, str | None]:
        c = _client()
        parent = f"{_project_path()}/secrets/{secret_name}"
        # Add new version
        new_v = c.add_secret_version(
            request={"parent": parent, "payload": {"data": new_payload}}
        )
        # Find current latest enabled to disable later
        prev: str | None = None
        for v in c.list_secret_versions(request={"parent": parent}):
            if v.name == new_v.name:
                continue
            if v.state == 1:  # ENABLED
                prev = v.name
                break
        return new_v.name, prev

    new_name, prev_name = await asyncio.to_thread(_do)
    log.info("secret.rotate.added", secret=secret_name, version=new_name, prev=prev_name)

    if prev_name:
        # Schedule disablement on a background task
        async def _disable_later() -> None:
            await asyncio.sleep(disable_after.total_seconds())
            try:
                await _disable_version(prev_name)
                log.info("secret.rotate.prev_disabled", version=prev_name)
            except Exception as e:  # noqa: BLE001
                log.warning("secret.rotate.disable_failed", version=prev_name, err=str(e))

        asyncio.create_task(_disable_later())  # noqa: RUF006

    return new_name


async def _disable_version(version_name: str) -> None:
    def _do() -> None:
        c = _client()
        c.disable_secret_version(request={"name": version_name})

    await asyncio.to_thread(_do)


async def audit_age() -> dict[str, int]:
    """Return ``{secret_name: days_since_latest_enabled_version_was_created}``."""

    def _do() -> dict[str, int]:
        c = _client()
        out: dict[str, int] = {}
        for s in c.list_secrets(request={"parent": _project_path()}):
            name = s.name.rsplit("/", 1)[-1]
            latest_create: datetime | None = None
            for v in c.list_secret_versions(request={"parent": s.name}):
                if v.state != 1:  # not ENABLED
                    continue
                ts = getattr(v, "create_time", None)
                if ts is None:
                    continue
                ct = ts if isinstance(ts, datetime) else datetime.fromtimestamp(ts.timestamp(), tz=timezone.utc)
                if latest_create is None or ct > latest_create:
                    latest_create = ct
            if latest_create is not None:
                age = (datetime.now(timezone.utc) - latest_create).days
                out[name] = age
        return out

    return await asyncio.to_thread(_do)


def _load_policy(path: str | None = None) -> RotationPolicy:
    import yaml  # type: ignore[import-not-found]

    p = Path(path) if path else Path("infrastructure/rotation-policy.yaml")
    if not p.exists():
        return RotationPolicy(policies=[])
    raw = yaml.safe_load(p.read_text()) or {}
    return RotationPolicy.model_validate(raw)


async def verify_rotation_policy(policy_path: str | None = None) -> RotationAuditReport:
    policy = _load_policy(policy_path)
    ages = await audit_age()
    violations: list[RotationViolation] = []
    for entry in policy.policies:
        age = ages.get(entry.secret)
        if age is None:
            violations.append(
                RotationViolation(
                    secret=entry.secret,
                    cadence_days=entry.cadence_days,
                    age_days=-1,
                    severity="warn",
                )
            )
            continue
        if age > entry.cadence_days * 1.5:
            sev = "critical"
        elif age > entry.cadence_days:
            sev = "warn"
        else:
            continue
        violations.append(
            RotationViolation(
                secret=entry.secret,
                cadence_days=entry.cadence_days,
                age_days=age,
                severity=sev,
            )
        )
    report = RotationAuditReport(ages_by_secret=ages, violations=violations)
    log.info(
        "secret.audit.complete",
        audited=len(ages),
        violations=len(violations),
        critical=sum(1 for v in violations if v.severity == "critical"),
    )
    return report


__all__ = [
    "RotationAuditReport",
    "RotationPolicy",
    "RotationPolicyEntry",
    "RotationViolation",
    "audit_age",
    "rotate",
    "verify_rotation_policy",
]
