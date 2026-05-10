---
name: regen-prompt
description: Iterate on an agent prompt — diff current vs. proposed, run golden regression, report score delta.
argument-hint: <agent-name> <change description>
---

You are iterating on a PROMETHEUS agent prompt. The user passed:
1. `<agent-name>` — e.g. `market_research`
2. `<change description>` — what they want changed

## Process

1. **Read** the current prompt at `backend/prompts/<agent-name>.txt`. Show the version header.

2. **Read** golden regression baseline:
   - `docs/PROMPT_REGISTRY.md` §2 for current scores on this agent
   - Note the score columns relevant to this agent (e.g. coherence, sourced rate, etc.)

3. **Read** any relevant golden ideas:
   - `backend/tests/golden/ideas.json` — sample 5 ideas that exercise this agent

4. **Propose the change.** Output:
   - **Diff** of the prompt (old → new)
   - **Hypothesis**: which metric will move and why
   - **Risks**: what might regress

5. **Confirm** with the user before writing. Print the diff + hypothesis; ask "OK to apply?"

6. **On approval**: write the new prompt with bumped version (patch unless behavior change → minor; schema change → major).

7. **Run regression** locally:
   ```bash
   cd backend
   pytest tests/golden -k <agent-name> -q --tb=short --json-report --json-report-file=regen-report.json
   ```

8. **Report**:
   - **Score delta** vs. baseline (coherence, sourced rate, schema-pass rate, cost-per-run)
   - Pass/fail of each ≥5 ideas
   - Sample of best & worst ideas (1 each)

9. **If positive (Δ ≥ +0.01 or no regression)**:
   - Update `docs/PROMPT_REGISTRY.md` §1 (current version), §2 (score table), §3 (changelog)
   - Suggest opening a PR via `.claude/commands/create-pr.md`

10. **If negative (Δ < -0.02)**:
    - Revert the prompt
    - Report what failed and on which ideas
    - Suggest a smaller iteration

## Anchors (read before iterating)

- `docs/PROMPT_REGISTRY.md` §5 — prompt template every agent follows
- `docs/PROMPT_REGISTRY.md` §6 — anti-fabrication clauses per agent
- `.claude/skills/prompt-tuner/SKILL.md` — auto-invoking discipline rules

## Hard rules

- Every prompt must have `# version: X.Y.Z` header
- Every prompt must include the HARD RULES block from §5
- Schema reference must match the schema in `backend/models/agent_schemas.py`
- `Output ONLY a JSON object` close — never freeform text
- Do not introduce new schema fields in the prompt without updating the schema in same PR
