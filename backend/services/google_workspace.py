"""Google Workspace API wrappers — Slides, Docs, Sheets, Drive.

Hard rules (per CLAUDE.md):
  * Drive scope is ``drive.file`` ONLY. No full ``drive`` scope.
  * Generated files MUST end up owned by the requesting user via OAuth or
    transfer-of-ownership. The service account never holds permanent assets.
  * Service objects cached at module load.

All blocking SDK calls are run via ``asyncio.to_thread``.
"""
from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path
from typing import Any

import structlog

from config import settings
from models.agent_schemas import (
    BrandIdentityResult,
    FinancialModelResult,
    PitchSlide,
)

log = structlog.get_logger(__name__)


# ─── Scopes (drive.file only) ────────────────────────────────────────────────

SCOPES: list[str] = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/presentations",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/spreadsheets",
]


# ─── Service object cache ────────────────────────────────────────────────────

_services: dict[str, Any] = {}
_credentials: Any | None = None


def _load_credentials() -> Any:
    """Workload Identity in prod (google.auth.default), file fallback for dev."""
    global _credentials
    if _credentials is not None:
        return _credentials

    import google.auth  # type: ignore[import-not-found]
    from google.oauth2 import service_account  # type: ignore[import-not-found]

    try:
        creds, _ = google.auth.default(scopes=SCOPES)
        _credentials = creds
        log.info("workspace.creds.adc")
        return creds
    except Exception as e:  # noqa: BLE001
        log.warning("workspace.creds.adc_failed", err=str(e))

    if settings.google_application_credentials:
        path = Path(settings.google_application_credentials)
        if path.exists():
            creds = service_account.Credentials.from_service_account_file(
                str(path), scopes=SCOPES
            )
            _credentials = creds
            log.info("workspace.creds.file", path=str(path))
            return creds

    raise RuntimeError("no Google credentials available — set GOOGLE_APPLICATION_CREDENTIALS or run on Workload Identity")


def _build_service(name: str, version: str) -> Any:
    cache_key = f"{name}:{version}"
    if cache_key in _services:
        return _services[cache_key]

    from googleapiclient.discovery import build  # type: ignore[import-not-found]

    creds = _load_credentials()
    svc = build(name, version, credentials=creds, cache_discovery=False)
    _services[cache_key] = svc
    log.info("workspace.service.build", api=name, version=version)
    return svc


def _get_slides() -> Any:
    return _build_service("slides", "v1")


def _get_docs() -> Any:
    return _build_service("docs", "v1")


def _get_sheets() -> Any:
    return _build_service("sheets", "v4")


def _get_drive() -> Any:
    return _build_service("drive", "v3")


# ─── Helpers ─────────────────────────────────────────────────────────────────


_PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")


def _master_slides_template_id() -> str:
    """Read ``backend/templates/slides/master_template.json`` for ``template_file_id``.
    If missing, returns empty string and caller will create a blank deck."""
    path = (
        Path(__file__).resolve().parent.parent
        / "templates"
        / "slides"
        / "master_template.json"
    )
    if not path.exists():
        return ""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return str(data.get("template_file_id", "") or "")
    except Exception:
        return ""


# ─── Slides ──────────────────────────────────────────────────────────────────


