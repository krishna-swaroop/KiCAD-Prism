# `prism.schematic_vector_a0`

`prism.schematic_vector_a0` is the native schematic-vector asset contract. It
exists beside `prism.schematic_world_a0`; the older world schema remains the
SVG thumbnail/fallback path.

Generated assets:

```text
schematic-vector/
  schematic.vector.manifest.json
  pages.json
  features.json
  strings.json
  diagnostics.json
  pages/*.svg
  chunks/page-0001/lod0.json
  chunks/page-0001/lod1.json
  chunks/page-0001/lod2.json
```

`schematic.vector.manifest.json`:

- `schema`: literal `prism.schematic_vector_a0`.
- `geometryRevision`: hash of page/chunk/diagnostic source content.
- `coordinateSystem`: page-local millimetres for GPU buffers; source identity
  remains instance-scoped.
- `pages`: concrete sheet instances. Repeated hierarchy instances appear as
  separate pages.
- `featureTable`: path to `features.json`.
- `netToPages`, `componentToPages`, `hierarchyEndpointIndex`: semantic indexes
  used by runtime selection and future overlays.
- `diagnostics`: unsupported operations, text-provider coverage, and page-level
  native-detail eligibility.

Feature identity:

```text
sheetInstancePath | sourceUuid-or-objectId | opIndex | semanticRole | subfeatureIndex
```

`featureId` values are deterministic 32-bit integers allocated from sorted
feature keys. `0` is reserved for no-hit.

Supported native L2 operation classes in the first slice:

- `PlotPoly`
- `Rect`
- `Circle`
- `ArcThreePoint`
- `ArcCenterAngle`
- `BezierCurve`
- `PenTo`
- `ThickSegment`
- `ThickArc`
- normalized `Line`
- `Text` when either validated `Text.render_cache`/`render_cache_polygons`
  contours are present, or when NewStroke polylines can be generated at build
  time through `kicad_monkey.kicad_stroke_font.get_renderer()`.

Unsupported operations are emitted to `diagnostics.json` instead of being
silently dropped. Browser fonts and placeholder client-side stroke glyphs are
not used in native L2/L3.

Text provider rules:

- Valid render-cache contours are treated as outline-font geometry and are
  emitted as `text_contours`.
- Normal uncached text falls back to KiCad NewStroke at build time and is
  emitted as `text_strokes`.
- NewStroke primitives include `polylinesMm`, `widthMm`, text bounds, source
  string, style metadata, and `provider: "newstroke"`.
- Page manifests include `nativeDetail.enabled`. The runtime uses native L2
  only when required text coverage is complete for that page; otherwise it uses
  the SVG fallback. Native detail is never overlaid on the SVG texture.
