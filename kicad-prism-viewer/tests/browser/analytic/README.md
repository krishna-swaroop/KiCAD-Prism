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
| `--out dir`, `--headed` | Output directory; show the Chrome window. |

Every mesh/analytic pair reports the pixels that differ and the share that
differ visibly (beyond 8 levels), so shading drift shows apart from the edge
pixels exact shapes move. The run fails on page errors, on an overlay that
does not change the picture, on analytic layers that draw nothing, on picks
that name no operation, and on a device without the depth-stencil feature
(subtracts and regions need it).

The default mesh path is the pixel-diff runner's job: with no pack loaded, the
viewer must match `origin/dev` but for the records in `../pixel-diff/README.md`.
