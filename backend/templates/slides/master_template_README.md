# PROMETHEUS — Master Slides Template

This directory holds the metadata for the Google Slides master template that
the Pitch Deck Agent copies for every generated deck. The actual `.gslides`
file is a manually-designed Google Slides file in the platform Drive — this
README is the operator runbook for creating it, registering it with the
backend, and keeping placeholders in sync.

## Why a master file (and not pure programmatic generation)

Per `CLAUDE.md`, agents must NOT batch-construct visual artifacts via raw
`slides.batchUpdate` calls. Doing so reliably yields the "AI slop" look that
breaks investor trust. We therefore design a tasteful master deck once,
upload it to a platform-owned Drive folder, and generate decks at runtime
via `drive.files.copy` + `slides.batchUpdate(replaceAllText)`. Every
agent-generated string lands inside a placeholder we already styled.

## Step-by-step setup

1. **Create the master file.**
   - In a personal Drive, create a new Slides deck named `PROMETHEUS Master Deck v1`.
   - Set the page size to 16:9 (Slides default).
   - Pick fonts via Insert → Font → More fonts:
     * Heading: a modern grotesque (e.g. **Space Grotesk**, **GT America**, **Söhne**, **Aktiv Grotesk**).
     * Body: a neutral sans (e.g. **Inter Tight**, **General Sans**, **System UI**).
     * **Do NOT use Inter Regular** — it is the default-slop signal in
       investor decks. Use Inter Tight or another sister face if you must.
2. **Build 12 layouts** matching the keys in `master_template.json`:
   - `title`, `problem`, `solution`, `market`, `business_model`, `traction`,
     `competition`, `gtm`, `financials`, `team`, `ask`, `contact`.
   - For each layout, place placeholder text strings exactly as
     `{{COMPANY_NAME}}`, `{{TAGLINE}}`, `{{SLIDE_N_TITLE}}`,
     `{{SLIDE_N_BODY}}`, `{{SLIDE_N_NOTES}}`. The substring match must be
     literal — `replaceAllText` is case-sensitive.
   - For each image slot, insert a temporary placeholder image and rename
     its object id (Format → Alt text → Object ID) to the
     `image_slot_id` specified in `master_template.json`.
3. **Define color tokens.** Add a hidden slide with named master shapes
   filled with the six color tokens (`primary`, `secondary`, `accent`, `bg`,
   `fg`, `muted`). Pitch Deck Agent will issue a follow-up
   `replaceAllText` for tokens like `{{PRIMARY_HEX}}` to restyle these
   shapes via `updateShapeProperties`.
4. **Permission the file.**
   - File → Share → Anyone in the workspace `prometheus-prod.iam.gserviceaccount.com`
     project = **Viewer**.
   - The Cloud Run service account needs the Drive `drive.file` scope.
     `drive.files.copy` works on files the SA can _view_ even though it
     never had `drive`.
5. **Capture the file ID.** From the URL
   `docs.google.com/presentation/d/<ID>/edit`, copy `<ID>`.
6. **Store in Secret Manager.**
   ```bash
   echo -n "<ID>" | gcloud secrets create PROMETHEUS_MASTER_DECK_ID --data-file=-
   ```
   Grant the runtime SA Secret Accessor on this secret.
7. **Update `master_template.json`.** Set `template_file_id` to `<ID>`.
   This file is read at runtime by `services/google_workspace.py` if the
   secret is unavailable (e.g. local dev).

## Placeholder strings the agent emits

Anywhere you want agent-supplied content, paste the exact placeholder
text into your Slides file. The full set is:

### Always-replaced

- `{{COMPANY_NAME}}`
- `{{TAGLINE}}`
- `{{HEADING_FONT}}`, `{{BODY_FONT}}`
- `{{PRIMARY_HEX}}`, `{{SECONDARY_HEX}}`, `{{ACCENT_HEX}}`,
  `{{BG_HEX}}`, `{{FG_HEX}}`
- `{{LOGO_IMAGE_URL}}` (replaced via image insertion, not text)
- `{{FOOTER_NOTE}}`, `{{DATE_GENERATED}}`

### Per-slide (N = 1..12)

- `{{SLIDE_N_TITLE}}`
- `{{SLIDE_N_BODY}}`
- `{{SLIDE_N_NOTES}}`

### Slide-specific tokens

- Slide 4 (market): `{{TAM_VALUE}}`, `{{SAM_VALUE}}`, `{{SOM_VALUE}}`
- Slide 5 (business_model): `{{TIER_1_NAME}}`, `{{TIER_1_PRICE}}`, ..., `{{TIER_3_PRICE}}`
- Slide 7 (competition): `{{AXIS_X_LABEL}}`, `{{AXIS_Y_LABEL}}`
- Slide 8 (gtm): `{{GTM_CHANNEL_1}}`, `{{GTM_CHANNEL_2}}`, `{{GTM_CHANNEL_3}}`
- Slide 9 (financials): `{{YR1_REV}}`, `{{YR2_REV}}`, `{{YR3_REV}}`,
  `{{RUNWAY_MONTHS}}`, `{{BREAKEVEN_MONTH}}`
- Slide 11 (ask): `{{ROUND_SIZE_USD}}`, `{{MILESTONE_1}}`, `{{MILESTONE_2}}`, `{{MILESTONE_3}}`
- Slide 12 (contact): `{{CONTACT_EMAIL}}`, `{{CONTACT_SCHED_URL}}`, `{{CONTACT_BLOCK}}`

## How the runtime uses this

`backend/services/google_workspace.create_presentation_from_template`:

1. Reads `template_file_id` from `master_template.json` (or secret).
2. `drive.files.copy(fileId=template_file_id, body={"name": "<COMPANY> — Pitch Deck"})`.
3. Builds a `replaceAllText` request per placeholder above.
4. Inserts Imagen-generated images by replacing the placeholder shape with
   `createImage` at the same bounding box.
5. Returns `(presentation_id, web_view_url)`. Caller transfers ownership
   to the user via `services/google_workspace.transfer_ownership`.

## Updating the template

When you edit the master file, **bump `version`** in `master_template.json`
and add a row to the changelog below. Generated decks reference the master
copy at copy-time so existing decks are unaffected.

## Changelog

| version | date       | author     | summary                                  |
|---------|------------|------------|------------------------------------------|
| 1       | 2026-04-30 | platform   | Initial 12-layout master, 6-token palette. |

## Troubleshooting

- **All placeholders stayed as `{{...}}`.** You added the text inside an
  image's caption box rather than a slide-level text frame, OR you pasted
  with smart quotes. `{{` must be ASCII.
- **Image slot stayed empty.** The Object ID didn't match the
  `image_slot_id` in `master_template.json` — re-check Format → Alt text → Object ID.
- **Images appeared but shifted.** Imagen aspect ratio mismatch with the
  placeholder shape. Update `image_slot_defaults` in `master_template.json`
  or change the placeholder's bounding box.
