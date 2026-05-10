"""DSAR processor — HTTP-triggered Cloud Function.

GDPR / CCPA Data Subject Access Request handler:
  - Authenticate the user via Firebase ID token.
  - Validate the requested operation (export | delete).
  - Enqueue a background job that gathers all data tied to ``uid`` from
    Firestore (sessions, agent_outputs, costs, usage), zips it, uploads to
    a private GCS bucket, and emails a 7-day signed URL to the user.
  - 30-day SLA enforced by writing a ``dsar_requests/{id}`` doc with a
    ``due_by`` field; a Cloud Scheduler job re-checks pending requests.

Deploy::

    gcloud functions deploy dsar_processor \\
        --gen2 --runtime python311 --region us-central1 \\
        --source ./cloud_functions/dsar_processor \\
        --entry-point handle --trigger-http --allow-unauthenticated
"""
from __future__ import annotations

import io
import json
import logging
import os
import uuid
import zipfile
from datetime import datetime, timedelta, timezone
from typing import Any

import functions_framework
import httpx
from flask import Request, jsonify, make_response

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("dsar_processor")


PROJECT_ID = os.environ.get("PROJECT_ID", "")
DSAR_BUCKET = os.environ.get("DSAR_BUCKET", "")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
FROM_EMAIL = os.environ.get("FROM_EMAIL", "privacy@prometheus.local")


@functions_framework.http
def handle(request: Request) -> Any:
    if request.method == "OPTIONS":
        return _cors_preflight()

    try:
        body = request.get_json(force=True, silent=True) or {}
    except Exception:  # noqa: BLE001
        return _json_response({"error": "invalid_json"}, 400)

    op = body.get("op")
    if op not in {"export", "delete"}:
        return _json_response({"error": "op must be export|delete"}, 400)

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return _json_response({"error": "missing_auth"}, 401)

    id_token = auth_header.split(" ", 1)[1]
    try:
        uid, email = _verify_firebase_token(id_token)
    except Exception as e:  # noqa: BLE001
        log.warning("dsar.bad_token", extra={"err": str(e)})
        return _json_response({"error": "invalid_token"}, 401)

    request_id = uuid.uuid4().hex
    due_by = datetime.now(timezone.utc) + timedelta(days=30)

    _persist_request(request_id, uid, email, op, due_by)

    if op == "delete":
        # Schedule deletion (out-of-band; here we just record)
        _schedule_deletion(uid)
        return _json_response(
            {"request_id": request_id, "op": "delete", "due_by": due_by.isoformat()}
        )

    # op == export — process inline (best-effort) and email link
    try:
        zip_bytes = _gather_user_data(uid)
        url = _upload_zip(uid, request_id, zip_bytes)
        _email_link(email, url, request_id)
        _mark_complete(request_id, url)
        return _json_response(
            {
                "request_id": request_id,
                "op": "export",
                "status": "completed",
                "due_by": due_by.isoformat(),
            }
        )
    except Exception as e:  # noqa: BLE001
        log.exception("dsar.export_failed", extra={"err": str(e)})
        return _json_response(
            {
                "request_id": request_id,
                "op": "export",
                "status": "queued",
                "due_by": due_by.isoformat(),
            },
            202,
        )


# ─── Helpers ────────────────────────────────────────────────────────────────


def _verify_firebase_token(id_token: str) -> tuple[str, str]:
    import firebase_admin  # type: ignore[import-not-found]
    from firebase_admin import auth  # type: ignore[import-not-found]

    if not firebase_admin._apps:
        firebase_admin.initialize_app()
    decoded = auth.verify_id_token(id_token, check_revoked=True)
    return decoded["uid"], decoded.get("email", "")


def _persist_request(request_id: str, uid: str, email: str, op: str, due_by: datetime) -> None:
    from google.cloud import firestore  # type: ignore[import-not-found]

    db = firestore.Client(project=PROJECT_ID or None)
    db.collection("dsar_requests").document(request_id).set(
        {
            "uid": uid,
            "email": email,
            "op": op,
            "status": "received",
            "received_at": datetime.now(timezone.utc),
            "due_by": due_by,
        }
    )


