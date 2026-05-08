"""Landing Page Agent — Wave 2, Flash.

After Gemini emits HTML, `after_model` calls services.sanitization.sanitize_html
and services.image_service.generate_hero_images (Imagen) to populate
hero_image_url + feature_image_urls.
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, ClassVar

from pydantic import BaseModel, HttpUrl

from config import settings
from models.agent_schemas import (
    ArticulationOutput,
    BrandIdentityResult,
    BusinessModelResult,
    LandingPageResult,
)
from models.session_models import AgentName, Wave

from .base import PrometheusAgent

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "landing_page.txt"


def _stringify(value: Any) -> str:
    if isinstance(value, BaseModel):
        return value.model_dump_json(indent=2)
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, indent=2, default=str)
    except (TypeError, ValueError):
        return str(value)


class LandingPageAgent(PrometheusAgent[LandingPageResult]):
    name: ClassVar[AgentName] = AgentName.LANDING_PAGE
    wave: ClassVar[Wave] = Wave.WAVE_2
    model: ClassVar[str] = settings.model_flash
    output_schema: ClassVar[type] = LandingPageResult
    prompt_template: ClassVar[str] = _PROMPT_PATH.read_text(encoding="utf-8")
    requires_grounding: ClassVar[bool] = False
    timeout_seconds: ClassVar[int] = 40
    temperature: ClassVar[float] = 0.6

    @property
    def output_key(self) -> str:
        return "landing_page_result"

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

        return self.prompt_template.format(
            polished_idea=polished or state.get("idea_text", ""),
            brand_identity_result=brand_str,
            business_model_result=bm_str,
        )

    async def after_model(
        self,
        output: LandingPageResult,
        state: dict[str, Any],
    ) -> LandingPageResult:
        from services.image_service import generate_hero_images  # noqa: WPS433
        from services.sanitization import sanitize_html  # noqa: WPS433

        # 1. Sanitize HTML server-side. Critical hard-constraint.
        try:
            sanitized = sanitize_html(output.html_sanitized)
        except Exception as exc:  # noqa: BLE001
            self.logger.warning("landing.sanitize_failed", error=str(exc))
            sanitized = output.html_sanitized  # fall through; gate will reject if unsafe

        updates: dict[str, Any] = {"html_sanitized": sanitized}

        # 2. Imagen heroes. Build the prompt from brand & polished idea.
        brand = state.get("brand_identity_result")
        polished = state.get("polished_idea") or state.get("idea_text", "")

        try:
            hero_payload = await asyncio.wait_for(
                generate_hero_images(
                    brand=brand,
                    polished_idea=polished,
                    page_title=output.title,
                ),
                timeout=30,
            )
        except (TimeoutError, Exception) as exc:  # noqa: BLE001
            self.logger.warning("landing.imagen_failed", error=str(exc))
            hero_payload = None

        if isinstance(hero_payload, dict):
            hero_url = hero_payload.get("hero_image_url")
            feature_urls = hero_payload.get("feature_image_urls") or []
            if hero_url:
                try:
                    updates["hero_image_url"] = HttpUrl(hero_url)
                except (TypeError, ValueError):
                    self.logger.warning("landing.hero_url_invalid", url=hero_url)
            cleaned_features: list[HttpUrl] = []
            for url in feature_urls:
                try:
                    cleaned_features.append(HttpUrl(url))
                except (TypeError, ValueError):
                    continue
            if cleaned_features:
                updates["feature_image_urls"] = cleaned_features

        return output.model_copy(update=updates)


landing_page_agent = LandingPageAgent()
