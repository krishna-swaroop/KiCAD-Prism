#!/usr/bin/env bash
# Run the 20-user V3 capacity hammer against a local Prism stack.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DURATION="${DURATION:-600}"
USERS="${USERS:-20}"
HEAVY_USERS="${HEAVY_USERS:-5}"
BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
OUTPUT="${OUTPUT:-/tmp/v3-capacity-hammer.json}"
NETWORK_DELAY_MS="${NETWORK_DELAY_MS:-45}"
NETWORK_JITTER_MS="${NETWORK_JITTER_MS:-25}"
NETWORK_LOSS_PCT="${NETWORK_LOSS_PCT:-0.1}"

if [[ -z "${PRISM_BENCHMARK_SESSION_COOKIE:-}" ]]; then
  python3 scripts/mint_benchmark_session.py
  export PRISM_BENCHMARK_SESSION_COOKIE="$(cat /tmp/prism-benchmark-session.txt)"
fi

echo "Hammer: users=${USERS} heavy=${HEAVY_USERS} duration=${DURATION}s base=${BASE_URL}"
echo "VPN-like delay: ${NETWORK_DELAY_MS}ms ±${NETWORK_JITTER_MS}ms loss=${NETWORK_LOSS_PCT}%"

exec python3 scripts/benchmark_concurrent_users.py \
  --base-url "$BASE_URL" \
  --users "$USERS" \
  --heavy-users "$HEAVY_USERS" \
  --duration "$DURATION" \
  --network-delay-ms "$NETWORK_DELAY_MS" \
  --network-jitter-ms "$NETWORK_JITTER_MS" \
  --network-loss-pct "$NETWORK_LOSS_PCT" \
  --session-cookie "$PRISM_BENCHMARK_SESSION_COOKIE" \
  --output "$OUTPUT" \
  "$@"
