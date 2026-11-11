# Mesh overlay: host page and browser check

The mesh overlay draws a simulation mesh (`prism.sim.mesh-pack`, power-integrity spec 11) over
the board `<prism-semantic-viewer>` shows. This directory holds an engineering host page for it
and a browser check. Both need Node 24 and a local Chrome, and no Prism server.

## Host page

```sh
cd kicad-prism-viewer
npm run mesh:live -- --board <design.prism> --pack <file or directory of *.meshpack>
```

This serves the page at `http://127.0.0.1:5281/mesh/host.html`. Pass `--live <port>` to the
script to choose another port.

With no `--board` and `--pack`, it serves the analytic fixture board and synthetic packs: two
background meshes and a quadtree group.

The page builds the element from this worktree and loads every pack into it. Its controls:

- mesh on or off, and which pack is shown;
- edges: on copper (the default: element edges only where the layer has copper of its
  conductor, with the copper's boundary outlined), the whole mesh, or off;
- pieces: the conductors, the solved domain (when the pack has one; edges then clip to it), or
  none;
- the slices and nets the pack covers, with each copper layer it does not cover tagged;
- markers and marker ids;
- colour by an element field, the colormap, and a threshold (hide below or above);
- step through the worst elements by a field;
- the board, the parts, the stackup separation and each copper layer.

Click an element to read its fields. A drag orbits the view as usual.

The server follows the files. A change to the viewer's sources rebuilds the element; a build
that fails keeps the last good one, and the panel shows its error. A change to `host.html` or
to the sources reloads the page. Packs and the board are read from disk when asked for, so a
pack written again in place is loaded again where it is shown, and a pack still being written
is read again until it holds still. Across reloads the page keeps the pack, the view controls,
the visible layers and the camera (`sessionStorage`). The panel's first line is the build: the
commit, `+` when the worktree has changes, and the build time (UTC).

The page warns when a pack's `bundle_sha256` is not the board's, and when a pack names slices
the board does not have.

`--board` takes one of:

- a Prism design bundle (`.prism`, manifest a3, with its board stage built), which the server
  opens and serves from;
- an analytic bundle directory (`bundle.json` of `prism.viewer_3d.analytic.a0` beside its
  members);
- `demo`.

## Browser check

```sh
node tests/browser/mesh/run.mjs --board <design.prism> --pack <pack> [--shots dir] [--perf]
```

The check loads the board and shows the first pack from the top. It then asserts the following:

- the pack's slices are on the board;
- the mesh, the pieces alone and the edges alone each change the picture;
- colouring and a threshold change it too;
- an element framed with `frameMeshElement` is the one `meshElementAt` picks at the centre, with
  all its fields;
- the selection shows;
- hiding the mesh frees its GPU memory.

The check uses the worst `cut_fraction` element when the pack has that field, which is usually
at an antipad.

`--shots dir` copies four captures into `dir`: `whole-board`, `antipad-close-up`, `color-by` and
`picked-element`. `--perf` then orbits for `--orbit-ms` (default 4000) with the pixel-diff
harness's own method (`../pixel-diff/README.md`, "Frame-time numbers"): once with no mesh, then
once with each pack shown. Use `--scale 2` for a high-density display.

Other options: `--size WxH`, `--scale s`, `--out dir` (default `out/<timestamp>`, gitignored)
and `--headed`.

`fixture.mjs` makes packs for the unit tests and for `demo`.
