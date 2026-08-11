# Phase 0B: identity and bounds resolution, measured

Phase 0B of [the revamp plan](../DESIGN_COMPARISON_REVAMP.md). The plan said
measure before deleting anything. This is the measurement.

## Setup

| | |
| --- | --- |
| Project | `SSD_XX_200_EPS_BACKPLANE` |
| Base | `05a89dd` "Remap BMB signals, added two 1gig phy on board" |
| Compare | `934be89` "power sequencing fix, tm_tc mux adc mapping" |
| Document | `Subsheets/1000BaseT_PHY.kicad_sch` (composite, cold cache) |
| Viewer | ecad-viewer `df92ecf`, clean tree, reproducible bundle |
| Scale | 1,603 schematic / 459 PCB / 154 BOM changes, 658 groups |

## Result

```
changes                   204
sourceResolved            204     100%
targets                   102
targetsWithPaintedBounds  102     100%
targetsUsingProvidedBounds  0
fallbackBoundsRate          0
visuals                   255
visualsWithPaintedBounds  255     100%   (0% before the generator fix below)
ambiguousSourceIds          0
duplicateChangeTargets    102     100%   (see finding 2)
```

## Finding 1 — the constant boxes are never used for focus

**`fallbackBoundsRate: 0`.** Every one of the 102 selection targets resolved
exact painted bounds from the scene. Not one camera focus used the backend's
5.08 mm symbol box.

Identity resolution was equally clean: 204/204 source ids resolved, zero
`missing-source-id`, zero `item-not-found`, zero ambiguity.

This answers the question Phase 0 existed to ask. The backend can stop emitting
bounds — Phase 1 is unblocked on that point.

The caveat is honest: this is one schematic document on one project. It should
be repeated on a PCB document and on a project with hierarchical sheet
instances before the bounds emission is deleted, because those are where uuid
resolution is most likely to be fragile.

## Finding 2 — per-visual bounds were never resolved at all *(fixed)*

The first run reported `visuals: 255, visualsWithPaintedBounds: 0` — every
target resolved, every visual failed. That contradiction was a real bug:

```ts
const item_bounds = viewer.layers.query_item_bboxes(item);  // generator
native_bounds.push(...item_bounds);
visual_bounds.push(...item_bounds);   // exhausted -- always empty
```

`query_item_bboxes` is a generator. The first spread consumed it; the second
received nothing. So `target.bounds` was correct while **every `visual.bounds`
silently kept whatever the caller supplied** — for Prism, the constant box.
The bug survived because the camera framed the right area; only per-visual
extents were wrong.

Fixed in ecad-viewer `df92ecf` by materializing the generator once. After the
fix: 255/255. `boundsFailuresBySide` is `{reference: 0, comparison: 0}`.

That last number also **refutes a hypothesis in the plan**. Reference-side
visuals were expected to fail for want of a reference scene; they do not,
because `build_diff_presentation` retains changed reference items in the
composite scene, and every reference visual here belongs to a change. The
plan's §3 argument stands on the *unchanged* reference objects that are absent
— not on changed ones.

## Finding 3 — reused hierarchical sheets collapse distinct items onto one id *(fixed for components)*

> **Correction.** This finding was first written up as "the backend emits each
> changed component twice". That was wrong. The change records are not
> duplicated; their *ids* collide. The corrected analysis follows.


**`duplicateChangeTargets: 102` out of 102 targets.** Every target was built
from two or more changes sharing a side and source id, so the presentation
index — which assigns rather than appends — discarded the earlier resolution
every time.

Tracing it into the artifact:

| | |
| --- | --- |
| Change entries across all 19 documents | **3,989** |
| Unique change ids | **2,340** |
| Inflation | **1.70×** |
| Worst document (`LVSM.kicad_sch`) | 284 entries for 41 ids — **6.9×** |
| `1000BaseT_PHY.kicad_sch` | 204 entries for **51** unique symbols — 4× |

The navigation sidecar records the duplication in plain sight:

```json
"sch-comp-changed-cmp:72b6dc52…": {
  "changeId":  "/01f6c458-c7c6-453e-b528-f72664fb7651",
  "changeIds": ["/01f6c458-…", "/01f6c458-…"]
}
```

and two *different* prism ids resolve to the same component uuid:

```
/01f6c458-… -> ['sch-comp-changed-cmp:72b6dc52…', 'sch-comp-changed-cmp:233d4f83…']
```

### Root cause

The two records are **different components**, R680 and R688, and both are real:

```
R688  cmp:72b6dc52…   sheetInstancePath: /SJA_EthernetSwitches/1000BaseT_PHY_B/
R680  cmp:233d4f83…   sheetInstancePath: /SJA_EthernetSwitches/1000BaseT_PHY_A/
                      symbolUuid:        01f6c458-c7c6-453e-b528-f72664fb7651
```

`Subsheets/1000BaseT_PHY.kicad_sch` is a **reused hierarchical sheet**. A reused
sheet is one file, so every instance of it holds the very same symbol UUIDs.
KiCad identifies a symbol by `sheetInstancePath + symbolUuid` — the KIID_PATH —
and the UUID alone is ambiguous exactly as often as a sheet is instantiated
more than once. `_component_sources` returned only `symbolUuid`, so
`_item_change` emitted `/{symbolUuid}` and two distinct components collapsed
onto one id.

