# Analytic board evidence run

Draws one board from its kicad_monkey materialization pack in place of the
mesh layers (dielectrics and their walls, copper, barrels and drill walls,
solder mask, paste, silkscreen), then applies a per-operation overlay and a
field-tile overlay from a synthetic result, in headless Chrome on a real
WebGPU device.

```sh
cd kicad-prism-viewer
node tests/browser/analytic/run.mjs \
  --board openswitch=../data/projects/.kicad-prism/semantic-visualizer/<project>/<revision> \
  --pack /path/to/board.kmpack
```

Make the pack with kicad_monkey's `materialization_pack` example from the same
board. The run reuses the pixel-diff harness (probe, Chrome driver, PNGs).

It captures, in order: the mesh board; the analytic board; a synthetic
per-net "current" through the per-operation overlay; a synthetic radial
"voltage" on the outer copper through field tiles on the pack's own tile grid
(0.2 mm pitch); the top and bottom views with and without the pack; and a
close-up, mesh then analytic, at one camera. It also picks four points and
records the operation, binding, and value under each.

| Option | Meaning |
|---|---|
| `--size WxH`, `--scale s` | Viewport (default 1280x800) and device pixel ratio (default 1). |
| `--zoom fx,fy`, `--zoom-steps n` | Where (canvas fractions) and how far the close-up zooms (default 0.5,0.42 and 8). |
| `--close-view v` | `default`, `top` or `bottom`: the view the close-up zooms from. |
| `--live [port]` | Serve an interactive page instead (default port 5199): toolbar for mesh, analytic and the two overlays, and the app's substrate, components, realistic-colour and separation controls. |
| `--perf`, `--orbit-ms n` | Measure instead of capturing: orbit the mesh and the analytic board for `n` ms (default 4000) from the loaded view and zoomed in, each on a fresh load. |
| `--out dir`, `--headed` | Output directory; show the Chrome window. |

Every mesh/analytic pair reports the pixels that differ and the share that
differ visibly (beyond 8 levels), so shading drift shows apart from the edge
pixels exact shapes move. The analytic board draws its laminate in the
stackup's dielectric colour (FR4 natural unless the stackup names another),
where the mesh body takes a darkened mask colour: through the translucent
mask the laminate's areas then differ visibly by design (about 9% of the top
and bottom views on openswitch-10x10g-carrier). The run fails on page errors, on an overlay that
does not change the picture, on analytic layers that draw nothing, on picks
that name no operation, and on a device without the depth-stencil feature
(subtracts and regions need it).

The default mesh path is the pixel-diff runner's job: with no pack loaded, the
viewer must match `origin/dev` but for the records in `../pixel-diff/README.md`.

`--perf` lifts Chrome's frame-rate cap so the GPU runs flat out at a steady
clock, and times each frame's GPU work with timestamp queries (every render
and compute pass, summed per submission; the probe adds them, the viewer is
unchanged). It reports GPU p50/p95 per case. Run at `--scale 2` for a
high-density display. On openswitch-10x10g-carrier at scale 2 (2560x1600,
4x MSAA), three runs agree within 0.15 ms:

| Case | Mesh | Analytic | Analytic before the perf pass |
|---|---|---|---|
| Loaded view | 2.8 ms | 5.0–5.5 ms | 7.8 ms |
| Zoomed in | 6.6–7.5 ms | 9.3–10.1 ms | 8.5 ms |

The analytic figures include copper as slabs with side walls and the
conformal solder mask (3.65 and 4.3 ms without either; 4.3 and 6.75 ms with
the slabs alone). Ranges are runs a few minutes apart.

The perf pass: a solid, unseparated board skips the slices it hides (inner
dielectric faces, and every face turned from the eye), barrels draw only the
far side of their box, the last batch of a slice leaves its bit-6 clear to
the slice's closing clear, and depth is never stored after a pass.
