---
name: prism-comparison-change-kind
description: Extend KiCAD Prism design-comparison parsing, semantics, review grouping, facts, focus, or presentation across backend and frontend. Use when a PCB or schematic difference is missing, misclassified, or not reviewable.
---

# Extend design-comparison semantics

Read `frontend/src/components/design-comparison/AGENTS.md` first. Trace one real
change payload through the current pipeline before editing; the visible row,
facts, and focus target may be produced by different modules.

## Preserve the lifecycle kind

`KiCadChangeKind` in `frontend/src/components/design-comparison/types.ts` is the
small lifecycle union (`added`, `removed`, `modified`, `collision`, and
`duplicate_uuid`). Most new electrical or graphical distinctions should be a
reason, category, fact, or review-group policy—not a new lifecycle kind. Extend
the union only when the change genuinely has different lifecycle behavior at
every consumer.

## Trace the affected hops

1. Parse and normalize in `backend/app/services/design_compare_nodes.py`.
   Derive the base and comparison revisions independently; absence on one side
   remains absence.
2. Shape semantic grouping in
   `backend/app/services/design_compare_semantics.py`. Decide whether reviewers
   need one row, one row per object, or a suppressed diagnostic.
3. Add durable output in `backend/app/services/design_compare_artifacts.py`
   only when the normal result payload is insufficient.
4. Update narrow frontend types in
   `frontend/src/components/design-comparison/types.ts` without widening an
   exhaustively checked union to `string`.
5. Add reviewer language and facts in
   `frontend/src/components/design-comparison/comparison-change-vocabulary.ts`
   and `frontend/src/components/design-comparison/comparison-change-facts.ts`.
6. Check grouping/noise policy in
   `frontend/src/components/design-comparison/comparison-review-groups.ts` and
   `frontend/src/components/design-comparison/comparison-review-noise.ts`.
7. If the change occupies layers, update
   `frontend/src/components/design-comparison/comparison-layer-focus.ts` so the
   selection shows exactly those layers. A layerless change contributes no
   focus layers; it does not veto other selected changes.
8. Check the final row and facts in
   `frontend/src/components/design-comparison/differences-pane.tsx` and
   `frontend/src/components/design-comparison/comparison-property-panel.tsx`.

Do not add `bbox` to Prism's PROJECT_DIFF item payload. The ECAD viewer resolves
identities and measures painted bounds; native KiCad input keeps its separate
strict-bounds contract.

## Tests and verification

Add the smallest backend fixture that proves parsing/grouping on both revision
sides. Add frontend coverage for grouping, vocabulary/facts, noise policy, and
layer focus as applicable. The broad presentation contracts live in
`frontend/src/components/design-comparison/comparison-presentation-shell.test.tsx`.
Finish with `.agents/skills/prism-quality-gate/SKILL.md`.