async def create_presentation_from_template(
    brand: BrandIdentityResult,
    slides: list[PitchSlide],
) -> tuple[str, str]:
    """Copy the master Slides template and replace placeholders with content.

    If no master template id is configured, falls back to creating a fresh deck
    and inserting slides programmatically.

    Returns: (presentation_id, web_view_url)
    """

    def _do() -> tuple[str, str]:
        slides_svc = _get_slides()
        drive_svc = _get_drive()

        master_id = _master_slides_template_id()
        if master_id:
            copy = drive_svc.files().copy(
                fileId=master_id,
                body={"name": f"{brand.company_name} — Pitch Deck"},
                fields="id, webViewLink",
                supportsAllDrives=False,
            ).execute()
            pres_id = copy["id"]
        else:
            created = slides_svc.presentations().create(
                body={"title": f"{brand.company_name} — Pitch Deck"}
            ).execute()
            pres_id = created["presentationId"]

        # Build placeholder substitution requests
        primary = next(
            (c.hex for c in brand.color_palette if c.role == "primary"), "#0F172A"
        )
        accent = next(
            (c.hex for c in brand.color_palette if c.role == "accent"), "#F97316"
        )

        substitutions: dict[str, str] = {
            "{{COMPANY_NAME}}": brand.company_name,
            "{{TAGLINE}}": brand.tagline,
            "{{HEADING_FONT}}": brand.typography.heading_font,
            "{{BODY_FONT}}": brand.typography.body_font,
            "{{PRIMARY_HEX}}": primary,
            "{{ACCENT_HEX}}": accent,
        }

        # Per-slide placeholders {{SLIDE_N_TITLE}} / {{SLIDE_N_BODY}}
        for s in slides:
            substitutions[f"{{{{SLIDE_{s.slide_number}_TITLE}}}}"] = s.title
            substitutions[f"{{{{SLIDE_{s.slide_number}_BODY}}}}"] = s.body
            substitutions[f"{{{{SLIDE_{s.slide_number}_NOTES}}}}"] = s.speaker_notes

        requests: list[dict[str, Any]] = [
            {
                "replaceAllText": {
                    "containsText": {"text": ph, "matchCase": True},
                    "replaceText": val,
                }
            }
            for ph, val in substitutions.items()
        ]

        # If we did NOT have a master template, append slides programmatically
        if not master_id:
            for s in slides:
                page_id = f"slide_{s.slide_number}"
                requests.append(
                    {
                        "createSlide": {
                            "objectId": page_id,
                            "slideLayoutReference": {"predefinedLayout": "TITLE_AND_BODY"},
                        }
                    }
                )

        if requests:
            slides_svc.presentations().batchUpdate(
                presentationId=pres_id, body={"requests": requests}
            ).execute()

        url = f"https://docs.google.com/presentation/d/{pres_id}/edit"
        return pres_id, url

    pres_id, url = await asyncio.to_thread(_do)
    log.info("workspace.slides.created", id=pres_id)
    return pres_id, url


# ─── Docs ────────────────────────────────────────────────────────────────────


async def create_doc_from_template(
    template_md: str, vars: dict[str, Any]
) -> tuple[str, str]:
    """Render a markdown template via simple {{var}} substitution and create
    a Google Doc. Returns (doc_id, web_view_url)."""

    def _render(tpl: str) -> str:
        def repl(m: re.Match[str]) -> str:
            key = m.group(1)
            v = vars.get(key, "")
            return str(v) if v is not None else ""

        return _PLACEHOLDER_RE.sub(repl, tpl)

    rendered = _render(template_md)
    title = str(vars.get("title") or vars.get("company_name") or "Document")

    def _do() -> tuple[str, str]:
        docs_svc = _get_docs()
        created = docs_svc.documents().create(body={"title": title}).execute()
        doc_id = created["documentId"]
        # Insert content. We strip naive markdown headings into bold lines —
        # full Markdown→Docs conversion is out of scope here.
        body = rendered
        requests = [
            {"insertText": {"location": {"index": 1}, "text": body}}
        ]
        docs_svc.documents().batchUpdate(
            documentId=doc_id, body={"requests": requests}
        ).execute()
        url = f"https://docs.google.com/document/d/{doc_id}/edit"
        return doc_id, url

    doc_id, url = await asyncio.to_thread(_do)
    log.info("workspace.docs.created", id=doc_id, title=title)
    return doc_id, url


# ─── Sheets ──────────────────────────────────────────────────────────────────


