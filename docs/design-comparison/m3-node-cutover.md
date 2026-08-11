# M3: ecad-viewer parser cutover

Milestone 3 of [the Design Comparison revamp](../DESIGN_COMPARISON_REVAMP.md).
This is the production cutover from Prism's Python geometry scanner to the
parser already used by `ecad-viewer`.

## What changed

- `ecad-diff.mjs` parses both revisions in one Node process and returns the
  authored object delta, native document identity, parent identity, centroids,
  component/BOM fields, and compact per-net route aggregates.
- The old `_extract_geometry`, geometry diff/merge path, geometry cache payload,
  and point-derived route-metric implementation were deleted.
- `initial.json` and `revision.json` now cache connectivity, stackup, source
  lists, and timings only. They contain no geometry and no component projection.
- Component and BOM rows are projected from parser symbols and footprints.
  `build_semantic_index(..., include_components=False)` now owns connectivity
  only.
- Semantic visual targets are hydrated from the parser's native UUID index.
  `documentPath`, `kind`, `parentSourceId`, centroid, and hierarchical
  `KIID_PATH` now cross the boundary without bounds.
- Snapshot creation runs first, then the Node object parser overlaps the two
  independent connectivity compiles. PCB route length, via count, used layers,
  and barrel length remain available from compact aggregates.
- PROJECT_DIFF still carries `[0, 0, 0, 0]` compatibility bboxes. Removing the
  bbox field is deliberately M5, after M4 completes the broader viewer
  resolution measurement.

## Validation

The runtime image passed:

- 81 backend tests;
- 21 parser/delta tests;
- 2 shadow-comparison tests;
- Python syntax validation and `git diff --check`.

Five cold runs were made per fixed panel inside `prism-worker`. Output was
deterministic on both panels: change counts, object counts, navigation health,
and document-diff bytes were identical across all five runs.

| Gate | A — JTYU-OBC | B — backplane | Result |
| --- | ---: | ---: | --- |
| `revision.json` target | ≤6 MB | ≤7 MB | pass |
| measured revisions | 2.29 / 2.41 MB | 3.55 / 3.51 MB | pass |
| geometry bytes in cache | 0 | 0 | pass |
| position-delta groups | 3,059 schematic | 2,078 schematic / 305 PCB | pass |
| median cold total target | ≤9.3 s | ≤8.3 s | miss |
| median cold total | 12.80 s | 10.57 s | miss |
| deterministic output | yes | yes | pass |

The artifact reduction is 92–93% on A against the 32 MB baseline and about
75% on B against the 14 MB baseline.

The post-cutover viewer fallback rate was not re-run across the larger
schematic/PCB sample. The server now names objects with the viewer's own parser
and the previous one-document measurement was 0%, but the expanded empirical
resolution gate remains M4 work rather than an inferred M3 pass.

## Timing finding

Removing component projection did not materially reduce semantic-index time:
the measured `project-components` stage rounds to zero. Connectivity's
`load-project` remains the dominant cost, with five-run median aggregate times
of 16.66 s on A and 12.66 s on B across the two concurrently built revisions.

The Node delta itself measured 9.73 s on A and 4.27 s on B while running
concurrently with connectivity. That overlap prevents the two parsers from
being fully additive, but it cannot reach the original wall-clock target while
connectivity alone keeps the initial stage around 9–11 seconds.

This is a measured target miss, not a correctness compromise. The cutover
still removes the duplicate geometry parser and its cache, and it leaves the
remaining performance problem correctly isolated: connectivity compilation,
not component or geometry projection.

## Contract notes

- Change records no longer contain `geometry` or `oldGeometry`.
- Native routing lives in `base_item`, `compare_item`, and
  `details.visualTargets`.
- Group `position_delta` is computed from parser centroids.
- Reused hierarchical symbols emit one visual target per full `KIID_PATH`;
  document UUID alone is not treated as instance identity.
- Route metrics are derived from per-net length/via aggregates rather than
  retained point arrays.

M4 can now focus on the viewer's unresolved pin identities without depending
on the deleted backend sidecar.