This is the `instancePath` gap the design review predicted: *"schematic
identity is `projectPath + KIID_PATH`, not filename or terminal UUID alone."*
It was already causing a live correctness bug, not just a future risk. The
viewer's presentation index assigns rather than appends, so of two components
sharing an id only the last stayed resolvable.

### Fix

`document_diff_service._change_id` now emits the full KIID_PATH when the target
carries a sheet instance path (`sheetPath`, with `page` and the change's own
`page` as fallbacks). The viewer resolves a native item from the last KIID_PATH
segment, so both instances still name the one symbol the file actually paints —
correct, because there is only one.

Measured on the same project, schematic changes only:

| | before | after |
| --- | ---: | ---: |
| Inflation, unique `(id, sourceSide)` | 1.311× | **1.021×** |
| `1000BaseT_PHY.kicad_sch` | 102 roots / 51 ids | **102 / 102** |
| Documents with colliding ids | 18 of 18 | **7 of 18** |
| Colliding `SCH_SYMBOL` entries | many | **0** |

### Residual: labels and wires in reused sheets

121 entries across 7 documents still collide — `SCH_LABEL` (109), `SCH_LINE`
(8), `SCH_PIN` (4). All come from the **net** diff path, and none can be fixed
the same way: a net's `schematicRefs[].page` in the semantic index is already
the native file path, so unlike a component's there is no sheet instance path
to recover.

```
sch-net-changed-net:a8783784…  EBP_LPBM_ADC_P1V8_MAIN_V_TM  ─┐ same label uuid,
sch-net-changed-net:47b95e3f…  EBP_LPBM_ADC_P1V8_RED_V_TM   ─┘ two sheet instances
```

Closing this requires the semantic index to record sheet instance paths on net
schematic refs, which is a `semantic_index_service` / kicad-monkey change rather
than an adapter change. Worst remaining case is `LPBM.kicad_sch` at 3.57×.

## Repeat on a second project (JTYU-OBC)

The plan required repeating this before deleting anything, on the grounds that
one document on one project proves little. It did not hold.

| project | document | changes | resolved | targets | fallback |
| --- | --- | ---: | ---: | ---: | ---: |
| backplane | `1000BaseT_PHY.kicad_sch` | 204 | 204 | 102 | 0 |
| JTYU-OBC | `USB.kicad_sch` | 590 | 590 | 936 | 0 |
| JTYU-OBC | `S32G3_NVM_Memory.kicad_sch` | 138 | 138 | 185 | 0 |
| JTYU-OBC | `OBC_Temperature_Sensors.kicad_sch` | 122 | 122 | 213 | 0 |
| JTYU-OBC | `B2B_Conn.kicad_sch` | 243 | **227** | 350 | **16** |
| **total** | | **1,297** | **1,281** (98.8%) | **1,786** | **16 (0.90%)** |

So the fallback rate is **0.90%, not 0**. Four of five documents are perfectly
clean; all 16 failures are in one document and every one of them is a
`SCH_PIN`.

The pins are not missing from the design. All 102 pin UUIDs in `B2B_Conn`
were checked against the snapshot of their own revision and **all 102 are
present in the file**. The viewer's parsed model simply does not expose them
as indexable paint items in this document, while it does in the other three.
The likely mechanism is that a schematic `PinInstance` only materializes when
the owning library symbol still defines that pin — so identity breaks exactly
when a symbol's pin set changes, which is precisely when the diff matters
most. That should be confirmed in the viewer before anything depends on it.

### The KIID_PATH fix, verified on a second project

JTYU-OBC reuses sheets heavily, so it is a stronger test than the backplane:

| | before | after |
| --- | ---: | ---: |
| Inflation (unique `id`+`side`) | 1.255× | **1.002×** |
| Documents with colliding ids | 9 of 12 | **2 of 12** |
| Colliding `SCH_SYMBOL` | 20 | **0** |
| Ids carrying a KIID_PATH prefix | 0 | **1,281 of 2,255** |

Residual is 8 `SCH_LABEL` entries. This project's net refs *do* carry sheet
paths, so it lands far closer to 1.0 than the backplane's 1.021×; the residual
there was a semantic-index gap specific to that project's net records.

**Process note.** The compare pipeline runs in `prism-worker`, not `backend`.
Rebuilding only the backend image left the worker on old code and produced a
measurement that showed the fix doing nothing. Rebuild both.

## What this changes in the plan

- **Phase 1 (digest, shadow mode) is unblocked. Phase 2 (stop emitting bounds)
  is not.** At 0.90% the fallback is low but real, and it is not randomly
  distributed — it is entirely `SCH_PIN` identity failure. Phase 1 emits both
  sidecars and changes no behaviour, so it is safe now. Phase 2 must wait until
  pin resolution is understood, or 1 in 100 targets loses its ability to focus.
- **A PCB document has still not been measured.** Neither project offered a
  commit pair with real PCB churn (JTYU-OBC's only `.kicad_pcb` commit changed
  STEP files and produced an empty diff). The backplane's 459 PCB changes are
  the place to do this.
- **Ambiguity is not the problem; hierarchical identity is.** The plan worried
  that `[0]`-of-many silently picks wrong. Measured ambiguity is zero. The real
  hazard was ids that omit the sheet instance path, which is precisely the
  `instancePath` field revision 2 added to the digest schema — now confirmed as
  load-bearing rather than defensive.
- **§3's two-scene argument needs restating.** Reference-side *changed* items
  paint fine. The argument rests on unchanged reference objects being absent
  from the composite scene, which is still true and still blocks a faithful
  Side-by-side left pane.
