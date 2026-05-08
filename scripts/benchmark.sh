#!/usr/bin/env bash
# scripts/benchmark.sh — Run 10 golden ideas through full pipeline.
# Records latency p50/p95, cost per run, output token sums.
# Writes benchmarks/run-YYYY-MM-DD.json
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
cd "$REPO_ROOT"

GOLDEN_FILE="${GOLDEN_FILE:-backend/tests/golden/ideas.json}"
N="${N:-10}"
BACKEND_URL="${BACKEND_URL:-http://localhost:8080}"
OUT_DIR="$REPO_ROOT/benchmarks"
DATE=$(date -u +%Y-%m-%d)
RESULT="$OUT_DIR/run-$DATE.json"
mkdir -p "$OUT_DIR"

if [ ! -f "$GOLDEN_FILE" ]; then
  echo "Golden ideas not found at $GOLDEN_FILE. Run scripts/seed-golden-ideas.sh first." >&2
  exit 1
fi

for cmd in jq curl python3; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Missing $cmd" >&2; exit 1; }
done

# Pick first N ideas
IDEAS_JSON=$(jq -c ".[0:$N] | .[]" "$GOLDEN_FILE")

echo "[benchmark] running $N ideas against $BACKEND_URL"
echo "[benchmark] output: $RESULT"
echo "{\"ideas\": [], \"started_at\": \"$(date -u +%FT%TZ)\"}" > "$RESULT"

i=0
while IFS= read -r idea; do
  i=$((i+1))
  IDEA_TEXT=$(echo "$idea" | jq -r '.text // .idea_text')
  IDEMP_KEY="bench-$DATE-$i-$RANDOM"
  echo ""
  echo "[$i/$N] $(echo "$IDEA_TEXT" | head -c 80)..."

  T0=$(python3 -c 'import time; print(int(time.time()*1000))')

  # Submit
  RESP=$(curl -fsS -X POST "$BACKEND_URL/api/generate" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: $IDEMP_KEY" \
    -H "Authorization: Bearer ${PROMETHEUS_BENCH_TOKEN:-dev-token}" \
    -d "$(jq -n --arg t "$IDEA_TEXT" '{idea_text: $t}')")
  SESSION_ID=$(echo "$RESP" | jq -r '.session_id')
  if [ -z "$SESSION_ID" ] || [ "$SESSION_ID" = "null" ]; then
    echo "  ! no session_id in response: $RESP"
    continue
  fi

  # Poll
  STATUS=queued
  while [ "$STATUS" = "queued" ] || [ "$STATUS" = "running" ]; do
    sleep 3
    STATE=$(curl -fsS "$BACKEND_URL/api/session/$SESSION_ID" \
      -H "Authorization: Bearer ${PROMETHEUS_BENCH_TOKEN:-dev-token}")
    STATUS=$(echo "$STATE" | jq -r '.status')
    NOW=$(python3 -c 'import time; print(int(time.time()*1000))')
    if [ $((NOW - T0)) -gt 300000 ]; then
      echo "  ! timed out after 5 min"
      STATUS=timeout
      break
    fi
  done
  T1=$(python3 -c 'import time; print(int(time.time()*1000))')

  ELAPSED=$((T1 - T0))
  COST=$(echo "$STATE" | jq -r '.cost.total_cost_usd // 0')
  TOK_IN=$(echo "$STATE" | jq -r '.cost.total_input_tokens // 0')
  TOK_OUT=$(echo "$STATE" | jq -r '.cost.total_output_tokens // 0')

  echo "  status=$STATUS  elapsed=${ELAPSED}ms  cost=\$$COST  tokens=${TOK_IN}/${TOK_OUT}"

  # Append to result
  ENTRY=$(jq -n \
    --arg text "$IDEA_TEXT" \
    --arg sid "$SESSION_ID" \
    --arg status "$STATUS" \
    --argjson elapsed "$ELAPSED" \
    --argjson cost "$COST" \
    --argjson tin "$TOK_IN" \
    --argjson tout "$TOK_OUT" \
    '{idea_text:$text, session_id:$sid, status:$status, elapsed_ms:$elapsed, cost_usd:$cost, input_tokens:$tin, output_tokens:$tout}')
  TMP=$(mktemp)
  jq --argjson e "$ENTRY" '.ideas += [$e]' "$RESULT" > "$TMP" && mv "$TMP" "$RESULT"
done <<<"$IDEAS_JSON"

# ---------- aggregates ----------
python3 - <<PY
import json, statistics, sys
with open("$RESULT") as f:
    data = json.load(f)
runs = [r for r in data["ideas"] if r["status"] == "completed"]
if not runs:
    print("[benchmark] no completed runs")
    sys.exit(0)
lats = sorted(r["elapsed_ms"] for r in runs)
costs = [r["cost_usd"] for r in runs]
data["aggregate"] = {
    "n_completed": len(runs),
    "n_failed": len(data["ideas"]) - len(runs),
    "latency_p50_ms": lats[len(lats)//2],
    "latency_p95_ms": lats[max(0, int(len(lats)*0.95) - 1)],
    "latency_p99_ms": lats[max(0, int(len(lats)*0.99) - 1)],
    "latency_max_ms": max(lats),
    "cost_avg_usd": round(statistics.mean(costs), 4),
    "cost_max_usd": round(max(costs), 4),
    "total_input_tokens": sum(r["input_tokens"] for r in runs),
    "total_output_tokens": sum(r["output_tokens"] for r in runs),
}
data["finished_at"] = "$(date -u +%FT%TZ)"
with open("$RESULT", "w") as f:
    json.dump(data, f, indent=2)
print(json.dumps(data["aggregate"], indent=2))
PY

echo ""
echo "[benchmark] done. result: $RESULT"
