# ecad-viewer Sync Notes

The viewer assets in `frontend/public/` are **vendored build artifacts**. They are
not built by this repo's toolchain — they are compiled in a separate fork and
copied in. This document records exactly which fork commit the checked-in bundles
came from, so a bundle can always be traced back to its source.

## Where the source lives

We no longer vendor Huaqiu's `main` directly; we build from **our fork**, which
carries app-specific integration work plus several genuine upstream bug fixes.

| | |
|---|---|
| fork (push here) | <https://github.com/Keybored02/ecad-viewer> |
| upstream (fetch only) | <https://github.com/Huaqiu-Electronics/ecad-viewer> |
| working branch | `kicad-prism-perf` |

The fork is a real clone of upstream (full history), so it can be rebased onto
new upstream releases and our fixes can be PR'd back.

## Current vendored build

- **fork commit:** `e3406e2` (`kicad-prism-perf`)
- **upstream merge-base:** `b8d8019`
- **fork carries:** 14 commits on top of the merge-base
- **upstream is ahead by:** 6 commits (not yet rebased onto — see below)
- **synced:** 2026-07-12

## Vendored artifacts

Built from the fork and copied into `frontend/public/`:

- `ecad-viewer.js` — the viewer web components
- `parser.worker.js` — the s-expr parser worker (**required**; the viewer parses
  boards/schematics off the main thread)
- `glyph-full.js`, `3d-viewer.js` — updated less frequently

## How to rebuild and re-vendor

From the fork checkout:

```bash
cd packages/ecad-viewer-app
npm run build:no-check          # esbuild; the repo does not typecheck cleanly

cp build/ecad-viewer.js   <prism>/frontend/public/ecad-viewer.js
cp build/parser.worker.js <prism>/frontend/public/parser.worker.js
```

Then **update the "Current vendored build" section above** with the new fork
commit. A bundle whose provenance isn't recorded is a bundle nobody can debug.

Notes:

- `npm run build` and `build:no-check` are the same script. The repo has
  pre-existing type errors, so a strict `tsc` gate is not part of the build.
- esbuild output is not byte-reproducible across runs; a rebuild from the same
  source will produce a slightly different file. Don't read a bundle diff as a
  source change.
- The bundles are static assets served with no cache-busting (`index.html` loads
  `/ecad-viewer.js` unversioned). After re-vendoring, **hard-reload** — a normal
  reload will happily keep serving the old bundle from disk cache.

## Fixes in the fork worth upstreaming

These are consumer-agnostic bugs in Huaqiu's code, not Prism-specific
integration. They'd benefit any user of the viewer:

- **`e3406e2` — `parse_expr` built debug-log strings eagerly.** `Logger.debug`
  discards the message, but arguments are evaluated *before* the call, and the
  template interpolated `${expr}` — stringifying the entire enclosing expression
  array, tens of thousands of times per board. A CPU profile attributed 89% of
  self-time to `parse_expr` and 8% to GC. Removing it: **9 MB board parse
  ~4,700 ms → ~250 ms (19×)**, byte-identical output.
- **`063a03b` — double-render race in `update()`.** It cleared the shadow root
  *before* `await render()`, so a second update in that gap left two content
  trees mounted. Fixed by rendering into a local first, then clearing +
  appending synchronously.
- **`063a03b` — `Disposables.add` threw on an already-disposed stack** during
  connect churn, instead of disposing the orphan and moving on.

## Scope notes

Viewer code is a higher-risk surface than the rest of the app:

- General frontend cleanup should not touch vendored assets unless the task *is*
  a viewer/vendor sync.
- Bundle/perf work elsewhere should isolate viewer chunks rather than rewrite the
  viewer surface.
- Changing viewer behaviour means editing the **fork**, rebuilding, and
  re-vendoring — editing `frontend/public/*.js` directly will be silently
  overwritten by the next sync.
