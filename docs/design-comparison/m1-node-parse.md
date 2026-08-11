# M1: the Node parse step, measured where it will run

M1 of [the revamp plan](../DESIGN_COMPARISON_REVAMP.md), against the
[M0 baseline](m0-baseline.md). The question M1 exists to answer is whether
`kicad-sexpr-parser` can carry object-level parsing on the server: fast enough,
inside the worker's memory, and accounting for everything it parses.

Entry point: `scripts/ecad-parse.mjs`, on the Node 22 already in the image.
The parser is vendored as one self-contained 96 KB ESM bundle
(`scripts/vendor/kicad-sexpr-parser.mjs`, rebuilt by
`scripts/build-ecad-parser.sh`, provenance recorded alongside it) — the image
has no npm install step, and the bundle has no external imports.

## Verdict

| target | result | |
| --- | --- | --- |
| ≤1.2 s per revision on A | **~1.8 s** | **missed** |
| ≤1.5 GB peak RSS | **1.44 GB** | met — and the real ceiling is 12 GB |
| Object counts match the parser's collections | **exact, 0 shortfall** | met |

The memory gate was the one that could have forced a design change. It does
not: the worker's `mem_limit` is **12 GB**, and a 35 MB board peaks at 1.44 GB
parsing *both* revisions in one process. Streaming is not needed and the
ceiling does not need raising.

The speed target is missed by about 50%, but on the comparison that matters it
is not close: against the M0 baseline, measured in the same image, the parser
replaces a stage costing three times as much.

## Measurement

Both revisions parsed in **one process**, which is the shape the plan
specifies. That matters: measured standalone, one snapshot costs 2.1 s, of
which JIT warm-up is a large share; the second revision in the same process
does not pay it again.

Median of three runs, inside `prism-worker`.

### A — JTYU-OBC (34.9 MB board, 27 schematics)

| | base | head |
| --- | ---: | ---: |
| parser | 1.14 s | 1.21 s |
| index build | 0.41 s | 0.43 s |
| read | 0.19 s | 0.13 s |
| **per revision** | **1.74 s** | **1.85 s** |
| objects | 43,028 | 43,767 |
| documents | 26 | 28 |

Both revisions, one process: **3.59 s**, peak RSS **1,435 MB** (1,433 / 1,436 /
1,435 across three runs — the most stable number in this whole exercise).

### B — backplane

| | base | head |
| --- | ---: | ---: |
| **per revision** | **1.62 s** | **1.19 s** |
| objects | 33,038 | 34,630 |
| documents | 40 | 40 |

Both revisions: **3.55 s**, peak RSS **~550 MB**.

## What this is replacing

Everything below is per revision, in the image, so the comparison is
like-for-like — which is precisely what M0 said this plan did not yet have.

| | A | B |
| --- | ---: | ---: |
| **Node parse + index** | **1.80 s** | **1.26 s** |
| `_extract_geometry` (M3 deletes this) | 5.48 s | 1.79 s |
| `build_semantic_index` (M3 reduces this) | 6.29 s | 7.89 s |

On A the parser does the geometry stage's job for **3.0× less**. On B it is
**1.4×** — a much weaker result, and B is the panel with real PCB churn, so
this is not a detail to bury. A's board carries 18,697 PCB geometry objects
against B's 1,595; the Python scan's cost scales with the file, the parser's
with the object count, and B is the case where they nearly meet.

The parser's own share is ~1.2 s of the 1.8 s; building the index on top costs
~0.42 s. The host measured the same parse at 639 ms, so the in-image penalty is
~1.9× — the same order M0 found on the Python stages, which is the reassuring
part: both sides moved together, and the ratio between them held.

## Bugs the tests caught

`scripts/ecad-parse.test.mjs` (13 cases, `node --test`, no dependencies). Three
of them failed first time, and all three would have shipped silently:

- **Net was read as `number | string`, per the type declaration.** The parser
  actually returns `{ number, name }` for pads, tracks and vias. Every copper
  object would have carried `net: undefined` — and `position_delta` groups by
  net, so one net would have fragmented into many.
- **Footprint fields were read from `properties`.** KiCad 8 moved them to
  repeated `(property …)` forms, which the parser surfaces as
  `properties_kicad_8`. Every footprint in every modern board would have had no
  refdes.
- **Properties were treated as addressable children of a symbol.** They carry no
  uuid, so the shallow hash replaced each with an empty string — making every
  property change, value or position, invisible on the symbol. Property
  attributes are one of the gaps this revamp exists to close; it would have
  closed it into a hash that could not see them.

The reconciliation check is the other half. Every parser collection is compared
against the objects indexed from it, plus the ones deliberately skipped for
having no identity, and the script exits non-zero on any shortfall. It balances
exactly on all four snapshots. Two board "groups" on A turn out to be KiCad's
auto-generated board-characteristics and stackup tables — a name, no id,
`members: [null]` — so nothing can address them and they are counted as
anonymous rather than lost.

## Open questions answered

**Does the parser fit the worker's memory ceiling on a 35 MB board?** Yes, with
an order of magnitude to spare: 1.44 GB against 12 GB. The question of
streaming versus raising the ceiling does not arise.

**Is per-revision parse caching worth its complexity?** Still probably not, but
the margin is narrower than the plan assumed. A cold compare pays ~3.6 s of
parsing, not the ~1.8 s the host figures suggested, against a 12.6 s
connectivity index on A. That is a quarter of the remaining cost rather than a
tenth. Recommendation: do not cache in M3; revisit once M3 shows what the
semantic index actually costs after components move out of it.

## Carried into M2

- **B is the panel that decides this.** A flatters the parser. Any claim about
  PCB change detection has to be made on B, which is also the only panel with
  PCB changes at all (A has 459 vs 0 — see M0).
- **Schematic pins have no position of their own.** The parser gives
  `{ number, uuid, alternate }`; position comes from the library symbol. The
  index currently inherits the parent symbol's centroid rather than inventing
  geometry. This is the same object class as M4's 16 unresolvable `SCH_PIN`s,
  and the two should be looked at together.
- **`kiidPaths` is an array, deliberately.** A symbol in a reused sheet is
  placed at several KIID_PATHs; taking the first is exactly what collapsed
  distinct components onto one change id before `35cd76f`.
