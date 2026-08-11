# UI Change Request

## Screenshots

- Current state: existing History workspace on `feature/history-design-comparison`.
- Target reference: KiCad V11-style single native comparison scene discussed in
  this task.

## Where

- Route: `/project/:projectId?section=history&base=<sha>&compare=<sha>`.
- Components: History Design Comparison workspace, Differences pane, native
  comparison canvas, existing comparison discussions.

## Before -> After

1. Preserve the existing Commit and Release History views.
2. Replace the two-viewer review graphics path with one native ecad-viewer
   comparison document.
3. Keep unchanged comparison content monochrome; paint added native items
   green, removed reference items red, and modified comparison items amber.
4. Load two immutable revision source sets plus KiCad-shaped DOCUMENT_DIFF
   data through one viewer API.
5. Selecting a difference updates the row immediately, then performs one O(1)
   viewer selection request using precomputed native bounds.
6. Switching changed files reuses parsed revisions and prepared document data.
7. Show explicit loading, unresolved-source, empty-document, and selection
   diagnostics in the canvas.
8. Keep PCB physical layer controls; remove measurement and alternate visual
   modes from this iteration.
9. Keep BOM, Stackup, search/status filters, URL restoration, and comparison
   discussions intact.
10. Publish canvas comments only through the typed comment-overlay API.
11. Treat schematic and PCB files at the same commit as distinct immutable
    source manifests.
12. Keep group expansion independent from group/item selection and focus the
    retained native bounds on every selected row.
13. Apply subdued monochrome treatment to unchanged PCB and schematic content,
    including the schematic drawing sheet.

## Constraints

- New dependencies allowed: no.
- Dark mode impact: canvas chrome and diagnostics use existing semantic tokens.
- Breakpoints to verify: desktop and narrow workspace.
- Behavior constraints: no Git checkout mutation; no source reload or full
  document paint during a warm item selection; no arbitrary public graphics.
- Non-goals: ghost/split/legacy modes, measurement, formal approvals, and
  free-form comparison markup.

## Done-When Checklist (pass/fail)

- [x] Visual update matches requested after state.
- [x] No hardcoded frontend colors introduced.
- [x] Existing Commit and Release views are preserved.
- [x] Loading, empty, unresolved, and error states remain valid.
- [x] Keyboard focus and labels remain accessible.
- [x] Changes limited to the comparison seam and comment API migration.
- [ ] Warm selection records zero parser invocations and zero full paints.
- [x] Frontend lint/build and focused tests pass.
