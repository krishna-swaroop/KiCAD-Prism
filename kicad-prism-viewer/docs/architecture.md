# Architecture Notes

## Runtime Shape

The visualiser is driven by `topology_model_a0`, not by a Prism viewer API.
The PCB renderer consumes `prism.semantic_gltf_a0`:

- tiled GLBs carry `_FEATURE_ID_0` for net ownership;
- `_FEATURE_ID_1` identifies the authoritative KiCad source object;
- `EXT_mesh_features` declares both feature domains;
- `EXT_meshopt_compression` and `KHR_mesh_quantization` reduce transfer size;
- `scene.manifest.json` stores nets, net classes, metrics, stackup, source
  feature records, source/net bounds, component records, via/plated-hole
  dimensions, tile bounds, and `netToTiles`.

Render triangles carry compact IDs only. Net names, classes, lengths, source
UUIDs, and analysis metadata are stored once in lookup tables.

## Semantic Copper Pipeline

`kicad_monkey` is the semantic authority. `KiCadDesign.to_pcb_ir()` supplies
tracks, arcs, pads, vias, layers, nets, UUIDs, net classes, and saved zone
fills. Maintained polygon and triangulation libraries clip these authoritative
contours into spatial tiles. Ownership is attached before tessellation.

Click-to-net reads `_FEATURE_ID_1`, resolves the source feature record, and
then resolves its immutable net ID. No aggregate-mesh overlap heuristic is
used.

Layer Compare and 3D View render the same copper surfaces at real stackup
heights. Layer Compare changes camera projection, viewport and visibility
masks. Via and plated-pad barrels use shared instanced geometry tied to the
same source feature and net as their copper caps.

KiCad GLB remains the source for board context and component models. STEP
remains suitable for B-rep validation, component conversion, and MCAD
interchange, but does not own PCB electrical semantics.

## Analysis Extension Contract

The stable join keys are:

- `netId` for electrical grouping and net-class operations;
- `objectFeatureId` for KiCad tracks, arcs, zones, pads, and vias;
- `geometryRevision` for detecting stale result files.

Inspector UI reads net details from the manifest. Highlighting a net class
uploads only an active class ID; the shader resolves membership through a
compact `netId -> netClassId` table.

An FEM workflow should generate a solver-quality surface or volume mesh from
the authoritative PCB contours and stackup thicknesses. Solver cells retain
`objectFeatureId` and `netId`, either directly or through a mapping table.
Results can then be loaded as GPU buffers and rendered as scalar color maps,
vectors, contours, or deformed overlays. The visual render mesh is not assumed
to be a valid FEM volume mesh.

Planned result sidecar:

```json
{
  "schema": "prism.analysis_result_a0",
  "geometryRevision": "<sha256>",
  "analysisType": "dc_ir_drop",
  "domain": {"netIds": [3], "objectFeatureIds": [18, 24]},
  "mesh": {"path": "analysis/ir-drop.glb", "featureAttribute": "_FEATURE_ID_1"},
  "fields": [
    {"name": "voltage", "association": "vertex", "units": "V", "path": "analysis/voltage.bin"},
    {"name": "currentDensity", "association": "cell", "units": "A/mm2", "path": "analysis/j.bin"}
  ]
}
```

## SVG Scope

Enriched SVG remains useful for schematic fidelity and source mappings. Large
interactive PCB designs do not depend on an SVG DOM for hit testing or
highlighting.

## Validation Fixtures

`scripts/build_usb_pd_sample.sh` builds the USB-PD Trigger Board. JTYU-OBC is
the large-board stress fixture. Its current semantic copper bundle contains all
12 copper layers and remains independent of per-net GLB exports.
