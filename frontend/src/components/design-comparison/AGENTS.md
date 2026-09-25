# Design comparison

Presents the difference between two revisions as reviewable evidence. Read
`AGENTS.md` at the repository root first, especially the state hierarchy rule.

## The correctness principle

Everything here serves one idea: **a reviewer must be shown exactly the evidence
for a change, and never anything that could be mistaken for it.** Most bugs in
this directory are not crashes. They are plausible, wrong evidence — which is
worse, because it gets believed.

Two rules follow, and both have been broken before:

1. **Each revision derives evidence independently.** A pane must never infer its
   visible layers or object identity from the other revision. Do this and a
   re-layered route, or a part moved to the other side of the board, reads as if
   it were always on both. `comparison-layer-focus.ts` documents the layer
   contract. The deliberate cross-side positional fallback in
   `revision-sources.ts` is only camera context for an added/removed object; it
   never invents identity or occupancy on the absent side.
2. **A selection is shown on exactly the layers it occupies.** Not more, not
   fewer. A change on B.Cu read through the F.Cu artwork stacked over it is, in
   that file's words, the opposite of evidence.

## Module groups

**URL and lifecycle** — `comparison-url.ts`, `use-comparison-url-state.ts`,
`comparison-lifecycle.ts`, `comparison-readiness.ts`.
The URL is the source of truth. `comparison-lifecycle.ts` is a reducer over
per-slot host state (`composite`, `base`, `compare`) — use it rather than adding
parallel `useState` for viewer readiness.

**Data in** — `use-design-compare-job.ts`, `comparison-result-loader.ts`,
`revision-sources.ts`, `types.ts`.

**Review shaping** — `comparison-review-groups.ts`, `comparison-review-noise.ts`,
`comparison-review-policy.ts`, `comparison-review-queue.ts`,
`comparison-review-report.ts`, `comparison-change-facts.ts`,
`comparison-change-vocabulary.ts`.
This is where "what counts as one change" is decided. Grouping and noise
suppression are the subtlest logic in the directory.

**Presentation** — `comparison-presentation-shell.tsx`,
`design-comparison-workspace.tsx`, `differences-pane.tsx`,
`comparison-property-panel.tsx`, `comparison-pcb-layers-panel.tsx`,
`bom-panel.tsx`, `fabrication-panel.tsx`, `stackup-panel.tsx`.

**Viewer bridge** — `comparison-viewer-host.tsx`,
`comparison-selection-bridge.ts`, `comparison-layer-focus.ts`,
`use-comparison-camera-sync.ts`, `fabrication-viewport.ts`.
This is the one place the state-hierarchy exception applies: the ECAD viewer is
an imperative custom element with its own lifecycle, and effects are the correct
tool for synchronizing with it. Everything outside this group should be derived,
not mirrored.

## Traps

- **A routing focus temporarily owns layer visibility.** Re-applying the
  reviewer's saved layers while one is active fights it on every URL update
  (`comparison-presentation-shell.tsx`).
- **Do not add `bbox` to Prism's PROJECT_DIFF item payload.** The viewer resolves
  identities and measures painted bounds. Native KiCad input retains its strict
  `bbox` contract; see `docs/design-comparison/m5-stop-emitting-bounds.md`.
- **Do not restore copper-only focus.** Requiring every selected object to be
  copper means an ordinary part group carrying one copper change plus a
  silkscreen annotation isolates nothing at all.
- **Never navigate for a URL write that changes nothing.** Preserve the no-op
  guard in `use-comparison-url-state.ts`.
- Changes that name no layer (a design rule, a netlist edit) do not veto a
  focus. They contribute nothing to it. They are not an error.

## History

Current reviewer policy is in
`docs/design-comparison/reviewer-presentation-policy.md`. The m0-m7 files in the
same directory are historical evidence; consult a specific milestone only when
the current code or policy points to it, not as required setup.
