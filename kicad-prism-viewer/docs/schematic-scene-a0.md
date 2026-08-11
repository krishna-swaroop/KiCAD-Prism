# `prism.schematic_scene_a0`

`prism.schematic_scene_a0` is the native WebGPU schematic-scene contract. It is
introduced beside `prism.schematic_world_a0`; the older schema remains the SVG
thumbnail/fallback path and is not redefined.

## Files

```text
schematic-scene/
  schematic.manifest.json
  features.json
  strings.json
  pages/
    0001-<sheet>.svg
  chunks/
    page-0001/
      lod0.json
      lod1.json
      lod2.json
```

## Manifest

`schematic.manifest.json`:

- `schema`: literal `prism.schematic_scene_a0`.
- `geometryRevision`: content hash of instance identity, topology indexes and
  vector chunk summaries.
- `coordinateSystem`: schematic coordinates are millimetres in page-local
  KiCad canvas space; world space is millimetres with pages arranged in a
  hierarchy layout.
- `worldBoundsMm`: full world bounds.
- `pages`: concrete hierarchy instances. Each page has its own
  `sheetInstancePath`, page/world bounds, parent ID, thumbnail reference and
  chunk references.
- `edges`: hierarchy edges between concrete page instances.
- `featureTable`: path to `features.json`.
- `stringTable`: path to `strings.json`.
- `netToPages`, `componentToPages`, `hierarchyEndpointIndex`: semantic indexes
  derived from `kicad_monkey` data and enriched SVG mappings.
- `lodPolicy`: screen-space thresholds and hysteresis.

Feature identity is instance scoped:

```text
sheetInstancePath + source UUID/object ID + primitive/sub-feature index
```

Reference designator or source schematic file identity is never canonical by
itself, because repeated hierarchy instances must remain separate.

## Feature Table

`features.json` is intentionally JSON for the first migration slice. It is the
compatibility shape of the future binary feature table plus string table:

- `features`: dense records with `id`, `stableKey`, `pageId`, `sheetInstancePath`,
  `kind`, source IDs, optional `netUid`/`netName`, optional component reference,
  and bounds.
- Rendered primitive sub-features are also present in the same table. They add
  `parentFeatureId`, `primitiveKind` and `subFeatureIndex`, and inherit net,
  component and source metadata from the parent source record.
- `pages`: page-to-feature ID lists.
- `byStableKey`: exact stable-key lookup.

Render geometry carries compact `featureId` only. Net names, component names,
classes and endpoint metadata live once in lookup tables.

## Vector Chunks

Each chunk is a per-page, per-LOD payload:

- `lod0`: page card frame, title anchor and thumbnail bounds.
- `lod1`: simplified source-record bounds and hierarchy/page structure.
- `lod2`: electrical review primitives extracted from schematic instance IR.

The current `lod2` chunk stores portable vector primitives (`line`, `polyline`,
`circle`, `arc`, `text`, `unknown`) with a primitive-level `featureId`. These
feature IDs resolve to primitive sub-feature records, which point back to their
source record through `parentFeatureId`.

Unsupported operation types are listed in `unsupported` arrays in the chunk and
manifest. They are reported explicitly rather than silently dropped.

## File-Level Implementation Plan

Milestone 1:

- Add `pipeline/topology_compiler/schematic_scene.py`.
- Emit the manifest, feature table, string table, thumbnails and vector chunks.
- Add fixture tests for stable instance-scoped IDs and chunk contents.
- Reference the native manifest from `semantic_geometry.assets.schematic_native_manifest`.

Milestone 2:

- Extend `viewer/src/schematic-world-renderer.js` to load either
  `schematic_world_a0` or `schematic_scene_a0`.
- For `schematic_scene_a0`, render native page cards and hierarchy edges from
  the native manifest while using thumbnails only as L0 texture content.
- Preserve existing `schematic_world_a0` behavior as fallback.

Milestone 3:

- Add native L2 vector pipelines for wires, pins, junctions, labels and GPU
  integer picking.
- Replace bounding-box feature selection with exact feature ID picking.
- Preserve source-record identity through `parentFeatureId` so exact primitive
  picking can still cross-probe to PCB/component/topology records.
