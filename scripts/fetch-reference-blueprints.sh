#!/usr/bin/env bash
# scripts/fetch-reference-blueprints.sh
#
# Fetches reference architecture blueprints from ShAuRyA-Noodle/Newspapering.
# Writes them to reference_blueprints/. They are NOT committed to this repo.
#
# Re-run quarterly to stay current.

set -euo pipefail

REPO="ShAuRyA-Noodle/Newspapering"
BRANCH="main"
BASE_URL="https://raw.githubusercontent.com/${REPO}/${BRANCH}"

# Resolve to absolute repo root (this script lives in scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEST_DIR="${REPO_ROOT}/reference_blueprints"

mkdir -p "${DEST_DIR}"

FILES=(
  "NEXUS_BLUEPRINT.md"
  "SYMPHONY_BLUEPRINT.md"
  "SUPPLYMIND_PHASES.md"
)

echo "Fetching reference blueprints from ${REPO}@${BRANCH}..."
echo "Destination: ${DEST_DIR}"
echo

for FILE in "${FILES[@]}"; do
  URL="${BASE_URL}/${FILE}"
  OUT="${DEST_DIR}/${FILE}"
  echo "  - ${FILE}"
  if ! curl -fsSL "${URL}" -o "${OUT}.tmp"; then
    echo "    WARN: failed to fetch ${URL}; keeping existing copy if any"
    rm -f "${OUT}.tmp"
    continue
  fi
  mv "${OUT}.tmp" "${OUT}"
  echo "    OK ($(wc -l < "${OUT}") lines)"
done

echo
echo "Done. Reference blueprints at: ${DEST_DIR}"
echo "These files are .gitignored — they are reference only, not project content."
