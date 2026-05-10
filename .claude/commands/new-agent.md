---
name: new-agent
description: Scaffold a new PROMETHEUS agent (file + prompt + schema stub + test). Reminds you to register in orchestrator + agent_schemas.
argument-hint: <name> <wave>
---

You are scaffolding a new PROMETHEUS agent. The user passed two arguments:
1. **name** — snake_case role (e.g. `customer_support`)
2. **wave** — one of `pre`, `1`, `2`, `3`

Generate exactly four files and one reminder. Use ONLY the conventions from `CLAUDE.md` and `docs/PROMPT_REGISTRY.md` §5 (template).

## 1. `backend/agents/{name}_agent.py`

```python
from __future__ import annotations

import structlog

from agents.base import PrometheusAgent
from models.agent_schemas import {NameCamel}Result
from services.gemini_client import call_gemini_structured

log = structlog.get_logger()


class {NameCamel}Agent(PrometheusAgent):
    """Wave-{wave} agent. Single responsibility: <FILL THIS IN>."""

    name = "{name}"
    output_key = "{name}_result"
    output_schema = {NameCamel}Result
    model = "gemini-2.5-flash"   # or "gemini-2.5-pro" if grounded synthesis
    grounded = False

    async def run(self, state: dict) -> {NameCamel}Result:
        prompt = self._render_prompt(state)
        result = await call_gemini_structured(
            model=self.model,
            prompt=prompt,
            response_schema={NameCamel}Result,
            grounded=self.grounded,
        )
        log.info("{name}.completed", session_id=state["session_id"])
        return result
```

## 2. `backend/prompts/{name}.txt`

Use the template from `docs/PROMPT_REGISTRY.md` §5. Header:

```
# version: 0.1.0
# agent: {name}
# model: gemini-2.5-flash
# grounded: false
# response_schema: {NameCamel}Result
```

Fill in role, hard rules, anti-fabrication clauses, and a 1-2 example block.

## 3. `backend/models/agent_schemas.py` — add the schema stub

```python
class {NameCamel}Result(BaseModel):
    """Output of {name}_agent. Wave {wave}."""
    model_config = ConfigDict(extra="forbid")

    # TODO: fill fields. Every numeric claim must be a DataPoint.
    # Use Citation for sourced values; derivation string for derived/inferred.
    placeholder_field: str = Field(..., max_length=500)
```

## 4. `backend/tests/test_agents/test_{name}_agent.py`

```python
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch

from agents.{name}_agent import {NameCamel}Agent
from models.agent_schemas import {NameCamel}Result


@pytest.mark.asyncio
async def test_{name}_agent_runs_and_validates():
    state = {{"session_id": "test", "polished_idea": "test idea"}}
    agent = {NameCamel}Agent()

    fake_output = {NameCamel}Result(placeholder_field="ok")
    with patch("agents.{name}_agent.call_gemini_structured", new=AsyncMock(return_value=fake_output)):
        result = await agent.run(state)

    assert isinstance(result, {NameCamel}Result)
    assert result.placeholder_field == "ok"


@pytest.mark.asyncio
async def test_{name}_agent_retries_on_validation_error():
    """Per CLAUDE.md hard rule: 1 retry on schema fail, then AgentValidationError."""
    # TODO: implement once base.PrometheusAgent retry-once is wired
    pass
```

## 5. Reminder (last in your response)

Print this checklist exactly:

> **Don't forget:**
> 1. Add `{name}` import + registration in `backend/agents/orchestrator.py` (Wave {wave}).
> 2. If Wave 3, add `_summarizer` step for upstream outputs.
> 3. If grounded, set `grounded=True` and use `model="gemini-2.5-pro"`.
> 4. Add 1 entry to `docs/PROMPT_REGISTRY.md` §1 (active prompts table) and §3 (changelog).
> 5. Add gate validation (Pydantic + custom checks) in `backend/agents/gates.py` for the wave.
> 6. Add 5+ golden ideas to `backend/tests/golden/ideas.json` that exercise this agent.
> 7. Run `./scripts/test.sh fast` and confirm green.

## Before generating

- Confirm the `{NameCamel}` capitalization matches `{name}` (snake → CamelCase).
- Confirm wave is one of `pre|1|2|3`. If invalid, ask the user.
