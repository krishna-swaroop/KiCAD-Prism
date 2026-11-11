# KiCad Prism viewer

The WebGPU board viewer Prism serves as `<prism-semantic-viewer>`. It draws a
board from its design bundle's analytic model (ADR amendment V2): the
`kicad_monkey` materialization pack, lowered to slices in workers by the
`prism-kicad` WASM build, the stackup projection, and the parts' GLB.

With `mode="system"` it draws every board of a system scene at once, each from
its own analytic bundle, placed by the host's `prism.system_scene.a0`
descriptor, with board labels, per-board layers and stackup separation, net
emphasis across boards, an assembly explode and a move gizmo. No Prism page uses
`mode="system"` since System Builder was removed (2026-10-23); it stays for its
re-scope on `feature/system-builder-v3`.

The mesh pipeline that came before it (the Python topology compiler, its
semantic glTF tiles and the standalone viewer page) was removed at System
Builder v2's stage 0 (`docs/architecture/adr-system-builder-v2.md`).

A host can also lay a simulation mesh over the board: a `prism.sim.mesh-pack`
(`viewer/src/mesh-pack.js`), drawn by `viewer/src/mesh-overlay.js` through
the element's mesh members (`loadMeshPack`, `setMeshPack`, `setMeshStyle`,
`meshElementAt`, `meshWorst`, `frameMeshElement`, …; `viewer/src/mesh-view.js`).
To look at meshes over a board, start the engineering host page:

```bash
npm run mesh:live -- --board <design.prism> --pack <dir of *.meshpack>
```

See `tests/browser/mesh/README.md`.

## Layout

- `viewer/src/`: the element (`prism-semantic-viewer-element.js`), the board
  view (`main.js`), the analytic renderer and its worker, and unit tests
  (`*.test.mjs`).
- `viewer/vendor/prism-kicad-wasm/`: the analytic WASM build the element loads.
- `tests/browser/`: browser checks: the pixel-diff and frame-time harness
  (`pixel-diff/`), inset views, shader variants, analytic runs, and the mesh
  overlay's host page and check (`mesh/`).
- `docs/`: implementation notes.

## Build and test

```bash
npm ci
npm run test:viewer
npm run test:harness
npm run build
```

`npm run build` writes `dist/` and synchronizes the element, its lowering
worker and the WASM into `frontend/public/`, updating the element's digest in
`frontend/index.html`. Commit those generated files with the source change.

Renderer changes must leave the 3D view pixel-identical unless the change is
meant to alter it. Check this with the headless pixel-diff harness (Node 24 and
a local Chrome; see `tests/browser/pixel-diff/README.md`).

New render features never edit a base shader. They plug into the hook markers
in each shader source as feature variants (`viewer/src/shader-variants.js`,
`Renderer.setShaderFeatures`). With no feature on, the shaders stay
byte-identical; `viewer/src/shader-variants.test.mjs` pins their hashes. Check
that variants compile on a real GPU with:

```bash
node tests/browser/shader-variants/check.mjs
```