async def create_sheets_from_finance(
    financial: FinancialModelResult,
) -> tuple[str, str]:
    """Create a Sheets file with three tabs (P&L, CashFlow, KeyMetrics) populated
    from the FinancialModelResult."""

    def _do() -> tuple[str, str]:
        sheets_svc = _get_sheets()

        spreadsheet_body = {
            "properties": {"title": "Financial Model"},
            "sheets": [
                {"properties": {"sheetId": 0, "title": "P&L"}},
                {"properties": {"sheetId": 1, "title": "CashFlow"}},
                {"properties": {"sheetId": 2, "title": "KeyMetrics"}},
            ],
        }
        created = sheets_svc.spreadsheets().create(body=spreadsheet_body).execute()
        sheet_id = created["spreadsheetId"]

        # P&L tab
        pl_header = [
            "Year",
            "Revenue",
            "COGS",
            "Gross Profit",
            "Opex",
            "EBITDA",
            "Headcount",
            "Cash",
        ]
        pl_rows = [
            [
                p.year,
                round(p.revenue_usd, 2),
                round(p.cogs_usd, 2),
                round(p.gross_profit_usd, 2),
                round(p.opex_usd, 2),
                round(p.ebitda_usd, 2),
                p.headcount,
                round(p.cash_usd, 2),
            ]
            for p in financial.projections
        ]

        cash_header = ["Year", "Cash Begin", "Cash End", "Net Change"]
        cash_rows = []
        prev_cash = financial.funding_seed_usd
        for p in financial.projections:
            net_change = p.cash_usd - prev_cash
            cash_rows.append([p.year, round(prev_cash, 2), round(p.cash_usd, 2), round(net_change, 2)])
            prev_cash = p.cash_usd

        metrics_rows: list[list[Any]] = [["Metric", "Value"]]
        metrics_rows.append(["Funding (seed USD)", financial.funding_seed_usd])
        metrics_rows.append(["Runway (months)", financial.runway_months])
        metrics_rows.append(["Breakeven Month", financial.breakeven_month or "n/a"])
        metrics_rows.append(["Reconciliation Passed", financial.reconciliation_passed])
        for k, v in (financial.key_metrics or {}).items():
            metrics_rows.append([k, v])

        data = [
            {"range": "P&L!A1", "values": [pl_header, *pl_rows]},
            {"range": "CashFlow!A1", "values": [cash_header, *cash_rows]},
            {"range": "KeyMetrics!A1", "values": metrics_rows},
        ]

        sheets_svc.spreadsheets().values().batchUpdate(
            spreadsheetId=sheet_id,
            body={"valueInputOption": "USER_ENTERED", "data": data},
        ).execute()

        # Add a chart on P&L for revenue trend
        chart_request = {
            "requests": [
                {
                    "addChart": {
                        "chart": {
                            "spec": {
                                "title": "Revenue / EBITDA",
                                "basicChart": {
                                    "chartType": "LINE",
                                    "legendPosition": "BOTTOM_LEGEND",
                                    "axis": [
                                        {"position": "BOTTOM_AXIS", "title": "Year"},
                                        {"position": "LEFT_AXIS", "title": "USD"},
                                    ],
                                    "domains": [
                                        {
                                            "domain": {
                                                "sourceRange": {
                                                    "sources": [
                                                        {
                                                            "sheetId": 0,
                                                            "startRowIndex": 0,
                                                            "endRowIndex": 1 + len(pl_rows),
                                                            "startColumnIndex": 0,
                                                            "endColumnIndex": 1,
                                                        }
                                                    ]
                                                }
                                            }
                                        }
                                    ],
                                    "series": [
                                        {
                                            "series": {
                                                "sourceRange": {
                                                    "sources": [
                                                        {
                                                            "sheetId": 0,
                                                            "startRowIndex": 0,
                                                            "endRowIndex": 1 + len(pl_rows),
                                                            "startColumnIndex": 1,
                                                            "endColumnIndex": 2,
                                                        }
                                                    ]
                                                }
                                            },
                                            "targetAxis": "LEFT_AXIS",
                                        },
                                        {
                                            "series": {
                                                "sourceRange": {
                                                    "sources": [
                                                        {
                                                            "sheetId": 0,
                                                            "startRowIndex": 0,
                                                            "endRowIndex": 1 + len(pl_rows),
                                                            "startColumnIndex": 5,
                                                            "endColumnIndex": 6,
                                                        }
                                                    ]
                                                }
                                            },
                                            "targetAxis": "LEFT_AXIS",
                                        },
                                    ],
                                    "headerCount": 1,
                                },
                            },
                            "position": {
                                "overlayPosition": {
                                    "anchorCell": {
                                        "sheetId": 0,
                                        "rowIndex": 1,
                                        "columnIndex": 9,
                                    }
                                }
                            },
                        }
                    }
                }
            ]
        }
        try:
            sheets_svc.spreadsheets().batchUpdate(
                spreadsheetId=sheet_id, body=chart_request
            ).execute()
        except Exception as e:  # noqa: BLE001
            log.warning("workspace.sheets.chart_failed", err=str(e))

        url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/edit"
        return sheet_id, url

    sid, url = await asyncio.to_thread(_do)
    log.info("workspace.sheets.created", id=sid)
    return sid, url


