"""Abuse response — Pub/Sub-triggered from a Cloud Logging metric.

Triggered when log-based metric ``high_rate_per_ip`` fires (e.g., > N requests
per minute from a single IP). We:
  1. Add the IP as a deny rule in our Cloud Armor security policy for 1h.
  2. Post an alert.
  3. Mirror the action in Firestore ``abuse_actions`` for forensic audit.

Deploy::

    gcloud functions deploy abuse_response \\
        --gen2 --runtime python311 --region us-central1 \\
        --source ./cloud_functions/abuse_response \\
        --entry-point handle --trigger-topic abuse-events
"""
from __future__ import annotations

import base64
import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any

import functions_framework
import httpx

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("abuse_response")


PROJECT_ID = os.environ.get("PROJECT_ID", "")
POLICY_NAME = os.environ.get("CLOUD_ARMOR_POLICY", "prometheus-abuse-deny")
SLACK_WEBHOOK = os.environ.get("SLACK_WEBHOOK", "")
BLOCK_DURATION_S = int(os.environ.get("BLOCK_DURATION_S", "3600"))
PRIORITY_BASE = int(os.environ.get("PRIORITY_BASE", "1000"))


@functions_framework.cloud_event
def handle(event: Any) -> str:
    try:
        data = _decode(event)
    except Exception as e:  # noqa: BLE001
        log.exception("abuse_response.bad_payload", extra={"err": str(e)})
        return "bad_payload"

    ip = data.get("ip") or data.get("sourceIp") or _extract_from_log_alert(data)
    if not ip:
        log.warning("abuse_response.no_ip", extra={"data": str(data)[:300]})
        return "no_ip"

    reason = data.get("reason") or "high_rate"
    _add_armor_rule(ip, reason)
    _persist(ip, reason)
    _slack(ip, reason)
    return f"blocked:{ip}"


def _decode(event: Any) -> dict[str, Any]:
    msg = event.data.get("message", {}) if hasattr(event, "data") else {}
    raw = msg.get("data", "")
    if not raw:
        return {}
    return json.loads(base64.b64decode(raw).decode("utf-8"))


def _extract_from_log_alert(data: dict[str, Any]) -> str | None:
    """Pluck IP out of a Cloud Logging alert payload (jsonPayload.client_ip)."""
    inc = data.get("incident") or {}
    metadata = inc.get("metadata") or {}
    labels = metadata.get("user_labels") or {}
    return labels.get("client_ip") or inc.get("resource_id")


def _add_armor_rule(ip: str, reason: str) -> None:
    if not PROJECT_ID:
        log.warning("abuse_response.no_project")
        return
    url = (
        f"https://compute.googleapis.com/compute/v1/projects/{PROJECT_ID}"
        f"/global/securityPolicies/{POLICY_NAME}/addRule"
    )
    expires_at = int(time.time()) + BLOCK_DURATION_S
    priority = PRIORITY_BASE + (int(time.time()) % 1000)
    body = {
        "action": "deny(403)",
        "priority": priority,
        "match": {
            "versionedExpr": "SRC_IPS_V1",
            "config": {"srcIpRanges": [f"{ip}/32"]},
        },
        "description": f"prometheus_abuse:{reason}:expires={expires_at}",
    }
    try:
        token = _adc_token()
        with httpx.Client(timeout=20) as c:
            r = c.post(url, json=body, headers={"Authorization": f"Bearer {token}"})
            log.info(
                "abuse_response.armor_rule",
                extra={"ip": ip, "status": r.status_code, "body": r.text[:300]},
            )
    except Exception as e:  # noqa: BLE001
        log.warning("abuse_response.armor_failed", extra={"err": str(e)})


def _persist(ip: str, reason: str) -> None:
    try:
        from google.cloud import firestore  # type: ignore[import-not-found]

        db = firestore.Client(project=PROJECT_ID or None)
        db.collection("abuse_actions").add(
            {
                "ip": ip,
                "reason": reason,
                "policy": POLICY_NAME,
                "duration_seconds": BLOCK_DURATION_S,
                "at": datetime.now(timezone.utc),
            }
        )
    except Exception as e:  # noqa: BLE001
        log.warning("abuse_response.persist_failed", extra={"err": str(e)})


def _slack(ip: str, reason: str) -> None:
    if not SLACK_WEBHOOK:
        return
    text = f":no_entry: PROMETHEUS abuse-block: *{ip}* (reason: {reason}, ttl {BLOCK_DURATION_S}s)"
    try:
        with httpx.Client(timeout=10) as c:
            c.post(SLACK_WEBHOOK, json={"text": text})
    except Exception as e:  # noqa: BLE001
        log.warning("abuse_response.slack_failed", extra={"err": str(e)})


def _adc_token() -> str:
    import google.auth  # type: ignore[import-not-found]
    import google.auth.transport.requests  # type: ignore[import-not-found]

    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    creds.refresh(google.auth.transport.requests.Request())
    return creds.token  # type: ignore[no-any-return]
