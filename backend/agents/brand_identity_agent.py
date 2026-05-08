"""Brand Identity Agent — Wave 1, Flash.

Returns BrandIdentityResult. `after_model` calls trademark_service + domain_service to
populate availability fields. If primary name has conflicts, generates up to 3 batches
of alternatives via a single extra Gemini call per retry, until one viable name is found
or `_MAX_NAME_RETRIES` is exhausted.
"""
from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path
from typing import Any, ClassVar

import structlog
from pydantic import BaseModel, ValidationError

from config import settings
from models.agent_schemas import (
    ArticulationOutput,
    BrandIdentityResult,
    NameCandidate,
    ParsedIdea,
)
from models.session_models import AgentName, Wave

from .base import PrometheusAgent

log = structlog.get_logger()

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "brand_identity.txt"
_ALT_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "brand_identity_alternatives.txt"

_MAX_NAME_RETRIES = 3


def _stringify(value: Any) -> str:
    if isinstance(value, BaseModel):
        return value.model_dump_json(indent=2)
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, indent=2, default=str)
    except (TypeError, ValueError):
        return str(value)


def _strip_code_fence(text: str) -> str:
    """Defensive: peel off ```json fences if Gemini ignored response_mime_type for the alt call."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```\s*$", "", text)
    return text.strip()


class BrandIdentityAgent(PrometheusAgent[BrandIdentityResult]):
    name: ClassVar[AgentName] = AgentName.BRAND_IDENTITY
    wave: ClassVar[Wave] = Wave.WAVE_1
    model: ClassVar[str] = settings.model_flash
    output_schema: ClassVar[type] = BrandIdentityResult
    prompt_template: ClassVar[str] = _PROMPT_PATH.read_text(encoding="utf-8")
    requires_grounding: ClassVar[bool] = False
    timeout_seconds: ClassVar[int] = 35
    temperature: ClassVar[float] = 0.7

    @property
    def output_key(self) -> str:
        return "brand_identity_result"

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

        parsed = state.get("parsed_idea")
        if isinstance(parsed, ParsedIdea):
            industry = parsed.industry
            personality = parsed.brand_personality_hints
        elif isinstance(parsed, dict):
            industry = parsed.get("industry", "other")
            personality = parsed.get("brand_personality_hints", "")
        else:
            industry = "other"
            personality = ""

        return self.prompt_template.format(
            polished_idea=polished or state.get("idea_text", ""),
            industry=industry,
            brand_personality_hints=personality or "(none specified)",
        )

    # ------------------------------------------------------------------
    #  after_model: USPTO + domain checks, with name-reroll fallback
    # ------------------------------------------------------------------

    async def after_model(
        self,
        output: BrandIdentityResult,
        state: dict[str, Any],
    ) -> BrandIdentityResult:
        # Local imports — services authored by sibling agent.
        from services.domain_service import check_domain_availability  # noqa: WPS433
        from services.trademark_service import check_uspto  # noqa: WPS433

        primary_name = output.company_name
        viable_name, candidate_meta = await self._resolve_name(
            primary_name=primary_name,
            existing_alternatives=list(output.name_alternatives),
            state=state,
            check_uspto=check_uspto,
            check_domain=check_domain_availability,
        )

        # Build a `NameCandidate` for the original name with its checks.
        primary_meta = candidate_meta[primary_name]
        primary_candidate = NameCandidate(
            name=primary_name,
            rationale="Primary brand candidate",
            domain_com_available=primary_meta["domain_com_available"],
            uspto_conflicts=primary_meta["uspto_conflicts"],
            handle_x_available=primary_meta["handle_x_available"],
            handle_instagram_available=primary_meta["handle_instagram_available"],
        )

        # Hydrate alternatives with availability data (if checked).
        hydrated_alts: list[NameCandidate] = []
        for alt in output.name_alternatives:
            meta = candidate_meta.get(alt.name)
            if meta is None:
                hydrated_alts.append(alt)
                continue
            hydrated_alts.append(
                alt.model_copy(
                    update={
                        "domain_com_available": meta["domain_com_available"],
                        "uspto_conflicts": meta["uspto_conflicts"],
                        "handle_x_available": meta["handle_x_available"],
                        "handle_instagram_available": meta["handle_instagram_available"],
                    }
                )
            )

        # If we ended up promoting an alternative, swap into company_name and push
        # the original to the alternatives list.
        if viable_name != primary_name:
            promoted_meta = candidate_meta[viable_name]
            self.logger.info(
                "brand.name_promoted",
                from_name=primary_name,
                to_name=viable_name,
            )
            # Find the promoted candidate; fall back to constructing a fresh one.
            promoted_candidate = next(
                (c for c in hydrated_alts if c.name == viable_name), None
            )
            if promoted_candidate is None:
                promoted_candidate = NameCandidate(
                    name=viable_name,
                    rationale="Promoted from re-roll",
                    domain_com_available=promoted_meta["domain_com_available"],
                    uspto_conflicts=promoted_meta["uspto_conflicts"],
                    handle_x_available=promoted_meta["handle_x_available"],
                    handle_instagram_available=promoted_meta["handle_instagram_available"],
                )
            new_alts = [primary_candidate] + [
                c for c in hydrated_alts if c.name != viable_name
            ]
            return output.model_copy(
                update={
                    "company_name": viable_name,
                    "name_alternatives": new_alts[:5],
                }
            )

        return output.model_copy(update={"name_alternatives": hydrated_alts[:5]})

    # ------------------------------------------------------------------
    #  Internal helpers
    # ------------------------------------------------------------------

    async def _check_name(
        self,
        name: str,
        check_uspto: Any,
        check_domain: Any,
    ) -> dict[str, Any]:
        """Run trademark + domain + handle checks concurrently for one name."""
        try:
            uspto_task = check_uspto(name)
            domain_task = check_domain(name)
            uspto_result, domain_result = await asyncio.gather(
                uspto_task, domain_task, return_exceptions=True
            )
        except Exception as exc:  # noqa: BLE001
            self.logger.warning("brand.availability_error", name=name, error=str(exc))
            return {
                "uspto_conflicts": [],
                "domain_com_available": None,
                "handle_x_available": None,
                "handle_instagram_available": None,
            }

        uspto_conflicts: list[str] = []
        if isinstance(uspto_result, Exception):
            self.logger.warning("brand.uspto_error", name=name, error=str(uspto_result))
        elif isinstance(uspto_result, dict):
            uspto_conflicts = list(uspto_result.get("conflicts", []) or [])

        domain_com_available: bool | None = None
        handle_x: bool | None = None
        handle_ig: bool | None = None
        if isinstance(domain_result, Exception):
            self.logger.warning("brand.domain_error", name=name, error=str(domain_result))
        elif isinstance(domain_result, dict):
            domain_com_available = domain_result.get("com_available")
            handle_x = domain_result.get("handle_x_available")
            handle_ig = domain_result.get("handle_instagram_available")

        return {
            "uspto_conflicts": uspto_conflicts,
            "domain_com_available": domain_com_available,
            "handle_x_available": handle_x,
            "handle_instagram_available": handle_ig,
        }

    @staticmethod
    def _is_viable(meta: dict[str, Any]) -> bool:
        """Viable = .com available AND no USPTO conflicts. None for .com is treated as
        unverified-but-acceptable to avoid blocking the pipeline on a transient API failure."""
        domain_ok = meta["domain_com_available"] is not False
        no_tm_conflicts = len(meta["uspto_conflicts"]) == 0
        return domain_ok and no_tm_conflicts

    async def _resolve_name(
        self,
        primary_name: str,
        existing_alternatives: list[NameCandidate],
        state: dict[str, Any],
        check_uspto: Any,
        check_domain: Any,
    ) -> tuple[str, dict[str, dict[str, Any]]]:
        """Return the chosen viable name and a metadata map keyed by name."""
        meta_map: dict[str, dict[str, Any]] = {}

        primary_meta = await self._check_name(primary_name, check_uspto, check_domain)
        meta_map[primary_name] = primary_meta
        if self._is_viable(primary_meta):
            # Still check existing alternatives for completeness.
            await self._check_existing_alternatives(
                existing_alternatives, meta_map, check_uspto, check_domain
            )
            return primary_name, meta_map

        self.logger.info(
            "brand.primary_not_viable",
            name=primary_name,
            uspto=primary_meta["uspto_conflicts"],
            domain=primary_meta["domain_com_available"],
        )

        # First check pre-supplied alternatives.
        await self._check_existing_alternatives(
            existing_alternatives, meta_map, check_uspto, check_domain
        )
        for alt in existing_alternatives:
            if self._is_viable(meta_map[alt.name]):
                return alt.name, meta_map

        # Generate fresh alternatives via Gemini, up to _MAX_NAME_RETRIES batches.
        for attempt in range(_MAX_NAME_RETRIES):
            self.logger.info("brand.name_reroll", attempt=attempt + 1)
            new_candidates = await self._generate_alternatives(
                rejected_name=primary_name,
                rejected_meta=primary_meta,
                state=state,
            )
            if not new_candidates:
                continue

            await self._check_existing_alternatives(
                new_candidates, meta_map, check_uspto, check_domain
            )
            for cand in new_candidates:
                if cand.name in meta_map and self._is_viable(meta_map[cand.name]):
                    # Append the new candidate to the existing list so the caller can promote it.
                    existing_alternatives.append(cand)
                    return cand.name, meta_map

            # All candidates failed; merge anyway so they are surfaced to the user.
            existing_alternatives.extend(new_candidates)

        # Exhausted retries — keep the primary name but surface conflicts via meta.
        self.logger.warning(
            "brand.name_resolution_exhausted",
            name=primary_name,
        )
        return primary_name, meta_map

    async def _check_existing_alternatives(
        self,
        candidates: list[NameCandidate],
        meta_map: dict[str, dict[str, Any]],
        check_uspto: Any,
        check_domain: Any,
    ) -> None:
        to_check = [c for c in candidates if c.name not in meta_map]
        if not to_check:
            return
        results = await asyncio.gather(
            *[self._check_name(c.name, check_uspto, check_domain) for c in to_check]
        )
        for cand, result in zip(to_check, results, strict=True):
            meta_map[cand.name] = result

    async def _generate_alternatives(
        self,
        rejected_name: str,
        rejected_meta: dict[str, Any],
        state: dict[str, Any],
    ) -> list[NameCandidate]:
        from services.gemini_client import call_gemini_text  # noqa: WPS433

        polished = state.get("polished_idea")
        if polished is None:
            articulation = state.get("articulation")
            if isinstance(articulation, ArticulationOutput):
                polished = articulation.polished_idea
            elif isinstance(articulation, dict):
                polished = articulation.get("polished_idea", "")
            else:
                polished = ""

        parsed = state.get("parsed_idea")
        if isinstance(parsed, ParsedIdea):
            industry = parsed.industry
            personality = parsed.brand_personality_hints
        elif isinstance(parsed, dict):
            industry = parsed.get("industry", "other")
            personality = parsed.get("brand_personality_hints", "")
        else:
            industry = "other"
            personality = ""

        prompt = _ALT_PROMPT_PATH.read_text(encoding="utf-8").format(
            rejected_name=rejected_name,
            uspto_conflicts=rejected_meta["uspto_conflicts"],
            domain_com_available=rejected_meta["domain_com_available"],
            polished_idea=polished or state.get("idea_text", ""),
            industry=industry,
            brand_personality_hints=personality or "(none specified)",
        )

        try:
            raw = await asyncio.wait_for(
                call_gemini_text(
                    model=self.model,
                    prompt=prompt,
                    temperature=0.85,
                ),
                timeout=15,
            )
        except (TimeoutError, Exception) as exc:  # noqa: BLE001
            self.logger.warning("brand.alt_gen_failed", error=str(exc))
            return []

        try:
            payload = json.loads(_strip_code_fence(raw))
        except (json.JSONDecodeError, ValueError) as exc:
            self.logger.warning("brand.alt_parse_failed", error=str(exc))
            return []

        if not isinstance(payload, list):
            self.logger.warning("brand.alt_unexpected_shape", shape=type(payload).__name__)
            return []

        out: list[NameCandidate] = []
        for raw_item in payload[:3]:
            if not isinstance(raw_item, dict):
                continue
            try:
                out.append(NameCandidate.model_validate(raw_item))
            except ValidationError as ve:
                self.logger.warning("brand.alt_validation_failed", error=str(ve))
        return out


brand_identity_agent = BrandIdentityAgent()
