"""Billing kill-switch — Pub/Sub-triggered Cloud Function.

Subscribes to a billing alert topic. When the alert payload says "cost has
breached threshold X", we:
  1. Disable the Gemini + Vertex AI Service Usage entries on the project.
  2. Write ``system_state/killswitch`` to Firestore with ``{enabled: true,
     reason, at}``. The gateway middleware reads this doc on every request
     and returns 503 once flipped.
  3. Post a Slack/Resend alert so a human knows to investigate.

Deploy::

    gcloud functions deploy billing_killswitch \\
        --gen2 --runtime python311 --region us-central1 \\
        --source ./cloud_functions/billing_killswitch \\
        --entry-point handle --trigger-topic billing-alerts \\
        --service-account billing-killswitch@<project>.iam.gserviceaccount.com \\
        --set-env-vars PROJECT_ID=<project>,SLACK_WEBHOOK=<...>
"""
from __future__ import annotations

import base64
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

import functions_framework
import httpx

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("billing_killswitch")


PROJECT_ID = os.environ.get("PROJECT_ID", "")
SLACK_WEBHOOK = os.environ.get("SLACK_WEBHOOK", "")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
ALERT_EMAIL = os.environ.get("ALERT_EMAIL", "")
HARD_LIMIT_USD = float(os.environ.get("HARD_LIMIT_USD", "100"))

DISABLE_SERVICES = [
    "aiplatform.googleapis.com",
    "generativelanguage.googleapis.com",
]


# ─── Entry point ─────────────────────────────────────────────────────────────


@functions_framework.cloud_event
def handle(event: Any) -> str:
    """CloudEvent payload from Pub/Sub. Body is the GCP Billing alert JSON."""
    try:
        data = _decode(event)
    except Exception as e:  # noqa: BLE001
        log.exception("billing_killswitch.bad_payload", extra={"err": str(e)})
        return "bad_payload"

    cost_amount = float(data.get("costAmount", 0) or 0)
    threshold = float(data.get("alertThresholdExceeded", 0) or 0)
    budget_amount = float(data.get("budgetAmount", 0) or 0)
    log.info(
        "billing_killswitch.alert",
        extra={
            "cost": cost_amount,
            "threshold": threshold,
            "budget": budget_amount,
        },
    )

    if cost_amount < HARD_LIMIT_USD and threshold < 1.0:
        log.info("billing_killswitch.below_hard_limit", extra={"cost": cost_amount})
        return "below_hard_limit"

    reason = f"billing breach cost={cost_amount} budget={budget_amount} threshold={threshold}"
    _flip_killswitch_firestore(reason)
    for svc in DISABLE_SERVICES:
        _disable_service(svc)
    _alert_humans(reason, cost_amount, budget_amount)
    return "killswitch_engaged"


def _decode(event: Any) -> dict[str, Any]:
    msg = event.data.get("message", {}) if hasattr(event, "data") else {}
    raw = msg.get("data", "")
    if not raw:
        return {}
    return json.loads(base64.b64decode(raw).decode("utf-8"))


# ─── Service Usage disable ──────────────────────────────────────────────────


def _disable_service(service: str) -> None:
    if not PROJECT_ID:
        log.warning("billing_killswitch.no_project_id")
        return
    url = f"https://serviceusage.googleapis.com/v1/projects/{PROJECT_ID}/services/{service}:disable"
    body = {"disableDependentServices": False}
    try:
        token = _adc_token()
        with httpx.Client(timeout=30) as c:
            r = c.post(url, json=body, headers={"Authorization": f"Bearer {token}"})
            log.info(
                "billing_killswitch.service_disable",
                extra={"service": service, "status": r.status_code, "body": r.text[:300]},
            )
    except Exception as e:  # noqa: BLE001
        log.warning("billing_killswitch.disable_failed", extra={"svc": service, "err": str(e)})


# ─── Firestore flip ─────────────────────────────────────────────────────────


def _flip_killswitch_firestore(reason: str) -> None:
    try:
        from google.cloud import firestore  # type: ignore[import-not-found]

        db = firestore.Client(project=PROJECT_ID or None)
        db.collection("system_state").document("killswitch").set(
            {
                "enabled": True,
                "reason": reason,
                "at": datetime.now(timezone.utc),
                "manual_override_required": True,
            }
        )
        log.info("billing_killswitch.firestore_flipped")
    except Exception as e:  # noqa: BLE001
        log.exception("billing_killswitch.firestore_failed", extra={"err": str(e)})


# ─── Alerts ─────────────────────────────────────────────────────────────────


def _alert_humans(reason: str, cost: float, budget: float) -> None:
    text = (
        f":rotating_light: *PROMETHEUS BILLING KILL-SWITCH ENGAGED*\n"
        f"Cost: ${cost:.2f} / Budget: ${budget:.2f}\nReason: {reason}\n"
        f"Action: investigate logs + manual override at "
        f"`gcloud services enable {','.join(DISABLE_SERVICES)}`"
    )
    if SLACK_WEBHOOK:
        try:
            with httpx.Client(timeout=10) as c:
                c.post(SLACK_WEBHOOK, json={"text": text})
        except Exception as e:  # noqa: BLE001
            log.warning("billing_killswitch.slack_failed", extra={"err": str(e)})

    if RESEND_API_KEY and ALERT_EMAIL:
        try:
            with httpx.Client(timeout=10) as c:
                c.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
                    json={
                        "from": "alerts@prometheus.local",
                        "to": [ALERT_EMAIL],
                        "subject": "PROMETHEUS billing kill-switch engaged",
                        "text": text,
                    },
                )
        except Exception as e:  # noqa: BLE001
            log.warning("billing_killswitch.email_failed", extra={"err": str(e)})


def _adc_token() -> str:
    import google.auth  # type: ignore[import-not-found]
    import google.auth.transport.requests  # type: ignore[import-not-found]

    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    creds.refresh(google.auth.transport.requests.Request())
    return creds.token  # type: ignore[no-any-return]
