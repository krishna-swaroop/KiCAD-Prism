# M2: object delta in Node, shadow agreement

M2 of [the revamp plan](../DESIGN_COMPARISON_REVAMP.md), against the
[M0 baseline](m0-baseline.md) and [M1 parser measurement](m1-node-parse.md).
Nothing in the shipping comparison depends on this delta yet. The milestone
asks whether one Node process can parse both revisions, emit only changes, and
explain every difference from the geometry scanner before M3 deletes it.

Entry points:

- `scripts/ecad-diff.mjs` parses base and head and emits added, removed and
  modified addressable objects, property deltas, movement deltas, and reason
  classifications.
- `scripts/compare_object_delta.py` builds the current revision artifacts and
  compares their geometry-derived changes with the Node delta from the exact
  same snapshots.

## Verdict

| target | result | |
| --- | ---: | --- |
| ≤2.5 s total on A | **4.02 s median** | missed; M1 parse alone was 3.59 s |
| ≥99% component add/remove | **100% where exercised** | met |
| ≥99% zone add/remove | **100% on B** | met |
| track / via add/remove | no changes in fixed panels | real-format unit coverage |
| every disagreement classified | **0 unexplained** | met |

The correctness gate passes. M3 is unblocked.

The speed target should have been restated after M1: it asks the full parse and
delta to finish in 2.5 s, while M1 had already measured 3.59 s for A's parse and
index alone. The object-to-object delta is small — 0.41 s on A and 0.18 s on B.
The parser remains much faster than the Python work M3 replaces.

## Measurement

Five runs inside `prism-worker`, fixed revision-cache snapshots, median shown.
Counts and serialized delta content were identical on every run.

| | A — JTYU-OBC | B — backplane |
| --- | ---: | ---: |
| base objects | 43,715 | 33,744 |
| head objects | 44,454 | 35,481 |
| added / removed / modified | 1,289 / 550 / 2,975 | 2,117 / 380 / 2,752 |
| parse + index + delta | **4.02 s** | **2.69 s** |
| delta calculation only | 0.41 s | 0.18 s |
| peak RSS | 1.46 GB | 540 MB |

A's five total times were 6.46, 4.02, 4.66, 4.02 and 3.88 s. B's were 2.84,
2.69, 2.47, 3.11 and 2.43 s. This is the same real-work variance M0 found, so a
single 2.41 s B run is not used as the claim.

## Agreement

The raw number deliberately treats new detections as disagreement. It is
therefore useful for auditing, but not a correctness score by itself.

| | A | B |
| --- | ---: | ---: |
| exact projected changes | 4,368 | 3,815 |
| raw agreement against current scanner | 96.83% | 94.76% |
| unexplained differences | **0** | **0** |

### A classifications

| classification | count | explanation |
| --- | ---: | --- |
| parser-authored-content-only | 423 | properties/content the geometry scanner does not model |
| semantic-enrichment-only | 137 | net/semantic ids owned by kicad-monkey, with unchanged authored geometry |
| object kind without sidecar | 23 | sheets and sheet pins, parsed and addressable |
| viewer-parser-unsupported graphic | 6 | moved polylines nested in `rule_area`; ecad-viewer parses and paints neither the wrapper nor child |

### B classifications

| classification | count | explanation |
| --- | ---: | --- |
| object kind without sidecar | 1,201 | 1,137 pads, 7 sheets, 56 sheet pins and 1 table |
| parser-authored-content-only | 227 | 103 footprints, 109 symbols and 15 graphics with authored changes the scanner misses |
| semantic-enrichment-only | 199 | connectivity identity changed without authored geometry changing |
| semantic-identity churn | 12 | six stable symbol UUIDs that the scanner split into add + remove after semantic-id churn |

B's footprint changes agree 269/269 and its nested-zone changes agree 190/190.
The fixed pair has no track or via changes, despite its 459 reported PCB
changes; those changes are footprints, pads and footprint keepout zones.
`ecad-diff.test.mjs` therefore exercises footprint, segment, via and zone
add/remove with parsed KiCad board text so the zero-denominator kinds still
have deterministic coverage.

## Bugs shadow mode caught

### Derived positions were skipped behind equal raw hashes

Schematic pin instances carry UUID and pin number, but no position. The index
inherits the owning symbol's position, as M1 specified. The first delta
implementation returned early when a pin's raw hash matched, without comparing
that derived position. B consequently missed 1,352 pin moves and reported only
3.2% pin agreement.

The delta now compares every projected index field as well as the raw hash.
Pin agreement on B is 95.1%; the remaining 72 are connectivity-only semantic
enrichment and correctly stay with kicad-monkey.

### Footprint zones were parsed but not indexed

The parser exposes board-level zones and `footprint.zones` separately. M1 only
enumerated the first collection, so its reconciliation check balanced while
silently omitting every nested zone. B exposed this as 190 sidecar-only zone
changes.

Nested zones are now indexed independently with their footprint parent UUID,
and reconciliation counts the collection explicitly. B zone agreement is
100%. This corrects M1's A object counts from 43,028 / 43,767 to
43,715 / 44,454.

## Carried into M3

- Use `scripts/ecad-diff.mjs` as the one-process Python↔Node boundary; do not
  ship either full object index.
- Preserve kicad-monkey's connectivity delta. Node's
  `semantic-enrichment-only` classification is evidence for the ownership
  boundary, not missing authored changes.
- Fold footprint-owned text and graphics into the footprint hash. Indexing
  each paint child separately turned B's ~5k delta into ~17k redundant records
  during the M2 audit and raised the Node step to 4.49 s.
- Do not report objects that ecad-viewer's own parser cannot paint. The six
  rule-area polylines on A are current scanner detections with no resolvable
  viewer target.
