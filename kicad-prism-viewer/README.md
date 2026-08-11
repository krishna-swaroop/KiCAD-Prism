# KiCad 3D Viz Dev

WebGPU-first, CAD-neutral visualisation prototype inspired by Wavenumber's
public 3D visualisation architecture.

This directory intentionally stands apart from KiCAD-Prism. Prism integration
is a future adapter; the runtime is a standards-based semantic glTF scene.

## Layout

- `references/`: cloned Wavenumber repositories for local code/reference.
- `pipeline/`: Python topology compiler, semantic glTF scene writer, and HTML
  exporter.
- `viewer/`: WebGPU viewer and bundled standards-based glTF loader.
- `samples/`: generated project topology, semantic glTF tiles, and standalone HTML.
- `tests/`: Python contract/unit tests.
- `docs/`: implementation notes and reference repository SHAs.

## Quick Start

Generate the USB-PD fixture and standalone viewer:

```bash
bash scripts/build_usb_pd_sample.sh
```

Open `samples/usb-pd-trigger-board/viewer.html` through a local server in a
browser with WebGPU support. WebGPU is the only production renderer.

Run tests:

```bash
/Users/Swaroop/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  -m unittest discover -s tests
```

Install the JavaScript tooling and rebuild the embedded viewer after
dependency changes:

```bash
npm install
npm run build:viewer
```

## Current Scope

Implemented now:

- `topology_model_a0` backed by `kicad_monkey`, including real board stackup.
- semantic copper generation from `KiCadDesign.to_pcb_ir()` with saved-zone
  validation and analytic track, arc, pad, via, and zone contours.
- tiled `prism.semantic_gltf_a0` GLBs using `EXT_mesh_features`,
  `EXT_meshopt_compression`, and `KHR_mesh_quantization`.
- `_FEATURE_ID_0` net ownership and `_FEATURE_ID_1` source-object ownership.
- progressive WebGPU loading of selected copper layers.
- exact click-to-net picking for tracks, zones, pads, vias, and plated barrels.
- perspective orbit, board-drag pan, damped navigation, axis views, and fit.
- synchronized multi-layer comparison using scissored WebGPU viewports.
- material-preserving component rendering with batched material draws.
- quadratic exploded-stackup controls with stretched conductive barrels.
- render-bundle caching for large stable draw sets.

KiCad GLB is used only for board context and component models. Copper
ownership is assigned from PCB IR before tessellation; no aggregate or per-net
copper GLB is generated. Surface copper is the production render LOD at its
real stackup height. Via and plated-hole records provide authoritative
conductive spans for later solid inspection and FEM meshing. Build inputs are
cached under `samples/.cache/`.
