# M4: viewer identity resolution

Milestone 4 of [the Design Comparison revamp](../DESIGN_COMPARISON_REVAMP.md).
This milestone closes the viewer-side identity and bounds gate before Prism
stops emitting compatibility bboxes in M5.

## What changed

The parser already contained the missing schematic pins. The gap was in
`ecad-viewer`'s paint index: `SchematicSymbol.items()` exposes pins for the
active unit, while the parsed symbol's full `pins` collection also contains
valid UUID-bearing instances for the other units. The paint index now walks
that full collection and resolves an identity-only pin to its owning painted
symbol.

The first required PCB measurement exposed two more viewer boundary gaps:

- modern pads carry `(uuid ...)`, but the viewer `Pad` model followed its
  legacy type declaration and retained only `tstamp`, which is empty in these
  files;
- layer bbox maps are keyed by top-level document items. Nested pads, zones,
  and graphics therefore resolve through their top-level painted footprint,
  while top-level items retain their own target;
- a hidden board layer still has scene geometry. Bounds lookup no longer
  discards a painted bbox merely because that layer is not currently
  composited.

These changes stay in the viewer. Prism continues to provide compatibility
bboxes until M5, but none were used by the measured targets below.

## Measurement

The final production bundle was exercised through Prism's real comparison UI
against fixed commits. Seven schematic documents use JTYU-OBC
`8f71cfea2b2c → 4b0a39a7f841`; the PCB document uses
SSD_XX_200_EPS_BACKPLANE `05a89dd6b445 → 934be891830e`.

| Document | Kind | Changes | Source resolved | Targets | Provided-bbox fallbacks | `item-not-found` |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `B2B_Conn.kicad_sch` | SCH | 329 | 329 | 406 | 0 | 0 |
| `USB.kicad_sch` | SCH | 801 | 801 | 999 | 0 | 0 |
| `S32G3_ETH_PCIe.kicad_sch` | SCH | 1,826 | 1,826 | 3,236 | 0 | 0 |
| `S32G3_Misc.kicad_sch` | SCH | 29 | 29 | 58 | 0 | 0 |
| `S32G3_NVM_Memory.kicad_sch` | SCH | 180 | 180 | 221 | 0 | 0 |
| `OBC_Temperature_Sensors.kicad_sch` | SCH | 208 | 208 | 344 | 0 | 0 |
| `S32G3_Boot_LS_Interfaces.kicad_sch` | SCH | 1,677 | 1,677 | 3,104 | 0 | 0 |
| `SSD_XX_200_EPS_BACKPLANE.kicad_pcb` | PCB | 1,743 | 1,743 | 3,398 | 0 | 0 |
| **Total** |  | **6,793** | **6,793** | **11,766** | **0** | **0** |

The aggregate fallback-bounds rate is **0%**. All **12,702** visual records
also resolved viewer-derived bounds, with zero reference-side or
comparison-side bounds failures.

Before the fix, the known schematic sample had 16 `SCH_PIN`
`item-not-found` failures. The first PCB run resolved only 606/1,743 source
objects and used caller-provided bounds for 2,274/3,398 targets (66.92%);
1,137 identities were missing, all from the modern-pad UUID boundary. Both
type buckets are zero in the final run.

The viewer still reports source-id ambiguity and duplicate-change-target
diagnostics in reused hierarchical sheets (17 and 700 respectively across the
sample). Those identities do resolve and every affected target has painted
bounds; they are not `item-not-found` or fallback failures. They remain useful
diagnostics for the later comparison-session consolidation rather than a
reason to hold M5.

## Validation

- `ecad-viewer-app`: 34 browser tests passed.
- The production ecad-viewer bundle built with zero warnings and zero errors.
- Prism's TypeScript and Vite production build passed.
- The eight-document runtime gate passed at 0% fallback.

M4 is complete. M5 can remove backend-emitted compatibility bounds without
losing focusability in the sampled schematic or PCB documents.
