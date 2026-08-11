# Geometry sidecar: consumer audit

Phase 0B of [the revamp plan](../DESIGN_COMPARISON_REVAMP.md). Enumerates
every reader of `_extract_geometry` output so the replacement digest schema is
provably sufficient before anything is deleted.

## What the sidecar actually contains

`_extract_geometry` returns `{"schematic": {source_id: entry}, "pcb": {...}}`.
Fields vary by kind:

| kind | fields |
| --- | --- |
| symbol | `kind`, `page`, `x`, `y`, `bounds` |
| pin | `kind`, `page`, `x`, `y`, `bounds`, `parent_source_id` |
| wire / graphic / label / junction | `kind`, `page`, `points`, `bounds`, `x`, `y` |
| track (`segment`) | `kind`, `layer`, `net`, `width`, `points`, `bounds` |
| arc | as track, three points |
| via | `kind`, `layer`, `net`, `x`, `y`, `radius`, `bounds`, `layers` |
| zone | `kind`, `layer`, `net`, `points`, `bounds` |
| footprint | `kind`, `layer`, `net`, `lib_id`, `reference`, `x`, `y`, `rotation`, `bounds` |

Every entry then passes through `_enrich_geometry`, which adds `source_id`,
and — via the semantic index — `semantic_id`, `reference` and `net`.

`points` is the bulk of the 28.96 MB and is **never read directly**. It exists
only to compute `bounds` and the centroid `x`/`y` in the same function.

## Consumers

### Backend

| Site | Reads | Purpose |
| --- | --- | --- |
| `document_diff_service._document_path` | `page` | Resolves the loadable document path, **before** any other candidate. This is what corrects a human hierarchy string into a real `.kicad_sch`. |
| `document_diff_service._item_change` | `kind` | Maps to KiCad `typeName` (`SCH_SYMBOL`, `PCB_FOOTPRINT`, …). |
| `document_diff_service._item_change` | `bounds` | Becomes `KiCadItemChange.bbox`; `[0, 0, 0, 0]` when absent. |
| `document_diff_service._target_geometry` | keyed by `source_id`, then `parent_source_id` | Resolves a visual target to its entry, falling back to the parent's — this is how a pin inherits its symbol's page. |
| `design_compare_service` group builder | `x`, `y` | **`position_delta`**: mean centroid movement per group, reported as `dx`/`dy`/`distance`. |
| `design_compare_service` group builder | `bounds` | Group-level union bounds. |

### Frontend

| Site | Reads | Purpose |
| --- | --- | --- |
| `comparison-presentation-shell.tsx:157` | `geometry.bounds`, `oldGeometry.bounds` | Per-side visual bounds for the `setRevisionDiffPresentation` path — the path the revamp deletes. |
| `revision-sources.ts:246` | `geometry.page`, `oldGeometry.page` | Document resolution, same role as the backend's. |
| `revision-sources.ts:256` | `geometry.bounds`, `oldGeometry.bounds` | Side-by-side focus, including the deliberate cross-side fallback so selecting an addition still moves the base pane. |
| `design-comparison-workspace.tsx:136` | `geometry.semantic_id` | Change grouping identity, after `semantic_id` / `reference` / `net`. |

### Not consumers

- `semantic_visualizer_service` "geometry" is 3D GLB asset output. Unrelated.
- No API router, export path or headless consumer reads the sidecar. It is
  reachable only through the change records the compare response embeds, and
  `revision.json` itself is a server-side cache artifact.

## Findings

**1. `page` and `kind` are load-bearing identity, not geometry.** Already
folded into revision 2 of the plan as `documentPath` and `kind`.

**2. `parent_source_id` is a resolution fallback, not decoration.**
`_target_geometry` uses it to resolve a child to its parent's entry. The digest
keeps it.

**3. The digest must keep a centroid, and revision 2 understated this.**
Revision 2 gave `at` only to components and footprints. But `position_delta`
is computed for *any* group — and tracks group by `net`, so "net `VBUS` shifted
0.4 mm" is a real, currently-shipping output. Dropping `x`/`y` for non-component
kinds would silently regress it.

The fix is cheap and does not reintroduce the size problem: keep the centroid,
drop the `points` arrays that produced it. Two floats per object, ~16 bytes,
against the point lists that account for most of the 28.96 MB. So the digest
carries `centroid` universally, and the fuller structured digest
(`at`, `rotation`, `mirror`, `layer`, `netId`) for components and footprints
where classification matters.

**4. `bounds` has exactly two remaining backend readers**, and both are on
their way out: `KiCadItemChange.bbox` (Phase 2 resolves this in the viewer) and
the group union (which the viewer computes from painted bounds anyway). No
consumer needs backend-authored bounds for its own sake.

**5. Nothing outside the browser reads geometry.** The "headless consumers"
risk in the plan is closed: there is no such consumer today. The risk that
remains is version skew — an older frontend bundle against a newer backend —
which the `unreported` flag in the resolution report already distinguishes.