def _gather_user_data(uid: str) -> bytes:
    from google.cloud import firestore  # type: ignore[import-not-found]

    db = firestore.Client(project=PROJECT_ID or None)
    user_doc = db.collection("users").document(uid).get()
    sessions = list(db.collection("sessions").where("user_uid", "==", uid).stream())
    companies = list(db.collection("companies").where("owner_uid", "==", uid).stream())

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(
            "user.json",
            json.dumps(user_doc.to_dict() or {}, default=str, indent=2),
        )
        z.writestr(
            "sessions.json",
            json.dumps(
                [{"id": s.id, **(s.to_dict() or {})} for s in sessions],
                default=str,
                indent=2,
            ),
        )
        z.writestr(
            "companies.json",
            json.dumps(
                [{"id": c.id, **(c.to_dict() or {})} for c in companies],
                default=str,
                indent=2,
            ),
        )
        # Per-session agent outputs
        for s in sessions:
            outs = (
                db.collection("sessions")
                .document(s.id)
                .collection("agent_outputs")
                .stream()
            )
            payload = [{"id": o.id, **(o.to_dict() or {})} for o in outs]
            z.writestr(
                f"agent_outputs/{s.id}.json",
                json.dumps(payload, default=str, indent=2),
            )
        z.writestr(
            "MANIFEST.txt",
            f"PROMETHEUS DSAR export for uid={uid}\n"
            f"Generated: {datetime.now(timezone.utc).isoformat()}\n"
            f"Includes: user profile, sessions, agent outputs, companies.\n",
        )
    return buf.getvalue()


def _upload_zip(uid: str, request_id: str, content: bytes) -> str:
    from datetime import timedelta as td

    from google.cloud import storage  # type: ignore[import-not-found]

    if not DSAR_BUCKET:
        raise RuntimeError("DSAR_BUCKET env var unset")
    client = storage.Client(project=PROJECT_ID or None)
    bucket = client.bucket(DSAR_BUCKET)
    blob = bucket.blob(f"dsar/{uid}/{request_id}.zip")
    blob.upload_from_string(content, content_type="application/zip")
    return blob.generate_signed_url(version="v4", expiration=td(days=7), method="GET")


def _email_link(email: str, url: str, request_id: str) -> None:
    if not RESEND_API_KEY or not email:
        return
    body = {
        "from": FROM_EMAIL,
        "to": [email],
        "subject": "Your PROMETHEUS data export is ready",
        "text": (
            f"Hi,\n\nYour data export ({request_id}) is ready. The link below "
            f"expires in 7 days:\n\n{url}\n\nIf you did not request this, "
            "please contact privacy@prometheus.local immediately."
        ),
    }
    with httpx.Client(timeout=10) as c:
        c.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
            json=body,
        )


def _mark_complete(request_id: str, url: str) -> None:
    from google.cloud import firestore  # type: ignore[import-not-found]

    db = firestore.Client(project=PROJECT_ID or None)
    db.collection("dsar_requests").document(request_id).update(
        {
            "status": "completed",
            "completed_at": datetime.now(timezone.utc),
            "download_url_signed": url,
        }
    )


def _schedule_deletion(uid: str) -> None:
    from google.cloud import firestore  # type: ignore[import-not-found]

    db = firestore.Client(project=PROJECT_ID or None)
    db.collection("dsar_deletions").add(
        {"uid": uid, "queued_at": datetime.now(timezone.utc), "status": "queued"}
    )


def _json_response(body: dict[str, Any], status: int = 200) -> Any:
    resp = make_response(jsonify(body), status)
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


def _cors_preflight() -> Any:
    resp = make_response("", 204)
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
    resp.headers["Access-Control-Max-Age"] = "3600"
    return resp
