use crate::analytic_contract::{
    Affine2D, AnalyticPrimitive, Document, MaterialPolarity, NmPoint, Operation,
};
use crate::geometer_packets::{
    BooleanRequest, ClipType, FillRule, Path as GeometerPath, decode_boolean_response,
    encode_boolean_request,
};
use crate::geometry::{
    Point, capsule, chamfered_rectangle, circle, mm_to_nm, oval, rounded_rectangle, sample_arc,
    trapezoid,
};
use crate::semantic_compiler::{LoweringRoute, TileId, classify, resolve_tile_size_mm};
use anyhow::{Context, Result, bail};
use rayon::prelude::*;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs;
use std::io::{BufWriter, Write};
use std::path::Path;
use std::time::Instant;

pub const SCHEMA: &str = "prism.semantic_mesh_pack.v1";
const TILE_MAGIC: &[u8; 8] = b"PRSMTL01";
const TILE_FORMAT_VERSION: u32 = 1;
const DEFAULT_PLATING_THICKNESS_MM: f64 = 0.025;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerRecord {
    pub id: u32,
    pub uid: String,
    pub source_index: Option<usize>,
    pub name: String,
    pub role: String,
    pub z_mm: f64,
    pub runtime_z_mm: f64,
    pub thickness_mm: f64,
    pub material: String,
    pub color: String,
    pub visibility_group: String,
    pub stack_index: usize,
    pub epsilon_r: Option<f64>,
    pub loss_tangent: Option<f64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetRecord {
    pub id: u32,
    pub uid: String,
    pub name: String,
    pub net_class: String,
    pub aliases: Vec<String>,
    pub metrics: NetMetrics,
    pub bounds_mm: Option<[f64; 6]>,
    pub layer_bounds_mm: BTreeMap<String, [f64; 6]>,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetMetrics {
    pub trace_length_mm: f64,
    pub layers: BTreeSet<String>,
    pub object_counts: BTreeMap<String, usize>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeatureRecord {
    pub id: u32,
    pub source_uid: String,
    pub net_id: u32,
    pub layer_id: u32,
    pub layer_ids: Vec<u32>,
    pub kind: String,
    pub bounds_mm: [f64; 6],
    pub footprint_uid: Option<String>,
    pub component_ref: Option<String>,
    pub pad_number: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BarrelRecord {
    pub source_uid: String,
    pub object_feature_id: u32,
    pub net_id: u32,
    pub kind: String,
    pub center_mm: [f64; 2],
    pub drill_width_mm: f64,
    pub drill_height_mm: f64,
    pub outer_width_mm: f64,
    pub outer_height_mm: f64,
    pub plating_thickness_mm: f64,
    pub plating_thickness_source: &'static str,
    pub start_layer_id: u32,
    pub end_layer_id: u32,
    pub layer_ids: Vec<u32>,
    pub bounds_mm: [f64; 6],
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TileRecord {
    pub id: String,
    pub path: String,
    pub layer_id: u32,
    pub layer_name: String,
    pub tile: [i64; 2],
    pub bounds_mm: [f64; 4],
    pub net_ids: Vec<u32>,
    pub vertex_count: usize,
    pub index_count: usize,
    pub bytes: u64,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileMetrics {
    pub parse_analytics_ms: f64,
    pub classification_ms: f64,
    pub lowering_ms: f64,
    pub clipping_ms: f64,
    pub triangulation_ms: f64,
    pub triangulation_workers: usize,
    pub triangulation_jobs: usize,
    pub packed_output_ms: f64,
    pub total_ms: f64,
    pub direct_operations: usize,
    pub geometer_operations: usize,
    pub vertices: usize,
    pub triangles: usize,
    pub packed_bytes: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshPack {
    pub schema: &'static str,
    pub version: u32,
    pub geometry_revision: String,
    pub source_geometry_revision: String,
    pub source_digest: String,
    pub kicad_monkey_revision: &'static str,
    pub analytic_contract_revision: &'static str,
    pub tile_size_mm: f64,
    pub mesh_tolerance_mm: f64,
    pub meshopt_level: String,
    pub coordinate_system: CoordinateRecord,
    pub board: BoardRecord,
    pub layers: Vec<LayerRecord>,
    pub nets: Vec<NetRecord>,
    pub object_features: Vec<FeatureRecord>,
    pub barrels: Vec<BarrelRecord>,
    pub bbox: SceneBounds,
    pub tiles: Vec<TileRecord>,
    pub stats: BTreeMap<String, usize>,
    pub diagnostics: Vec<crate::analytic_contract::Diagnostic>,
    pub metrics: CompileMetrics,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoordinateRecord {
    pub units: &'static str,
    pub up_axis: &'static str,
    pub source_x_axis: &'static str,
    pub source_y_axis: &'static str,
    pub source_to_scene: &'static str,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardRecord {
    pub thickness_mm: f64,
    pub bbox_mm: [f64; 4],
    pub aux_axis_origin_mm: [f64; 2],
    pub stackup_layers: Vec<crate::analytic_contract::StackupLayer>,
    pub copper_finish: String,
    pub edge_connector: String,
    pub edge_plating: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct SceneBounds {
    pub min: [f64; 3],
    pub max: [f64; 3],
}

#[derive(Default)]
struct TileMesh {
    layer_id: u32,
    layer_name: String,
    tile: TileId,
    positions: Vec<f32>,
    net_ids: Vec<u32>,
    feature_ids: Vec<u32>,
    indices: Vec<u32>,
}

#[derive(Clone)]
struct Region {
    outer: Vec<NmPoint>,
    holes: Vec<Vec<NmPoint>>,
}

struct FeatureBuilder {
    record: FeatureRecord,
}

struct TriangulationJob {
    sequence: usize,
    layer_id: u32,
    layer_name: String,
    tile: TileId,
    y_mm: f64,
    net_id: u32,
    feature_id: u32,
    region: Region,
}

pub fn compile_semantic(
    pcb: &Path,
    output: &Path,
    requested_tile_size_mm: Option<f64>,
    mesh_tolerance_mm: f64,
    meshopt_level: &str,
) -> Result<MeshPack> {
    let total_started = Instant::now();
    let parse_started = Instant::now();
    let document = crate::materialize::materialize_analytic(pcb, mesh_tolerance_mm)?;
    let parse_analytics_ms = parse_started.elapsed().as_secs_f64() * 1000.0;
    if document
        .stats
        .get("unsupported_features")
        .copied()
        .unwrap_or_default()
        != 0
    {
        bail!("native analytic producer reported unsupported features");
    }
    if document
        .diagnostics
        .iter()
        .any(|item| item.severity == "error")
    {
        bail!("native analytic producer reported an error diagnostic");
    }

    let tile_size_mm = resolve_tile_size_mm(requested_tile_size_mm, document.bounds_nm)?;
    let classification_started = Instant::now();
    let classified = classify(&document, tile_size_mm)?;
    let classification_ms = classification_started.elapsed().as_secs_f64() * 1000.0;
    let geometer_operations = classified
        .iter()
        .filter(|item| item.route == LoweringRoute::GeometerBoolean)
        .count();
    let subtractive_operations = document
        .operations
        .iter()
        .filter(|operation| operation.polarity == MaterialPolarity::Subtract)
        .count();
    if subtractive_operations != 0 {
        bail!(
            "native packed compiler does not yet group {subtractive_operations} subtractive operation(s) with their additive subjects"
        );
    }
    if geometer_operations != 0 && !crate::geometer_ffi::available() {
        bail!(
            "native packed compiler requires a Geometer SDK-linked helper for {geometer_operations} multi-tile operation(s)"
        );
    }

    let layers = layer_records(&document)?;
    let layer_by_source = layers
        .iter()
        .filter_map(|layer| layer.source_index.map(|index| (index, layer)))
        .collect::<HashMap<_, _>>();
    let plated_sources = document
        .drills
        .iter()
        .filter(|drill| drill.plated)
        .map(|drill| drill.source_uid.as_str())
        .collect::<BTreeSet<_>>();
    let drills_by_source = document
        .drills
        .iter()
        .map(|drill| (drill.source_uid.as_str(), drill))
        .collect::<HashMap<_, _>>();

    let mut feature_by_key = HashMap::<String, u32>::new();
    let mut feature_builders = Vec::<FeatureBuilder>::new();
    let mut source_feature_ids = HashMap::<String, u32>::new();
    let mut triangulation_jobs = Vec::<TriangulationJob>::new();
    let mut lowering_ms = 0.0;
    let mut clipping_ms = 0.0;

    for classified_operation in &classified {
        let operation = &document.operations[classified_operation.operation_index];
        let lower_started = Instant::now();
        let mut regions = lower_direct(operation, mesh_tolerance_mm)?;
        if let Some(drill) = drills_by_source.get(operation.source_uid.as_str()) {
            apply_drill_hole(&mut regions, drill, mesh_tolerance_mm);
        }
        lowering_ms += lower_started.elapsed().as_secs_f64() * 1000.0;
        let tile_regions = if classified_operation.route == LoweringRoute::Direct {
            vec![(classified_operation.tiles[0], regions)]
        } else {
            let clip_started = Instant::now();
            let result = classified_operation
                .tiles
                .iter()
                .copied()
                .map(|tile| {
                    clip_regions_to_tile(&regions, tile, tile_size_mm)
                        .map(|clipped| (tile, clipped))
                })
                .collect::<Result<Vec<_>>>()?;
            clipping_ms += clip_started.elapsed().as_secs_f64() * 1000.0;
            result
        };
        for source_layer_index in &operation.layer_indexes {
            let layer = layer_by_source.get(source_layer_index).with_context(|| {
                format!("operation references missing source layer index {source_layer_index}")
            })?;
            let net_id = operation
                .net_index
                .map(|index| index as u32 + 1)
                .unwrap_or(0);
            let kind = normalized_kind(&operation.kind);
            let feature_key = if plated_sources.contains(operation.source_uid.as_str()) {
                format!("plated:{}", operation.source_uid)
            } else {
                format!("{}:{}:{}:{}", operation.source_uid, net_id, layer.id, kind)
            };
            let feature_id = if let Some(value) = feature_by_key.get(&feature_key) {
                *value
            } else {
                let id = feature_builders.len() as u32 + 1;
                feature_by_key.insert(feature_key, id);
                source_feature_ids
                    .entry(operation.source_uid.clone())
                    .or_insert(id);
                feature_builders.push(FeatureBuilder {
                    record: FeatureRecord {
                        id,
                        source_uid: operation.source_uid.clone(),
                        net_id,
                        layer_id: layer.id,
                        layer_ids: vec![layer.id],
                        kind: kind.to_owned(),
                        bounds_mm: empty_bounds(),
                        footprint_uid: operation.footprint_uid.clone(),
                        component_ref: operation.component_ref.clone(),
                        pad_number: operation.pad_number.clone(),
                    },
                });
                id
            };
            let feature = &mut feature_builders[(feature_id - 1) as usize].record;
            if !feature.layer_ids.contains(&layer.id) {
                feature.layer_ids.push(layer.id);
                feature.layer_ids.sort_unstable();
            }
            // The analytic operation bounds are deliberately conservative so
            // tile classification cannot miss a primitive.  Feature bounds,
            // however, are part of the viewer's picking contract and must
            // describe the terminal mesh.  Circular sweeps in particular
            // must not publish the bounds of their entire parent circle.
            for (tile, regions) in &tile_regions {
                if regions.is_empty() {
                    continue;
                }
                merge_bounds(&mut feature.bounds_mm, regions_bounds_mm(regions, layer));
                for region in regions {
                    triangulation_jobs.push(TriangulationJob {
                        sequence: triangulation_jobs.len(),
                        layer_id: layer.id,
                        layer_name: layer.name.clone(),
                        tile: *tile,
                        y_mm: layer_surface_y_mm(layer),
                        net_id,
                        feature_id,
                        region: region.clone(),
                    });
                }
            }
        }
    }

    let triangulation_worker_count = semantic_worker_count();
    let triangulation_job_count = triangulation_jobs.len();
    let triangulate_started = Instant::now();
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(triangulation_worker_count)
        .thread_name(|index| format!("prism-semantic-{index}"))
        .build()
        .context("create bounded semantic triangulation worker pool")?;
    let mut chunks = pool.install(|| {
        triangulation_jobs
            .into_par_iter()
            .map(triangulate_job)
            .collect::<Result<Vec<_>>>()
    })?;
    let triangulation_ms = triangulate_started.elapsed().as_secs_f64() * 1000.0;
    chunks.sort_unstable_by_key(|(sequence, _)| *sequence);
    let mut meshes = BTreeMap::<(u32, i64, i64), TileMesh>::new();
    for (_, chunk) in chunks {
        let key = (chunk.layer_id, chunk.tile.x, chunk.tile.y);
        if let Some(mesh) = meshes.get_mut(&key) {
            append_mesh(mesh, chunk)?;
        } else {
            meshes.insert(key, chunk);
        }
    }

    let mut features = feature_builders
        .into_iter()
        .map(|builder| builder.record)
        .collect::<Vec<_>>();
    let barrels = build_barrels(
        &document,
        &layers,
        &layer_by_source,
        &source_feature_ids,
        &mut features,
    );
    let nets = build_nets(&document, &features, &layers);
    let bbox = scene_bounds(&features, &barrels);
    let source_geometry_revision =
        geometry_revision(&document, tile_size_mm, mesh_tolerance_mm, meshopt_level);
    let geometry_revision = source_geometry_revision.clone();

    let parent = output.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent)?;
    let name = output
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("semantic-mesh-pack");
    let temporary = parent.join(format!(".{name}.tmp-{}", std::process::id()));
    if temporary.exists() {
        fs::remove_dir_all(&temporary)?;
    }
    fs::create_dir_all(&temporary)?;
    let packed_started = Instant::now();
    let mut tile_records = Vec::new();
    let mut packed_bytes = 0u64;
    let mut vertices = 0usize;
    let mut triangles = 0usize;
    for mesh in meshes.values() {
        let filename = format!(
            "layer-{}-tile-{}-{}.bin",
            mesh.layer_id, mesh.tile.x, mesh.tile.y
        );
        let path = temporary.join(&filename);
        write_tile(&path, mesh)?;
        let bytes = path.metadata()?.len();
        packed_bytes += bytes;
        vertices += mesh.positions.len() / 3;
        triangles += mesh.indices.len() / 3;
        tile_records.push(TileRecord {
            id: format!("{}:{}:{}", mesh.layer_id, mesh.tile.x, mesh.tile.y),
            path: filename,
            layer_id: mesh.layer_id,
            layer_name: mesh.layer_name.clone(),
            tile: [mesh.tile.x, mesh.tile.y],
            bounds_mm: tile_bounds(mesh.tile, tile_size_mm),
            net_ids: mesh
                .net_ids
                .iter()
                .copied()
                .collect::<BTreeSet<_>>()
                .into_iter()
                .collect(),
            vertex_count: mesh.positions.len() / 3,
            index_count: mesh.indices.len(),
            bytes,
        });
    }
    let packed_output_ms = packed_started.elapsed().as_secs_f64() * 1000.0;
    let bounds_nm = document.bounds_nm.unwrap_or([0, 0, 1_000_000, 1_000_000]);
    let metrics = CompileMetrics {
        parse_analytics_ms,
        classification_ms,
        lowering_ms,
        clipping_ms,
        triangulation_ms,
        triangulation_workers: triangulation_worker_count,
        triangulation_jobs: triangulation_job_count,
        packed_output_ms,
        total_ms: 0.0,
        direct_operations: classified.len() - geometer_operations,
        geometer_operations,
        vertices,
        triangles,
        packed_bytes,
    };
    let mut pack = MeshPack {
        schema: SCHEMA,
        version: 1,
        geometry_revision,
        source_geometry_revision,
        source_digest: document.source.digest_sha256.clone(),
        kicad_monkey_revision: document.kicad_monkey_revision,
        analytic_contract_revision: document.contract_revision,
        tile_size_mm,
        mesh_tolerance_mm,
        meshopt_level: meshopt_level.to_owned(),
        coordinate_system: CoordinateRecord {
            units: "meters",
            up_axis: "+Y",
            source_x_axis: "board-right",
            source_y_axis: "board-down",
            source_to_scene: "[x_mm,layer_y_mm,y_mm]/1000",
        },
        board: BoardRecord {
            thickness_mm: document.board.thickness_mm,
            bbox_mm: [
                nm_to_mm(bounds_nm[0]),
                nm_to_mm(bounds_nm[1]),
                nm_to_mm(bounds_nm[2]),
                nm_to_mm(bounds_nm[3]),
            ],
            aux_axis_origin_mm: [
                nm_to_mm(document.board.aux_axis_origin_nm[0]),
                nm_to_mm(document.board.aux_axis_origin_nm[1]),
            ],
            stackup_layers: document.board.stackup_layers.clone(),
            copper_finish: document.board.copper_finish.clone(),
            edge_connector: document.board.edge_connector.clone(),
            edge_plating: document.board.edge_plating,
        },
        layers,
        nets: with_null_net(nets),
        object_features: with_null_feature(features),
        barrels,
        bbox,
        tiles: tile_records,
        stats: document.stats.clone(),
        diagnostics: document.diagnostics.clone(),
        metrics,
    };
    pack.metrics.total_ms = total_started.elapsed().as_secs_f64() * 1000.0;
    let metadata_path = temporary.join("mesh-pack.json");
    fs::write(&metadata_path, serde_json::to_vec(&pack)?)?;
    if output.exists() {
        fs::remove_dir_all(output)?;
    }
    fs::rename(&temporary, output)?;
    Ok(pack)
}

fn semantic_worker_count() -> usize {
    let available = std::thread::available_parallelism()
        .map(usize::from)
        .unwrap_or(1);
    let default = available.saturating_sub(2).clamp(1, 4);
    std::env::var("PRISM_SEMANTIC_WORKERS")
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
}

fn triangulate_job(job: TriangulationJob) -> Result<(usize, TileMesh)> {
    let mut mesh = TileMesh {
        layer_id: job.layer_id,
        layer_name: job.layer_name,
        tile: job.tile,
        ..TileMesh::default()
    };
    append_region_mesh(&mut mesh, &job.region, job.y_mm, job.net_id, job.feature_id)?;
    Ok((job.sequence, mesh))
}

fn append_mesh(target: &mut TileMesh, chunk: TileMesh) -> Result<()> {
    let vertex_offset = target.positions.len() / 3;
    let chunk_vertices = chunk.positions.len() / 3;
    if vertex_offset + chunk_vertices > u32::MAX as usize {
        bail!("tile vertex count exceeds uint32 index range");
    }
    target.positions.extend(chunk.positions);
    target.net_ids.extend(chunk.net_ids);
    target.feature_ids.extend(chunk.feature_ids);
    target.indices.extend(
        chunk
            .indices
            .into_iter()
            .map(|index| index + vertex_offset as u32),
    );
    Ok(())
}

fn layer_records(document: &Document) -> Result<Vec<LayerRecord>> {
    let mut raw = Vec::<LayerRecord>::new();
    let total_thickness = document
        .board
        .stackup_layers
        .iter()
        .map(|layer| layer.thickness_mm.max(0.0))
        .sum::<f64>();
    let physical_thickness = if total_thickness > 0.0 {
        total_thickness
    } else {
        document.board.thickness_mm
    };
    let mut cursor = physical_thickness / 2.0;
    let source_by_name = document
        .layers
        .iter()
        .map(|layer| (layer.name.as_str(), layer.index))
        .collect::<HashMap<_, _>>();
    for (index, layer) in document.board.stackup_layers.iter().enumerate() {
        let thickness = layer.thickness_mm.max(0.0);
        cursor -= thickness / 2.0;
        let z_mm = cursor;
        cursor -= thickness / 2.0;
        let role = layer_role(&layer.name, &layer.type_name);
        raw.push(LayerRecord {
            id: index as u32 + 1,
            uid: stable_uid("layer", &layer.name),
            source_index: source_by_name.get(layer.name.as_str()).copied(),
            name: layer.name.clone(),
            role: role.to_owned(),
            z_mm,
            runtime_z_mm: z_mm,
            thickness_mm: thickness,
            material: if layer.material.is_empty() {
                role.to_owned()
            } else {
                layer.material.clone()
            },
            color: layer.color.clone(),
            visibility_group: role.to_owned(),
            stack_index: index,
            epsilon_r: layer.epsilon_r,
            loss_tangent: layer.loss_tangent,
        });
    }
    if raw.is_empty() {
        let copper = document
            .layers
            .iter()
            .filter(|layer| layer.name.ends_with(".Cu"))
            .collect::<Vec<_>>();
        for (index, layer) in copper.iter().enumerate() {
            let z_mm = if layer.name == "F.Cu" {
                document.board.thickness_mm / 2.0 + 0.0175
            } else if layer.name == "B.Cu" {
                -document.board.thickness_mm / 2.0 - 0.0175
            } else {
                0.0
            };
            raw.push(LayerRecord {
                id: index as u32 + 1,
                uid: stable_uid("layer", &layer.name),
                source_index: Some(layer.index),
                name: layer.name.clone(),
                role: "copper".to_owned(),
                z_mm,
                runtime_z_mm: z_mm,
                thickness_mm: 0.035,
                material: "copper".to_owned(),
                color: String::new(),
                visibility_group: "copper".to_owned(),
                stack_index: index,
                epsilon_r: None,
                loss_tangent: None,
            });
        }
    }
    let copper = raw
        .iter()
        .filter(|layer| layer.role == "copper")
        .collect::<Vec<_>>();
    if copper.len() < 2 {
        bail!("semantic mesh pack requires at least two copper stackup layers");
    }
    let bottom = copper
        .iter()
        .min_by(|a, b| a.z_mm.total_cmp(&b.z_mm))
        .unwrap();
    let top = copper
        .iter()
        .max_by(|a, b| a.z_mm.total_cmp(&b.z_mm))
        .unwrap();
    let body_min = bottom.z_mm + bottom.thickness_mm / 2.0;
    let body_max = top.z_mm - top.thickness_mm / 2.0;
    let body_thickness = body_max - body_min;
    for layer in &mut raw {
        let normalized =
            (layer.z_mm + document.board.thickness_mm / 2.0) / document.board.thickness_mm;
        layer.runtime_z_mm = normalized * body_thickness;
    }
    Ok(raw)
}

fn lower_direct(operation: &Operation, tolerance_mm: f64) -> Result<Vec<Region>> {
    if operation.polarity != MaterialPolarity::Add {
        bail!("subtractive analytic operations require Geometer terminal lowering");
    }
    let transform = operation.transform;
    let regions = match &operation.primitive {
        AnalyticPrimitive::Disk {
            center_nm,
            radius_nm,
        } => vec![region(
            circle_nm(*center_nm, *radius_nm, tolerance_mm),
            vec![],
            transform,
        )],
        AnalyticPrimitive::Annulus {
            center_nm,
            outer_radius_nm,
            inner_radius_nm,
        } => vec![region(
            circle_nm(*center_nm, *outer_radius_nm, tolerance_mm),
            vec![circle_nm(*center_nm, *inner_radius_nm, tolerance_mm)],
            transform,
        )],
        AnalyticPrimitive::Capsule {
            start_nm,
            end_nm,
            radius_nm,
        } => vec![region(
            points_to_nm(capsule(
                point_mm(*start_nm),
                point_mm(*end_nm),
                nm_to_mm(*radius_nm),
                tolerance_mm,
            )),
            vec![],
            transform,
        )],
        AnalyticPrimitive::CircularSweep {
            start_nm,
            mid_nm,
            end_nm,
            radius_nm,
        } => {
            let path = sample_arc(
                point_mm(*start_nm),
                point_mm(*mid_nm),
                point_mm(*end_nm),
                tolerance_mm,
            )
            .context("analytic circular sweep is degenerate")?;
            stroke_regions(&path, nm_to_mm(*radius_nm), tolerance_mm, false, transform)
        }
        AnalyticPrimitive::SweptPath {
            points_nm,
            radius_nm,
            closed,
        } => {
            let path = points_nm.iter().copied().map(point_mm).collect::<Vec<_>>();
            stroke_regions(
                &path,
                nm_to_mm(*radius_nm),
                tolerance_mm,
                *closed,
                transform,
            )
        }
        AnalyticPrimitive::RoundedRect {
            center_nm,
            width_nm,
            height_nm,
            radius_nm,
        } => vec![region(
            points_to_nm(rounded_rectangle(
                point_mm(*center_nm),
                nm_to_mm(*width_nm),
                nm_to_mm(*height_nm),
                nm_to_mm(*radius_nm),
                0.0,
                tolerance_mm,
            )),
            vec![],
            transform,
        )],
        AnalyticPrimitive::ChamferedRect {
            center_nm,
            width_nm,
            height_nm,
            ratio,
            corners,
        } => vec![region(
            points_to_nm(chamfered_rectangle(
                point_mm(*center_nm),
                nm_to_mm(*width_nm),
                nm_to_mm(*height_nm),
                *ratio,
                corners,
                0.0,
            )),
            vec![],
            transform,
        )],
        AnalyticPrimitive::Trapezoid {
            center_nm,
            width_nm,
            height_nm,
            delta_x_nm,
            delta_y_nm,
        } => vec![region(
            points_to_nm(trapezoid(
                point_mm(*center_nm),
                nm_to_mm(*width_nm),
                nm_to_mm(*height_nm),
                nm_to_mm(*delta_x_nm),
                nm_to_mm(*delta_y_nm),
                0.0,
            )),
            vec![],
            transform,
        )],
        AnalyticPrimitive::PlanarRegion { outer_nm, holes_nm } => {
            vec![region(outer_nm.clone(), holes_nm.clone(), transform)]
        }
    };
    Ok(regions
        .into_iter()
        .filter(|item| item.outer.len() >= 3)
        .collect())
}

fn stroke_regions(
    path: &[Point],
    radius_mm: f64,
    tolerance_mm: f64,
    closed: bool,
    transform: Affine2D,
) -> Vec<Region> {
    let mut output = Vec::new();
    for segment in path.windows(2) {
        output.push(region(
            points_to_nm(capsule(segment[0], segment[1], radius_mm, tolerance_mm)),
            vec![],
            transform,
        ));
    }
    if closed && path.len() > 2 {
        output.push(region(
            points_to_nm(capsule(
                *path.last().unwrap(),
                path[0],
                radius_mm,
                tolerance_mm,
            )),
            vec![],
            transform,
        ));
    }
    output
}

fn apply_drill_hole(
    regions: &mut [Region],
    drill: &crate::analytic_contract::Drill,
    tolerance_mm: f64,
) {
    if drill.width_nm <= 0 || drill.height_nm <= 0 {
        return;
    }
    let center = point_mm(drill.center_nm);
    let hole = points_to_nm(oval(
        center,
        nm_to_mm(drill.width_nm),
        nm_to_mm(drill.height_nm),
        drill.angle_deg,
        tolerance_mm,
    ));
    for region in regions {
        if point_in_ring(drill.center_nm, &region.outer) {
            region.holes.push(hole.clone());
        }
    }
}

fn clip_regions_to_tile(
    regions: &[Region],
    tile: TileId,
    tile_size_mm: f64,
) -> Result<Vec<Region>> {
    let subjects = regions
        .iter()
        .flat_map(|region| std::iter::once(&region.outer).chain(region.holes.iter()))
        .filter(|ring| ring.len() >= 3)
        .map(|ring| {
            ring.iter()
                .map(|point| [nm_to_mm(point[0]), nm_to_mm(point[1])])
                .collect::<GeometerPath>()
        })
        .collect::<Vec<_>>();
    if subjects.is_empty() {
        return Ok(Vec::new());
    }
    let [min_x, min_y, max_x, max_y] = tile_bounds(tile, tile_size_mm);
    let clips = vec![vec![
        [min_x, min_y],
        [max_x, min_y],
        [max_x, max_y],
        [min_x, max_y],
    ]];
    let request = encode_boolean_request(&BooleanRequest {
        clip_type: ClipType::Intersection,
        fill_rule: FillRule::EvenOdd,
        decimal_precision: 6,
        cleanup_radius_mm: 0.0,
        cleanup_miter_limit: 2.0,
        cleanup_arc_tolerance_mm: 0.005,
        subjects: &subjects,
        clips: &clips,
    })?;
    let response = crate::geometer_ffi::clipper2_boolean(&request)?;
    Ok(decode_boolean_response(&response)?
        .into_iter()
        .map(|region| Region {
            outer: region
                .outline
                .into_iter()
                .map(|point| [mm_to_nm(point[0]), mm_to_nm(point[1])])
                .collect(),
            holes: region
                .holes
                .into_iter()
                .map(|ring| {
                    ring.into_iter()
                        .map(|point| [mm_to_nm(point[0]), mm_to_nm(point[1])])
                        .collect()
                })
                .collect(),
        })
        .collect())
}

fn point_in_ring(point: NmPoint, ring: &[NmPoint]) -> bool {
    if ring.len() < 3 {
        return false;
    }
    let mut inside = false;
    let mut previous = *ring.last().unwrap();
    for &current in ring {
        let crosses = (current[1] > point[1]) != (previous[1] > point[1]);
        if crosses {
            let x = (previous[0] - current[0]) as f64 * (point[1] - current[1]) as f64
                / (previous[1] - current[1]) as f64
                + current[0] as f64;
            if (point[0] as f64) < x {
                inside = !inside;
            }
        }
        previous = current;
    }
    inside
}

fn region(outer: Vec<NmPoint>, holes: Vec<Vec<NmPoint>>, transform: Affine2D) -> Region {
    Region {
        outer: outer
            .into_iter()
            .map(|point| transform.apply(point))
            .collect(),
        holes: holes
            .into_iter()
            .map(|ring| {
                ring.into_iter()
                    .map(|point| transform.apply(point))
                    .collect()
            })
            .collect(),
    }
}

fn append_region_mesh(
    mesh: &mut TileMesh,
    region: &Region,
    y_mm: f64,
    net_id: u32,
    feature_id: u32,
) -> Result<()> {
    let rings = std::iter::once(&region.outer)
        .chain(region.holes.iter())
        .filter(|ring| ring.len() >= 3)
        .collect::<Vec<_>>();
    if rings.is_empty() {
        return Ok(());
    }
    let mut coordinates = Vec::<f64>::new();
    let mut holes = Vec::<usize>::new();
    let mut vertex_count = 0usize;
    for (index, ring) in rings.iter().enumerate() {
        if index != 0 {
            holes.push(vertex_count);
        }
        for point in ring.iter() {
            coordinates.push(nm_to_mm(point[0]));
            coordinates.push(nm_to_mm(point[1]));
            vertex_count += 1;
        }
    }
    let triangles = earcutr::earcut(&coordinates, &holes, 2)
        .map_err(|error| anyhow::anyhow!("triangulation failed: {error}"))?;
    let base = mesh.positions.len() / 3;
    if base + vertex_count > u32::MAX as usize {
        bail!("tile vertex count exceeds uint32 index range");
    }
    for point in coordinates.chunks_exact(2) {
        mesh.positions.push((point[0] / 1000.0) as f32);
        mesh.positions.push((y_mm / 1000.0) as f32);
        mesh.positions.push((point[1] / 1000.0) as f32);
        mesh.net_ids.push(net_id);
        mesh.feature_ids.push(feature_id);
    }
    mesh.indices
        .extend(triangles.into_iter().map(|index| (base + index) as u32));
    Ok(())
}

fn write_tile(path: &Path, mesh: &TileMesh) -> Result<()> {
    let mut output = BufWriter::new(fs::File::create(path)?);
    output.write_all(TILE_MAGIC)?;
    output.write_all(&TILE_FORMAT_VERSION.to_le_bytes())?;
    output.write_all(&(mesh.positions.len() as u32 / 3).to_le_bytes())?;
    output.write_all(&(mesh.indices.len() as u32).to_le_bytes())?;
    output.write_all(&0u32.to_le_bytes())?;
    for value in &mesh.positions {
        output.write_all(&value.to_le_bytes())?;
    }
    for value in &mesh.net_ids {
        output.write_all(&value.to_le_bytes())?;
    }
    for value in &mesh.feature_ids {
        output.write_all(&value.to_le_bytes())?;
    }
    for value in &mesh.indices {
        output.write_all(&value.to_le_bytes())?;
    }
    output.flush()?;
    Ok(())
}

fn build_barrels(
    document: &Document,
    layers: &[LayerRecord],
    layer_by_source: &HashMap<usize, &LayerRecord>,
    source_feature_ids: &HashMap<String, u32>,
    features: &mut [FeatureRecord],
) -> Vec<BarrelRecord> {
    let operation_by_source = document
        .operations
        .iter()
        .map(|operation| (operation.source_uid.as_str(), operation))
        .collect::<HashMap<_, _>>();
    let mut output = Vec::new();
    for drill in document.drills.iter().filter(|drill| drill.plated) {
        let Some(feature_id) = source_feature_ids.get(&drill.source_uid).copied() else {
            continue;
        };
        let layer_ids = drill
            .layer_indexes
            .iter()
            .filter_map(|index| layer_by_source.get(index).map(|layer| layer.id))
            .collect::<Vec<_>>();
        if layer_ids.is_empty() {
            continue;
        }
        let selected = layers
            .iter()
            .filter(|layer| layer_ids.contains(&layer.id))
            .collect::<Vec<_>>();
        let min_y = selected
            .iter()
            .map(|layer| layer.runtime_z_mm - layer.thickness_mm / 2.0)
            .fold(f64::INFINITY, f64::min);
        let max_y = selected
            .iter()
            .map(|layer| layer.runtime_z_mm + layer.thickness_mm / 2.0)
            .fold(f64::NEG_INFINITY, f64::max);
        let center = [nm_to_mm(drill.center_nm[0]), nm_to_mm(drill.center_nm[1])];
        let outer_width = nm_to_mm(drill.width_nm) + DEFAULT_PLATING_THICKNESS_MM * 2.0;
        let outer_height = nm_to_mm(drill.height_nm) + DEFAULT_PLATING_THICKNESS_MM * 2.0;
        let bounds = [
            center[0] - outer_width / 2.0,
            center[1] - outer_height / 2.0,
            min_y,
            center[0] + outer_width / 2.0,
            center[1] + outer_height / 2.0,
            max_y,
        ];
        merge_bounds(&mut features[(feature_id - 1) as usize].bounds_mm, bounds);
        let net_id = operation_by_source
            .get(drill.source_uid.as_str())
            .and_then(|operation| operation.net_index)
            .map(|index| index as u32 + 1)
            .unwrap_or(0);
        output.push(BarrelRecord {
            source_uid: drill.source_uid.clone(),
            object_feature_id: feature_id,
            net_id,
            kind: if drill.kind == "via" {
                "via".to_owned()
            } else {
                "plated_pad".to_owned()
            },
            center_mm: center,
            drill_width_mm: nm_to_mm(drill.width_nm),
            drill_height_mm: nm_to_mm(drill.height_nm),
            outer_width_mm: outer_width,
            outer_height_mm: outer_height,
            plating_thickness_mm: DEFAULT_PLATING_THICKNESS_MM,
            plating_thickness_source: "default",
            start_layer_id: *layer_ids.first().unwrap(),
            end_layer_id: *layer_ids.last().unwrap(),
            layer_ids,
            bounds_mm: bounds,
        });
    }
    output
}

fn build_nets(
    document: &Document,
    features: &[FeatureRecord],
    layers: &[LayerRecord],
) -> Vec<NetRecord> {
    let layer_names = layers
        .iter()
        .map(|layer| (layer.id, layer.name.as_str()))
        .collect::<HashMap<_, _>>();
    document
        .nets
        .iter()
        .map(|net| {
            let id = net.index as u32 + 1;
            let mut metrics = NetMetrics::default();
            let mut bounds = empty_bounds();
            let mut has_bounds = false;
            let mut layer_bounds = BTreeMap::new();
            for feature in features.iter().filter(|feature| feature.net_id == id) {
                *metrics
                    .object_counts
                    .entry(feature.kind.clone())
                    .or_default() += 1;
                for layer_id in &feature.layer_ids {
                    if let Some(name) = layer_names.get(layer_id) {
                        metrics.layers.insert((*name).to_owned());
                    }
                    let value = layer_bounds
                        .entry(layer_id.to_string())
                        .or_insert_with(empty_bounds);
                    merge_bounds(value, feature.bounds_mm);
                }
                merge_bounds(&mut bounds, feature.bounds_mm);
                has_bounds = true;
            }
            NetRecord {
                id,
                uid: net
                    .source_ordinal
                    .map(|value| format!("{value:012}"))
                    .unwrap_or_else(|| stable_uid("net", &net.name)),
                name: net.name.clone(),
                net_class: String::new(),
                aliases: Vec::new(),
                metrics,
                bounds_mm: has_bounds.then_some(bounds),
                layer_bounds_mm: layer_bounds,
            }
        })
        .collect()
}

fn with_null_feature(features: Vec<FeatureRecord>) -> Vec<FeatureRecord> {
    let mut output = Vec::with_capacity(features.len() + 1);
    output.push(FeatureRecord {
        id: 0,
        source_uid: String::new(),
        net_id: 0,
        layer_id: 0,
        layer_ids: Vec::new(),
        kind: "none".to_owned(),
        bounds_mm: [0.0; 6],
        footprint_uid: None,
        component_ref: None,
        pad_number: None,
    });
    output.extend(features);
    output
}

fn with_null_net(nets: Vec<NetRecord>) -> Vec<NetRecord> {
    let mut output = Vec::with_capacity(nets.len() + 1);
    output.push(NetRecord {
        id: 0,
        uid: String::new(),
        name: String::new(),
        net_class: String::new(),
        aliases: Vec::new(),
        metrics: NetMetrics::default(),
        bounds_mm: None,
        layer_bounds_mm: BTreeMap::new(),
    });
    output.extend(nets);
    output
}

fn regions_bounds_mm(regions: &[Region], layer: &LayerRecord) -> [f64; 6] {
    let mut bounds = empty_bounds();
    for point in regions
        .iter()
        .flat_map(|region| std::iter::once(&region.outer).chain(region.holes.iter()))
        .flatten()
    {
        bounds[0] = bounds[0].min(nm_to_mm(point[0]));
        bounds[1] = bounds[1].min(nm_to_mm(point[1]));
        bounds[3] = bounds[3].max(nm_to_mm(point[0]));
        bounds[4] = bounds[4].max(nm_to_mm(point[1]));
    }
    bounds[2] = layer.runtime_z_mm - layer.thickness_mm / 2.0;
    bounds[5] = layer.runtime_z_mm + layer.thickness_mm / 2.0;
    bounds
}

fn scene_bounds(features: &[FeatureRecord], barrels: &[BarrelRecord]) -> SceneBounds {
    let mut bounds = empty_bounds();
    for feature in features {
        merge_bounds(&mut bounds, feature.bounds_mm);
    }
    for barrel in barrels {
        merge_bounds(&mut bounds, barrel.bounds_mm);
    }
    SceneBounds {
        min: [bounds[0] / 1000.0, bounds[2] / 1000.0, bounds[1] / 1000.0],
        max: [bounds[3] / 1000.0, bounds[5] / 1000.0, bounds[4] / 1000.0],
    }
}

fn empty_bounds() -> [f64; 6] {
    [
        f64::INFINITY,
        f64::INFINITY,
        f64::INFINITY,
        f64::NEG_INFINITY,
        f64::NEG_INFINITY,
        f64::NEG_INFINITY,
    ]
}

fn merge_bounds(target: &mut [f64; 6], value: [f64; 6]) {
    target[0] = target[0].min(value[0]);
    target[1] = target[1].min(value[1]);
    target[2] = target[2].min(value[2]);
    target[3] = target[3].max(value[3]);
    target[4] = target[4].max(value[4]);
    target[5] = target[5].max(value[5]);
}

fn geometry_revision(
    document: &Document,
    tile_size_mm: f64,
    tolerance_mm: f64,
    meshopt_level: &str,
) -> String {
    let mut digest = Sha256::new();
    digest.update(document.source.digest_sha256.as_bytes());
    digest.update(document.kicad_monkey_revision.as_bytes());
    digest.update(document.contract_revision.as_bytes());
    digest.update(tile_size_mm.to_le_bytes());
    digest.update(tolerance_mm.to_le_bytes());
    digest.update(meshopt_level.as_bytes());
    digest.update(b"prism-native-semantic-pack-v1");
    digest
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn tile_bounds(tile: TileId, tile_size_mm: f64) -> [f64; 4] {
    [
        tile.x as f64 * tile_size_mm,
        tile.y as f64 * tile_size_mm,
        (tile.x + 1) as f64 * tile_size_mm,
        (tile.y + 1) as f64 * tile_size_mm,
    ]
}

fn normalized_kind(kind: &str) -> &str {
    match kind {
        "zone_fill" => "zone",
        value => value,
    }
}

fn layer_surface_y_mm(layer: &LayerRecord) -> f64 {
    layer.runtime_z_mm + layer.thickness_mm / 2.0
}

fn layer_role(name: &str, type_name: &str) -> &'static str {
    let lower = type_name.to_ascii_lowercase();
    if name.ends_with(".Cu") || lower == "copper" {
        "copper"
    } else if name.ends_with(".Mask") || lower.contains("solder mask") {
        "soldermask"
    } else if name.ends_with(".Paste") || lower.contains("solder paste") {
        "paste"
    } else if name.ends_with(".SilkS") || lower.contains("silk") {
        "silkscreen"
    } else if lower.contains("dielectric") || lower == "core" || lower == "prepreg" {
        "dielectric"
    } else {
        "unknown"
    }
}

fn stable_uid(kind: &str, value: &str) -> String {
    let digest = Sha256::digest(format!("{kind}:{value}").as_bytes());
    format!(
        "{kind}_{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        digest[0], digest[1], digest[2], digest[3], digest[4], digest[5]
    )
}

fn nm_to_mm(value: i64) -> f64 {
    value as f64 / 1_000_000.0
}

fn point_mm(point: NmPoint) -> Point {
    Point::new(nm_to_mm(point[0]), nm_to_mm(point[1]))
}

fn points_to_nm(points: Vec<Point>) -> Vec<NmPoint> {
    points
        .into_iter()
        .map(|point| {
            [
                (point.x * 1_000_000.0).round() as i64,
                (point.y * 1_000_000.0).round() as i64,
            ]
        })
        .collect()
}

fn circle_nm(center: NmPoint, radius: i64, tolerance_mm: f64) -> Vec<NmPoint> {
    points_to_nm(circle(point_mm(center), nm_to_mm(radius), tolerance_mm))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tile_binary_layout_has_a_fixed_header() {
        let mesh = TileMesh {
            layer_id: 1,
            layer_name: "F.Cu".to_owned(),
            tile: TileId { x: 0, y: 0 },
            positions: vec![0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0],
            net_ids: vec![1, 1, 1],
            feature_ids: vec![2, 2, 2],
            indices: vec![0, 1, 2],
        };
        let path = std::env::temp_dir().join(format!(
            "prism-mesh-pack-test-{}-{}.bin",
            std::process::id(),
            std::thread::current().name().unwrap_or("main")
        ));
        write_tile(&path, &mesh).unwrap();
        let bytes = fs::read(&path).unwrap();
        fs::remove_file(path).unwrap();
        assert_eq!(&bytes[0..8], TILE_MAGIC);
        assert_eq!(u32::from_le_bytes(bytes[8..12].try_into().unwrap()), 1);
        assert_eq!(u32::from_le_bytes(bytes[12..16].try_into().unwrap()), 3);
        assert_eq!(u32::from_le_bytes(bytes[16..20].try_into().unwrap()), 3);
        assert_eq!(bytes.len(), 24 + 9 * 4 + 3 * 4 + 3 * 4 + 3 * 4);
    }

    #[test]
    fn annulus_lowering_preserves_a_hole() {
        let operation = Operation {
            source_order: 0,
            semantic_id: "pad:test".to_owned(),
            kind: "pad".to_owned(),
            source_uid: "test".to_owned(),
            net_index: None,
            layer_indexes: vec![0],
            transform: Affine2D::default(),
            bounds_nm: [-2_000_000, -2_000_000, 2_000_000, 2_000_000],
            polarity: MaterialPolarity::Add,
            primitive: AnalyticPrimitive::Annulus {
                center_nm: [0, 0],
                outer_radius_nm: 2_000_000,
                inner_radius_nm: 1_000_000,
            },
            footprint_uid: None,
            component_ref: None,
            pad_number: None,
            island: false,
        };
        let regions = lower_direct(&operation, 0.005).unwrap();
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].holes.len(), 1);
        assert!(regions[0].outer.len() > regions[0].holes[0].len());
    }

    #[test]
    fn drill_record_punches_a_hole_in_a_containing_flash() {
        let mut regions = vec![Region {
            outer: circle_nm([0, 0], 2_000_000, 0.005),
            holes: Vec::new(),
        }];
        let drill = crate::analytic_contract::Drill {
            semantic_id: "pad_hole:test".to_owned(),
            source_uid: "test".to_owned(),
            kind: "plated_pad".to_owned(),
            center_nm: [0, 0],
            width_nm: 1_000_000,
            height_nm: 500_000,
            angle_deg: 90.0,
            oval: true,
            plated: true,
            layer_indexes: vec![0],
            footprint_uid: None,
            component_ref: None,
            pad_number: None,
        };
        apply_drill_hole(&mut regions, &drill, 0.005);
        assert_eq!(regions[0].holes.len(), 1);
        let hole_bounds = regions[0].holes[0].iter().fold(
            [i64::MAX, i64::MAX, i64::MIN, i64::MIN],
            |bounds, point| {
                [
                    bounds[0].min(point[0]),
                    bounds[1].min(point[1]),
                    bounds[2].max(point[0]),
                    bounds[3].max(point[1]),
                ]
            },
        );
        assert!(hole_bounds[3] - hole_bounds[1] > hole_bounds[2] - hole_bounds[0]);
    }
}
