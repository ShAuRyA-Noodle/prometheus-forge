"""Legal Documents Agent — Wave 2, Flash.

DOES NOT generate legal text via LLM. Calls services.legal_template_service.fill_template
which uses Termly/iubenda/internal templates. Gemini's role: select template_id +
fill non-legal fields (company name, jurisdictions, business model). Always sets
lawyer_review_cta=True.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, ClassVar

from pydantic import BaseModel, HttpUrl

from config import settings
from models.agent_schemas import (
    ArticulationOutput,
    BrandIdentityResult,
    BusinessModelResult,
    LegalDocumentsResult,
    ParsedIdea,
    RiskAnalysisResult,
)
from models.session_models import AgentName, Wave

from .base import PrometheusAgent

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "legal_documents.txt"


def _stringify(value: Any) -> str:
    if isinstance(value, BaseModel):
        return value.model_dump_json(indent=2)
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, indent=2, default=str)
    except (TypeError, ValueError):
        return str(value)


class LegalDocumentsAgent(PrometheusAgent[LegalDocumentsResult]):
    name: ClassVar[AgentName] = AgentName.LEGAL_DOCUMENTS
    wave: ClassVar[Wave] = Wave.WAVE_2
    model: ClassVar[str] = settings.model_flash
    output_schema: ClassVar[type] = LegalDocumentsResult
    prompt_template: ClassVar[str] = _PROMPT_PATH.read_text(encoding="utf-8")
    requires_grounding: ClassVar[bool] = False
    timeout_seconds: ClassVar[int] = 30
    temperature: ClassVar[float] = 0.1

    @property
    def output_key(self) -> str:
        return "legal_documents_result"

    def render_prompt(self, state: dict[str, Any]) -> str:
        polished = state.get("polished_idea")
        if polished is None:
            articulation = state.get("articulation")
            if isinstance(articulation, ArticulationOutput):
                polished = articulation.polished_idea
            elif isinstance(articulation, dict):
                polished = articulation.get("polished_idea", "")
            else:
                polished = ""

        brand = state.get("brand_identity_result")
        brand_str = (
            brand.model_dump_json(indent=2)
            if isinstance(brand, BrandIdentityResult)
            else _stringify(brand or {})
        )

        bm = state.get("business_model_result")
        bm_str = (
            bm.model_dump_json(indent=2)
            if isinstance(bm, BusinessModelResult)
            else _stringify(bm or {})
        )

        risk = state.get("risk_analysis_result")
        risk_str = (
            risk.model_dump_json(indent=2)
            if isinstance(risk, RiskAnalysisResult)
            else _stringify(risk or {})
        )

        return self.prompt_template.format(
            polished_idea=polished or state.get("idea_text", ""),
            brand_identity_result=brand_str,
            business_model_result=bm_str,
            risk_analysis_result=risk_str,
        )

    async def after_model(
        self,
        output: LegalDocumentsResult,
        state: dict[str, Any],
    ) -> LegalDocumentsResult:
        from services.legal_template_service import fill_template  # noqa: WPS433

        # Always force the CTA, even if the model omitted/disabled it.
        updates: dict[str, Any] = {"lawyer_review_cta": True}

        brand = state.get("brand_identity_result")
        company_name = (
            brand.company_name
            if isinstance(brand, BrandIdentityResult)
            else (brand or {}).get("company_name", "Newco")
        )

        bm = state.get("business_model_result")
        business_model_summary = (
            {
                "revenue_model": bm.revenue_model,
                "primary_revenue_stream": bm.primary_revenue_stream,
            }
            if isinstance(bm, BusinessModelResult)
            else {}
        )

        parsed = state.get("parsed_idea")
        regulated_data = (
            parsed.regulated_data
            if isinstance(parsed, ParsedIdea)
            else (parsed or {}).get("regulated_data", False)
        )

        try:
            filled = await fill_template(
                tos_template_id=output.tos_template_id,
                privacy_template_id=output.privacy_template_id,
                jurisdictions=output.jurisdictions_covered,
                company_name=company_name,
                business_model=business_model_summary,
                regulated_data=regulated_data,
            )
        except Exception as exc:  # noqa: BLE001
            self.logger.warning("legal.template_fill_failed", error=str(exc))
            filled = None

        if isinstance(filled, dict):
            for src_key, dst_key in (
                ("tos_doc_id", "tos_doc_id"),
                ("privacy_doc_id", "privacy_doc_id"),
            ):
                if filled.get(src_key):
                    updates[dst_key] = filled[src_key]
            for url_src, url_dst in (
                ("tos_doc_url", "tos_doc_url"),
                ("privacy_doc_url", "privacy_doc_url"),
            ):
                url_value = filled.get(url_src)
                if url_value:
                    try:
                        updates[url_dst] = HttpUrl(url_value)
                    except (TypeError, ValueError):
                        self.logger.warning(
                            "legal.url_invalid", key=url_src, value=url_value
                        )

        return output.model_copy(update=updates)


legal_documents_agent = LegalDocumentsAgent()
