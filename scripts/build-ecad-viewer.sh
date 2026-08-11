#!/usr/bin/env bash
set -euo pipefail

PRISM_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ECAD_VIEWER_DIR="${ECAD_VIEWER_DIR:-${PRISM_ROOT}/../ecad-viewer}"
APP_DIR="${ECAD_VIEWER_DIR}/packages/ecad-viewer-app"
PUBLIC_DIR="${PRISM_ROOT}/frontend/public"
UPSTREAM_COMMIT="$(tr -d '[:space:]' < "${PRISM_ROOT}/scripts/ecad-viewer-upstream.lock")"

git -C "${ECAD_VIEWER_DIR}" merge-base --is-ancestor "${UPSTREAM_COMMIT}" HEAD

DIRTY=false
if ! git -C "${ECAD_VIEWER_DIR}" diff --quiet HEAD -- packages/ecad-viewer-app/src packages/kicad-parser/src; then
  DIRTY=true
fi
if [[ -n "$(git -C "${ECAD_VIEWER_DIR}" status --porcelain --untracked-files=all -- packages/ecad-viewer-app/src packages/kicad-parser/src)" ]]; then
  DIRTY=true
fi
if [[ "${DIRTY}" == true && "${ECAD_ALLOW_DIRTY:-0}" != "1" ]]; then
  echo "Refusing to publish a bundle from a dirty ecad-viewer source tree." >&2
  echo "Commit the adapter changes, or set ECAD_ALLOW_DIRTY=1 for a local verification build." >&2
  exit 1
fi

node "${APP_DIR}/scripts/build.js"

install -m 0644 "${APP_DIR}/build/ecad-viewer.js" "${PUBLIC_DIR}/ecad-viewer.js"
install -m 0644 "${APP_DIR}/build/parser.worker.js" "${PUBLIC_DIR}/parser.worker.js"

ADAPTER_COMMIT="$(git -C "${ECAD_VIEWER_DIR}" rev-parse HEAD)"
ECAD_SHA="$(shasum -a 256 "${PUBLIC_DIR}/ecad-viewer.js" | awk '{print $1}')"
WORKER_SHA="$(shasum -a 256 "${PUBLIC_DIR}/parser.worker.js" | awk '{print $1}')"
BUILD_VERSION="prism-native-document-diff-v1"
PATCH_SHA="$(git -C "${ECAD_VIEWER_DIR}" diff --binary HEAD -- packages/ecad-viewer-app/src packages/kicad-parser/src | shasum -a 256 | awk '{print $1}')"
SOURCE_TREE_SHA="$(node -e '
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const root = process.argv[1];
const files = execFileSync("git", [
  "-C", root, "ls-files", "--cached", "--others", "--exclude-standard", "-z", "--",
  "packages/ecad-viewer-app/src", "packages/kicad-parser/src",
]).toString().split("\0").filter(Boolean).sort();
const hash = crypto.createHash("sha256");
for (const file of files) {
  hash.update(file).update("\0").update(fs.readFileSync(path.join(root, file)));
}
process.stdout.write(hash.digest("hex"));
' "${ECAD_VIEWER_DIR}")"

# The URL cache key is the artifact digest, so every changed bundle gets a new
# browser/CDN identity without maintaining a second hand-written version.
node -e '
const fs = require("fs");
const [file, digest] = process.argv.slice(1);
const html = fs.readFileSync(file, "utf8").replace(
  /\/ecad-viewer\.js\?v=[^"<]+/,
  `/ecad-viewer.js?v=${digest}`,
);
fs.writeFileSync(file, html);
' "${PRISM_ROOT}/frontend/index.html" "${ECAD_SHA}"

cat > "${PUBLIC_DIR}/ecad-viewer.manifest.json" <<EOF
{
  "schema": "prism.ecad_viewer_build_a0",
  "version": "${BUILD_VERSION}",
  "upstreamCommit": "${UPSTREAM_COMMIT}",
  "adapterCommit": "${ADAPTER_COMMIT}",
  "dirty": ${DIRTY},
  "worktreePatchSha256": "${PATCH_SHA}",
  "sourceTreeSha256": "${SOURCE_TREE_SHA}",
  "artifacts": {
    "ecad-viewer.js": "sha256:${ECAD_SHA}",
    "parser.worker.js": "sha256:${WORKER_SHA}"
  }
}
EOF

echo "Built ecad-viewer ${BUILD_VERSION} from ${ADAPTER_COMMIT}"