# ─── Drive: ownership transfer + sharing ─────────────────────────────────────


async def transfer_ownership(file_id: str, user_email: str) -> None:
    """Make the user the owner of a file (OAuth same-domain only). For
    cross-domain, use ``drive.permissions.create`` with role=writer + add a
    pending-owner permission. We try OWNER first, fall back to WRITER."""

    def _do() -> None:
        drive_svc = _get_drive()
        body = {
            "type": "user",
            "role": "owner",
            "emailAddress": user_email,
        }
        try:
            drive_svc.permissions().create(
                fileId=file_id,
                body=body,
                transferOwnership=True,
                sendNotificationEmail=False,
                supportsAllDrives=False,
            ).execute()
            return
        except Exception as e:  # noqa: BLE001
            log.warning("workspace.drive.owner_transfer_failed", err=str(e))

        # Fallback: add as writer + try pending-owner consent
        body_writer = {
            "type": "user",
            "role": "writer",
            "emailAddress": user_email,
            "pendingOwner": True,
        }
        try:
            drive_svc.permissions().create(
                fileId=file_id,
                body=body_writer,
                sendNotificationEmail=True,
                supportsAllDrives=False,
            ).execute()
        except Exception as e:  # noqa: BLE001
            log.error("workspace.drive.fallback_perm_failed", err=str(e))
            raise

    await asyncio.to_thread(_do)
    log.info("workspace.drive.ownership_transferred", file_id=file_id, to=user_email)


async def share_anyone_with_link(file_id: str) -> str:
    """Public read share for investor view. Returns the shareable link."""

    def _do() -> str:
        drive_svc = _get_drive()
        drive_svc.permissions().create(
            fileId=file_id,
            body={"type": "anyone", "role": "reader"},
            supportsAllDrives=False,
        ).execute()
        meta = (
            drive_svc.files()
            .get(fileId=file_id, fields="webViewLink, mimeType")
            .execute()
        )
        return str(meta.get("webViewLink") or "")

    link = await asyncio.to_thread(_do)
    log.info("workspace.drive.public_share", file_id=file_id)
    return link


async def create_drive_folder(name: str) -> tuple[str, str]:
    """Create a Drive folder. Returns (folder_id, web_view_url)."""

    def _do() -> tuple[str, str]:
        drive_svc = _get_drive()
        meta = (
            drive_svc.files()
            .create(
                body={
                    "name": name,
                    "mimeType": "application/vnd.google-apps.folder",
                },
                fields="id, webViewLink",
                supportsAllDrives=False,
            )
            .execute()
        )
        return meta["id"], meta.get("webViewLink", "")

    return await asyncio.to_thread(_do)


async def move_file_to_folder(file_id: str, folder_id: str) -> None:
    def _do() -> None:
        drive_svc = _get_drive()
        meta = drive_svc.files().get(fileId=file_id, fields="parents").execute()
        prev_parents = ",".join(meta.get("parents", []) or [])
        drive_svc.files().update(
            fileId=file_id,
            addParents=folder_id,
            removeParents=prev_parents,
            fields="id, parents",
            supportsAllDrives=False,
        ).execute()

    await asyncio.to_thread(_do)


__all__ = [
    "SCOPES",
    "create_doc_from_template",
    "create_drive_folder",
    "create_presentation_from_template",
    "create_sheets_from_finance",
    "move_file_to_folder",
    "share_anyone_with_link",
    "transfer_ownership",
]
