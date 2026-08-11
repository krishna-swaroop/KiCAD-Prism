#!/bin/sh
set -eu

if [ -z "${PRISM_LOADTEST_BEARER_TOKEN:-}" ] \
  && { [ -z "${PRISM_LOADTEST_CLIENT_ID:-}" ] || [ -z "${PRISM_LOADTEST_CLIENT_SECRET:-}" ]; }; then
  echo "Provide PRISM_LOADTEST_BEARER_TOKEN or PRISM_LOADTEST_CLIENT_ID/_SECRET." >&2
  echo "Create them with: ./scripts/bootstrap_remote_panel_loadtest_client.sh" >&2
  exit 2
fi

mkdir -p "$(dirname "${PRISM_LOADTEST_OUTPUT:-/results/remote-panel-load.json}")"

echo "Starting remote-panel load test against ${PRISM_BASE_URL}"
echo "Users=${PRISM_LOADTEST_USERS} duration=${PRISM_LOADTEST_DURATION}s"

set -- python3 /loadtest/benchmark_remote_panel_load.py \
  --base-url "${PRISM_BASE_URL}" \
  --users "${PRISM_LOADTEST_USERS}" \
  --duration "${PRISM_LOADTEST_DURATION}" \
  --scope "${PRISM_LOADTEST_SCOPE}" \
  --output "${PRISM_LOADTEST_OUTPUT}"

if [ -n "${PRISM_LOADTEST_BEARER_TOKEN:-}" ]; then
  set -- "$@" --bearer-token "${PRISM_LOADTEST_BEARER_TOKEN}"
else
  set -- "$@" \
    --client-id "${PRISM_LOADTEST_CLIENT_ID}" \
    --client-secret "${PRISM_LOADTEST_CLIENT_SECRET}"
fi

exec "$@"
