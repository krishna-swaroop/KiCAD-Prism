# SVG DOM Schematic Renderer

## Status

`viewer.html` now uses an SVG DOM renderer as the default schematic detail renderer. The existing WebGPU schematic world remains the overview renderer and page-layout authority, and remains available as a fallback/dev path with:

```text
?schematicRenderer=native
?schematicRenderer=legacy
?schematicRenderer=webgpu
```

## Integration Points

- `viewer/src/main.js` loads the existing schematic manifest and feature sidecar through `SchematicWorldRenderer` so page layout, page search, net-to-page indexes, and feature metadata stay unchanged.
- `viewer/src/svg-dom-schematic-renderer.js` mounts visible detailed SVG pages into `#schematic-dom-layer`, with a bounded LRU. The default runtime target is one mounted detailed page.
- `viewer/viewer.template.html` provides the DOM mount layer beside the existing WebGPU canvases.
- `viewer/styles.css` styles the focused SVG page surface.

## Safety Boundary

The focused page SVG is parsed with `DOMParser` and sanitized before mounting:

- removes scripts, foreignObject, iframe/object/embed;
- removes inline event handlers;
- removes javascript/data/http/https hrefs;
- rewrites relative same-origin resource URLs to absolute URLs;
- prefixes page-local IDs and rewrites local `url(#...)` and fragment references.

This renderer intentionally does not use SVG DOM as the all-page world model. The WebGPU schematic world continues to handle overview navigation, page cards, hierarchy links, and animated net tracking overlays.

## Selection Contract

DOM selection emits renderer-neutral selection objects:

```js
{
  kind,
  featureKey,
  sheetInstancePath,
  sourceId,
  role,
  netUid,
  netName,
  feature
}
```

Pins and components include pin/reference fields when present in the feature sidecar.

## Highlighting

Single-click selects. Double-click or `~` highlights the selected net. The highlight is drawn in an overlay `<g>` inside each mounted SVG; the base schematic SVG is not globally restyled. Cross-page tracking links are rendered by a transparent WebGPU overlay canvas above the SVG DOM layer.

## M5 Performance Controls

- Mounted detailed SVG pages default to `1`. The GPU thumbnail/world layer remains responsible for all non-detailed pages.
- Parsed and sanitized SVG templates are cached in an LRU with a default cap of `18` pages.
- Startup preload is capped to the first `8` schematic pages. Other SVGs are fetched and parsed on demand, then reused from cache.
- The Stats tab reports mounted pages, DOM nodes, indexed SVG features/nets, cache pages/bytes, JS heap when available, mount time, selection time, highlight time, and net tracking geometry counts.
- DOM SVG transition is intentionally delayed until a page is large enough on screen to avoid mounting several detailed pages while navigating the hierarchy overview.

Acceptance targets for the default renderer:

| Metric | Target |
|---|---:|
| Active page DOM mount | <= 500 ms cold on reference desktop |
| Warm mount | <= 150 ms |
| Click to selection | <= 50 ms |
| Highlight update | <= 50 ms |
| Mounted detailed pages default | 1 |
| Full hierarchy live detailed SVG pages | 0 |

## Current Limitations

- Net highlight completeness depends on `netUid` coverage in the existing feature sidecar. Some wire SVG groups in current fixtures do not carry net identity in the sidecar, so those shapes cannot be highlighted semantically yet.
- Cross-page net occurrence navigation uses `manifest.netToPages` and feature bounds. Highly dense nets are anchor-limited per page to keep the overlay readable and bounded.
- The legacy/native WebGPU schematic renderer is still present for fallback and comparison, but is no longer the default detailed renderer.
