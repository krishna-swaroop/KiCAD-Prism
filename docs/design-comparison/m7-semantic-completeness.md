# M7: semantic completeness

Milestone 7 of [the Design Comparison revamp](../DESIGN_COMPARISON_REVAMP.md)
closes the semantic and identity gaps measured in M0–M6.

## What changed

### Property attributes survive the complete pipeline

The ecad-viewer parser adapter now projects every schematic property with:

- value
- position and rotation
- visibility
- text effects

The Node delta emits the old and new attribute payload separately. Prism keeps
attribute-only edits as a visible `<property> attributes` field, so moving,
hiding, or restyling a field no longer produces a misleading unchanged
value-to-value row.

Native edits that change an authored parser hash without changing position,
identity, net, or a named property are classified as `content-changed`. This
covers pad shape, stroke, fill, zone rules, and similar native fields without
leaving an `unclassified` bucket.

### Hierarchy-aware connectivity identity

kicad-monkey remains the connectivity owner. Its concrete schematic-instance
model is projected into the semantic index as:

- `sheetInstances[]`
- `buses[]` for bus wires, entries, and aliases
- `schematicRefs[].sheetInstancePath` and native `page` on each net

A reused schematic file contributes one ref for every concrete KIID path.
Prism carries that path onto wire, label, junction, and terminal visual
targets. Both target-deduplication layers include the path in their identity,
so one shared source UUID can legitimately resolve in multiple hierarchy
instances.

Parser changes and semantic net changes can point at the same native item. The
PROJECT_DIFF assembler now claims `(document, KIID_PATH, side)` once and makes
both Prism changes navigate to that canonical entry. This removes actual
viewer-index overwrites without discarding either semantic change.

### Power symbols are connectivity

Symbols from the KiCad `power:` library, including `power:PWR_FLAG`, are no
longer projected into components or BOM rows. Their object changes are primary
Nets changes, using the Value property (or library name fallback) as the
connectivity label. The native item remains a schematic symbol for selection
and painting.

## Coverage

The four fixed snapshots now contain 1,261 first-class records that were
previously outside the semantic projection:

| input | revision | sheet instances | bus records |
| --- | --- | ---: | ---: |
| A — JTYU-OBC | `8f71cfe` | 28 | 133 |
| A — JTYU-OBC | `4b0a39a` | 28 | 161 |
| B — backplane | `05a89dd` | 41 | 415 |
| B — backplane | `934be89` | 41 | 414 |

Bus records comprise physical bus wires, bus entries, and aliases. The Node
object index continues to reconcile every addressable parser collection.

Across the fixed object deltas:

| input | base objects | compare objects | modified | unclassified | explicit content changes |
| --- | ---: | ---: | ---: | ---: | ---: |
| A | 43,715 | 44,454 | 2,975 | **0** | 4 |
| B | 33,744 | 35,481 | 2,752 | **0** | 54 |

## Collision gate

Collision identity is scoped the same way as the viewer:
`(document path, change id, source side)`. The old benchmark accidentally
compared ids globally across documents, where the same file-local UUID is
allowed to recur; M7 corrects that measurement.

| input | document entries | unique scoped ids | duplicate targets | diagnostics |
| --- | ---: | ---: | ---: | ---: |
| A | 6,089 | 6,089 | **0** | 0 |
| B | 7,634 | 7,634 | **0** | 0 |

Both fixed inputs have an inflation ratio of exactly **1.0000**.

## Production replay

| input | initial ready | total ready | schematic changes | PCB changes |
| --- | ---: | ---: | ---: | ---: |
| A | 5,636 ms | 5,833 ms | 5,069 | 0 |
| B | 7,578 ms | 7,860 ms | 4,051 | 1,699 |

The new `project-schematic-instances` projection was 18.6 ms on A and 74.3 ms
on B, below 1% of total ready time in both runs.

## Validation

- Prism backend: 436 tests passed, 29 skipped.
- M7-focused backend: 90 tests passed.
- Node parser adapter/delta: 23 tests passed.
- Prism frontend: 109 tests passed.
- Frontend lint and production build passed.
- Both fixed production comparisons: zero unclassified changes, zero duplicate
  native targets, and zero document-diff diagnostics.

The upstream ecad-viewer parser repository's full serialization suite is not a
clean gate in this workspace: it has existing `fields_autoplaced` round-trip
failures and its ERC cases require `kicad-cli` on `PATH`. M7 does not modify
that repository; the parser adapter tests exercise the fields and object kinds
used by Design Comparison directly.

See [the M7 performance follow-up](m7-performance-followup.md) for the
in-container upstream/local dependency comparison, Cynthion issue 78 replay,
revision-concurrency measurement, and the subsequent parser optimization.
