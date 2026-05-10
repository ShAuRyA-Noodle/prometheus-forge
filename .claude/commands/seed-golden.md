---
name: seed-golden
description: Add 5 new golden ideas to backend/tests/golden/ideas.json — diverse industries, jurisdictions, stages.
argument-hint: [theme, e.g. "healthcare" or "B2B SaaS" or "consumer hardware"]
---

You are adding 5 new golden ideas to the regression suite.

## Process

1. **Read** `backend/tests/golden/ideas.json` to see existing ideas (count, distribution).

2. **Diversify**. The set must span:
   - Industries (avoid duplicating heavily-represented ones)
   - Geographies (US, EU, UK, IN, BR, JP)
   - Stages (idea-stage, MVP, post-revenue)
   - Jurisdictions (different legal templates exercised)
   - Risk profiles (some regulated, some not)

3. **Generate 5 ideas** matching the theme (or general diversification if no theme passed). Each idea is a JSON object:

   ```json
   {
     "id": "g0051",
     "title": "<2-3 word handle>",
     "idea_text": "<≤2000 chars, realistic, voice-of-founder>",
     "expected_industry": "<short tag>",
     "expected_geography": "<country/region>",
     "expected_target_market": "<descriptor>",
     "expected_regulated": <true|false>,
     "tags": ["<keywords>", "<for filtering>"],
     "min_coherence_score": 0.65,
     "max_cost_usd": 0.85,
     "added_at": "<YYYY-MM-DD>",
     "added_by": "<your name or 'auto'>"
   }
   ```

4. **No fabrication**. The ideas should be plausible founder ideas — not parodies. Use the **Maya / Daniel / Priya** archetype voice. Avoid:
   - "John Doe" / "Acme Corp" / generic "social media for X"
   - Demo-bait like "Uber for dogs"
   - Adversarial ideas (those go in `backend/tests/security/test_safety_pre_filter.py` instead)

5. **Append** to the JSON array. Preserve formatting (one idea per line, tab-indented, valid JSON).

6. **Verify**:
   ```bash
   cd backend
   python -c "import json; ideas=json.load(open('tests/golden/ideas.json')); print(f'{len(ideas)} ideas'); assert len({i[\"id\"] for i in ideas}) == len(ideas), 'duplicate id'"
   ```

7. **Run regression on the new ideas only** (smoke):
   ```bash
   pytest tests/golden -k "g0051 or g0052 or g0053 or g0054 or g0055" -q
   ```

8. **Report**:
   - 5 new IDs + titles
   - Industries / geographies covered
   - Pass/fail of the smoke run

## Example diversification (5 ideas)

- `g0051` — "Carbon-credit auditor for smallholder farms, India, post-MVP"
- `g0052` — "Niche B2B marketplace for vintage industrial machinery, Germany, idea-stage"
- `g0053` — "AI-enabled vocational ESL tutor for adult learners, US East Coast, post-revenue"
- `g0054` — "Compliance-first telehealth for psychiatric medication management, UK, idea-stage"
- `g0055` — "Direct-to-consumer prebiotic skincare for menopausal women, Brazil, MVP"

(Generate fresh ones based on the user's theme. Don't reuse these examples verbatim.)
