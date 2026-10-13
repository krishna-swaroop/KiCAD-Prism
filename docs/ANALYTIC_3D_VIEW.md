# Analytic 3D board view (experimental)

The semantic viewer can draw a board from exact geometry instead of triangle
meshes. Copper, laminate, plated holes, solder mask, silkscreen and paste are
evaluated per pixel from the shapes a `kicad_monkey` materialization pack
describes (disks, capsules, rounded rectangles, swept paths, polygons with
holes), so edges stay exact at any zoom and nothing is tessellated ahead of
time.

**Status: opt-in and not yet used by the 3D tab.** The 3D tab still renders
the mesh scene. A host turns the analytic board on by handing the viewer a
pack (see [Element API](#element-api)); nothing in the Prism worker produces
packs yet. Read [Pending work](#pending-work) before relying on it.

## Pipeline

```text
.kicad_pcb (+ .kicad_pro)
    │  kicad_monkey analytic materializer (Rust)
    ▼
kicad_monkey.materialization.a0 pack (.kmpack)
    │  vendored kicad-monkey-analytic WASM: open, validate, lower slices
    ▼
analytic renderer (WebGPU, viewer/src/analytic-*.js)
```

The materializer resolves KiCad's physical intent once: where the material is,
which slice of the stack it belongs to, its net, and the KiCad item it came
from. It does not carry KiCad object kinds into the geometry. The pack's
header holds the stack, nets and binding table; its chunks hold the add and
subtract operations per slice and the holes. The viewer reads only the pack.
The mesh scene still supplies components, net names, features (for selection)
and the copper colours, so the pack and the mesh bundle must come from the
same board revision.

The vendored WASM and its pinned revision are described in
[Dependency identity](DEPENDENCIES.md#analytic-pack-wasm-viewer-spike).

## What it draws

| Part of the board | Drawn as |
|---|---|
| Copper, every layer | Slabs of their stackup thickness with exact side walls; holes cut through them. |
| Laminate | One slab per dielectric layer, in its stackup colour (KiCad's named laminate colours or `#RRGGBB`; FR4 natural when unstated). Board edges are exact per layer and follow the stack when it separates. |
| Plated edges | When the stackup sets `edge_plating`, the whole board outline is drawn as copper (KiCad records no plated-edge geometry). |
| Plated and unplated holes | Exact barrels: round drills and slots, plating, layer spans, back-drills. Unplated holes are bare drill walls in the laminate colour. |
| Via protection (IPC-4761) | Filled vias show resin flush with both ends, plugged vias resin recessed from the plugged side, capped vias a copper cap, covered vias a cover in the mask colour. Tenting follows the mask openings. |
| Castellated holes | The barrel is cut by the board edge it sits on; only the board's side stands. |
| Solder mask | Conformal: over copper at the stackup's mask face, over bare laminate one copper thickness lower, with a coated step between them. Openings come from the board file (below). |
| Silkscreen | On the mask, following its relief; never printed in a mask opening. |
| Paste | On the pads' copper. |

Mask openings follow KiCad's own rules:

- A pad gets an opening only when its layer list includes `F.Mask` or `B.Mask`,
  so removing that layer covers the pad.
- The margin resolves from the pad, then the footprint, then the board setup,
  clamped so the opening never becomes negative. Older boards' `0` means
  "inherit".
- Opening shapes grow as KiCad plots them (a grown rectangle becomes a rounded
  rectangle; custom pads are offset).
- Via tenting, covering, plugging, filling and capping are read per via and
  fall back to the board setup, as KiCad's `FROM_BOARD` modes do. Boards older
  than format 20250228 did not write covering, plugging, filling or capping,
  so an absent one is off there.
- Tracks exposed on a mask layer, and graphics, text and zones drawn on the
  mask layers, open the mask.

Everything the mesh 3D view offers on one board also works on the analytic
board: selection and net glow, net isolation, stackup separation, realistic
colours, insets and the per-side layer toggles described in
[Project workflows](PROJECT_WORKFLOWS.md#pcb-3d-layers). Overlays colour each
operation by a value or the board by a sampled field.

## Element API

These members exist on `<prism-semantic-viewer>` in its one-board mode
(`frontend/src/types/prism-semantic-viewer.d.ts` declares them):

| Member | Purpose |
|---|---|
| `loadAnalyticPack(bytes, { wasm, toleranceNm })` | Open a pack and draw the board from it in place of the mesh copper and board layers. `wasm` is the URL of `kicad-monkey-analytic.wasm`. Resolves to the board's stats. |
| `unloadAnalyticPack()` | Return to the mesh scene. |
| `setAnalyticOverlay(overlay)` | Colour operations by value, or the board by a field raster; `null` clears it. |
| `analyticAt(clientX, clientY)` | The operation, binding and feature under a point. |
| `analyticStats()` | Slices, operation counts, lowering time and GPU memory. |

The WASM loads only when `loadAnalyticPack` is called.

## Requirements and cost

The analytic board needs WebGPU with the `depth32float-stencil8` feature:
subtracts, regions and the conformal mask are resolved in the stencil buffer.
On an adapter without it, only the add shapes draw (no holes cut, no zones),
so a host should keep the mesh scene there.

On openswitch-10x10g-carrier at 2560x1600 with 4x multisampling, GPU time per
frame is about 5.3 ms for the loaded view and 10.1 ms zoomed in, against
2.8 ms and 6.8 ms for the mesh scene. The analytic board draws more than the
mesh does (copper thickness and walls, the conformal mask, exact barrels).
Lowering the pack takes about 260 ms in the browser and the board uses about
33 MB of GPU memory. `kicad-prism-viewer/tests/browser/analytic/README.md`
describes how to measure it.

## Pending work

- **No producer in Prism.** The worker does not materialize packs and the 3D
  tab does not load them. Until both exist the analytic board is reachable only
  through the element API and the browser harness.
- **One-board view only.** System scenes and the flat 2D layer view keep the
  mesh scene.
- **Components stay meshes.** Component bodies come from the KiCad 3D models as
  before.
- **Materializer source.** The materializer is not in an upstream
  `kicad_monkey` release. The vendored WASM is built from a pinned revision of
  the `krishna-swaroop/kicad_monkey` fork; upstream issue 20 tracks the shared
  contract.
- **Not modelled:**
  - mask margins from custom rules in `.kicad_dru`;
  - `solder_mask_min_width` web merging, which is a fabrication step;
  - surface-finish thickness (KiCad stores the finish type only; its colour is
    applied);
  - barrel plating thickness, which KiCad does not store and is drawn at
    25 µm (the IPC class 2 minimum average);
  - edge-connector bevels, since KiCad records the bevel flag but not the edge;
  - copper of a castellated pad beyond the board outline, which is not
    clipped.
- **Differs from the mesh scene by design.** The laminate is drawn in the
  stackup colour, while the mesh body takes a darkened mask colour, so through
  the translucent mask about 9% of a top-down view differs in shade.

## Verification

```bash
cd kicad-prism-viewer
npm run test:viewer
node tests/browser/analytic/run.mjs --board <name>=<semantic bundle dir> \
  --pack <board.kmpack> --out <output dir> --scale 2
```

The browser harness captures the mesh and analytic boards from the same
cameras, compares them, exercises overlays, glow and picking, and fails on
page errors or on analytic layers that draw nothing. `--live` serves an
interactive page and `--perf` measures GPU time. Packs are written with
`cargo run --release -p kicad-monkey-core --example materialization_pack --
<board.kicad_pcb> <out.kmpack>` in the pinned `kicad_monkey` checkout.
