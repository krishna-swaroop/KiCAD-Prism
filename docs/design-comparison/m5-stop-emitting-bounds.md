# M5: stop emitting bounds

Milestone 5 of [the Design Comparison revamp](../DESIGN_COMPARISON_REVAMP.md).
Prism's PROJECT_DIFF is now identity-only. Geometry is measured from the
ecad-viewer scene after parser objects have been resolved and painted.

## Contract and preparation

The viewer boundary now distinguishes two inputs:

- `NativeKiCadItemChange` retains KiCad's strict required `bbox`.
- `PrismItemChangeInput` has an optional `bbox`; Prism sends none.

Prism explicitly loads comparisons with `diffFormat: "prism"`. Validation
therefore accepts identity-only changes without weakening the native KiCad
contract. Preparation creates pending identity targets first. After paint, the
viewer resolves source IDs, measures item bounds, and publishes only focusable
targets.

If an identity cannot produce painted bounds and has no native fallback, its
change-list entry remains visible with a diagnostic, but it is excluded from
the focus-target map. It can never synthesize `[0, 0, 0, 0]` or move the camera
to the origin.

## Artifact measurement

The production worker replayed JTYU-OBC
`80bb1444207b → 6419882841c0`, the pair that exposed the structured-layer
failure described below.

| PROJECT_DIFF measurement | M5 |
| --- | ---: |
| Documents | 8 |
| Change entries | 47,139 |
| Entries carrying `bbox` | **0** |
| Serialized bytes | 20,357,528 |
| Navigation entries | 47,139 |
| Diagnostics | 0 |

Adding only a minimal `[0,0,0,0]` field back to every entry would make the same
artifact 21,158,891 bytes. M5 therefore removes at least **801,363 bytes
(3.79%)** from this artifact; real numeric boxes would cost more.

## Runtime gate

The production Prism UI was exercised with auth disabled against the same
fixed eight-document gate used by M4. This time the backend emitted no bounds.

| Sample | Changes | Targets | Painted targets | Provided bounds | Non-focusable |
| --- | ---: | ---: | ---: | ---: | ---: |
| Seven JTYU-OBC schematic documents | 5,050 | 8,368 | 8,368 | 0 | 0 |
| SSD backplane PCB | 1,743 | 3,398 | 3,398 | 0 | 0 |
| **Total** | **6,793** | **11,766** | **11,766** | **0** | **0** |

All **12,702** visual records also used painted bounds. The fallback rate and
non-focusable rate are both **0%**.

Two direct selections verified the camera path:

- schematic `#PWR0182` focused measured bounds
  `[38.7147, 49.3776, 6.3906, 6.1659]` in 77 ms;
- removed PCB component `C222` focused measured bounds
  `[-78.45, -71.75, 3.0, 1.4]` in 16.8 ms.

Neither selection reparsed a source or used a host-provided box.

## Worker failure found during M5

Job `f4627285-8494-4ffa-9246-d21cf4f17629` did not actually lose its lease.
Its child log showed `TypeError: unhashable type: 'dict'` while normalizing a
KiCad layer. Some parser graphics expose a structured layer object
`{name, knockout}` rather than a string. The comparison assembler attempted to
place that object in a Python set.

Layer values are now normalized to their names at the Node parser boundary and
again at the Python comparison boundary. The worker supervisor also recognizes
that a same-fence child may briefly remain alive after the job runner records a
terminal state; it waits for normal exit instead of logging `lease_lost` and
sending SIGTERM.

The exact failed pair was replayed as job
`92307088-46ad-4427-b902-782cff0be4bf`. It completed on attempt 1 in 15 seconds
with no lease loss and produced the zero-bbox artifact measured above.

## Validation

- ecad-viewer: 38 browser tests passed, including painted identity-only focus
  and non-focusable unresolved identity integration tests.
- Prism frontend: 21 focused comparison tests passed; production build passed.
- Backend: 56 document-diff, comparison, and worker tests passed.
- Node parser/delta adapters: 22 tests passed.
- Real UI gate: all 11,766 targets and 12,702 visuals used painted bounds.

M5 is complete. Prism no longer emits coordinates in PROJECT_DIFF, and native
KiCad input remains strict.
