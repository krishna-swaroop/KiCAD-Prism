#!/usr/bin/env bash
# Vendor ecad-viewer's kicad-sexpr-parser as a self-contained ESM bundle.
#
# `scripts/ecad-parse.mjs` runs on the Node already present in the backend and
# worker images, which have no npm install step and no node_modules. The
# parser bundles to ~100 KB with no external imports, so the whole dependency
# is one committed file -- but a committed build artifact is only honest if it
# can be regenerated, hence the provenance record this writes alongside it.
#
# Deliberately mirrors scripts/build-ecad-viewer.sh: same upstream lock, same
# refusal to publish from a dirty source tree.
set -euo pipefail

PRISM_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ECAD_VIEWER_DIR="${ECAD_VIEWER_DIR:-${PRISM_ROOT}/../ecad-viewer}"
PARSER_DIR="${ECAD_VIEWER_DIR}/packages/kicad-parser"
VENDOR_DIR="${PRISM_ROOT}/scripts/vendor"
ARTIFACT="${VENDOR_DIR}/kicad-sexpr-parser.mjs"
UPSTREAM_COMMIT="$(tr -d '[:space:]' < "${PRISM_ROOT}/scripts/ecad-viewer-upstream.lock")"

git -C "${ECAD_VIEWER_DIR}" merge-base --is-ancestor "${UPSTREAM_COMMIT}" HEAD

if [[ -n "$(git -C "${ECAD_VIEWER_DIR}" status --porcelain --untracked-files=all -- packages/kicad-parser/src)" ]] \
  || ! git -C "${ECAD_VIEWER_DIR}" diff --quiet HEAD -- packages/kicad-parser/src; then
  if [[ "${ECAD_ALLOW_DIRTY:-0}" != "1" ]]; then
    echo "Refusing to vendor a parser built from a dirty source tree." >&2
    echo "Commit the parser changes, or set ECAD_ALLOW_DIRTY=1 for a local build." >&2
    exit 1
  fi
fi

# Only the esbuild step, not the package's `build` script: that also runs
# `tsc --emitDeclarationOnly`, which fails on pre-existing unused-symbol debt
# in upstream tokenizer.ts and would block vendoring for a reason unrelated to
# the artifact. Declarations are not shipped here in any case.
mkdir -p "${VENDOR_DIR}"
(cd "${PARSER_DIR}" && npx --no-install esbuild src/index.ts \
  --bundle --platform=node --format=esm --target=es2022 \
  --outfile="${ARTIFACT}")

SOURCE_COMMIT="$(git -C "${ECAD_VIEWER_DIR}" rev-parse HEAD)"
SOURCE_TREE_SHA="$(node -e '
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const root = process.argv[1];
const files = execFileSync("git", [
  "-C", root, "ls-files", "--cached", "--others", "--exclude-standard", "-z", "--",
  "packages/kicad-parser/src",
]).toString().split("\0").filter(Boolean).sort();
const hash = crypto.createHash("sha256");
for (const file of files) {
  hash.update(file).update("\0").update(fs.readFileSync(path.join(root, file)));
}
process.stdout.write(hash.digest("hex"));
' "${ECAD_VIEWER_DIR}")"
ARTIFACT_SHA="$(shasum -a 256 "${ARTIFACT}" | awk '{print $1}')"
PARSER_VERSION="$(node -p "require('${PARSER_DIR}/package.json').version")"

cat > "${VENDOR_DIR}/kicad-sexpr-parser.provenance.json" <<JSON
{
  "artifact": "kicad-sexpr-parser.mjs",
  "package": "kicad-sexpr-parser",
  "version": "${PARSER_VERSION}",
  "sourceCommit": "${SOURCE_COMMIT}",
  "sourceTreeSha256": "${SOURCE_TREE_SHA}",
  "artifactSha256": "${ARTIFACT_SHA}",
  "build": "esbuild src/index.ts --bundle --platform=node --format=esm --target=es2022"
}
JSON

echo "Vendored kicad-sexpr-parser ${PARSER_VERSION} from ${SOURCE_COMMIT:0:7}"
echo "  ${ARTIFACT}"
echo "  sha256 ${ARTIFACT_SHA}"
