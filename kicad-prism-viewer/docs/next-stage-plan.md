# Visualiser Next-Stage Implementation Plan

## Decision Summary

The production schematic renderer should be WebGPU-backed, but it should not
parse SVG paths at runtime.

Use:

`kicad_monkey schematic instance IR -> semantic vector tiles -> WebGPU`

Enriched SVG remains an important build artifact for fidelity comparison,
standalone export, thumbnails, and diagnostic source mappings. Mounting every
schematic page as an interactive SVG DOM would support basic clicking and
navigation, but it would not provide the predictable memory use, tile
streaming, GPU picking, or multi-level detail required for a 50-100 page world.

The existing retained Canvas2D schematic-world prototype in the local
`ecad-viewer` fork proves the interaction model, but it paints every page at
full detail and scans retained bounding boxes for interaction. It should be
treated as a prototype and source of KiCanvas painter behavior, not the final
large-design renderer.

## Current Viewer Readiness

The PCB viewer is now based only on `prism.semantic_gltf_a0`.

Before schematic work begins:

- Keep the generic selection inspector for nets, source objects, and
  components.
- Keep the standalone `viewer.html` as a test shell.
- Make the renderer mountable as a module so Prism does not require an iframe.
- Keep raw JSON diagnostics behind the Inspect tab.
- Continue removing dead state and unreachable export code when encountered.
- Do not reintroduce A2/A3/A4 binary scenes, per-net GLBs, runtime SVG PCB
  rendering, or Geometer-based copper triangulation.

## Schematic World Architecture

### Build Inputs

- `KiCadDesign.schematic_instances()` for every concrete hierarchy instance.
- `KiCadDesign.to_schematic_instance_ir(instance)` for authoritative drawing
  operations and source-owned records.
- `kicad_monkey.design.a0` for components, nets, endpoints, hierarchy, and
  design-wide indexes.
- Enriched SVG metadata for validation and compatibility:
  `view_indexes.svg_to_net`, `net_to_svg`, `net_uid_to_svg`, source UUIDs, and
  sheet instance paths.

Repeated hierarchy instances must be represented independently. Source-file
identity alone is insufficient; `sheet_instance_path` is part of every stable
page and feature key.

### Runtime Assets

Introduce `prism.schematic_world_a0`:

- `schematic.manifest.json`
  - project and generator revisions;
  - world bounds;
  - page records and world transforms;
  - hierarchy edges;
  - tile/LOD records;
  - net-to-pages and component-to-pages indexes.
- `schematic.features.bin`
  - compact `featureId`, kind, net ID, component ID, source UUID, page ID,
    bounds, and text/string-table references.
- `schematic.pages.json`
  - page identity, title, source path, instance path, hierarchy depth,
    parent/child links, bounds, and persisted layout.
- Per-page vector chunks
  - lines, arcs, Beziers, fills, symbols, pins, junctions, buses, and labels;
  - immutable feature IDs for GPU picking;
  - independent compression and loading.
- Thumbnail textures
  - generated from enriched SVG for low-zoom page previews.
- Shared text assets
  - KiCad stroke-font geometry or an MSDF glyph atlas plus text-run records.

### Level Of Detail

- L0, world overview:
  page frame, title, hierarchy depth, activity/net-density summary, thumbnail.
- L1, page structure:
  symbol bodies, major buses, ports, sheet entries, simplified net paths.
- L2, electrical review:
  full wires, pins, labels, junctions, buses, and selectable symbols.
- L3, fidelity:
  complete vector detail and text for visible pages only; enriched SVG may be
  used as an optional visual oracle, not as the interaction authority.

Use screen-space error with hysteresis. Cull pages by world-space bounds,
decode visible chunks in workers, and evict high-detail page chunks under
memory pressure.

### Rendering And Picking

- One WebGPU canvas for the entire world.
- Instanced page frames and thumbnails at low LOD.
- Batched analytic/SDF strokes for wires, buses, outlines, and arcs.
- Batched fills for symbol bodies and sheet graphics.
- Shared glyph buffers/atlas for text.
- On-demand integer picking target returning `featureId`.
- CPU spatial index only narrows candidate page/tile; semantic resolution
  comes from the feature table.

SVG DOM hit testing is not used in the production world renderer.

### Net And Hierarchy Overlays

Selecting a net must:

- highlight exact resident wires, pins, labels, and ports on each page;
- mark pages containing unloaded portions of the net;
- draw inter-page hierarchy links between resolved sheet ports;
- distinguish link types:
  - local/intra-page path: selected green;
  - hierarchical parent-child link: blue;
  - global-label or power-domain link: amber;
  - bus/member relationship: violet.

Overlay routes are world-space curves generated from semantic endpoint and
hierarchy data. They are not inferred from label text in rendered SVG.

### Navigation

- Double-click a page to frame it.
- `Home` frames the world.
- `[` and `]` move to previous/next page in hierarchy order.
- `Alt+Up` moves to the parent page.
- `Alt+Left/Right` cycles child pages.
- `N` cycles visible instances of the selected net.
- `P` cycles connected pins/components.
- Search frames a page, component, pin, or net occurrence.
- Edge markers identify selected-net occurrences outside the viewport.

## Exporter As A Prism Workflow Step

Add a trusted workflow node:

`generate_semantic_visualizer`

Do not implement this as `custom_command`. The backend should invoke a
versioned exporter with validated project-relative paths and explicit resource
limits.

### Workflow Inputs

