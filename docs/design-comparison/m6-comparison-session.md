# M6: one comparison session, three views

Milestone 6 of [the Design Comparison revamp](../DESIGN_COMPARISON_REVAMP.md)
removes Prism's second rendering path. Composite, side-by-side, and Old/New
now consume one parser-owned comparison session.

## Session contract

`ecad-viewer.prepareComparison()` parses the reference and comparison source
sets once and returns an `EcadComparisonSession`. The session owns the parsed
projects, native diff presentation, prepared identity targets, and retained
display lists.

The shell changes presentation only through:

- `setPresentation("composite", viewport)`
- `setPresentation("reference", viewport)`
- `setPresentation("comparison", viewport)`

Side-by-side attaches a second viewport to the same session. The second
viewport adopts the already parsed project model; it never invokes the parser.
Warm switches restore the retained document layers, prepared targets, and
diff-overlay scene instead of repainting them.

The former Prism-side presentation builder and the viewer APIs
`setRevisionDiffPresentation`, `selectRevisionDiff`, and
`previewRevisionDiff` have been deleted. Selection and preview now use only
`selectDocumentDiff` and `previewDocumentDiff`.

## Two-viewport gate

The browser integration gate prepares one schematic comparison on the primary
viewer, attaches a second `<ecad-viewer>`, and requests reference and comparison
presentations concurrently.

| Gate measurement | Result |
| --- | ---: |
| Preparation paths | **1** |
| Retained viewer elements | **2** |
| Retained scenes after side-by-side | **3** |
| Parser calls during either viewport switch | **0** |
| Warm repaint count | **0** |
| Selection applied in both viewports | **yes** |

The gate passes and the two-scene-model scope risk is closed.

## Production benchmark

The auth-disabled Prism UI was measured on JTYU-OBC comparison
`8f71cfea2b2c → 4b0a39a7f84`, schematic
`Subsheets/B2B_Conn.kicad_sch` (329 native changes, 406 focus targets, 547
visuals). The source session contains 29,822,470 bytes across both revisions.

Cold preparation took 1,607.7 ms and made 51 per-file parser invocations.
Materializing side-by-side for the first time took 196.4 ms for reference and
436.2 ms for the newly attached comparison viewport. Those are one-time scene
construction costs, not warm view switches.

| Warm transition | Switch time | Parser calls | Repaints |
| --- | ---: | ---: | ---: |
| Side-by-side → Composite | **75.2 ms** | 0 | 0 |
| Composite → Side-by-side | **72.7 ms** | 0 | 0 |
| New → Old | **70.6 ms** | 0 | 0 |
| Old → New | **76.7 ms** | 0 | 0 |

All measured warm switches are below the 150 ms target.

## Size and memory

| Measurement | Before M6 | M6 |
| --- | ---: | ---: |
| `comparison-presentation-shell.tsx` | 2,092 lines | **1,047 lines** |
| Viewer elements after visiting side-by-side | 3 | **2** |
| Comparison preparation paths | 2 | **1** |

Chrome's measured JS heap was 386,393,338 bytes after Composite preparation,
486,718,175 bytes with the three Composite/reference/comparison scenes warm,
and 526,628,905 bytes after also warming comparison on the primary Old/New
viewport. The three-scene delta is 100,324,837 bytes (95.7 MiB); the fully
warmed four-scene delta is 140,235,567 bytes (133.7 MiB). These are whole-page
heap snapshots and therefore include normal V8/app noise, but they bound the
retained-scene cost on the production fixture.

## Validation

- ecad-viewer: 39 browser tests passed.
- M6 focused gate: two viewports, warm Composite/reference restore, zero
  parser calls, zero repaints, and switch latency below 150 ms.
- Prism frontend: 109 tests passed; lint and production build passed.
- Real UI: Composite, side-by-side, Old/New, and both Old/New sides rendered
  without alerts; the viewer count stayed at two after side-by-side was first
  visited.

M6 is complete. Prism owns navigation and controls; ecad-viewer owns parsing,
prepared identity, presentation state, retained scenes, and rendering.
