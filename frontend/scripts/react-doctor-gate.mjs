#!/usr/bin/env node
// Hold the react-doctor backlog at or below a committed count.
//
// react-doctor always exits 0, so running it in CI reports without gating.
// This compares a fresh scan against react-doctor-baseline.json and fails when
// the backlog grows. It also fails when the backlog shrinks, so the number in
// the file always describes the tree rather than drifting into fiction.
//
// Deliberately a total rather than a per-rule allowlist: the point is that the
// backlog cannot grow while it is being drained, and a total says that in one
// number a reviewer can check.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const baselinePath = join(root, "react-doctor-baseline.json");
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));

const scratch = mkdtempSync(join(tmpdir(), "react-doctor-gate-"));
const reportPath = join(scratch, "report.json");
let summary;
try {
  execFileSync(
    "npx",
    ["react-doctor", ".", "--no-telemetry", "--json", "--json-out", reportPath],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  );
  summary = JSON.parse(readFileSync(reportPath, "utf8")).summary;
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

const { errorCount, warningCount } = summary;
const fail = (message) => {
  console.error(`react-doctor gate: ${message}`);
  process.exit(1);
};

// Errors are never carried. The backlog is warnings only, by construction.
if (errorCount > 0) {
  fail(`${errorCount} error-level finding(s). Errors are never acceptable; run \`npm run scan\`.`);
}

if (warningCount > baseline.warnings) {
  fail(
    `${warningCount} warnings, baseline ${baseline.warnings}. `
      + `This change adds ${warningCount - baseline.warnings}. `
      + "Fix them, or justify raising the baseline in the pull request.",
  );
}

if (warningCount < baseline.warnings) {
  fail(
    `${warningCount} warnings, baseline ${baseline.warnings}. `
      + `Good news: ${baseline.warnings - warningCount} fewer. `
      + `Set "warnings": ${warningCount} in react-doctor-baseline.json so the ratchet holds there.`,
  );
}

console.log(`react-doctor gate: ${warningCount} warnings, at baseline. 0 errors.`);