- KiCad project path.
- Include PCB, schematic, or both.
- Component fidelity mode.
- Schematic thumbnail and maximum LOD settings.
- Cache policy.
- Optional clean rebuild.

### Output Layout

Store generated assets inside the project:

```text
Design-Outputs/PrismVisualizer/
  manifest.json
  revisions/<source-hash>/
    topology.json
    pcb/scene.manifest.json
    pcb/tiles/*.glb
    pcb/geometry/*.glb
    schematic/schematic.manifest.json
    schematic/pages.json
    schematic/features.bin
    schematic/tiles/*
    viewer.html
    viewer.js
    viewer.css
```

`manifest.json` is the stable pointer to the active revision. It includes:

- schema and generation status;
- source commit or working-tree hash;
- KiCad, `kicad_monkey`, exporter, and viewer versions;
- geometry/topology revisions;
- entry points and asset paths;
- byte sizes and checksums;
- generated timestamp and workflow run ID;
- warnings and unsupported features.

The workflow run writes this manifest path and revision into
`workflow_runs.artifacts_json`.

### Backend Execution

- Add the node type to frontend and backend workflow allowlists.
- Implement a dedicated executor in `WorkflowPipelineService._run_node`.
- Run the exporter as a managed subprocess, stream structured progress, and
  support cancellation.
- Cache by project content hash, KiCad version, exporter version, and options.
- Write to a temporary revision directory and atomically publish only after
  validation succeeds.
- Never replace a valid active revision with a failed partial build.

## Prism Embedding

Keep standalone HTML, but split the viewer into a reusable runtime:

```js
mountSemanticViewer(container, {
  assetManifestUrl,
  initialMode,
  theme,
  onSelection,
  onError,
});
```

A small React wrapper owns the lifecycle. A custom element is also acceptable,
but the renderer core must not depend on React or Prism.

Add:

- `GET /api/projects/{id}/visualizer-assets`
  - returns `missing`, `stale`, `generating`, `ready`, or `failed`;
  - includes the active asset manifest URL and workflow run when available.
- Existing project asset routes serve generated files.
- Add immutable cache headers for revisioned assets and no-cache for the stable
  pointer manifest.
- Support range requests for large GLB and binary chunks.

If assets are missing or stale, Prism shows a first-class empty state:

- explain which visualizer assets are absent;
- offer `Open workflow` and `Run visualizer generation`;
- show progress when a generation run exists;
- retry mounting when the manifest becomes ready.

Selection events use the existing unified payload and later support Prism
comments, simulations, and cross-view navigation without coupling renderer
internals to Prism.

## Implementation Phases

1. Runtime packaging
   - Export `viewer.js`/`viewer.css` and preserve `viewer.html`.
   - Add mount/unmount lifecycle and event contract.
2. Schematic compiler contract
   - Emit page, feature, hierarchy, and topology manifests from
     `kicad_monkey` instance IR.
3. World overview MVP
   - Page layout, thumbnails, pan/zoom, search, page framing, and culling.
4. WebGPU vector LOD
   - Lines, fills, arcs, text, workers, tile streaming, and GPU picking.
5. Semantic interaction
   - Component/pin selection, intra-page net highlight, inspector integration.
6. Cross-page signal flow
   - Hierarchical/global/bus overlays, edge markers, and instance cycling.
7. Prism workflow node
   - Managed generation, caching, atomic publication, artifacts, and progress.
8. Prism visualizer adapter
   - Asset-state endpoint, empty states, module mount, theme and events.
9. Scale validation
   - 50-100 page fixtures, repeated hierarchy, large text counts, and memory
     pressure tests.

## Acceptance Criteria

- Every concrete schematic instance appears once with a stable instance key.
- World overview becomes interactive before full-detail pages load.
- Only visible pages decode L2/L3 vector data.
- Clicking symbols, pins, wires, labels, buses, and ports returns stable
  semantic identities.
- A selected net highlights all loaded occurrences and identifies unloaded
  pages containing it.
- Cross-page overlays resolve from topology/hierarchy, not text scraping.
- 100-page overview maintains 60 FPS on the current test machine.
- Page-level detail becomes usable within 150 ms after its data is resident.
- Prism can detect missing/stale assets without loading the renderer.
- Failed workflows leave the previous valid revision usable.
- Standalone and Prism-hosted viewers consume the same manifests and runtime.

## Risks

- Text rendering is the largest WebGPU implementation cost. Reuse KiCanvas
  stroke-font behavior or generate a shared glyph atlas rather than relying on
  browser DOM text.
- Buses and hierarchy require explicit semantic routing rules; visual proximity
  is not connectivity.
- Repeated sheet instances require instance-scoped feature IDs throughout.
- SVG thumbnails can become expensive to rasterize; cache them by instance IR
  hash and generate them in parallel workers/processes.
- Generated assets may be large. Repository storage policy should be
  configurable even though the assets live under the project directory.

## Reference Findings

- Wavenumber's public demonstration uses a complete schematic workspace,
  hierarchical net overlays, and LOD for large designs.
- `kicad_monkey` already exposes concrete schematic instances, plotter IR,
  semantic SVG groups, design-wide connectivity, and instance-aware SVG/net
  indexes.
- KiCanvas uses retained drawing layers and bounding-box interaction. The local
  world prototype extends that model but remains Canvas2D and full-detail.
- Prism `v3-dev` already has a React Flow workflow scaffold, run artifacts, a
  project asset route, and a visualizer host. The visualizer exporter should
  extend those contracts rather than create a parallel job system.
