use crate::geometer_packets::{
    BooleanRequest, ClipType, FillRule, Path as GeometerPath, decode_boolean_response,
    encode_boolean_request,
};
use crate::geometry::{
    Point, capsule, circle, oval, rounded_rectangle, sample_arc, transform_footprint,
};
use anyhow::{Context, Result, bail};
use kicad_monkey_core::{
    BoardFootprintOperation, BoardPlotLimits, BoardPlotRecord, BoardTextHAlign, BoardTextOperation,
    BoardTextRenderCacheCoordinateSpace, BoardTextVAlign, NewstrokeLimits, NewstrokeRequest,
    PcbFamily, PcbFootprint, PcbGraphic, PcbGraphicKind, PcbHoleOwner, PcbPoint, PcbPolygonPoint,
    PcbProfileOwner, PcbSelection, PcbView, PlotterFill, PlotterOperation, TextHorizontalAlignment,
    TextVerticalAlignment, board_plot_document, realize_newstroke_a0,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::io::{BufWriter, Write};
use std::path::Path;
use std::time::Instant;

pub const SCHEMA: &str = "prism.board_mesh_pack.v1";
const MAGIC: &[u8; 8] = b"PRSMBD01";
const VERSION: u32 = 1;
const POINT_SCALE: f64 = 10_000.0;
const MIN_REGION_AREA_MM2: f64 = 1.0e-4;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardMeshPack {
    pub schema: &'static str,
    pub version: u32,
    pub source_digest: String,
    pub kicad_monkey_revision: &'static str,
    pub mesh_tolerance_mm: f64,
    pub thickness_mm: f64,
    pub bbox_m: [f64; 6],
    pub mesh_path: &'static str,
    pub silkscreen_mesh_path: &'static str,
    pub vertex_count: usize,
    pub triangle_count: usize,
    pub silkscreen_vertex_count: usize,
    pub silkscreen_triangle_count: usize,
    pub bytes: u64,
    pub metrics: BoardMetrics,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardMetrics {
    pub parse_ms: f64,
    pub profile_ms: f64,
    pub silkscreen_ms: f64,
    pub clipping_ms: f64,
    pub triangulation_ms: f64,
    pub output_ms: f64,
    pub total_ms: f64,
    pub profile_ring_count: usize,
    pub drill_count: usize,
    pub silkscreen_path_count: usize,
}

#[derive(Default)]
struct BoardMesh {
    positions: Vec<f32>,
    normals: Vec<f32>,
    indices: Vec<u32>,
}

#[derive(Clone, Debug)]
struct Segment {
    points: Vec<Point>,
}

impl Segment {
    fn start_key(&self) -> (i64, i64) {
        point_key(self.points[0])
    }

    fn end_key(&self) -> (i64, i64) {
        point_key(*self.points.last().expect("segment has points"))
    }
}

pub fn compile_board_body(
    pcb: &Path,
    output: &Path,
    mesh_tolerance_mm: f64,
) -> Result<BoardMeshPack> {
    if mesh_tolerance_mm <= 0.0 || !mesh_tolerance_mm.is_finite() {
        bail!("board mesh tolerance must be finite and positive");
    }
    if !crate::geometer_ffi::available() {
        bail!("native board body requires a Geometer SDK-linked helper");
    }
    let total_started = Instant::now();
    let source = fs::read(pcb).with_context(|| format!("read {}", pcb.display()))?;
    let source_digest = Sha256::digest(&source)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let text = std::str::from_utf8(&source).context("PCB source is not UTF-8")?;

    let parse_started = Instant::now();
    let selection = PcbSelection::none()
        .with(PcbFamily::Footprints)
        .with(PcbFamily::Profile)
        .with(PcbFamily::Holes);
    let view = PcbView::parse_selected(text, Default::default(), selection)
        .context("parse board profile and holes")?;
    let footprints = view.footprints().collect::<Result<Vec<_>, _>>()?;
    let thickness_mm = view.metadata()?.thickness.max(0.01);
    let parse_ms = parse_started.elapsed().as_secs_f64() * 1000.0;

    let profile_started = Instant::now();
    let profile_rings = profile_rings(&view, &footprints, mesh_tolerance_mm)?;
    if profile_rings.is_empty() {
        bail!("native board body requires at least one closed Edge.Cuts profile");
    }
    let holes = drill_rings(&view, &footprints, mesh_tolerance_mm)?;
    let profile_ms = profile_started.elapsed().as_secs_f64() * 1000.0;

    let silkscreen_started = Instant::now();
    let (front_silkscreen, back_silkscreen) = silkscreen_paths(text, mesh_tolerance_mm)?;
    let silkscreen_path_count = front_silkscreen.len() + back_silkscreen.len();
    let silkscreen_ms = silkscreen_started.elapsed().as_secs_f64() * 1000.0;

    let clipping_started = Instant::now();
    let request = encode_boolean_request(&BooleanRequest {
        clip_type: if holes.is_empty() {
            ClipType::Union
        } else {
            ClipType::Difference
        },
        fill_rule: FillRule::EvenOdd,
        decimal_precision: 6,
        cleanup_radius_mm: 0.0,
        cleanup_miter_limit: 2.0,
        cleanup_arc_tolerance_mm: mesh_tolerance_mm,
        subjects: &profile_rings,
        clips: &holes,
    })?;
    let regions = decode_boolean_response(&crate::geometer_ffi::clipper2_boolean(&request)?)?;
    let clipping_ms = clipping_started.elapsed().as_secs_f64() * 1000.0;
    if regions.is_empty() {
        bail!("Edge.Cuts and drill subtraction produced an empty board body");
    }

    let triangulation_started = Instant::now();
    let mut mesh = BoardMesh::default();
    for region in &regions {
        append_extruded_region(&mut mesh, &region.outline, &region.holes, thickness_mm)?;
    }
    let mut silkscreen_mesh = BoardMesh::default();
    append_silkscreen_mesh(
        &mut silkscreen_mesh,
        &front_silkscreen,
        thickness_mm / 2.0 + 0.01,
        true,
        mesh_tolerance_mm,
    )?;
    append_silkscreen_mesh(
        &mut silkscreen_mesh,
        &back_silkscreen,
        -thickness_mm / 2.0 - 0.01,
        false,
        mesh_tolerance_mm,
    )?;
    let triangulation_ms = triangulation_started.elapsed().as_secs_f64() * 1000.0;
    let bbox_m = mesh_bounds(&mesh.positions);

    let parent = output.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent)?;
    let name = output
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("board-mesh-pack");
    let temporary = parent.join(format!(".{name}.tmp-{}", std::process::id()));
    if temporary.exists() {
        fs::remove_dir_all(&temporary)?;
    }
    fs::create_dir_all(&temporary)?;
    let output_started = Instant::now();
    let mesh_path = temporary.join("board-body.bin");
    write_mesh(&mesh_path, &mesh)?;
    let silkscreen_mesh_path = temporary.join("board-silkscreen.bin");
    write_mesh(&silkscreen_mesh_path, &silkscreen_mesh)?;
    let bytes = mesh_path.metadata()?.len() + silkscreen_mesh_path.metadata()?.len();
    let output_ms = output_started.elapsed().as_secs_f64() * 1000.0;
    let metrics = BoardMetrics {
        parse_ms,
        profile_ms,
        silkscreen_ms,
        clipping_ms,
        triangulation_ms,
        output_ms,
        total_ms: total_started.elapsed().as_secs_f64() * 1000.0,
        profile_ring_count: profile_rings.len(),
        drill_count: holes.len(),
        silkscreen_path_count,
    };
    let pack = BoardMeshPack {
        schema: SCHEMA,
        version: VERSION,
        source_digest,
        kicad_monkey_revision: crate::contract::KICAD_MONKEY_REVISION,
        mesh_tolerance_mm,
        thickness_mm,
        bbox_m,
        mesh_path: "board-body.bin",
        silkscreen_mesh_path: "board-silkscreen.bin",
        vertex_count: mesh.positions.len() / 3,
        triangle_count: mesh.indices.len() / 3,
        silkscreen_vertex_count: silkscreen_mesh.positions.len() / 3,
        silkscreen_triangle_count: silkscreen_mesh.indices.len() / 3,
        bytes,
        metrics,
    };
    fs::write(
        temporary.join("board-mesh-pack.json"),
        serde_json::to_vec(&pack)?,
    )?;
    if output.exists() {
        fs::remove_dir_all(output)?;
    }
    fs::rename(&temporary, output)?;
    Ok(pack)
}

fn profile_rings(
    view: &PcbView<'_>,
    footprints: &[PcbFootprint],
    tolerance: f64,
) -> Result<Vec<GeometerPath>> {
    let mut segments = Vec::new();
    let mut closed = Vec::new();
    for profile in view.profile_primitives() {
        let profile = profile?;
        let transform = |point: PcbPoint| match profile.owner {
            PcbProfileOwner::Board => Point::new(point.x, point.y),
            PcbProfileOwner::Footprint { footprint_index } => footprints
                .get(footprint_index)
                .map_or(Point::new(point.x, point.y), |footprint| {
                    transform_footprint(
                        Point::new(point.x, point.y),
                        Point::new(footprint.at_x.unwrap_or(0.0), footprint.at_y.unwrap_or(0.0)),
                        footprint.angle.unwrap_or(0.0),
                    )
                }),
        };
        append_graphic(
            &profile.graphic,
            &transform,
            tolerance,
            &mut segments,
            &mut closed,
        );
    }
    closed.extend(assemble_rings(&segments));
    closed.retain(|ring| signed_area(ring).abs() > MIN_REGION_AREA_MM2);
    Ok(closed
        .into_iter()
        .map(|ring| ring.into_iter().map(|point| [point.x, point.y]).collect())
        .collect())
}

fn append_graphic(
    graphic: &PcbGraphic,
    transform: &impl Fn(PcbPoint) -> Point,
    tolerance: f64,
    segments: &mut Vec<Segment>,
    closed: &mut Vec<Vec<Point>>,
) {
    match graphic.kind {
        PcbGraphicKind::Line => {
            if let (Some(start), Some(end)) = (graphic.start, graphic.end) {
                segments.push(Segment {
                    points: vec![transform(start), transform(end)],
                });
            }
        }
        PcbGraphicKind::Arc => {
            if let (Some(start), Some(mid), Some(end)) = (graphic.start, graphic.mid, graphic.end)
                && let Some(points) =
                    sample_arc(transform(start), transform(mid), transform(end), tolerance)
            {
                segments.push(Segment { points });
            }
        }
        PcbGraphicKind::Curve if graphic.points.len() == 4 => segments.push(Segment {
            points: sample_curve(
                graphic.points.iter().copied().map(transform).collect(),
                tolerance,
            ),
        }),
        PcbGraphicKind::Rect => {
            if let (Some(start), Some(end)) = (graphic.start, graphic.end) {
                closed.push(
                    [
                        start,
                        PcbPoint {
                            x: end.x,
                            y: start.y,
                        },
                        end,
                        PcbPoint {
                            x: start.x,
                            y: end.y,
                        },
                    ]
                    .into_iter()
                    .map(transform)
                    .collect(),
                );
            }
        }
        PcbGraphicKind::Circle => {
            if let (Some(center), Some(end)) = (graphic.center.or(graphic.start), graphic.end) {
                let center = transform(center);
                let end = transform(end);
                let radius = distance(center, end);
                if radius > 0.0 {
                    closed.push(circle(center, radius, tolerance));
                }
            }
        }
        PcbGraphicKind::Poly => {
            let points = polygon_points(&graphic.polygon_points, transform, tolerance);
            if points.len() >= 3 {
                closed.push(points);
            }
        }
        _ => {}
    }
}

fn polygon_points(
    authored: &[PcbPolygonPoint],
    transform: &impl Fn(PcbPoint) -> Point,
    tolerance: f64,
) -> Vec<Point> {
    let mut output = Vec::new();
    for point in authored {
        match point {
            PcbPolygonPoint::Xy(point) => output.push(transform(*point)),
            PcbPolygonPoint::Arc { start, mid, end } => {
                if let Some(arc) = sample_arc(
                    transform(*start),
                    transform(*mid),
                    transform(*end),
                    tolerance,
                ) {
                    if output
                        .last()
                        .is_some_and(|value| point_key(*value) == point_key(arc[0]))
                    {
                        output.extend_from_slice(&arc[1..]);
                    } else {
                        output.extend(arc);
                    }
                }
            }
        }
    }
    output
}

fn assemble_rings(segments: &[Segment]) -> Vec<Vec<Point>> {
    let mut adjacency = BTreeMap::<(i64, i64), Vec<usize>>::new();
    for (index, segment) in segments.iter().enumerate() {
        adjacency
            .entry(segment.start_key())
            .or_default()
            .push(index);
        adjacency.entry(segment.end_key()).or_default().push(index);
    }
    let mut visited = vec![false; segments.len()];
    let mut output = Vec::new();
    for start_index in 0..segments.len() {
        if visited[start_index] {
            continue;
        }
        let start = &segments[start_index];
        let start_key = start.start_key();
        let mut points = start.points.clone();
        let mut current = start.end_key();
        visited[start_index] = true;
        while current != start_key {
            let Some(next_index) = adjacency
                .get(&current)
                .and_then(|values| values.iter().copied().find(|index| !visited[*index]))
            else {
                break;
            };
            let next = &segments[next_index];
            let (oriented, end) = if next.start_key() == current {
                (next.points.clone(), next.end_key())
            } else {
                let mut reversed = next.points.clone();
                reversed.reverse();
                (reversed, next.start_key())
            };
            points.extend_from_slice(&oriented[1..]);
            current = end;
            visited[next_index] = true;
        }
        if current == start_key && points.len() >= 3 {
            if points
                .last()
                .is_some_and(|point| point_key(*point) == start_key)
            {
                points.pop();
            }
            output.push(points);
        }
    }
    output
}

fn drill_rings(
    view: &PcbView<'_>,
    footprints: &[PcbFootprint],
    tolerance: f64,
) -> Result<Vec<GeometerPath>> {
    let mut output = Vec::new();
    for hole in view.holes() {
        let hole = hole?;
        let (center, angle) = if hole.owner == PcbHoleOwner::Pad {
            let Some(footprint) = hole.footprint_index.and_then(|index| footprints.get(index))
            else {
                continue;
            };
            let local_offset =
                crate::geometry::rotate(Point::new(hole.offset.x, hole.offset.y), -hole.angle);
            let local = Point::new(
                hole.center.x + local_offset.x,
                hole.center.y + local_offset.y,
            );
            (
                transform_footprint(
                    local,
                    Point::new(footprint.at_x.unwrap_or(0.0), footprint.at_y.unwrap_or(0.0)),
                    footprint.angle.unwrap_or(0.0),
                ),
                -(hole.angle + footprint.angle.unwrap_or(0.0)),
            )
        } else {
            (Point::new(hole.center.x, hole.center.y), -hole.angle)
        };
        output.push(
            oval(center, hole.width, hole.height, angle, tolerance)
                .into_iter()
                .map(|point| [point.x, point.y])
                .collect(),
        );
    }
    Ok(output)
}

#[derive(Clone, Copy)]
struct Placement {
    origin: Point,
    angle_deg: f64,
}

impl Placement {
    const IDENTITY: Self = Self {
        origin: Point::new(0.0, 0.0),
        angle_deg: 0.0,
    };

    fn apply(self, point: Point) -> Point {
        transform_footprint(point, self.origin, self.angle_deg)
    }
}

fn silkscreen_paths(
    source: &str,
    tolerance: f64,
) -> Result<(Vec<GeometerPath>, Vec<GeometerPath>)> {
    let presentation_source = crate::materialize::blank_forms_by_head(
        source,
        &["segment", "via", "zone", "pad", "model", "embedded_files"],
    )?;
    let mut limits = BoardPlotLimits::default();
    limits.max_source_bytes = limits
        .max_source_bytes
        .max(presentation_source.len().saturating_add(1));
    // Large production boards can carry dense authored silkscreen and
    // footprint presentation geometry even after copper/zones are blanked.
    // Keep the read bounded, but align its typed-reader ceilings with the
    // upstream PCB reader rather than the much smaller preview defaults.
    limits.max_graphics = limits.max_graphics.max(1_000_000);
    limits.max_parse_nodes = limits.max_parse_nodes.max(4_000_000);
    limits.max_input_points = limits.max_input_points.max(4_000_000);
    limits.max_input_polygons = limits.max_input_polygons.max(1_000_000);
    limits.max_metadata_bytes = limits.max_metadata_bytes.max(128 * 1024 * 1024);
    limits.max_text_bytes = limits.max_text_bytes.max(64 * 1024 * 1024);
    limits.max_net_class_bytes = limits.max_net_class_bytes.max(32 * 1024 * 1024);
    limits.max_operations = limits.max_operations.max(1_000_000);
    let document = board_plot_document(&presentation_source, limits)
        .context("materialize native silkscreen with kicad-monkey board plot facts")?;
    let mut front = Vec::new();
    let mut back = Vec::new();
    for record in document.records {
        match record {
            BoardPlotRecord::Graphic(record) if is_silkscreen(&record.layer) => {
                let target = side_paths(&record.layer, &mut front, &mut back);
                for operation in &record.operations {
                    append_plotter_paths(operation, Placement::IDENTITY, tolerance, target)?;
                }
            }
            BoardPlotRecord::Text(record) if is_silkscreen(&record.layer) => {
                let target = side_paths(&record.layer, &mut front, &mut back);
                for operation in &record.operations {
                    append_text_paths(operation, Placement::IDENTITY, tolerance, target)?;
                }
            }
            BoardPlotRecord::TextBox(record) if is_silkscreen(&record.layer) => {
                let target = side_paths(&record.layer, &mut front, &mut back);
                for operation in &record.operations {
                    match operation {
                        kicad_monkey_core::BoardTextBoxOperation::Border(operation) => {
                            append_plotter_paths(
                                operation,
                                Placement::IDENTITY,
                                tolerance,
                                target,
                            )?;
                        }
                        kicad_monkey_core::BoardTextBoxOperation::Text(operation) => {
                            append_text_paths(operation, Placement::IDENTITY, tolerance, target)?;
                        }
                    }
                }
            }
            BoardPlotRecord::Footprint(record) => {
                let placement = Placement {
                    origin: Point::new(
                        record.placement.x_nm as f64 / 1_000_000.0,
                        record.placement.y_nm as f64 / 1_000_000.0,
                    ),
                    angle_deg: record.placement.angle_deg,
                };
                for operation in &record.operations {
                    match operation {
                        BoardFootprintOperation::Geometry {
                            operation,
                            metadata,
                        } => {
                            let Some(layer) = metadata.extra_attrs.layer_name.as_deref() else {
                                continue;
                            };
                            if is_silkscreen(layer) {
                                append_plotter_paths(
                                    operation,
                                    placement,
                                    tolerance,
                                    side_paths(layer, &mut front, &mut back),
                                )?;
                            }
                        }
                        BoardFootprintOperation::Text {
                            operation,
                            metadata,
                        } => {
                            let Some(layer) = metadata.extra_attrs.layer_name.as_deref() else {
                                continue;
                            };
                            if is_silkscreen(layer) {
                                append_text_paths(
                                    operation,
                                    placement,
                                    tolerance,
                                    side_paths(layer, &mut front, &mut back),
                                )?;
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }
    Ok((front, back))
}

fn is_silkscreen(layer: &str) -> bool {
    matches!(layer, "F.SilkS" | "B.SilkS")
}

fn side_paths<'a>(
    layer: &str,
    front: &'a mut Vec<GeometerPath>,
    back: &'a mut Vec<GeometerPath>,
) -> &'a mut Vec<GeometerPath> {
    if layer == "B.SilkS" { back } else { front }
}

fn append_plotter_paths(
    operation: &PlotterOperation,
    placement: Placement,
    tolerance: f64,
    output: &mut Vec<GeometerPath>,
) -> Result<()> {
    let point = |x: i64, y: i64| {
        placement.apply(Point::new(x as f64 / 1_000_000.0, y as f64 / 1_000_000.0))
    };
    match operation {
        PlotterOperation::ThickSegment(value) => append_stroke(
            output,
            &[
                point(value.start_x, value.start_y),
                point(value.end_x, value.end_y),
            ],
            value.width_nm as f64 / 1_000_000.0,
            false,
            tolerance,
        ),
        PlotterOperation::ArcThreePoint(value) => {
            if let Some(points) = sample_arc(
                point(value.start_x, value.start_y),
                point(value.mid_x, value.mid_y),
                point(value.end_x, value.end_y),
                tolerance,
            ) {
                append_stroke(
                    output,
                    &points,
                    value.width_nm as f64 / 1_000_000.0,
                    false,
                    tolerance,
                );
            }
        }
        PlotterOperation::Circle(value) => {
            let center = point(value.cx, value.cy);
            let radius = value.diameter_nm as f64 / 2_000_000.0;
            if value.fill == PlotterFill::NoFill {
                append_annulus(
                    output,
                    center,
                    radius,
                    value.width_nm as f64 / 1_000_000.0,
                    tolerance,
                );
            } else {
                output.push(to_path(circle(center, radius, tolerance)));
            }
        }
        PlotterOperation::Rect(value) => {
            let center = point((value.x1 + value.x2) / 2, (value.y1 + value.y2) / 2);
            let width = (value.x2 - value.x1).abs() as f64 / 1_000_000.0;
            let height = (value.y2 - value.y1).abs() as f64 / 1_000_000.0;
            let corners = rounded_rectangle(
                center,
                width,
                height,
                value.corner_radius_nm as f64 / 1_000_000.0,
                -placement.angle_deg,
                tolerance,
            );
            if value.fill == PlotterFill::NoFill {
                append_stroke(
                    output,
                    &corners,
                    value.width_nm as f64 / 1_000_000.0,
                    true,
                    tolerance,
                );
            } else {
                output.push(to_path(corners));
            }
        }
        PlotterOperation::PlotPoly(value) => {
            let points = value
                .points
                .iter()
                .map(|value| point(value[0], value[1]))
                .collect::<Vec<_>>();
            if value.fill == PlotterFill::NoFill {
                append_stroke(
                    output,
                    &points,
                    value.width_nm as f64 / 1_000_000.0,
                    true,
                    tolerance,
                );
            } else if points.len() >= 3 {
                output.push(to_path(points));
            }
        }
        PlotterOperation::BezierCurve(value) => {
            let points = sample_curve(
                vec![
                    point(value.start_x, value.start_y),
                    point(value.ctrl1_x, value.ctrl1_y),
                    point(value.ctrl2_x, value.ctrl2_y),
                    point(value.end_x, value.end_y),
                ],
                tolerance,
            );
            append_stroke(
                output,
                &points,
                value.width_nm as f64 / 1_000_000.0,
                false,
                tolerance,
            );
        }
        PlotterOperation::Text(value) => {
            let operation = BoardTextOperation {
                x: value.x,
                y: value.y,
                text: value.text.clone(),
                color: value.color.clone(),
                orient_deg: value.orient_deg,
                size_x_nm: value.size_x_nm,
                size_y_nm: value.size_y_nm,
                h_align: match value.h_align {
                    kicad_monkey_core::PlotterTextHAlign::Left => BoardTextHAlign::Left,
                    kicad_monkey_core::PlotterTextHAlign::Center => BoardTextHAlign::Center,
                    kicad_monkey_core::PlotterTextHAlign::Right => BoardTextHAlign::Right,
                },
                v_align: match value.v_align {
                    kicad_monkey_core::PlotterTextVAlign::Top => BoardTextVAlign::Top,
                    kicad_monkey_core::PlotterTextVAlign::Center => BoardTextVAlign::Center,
                    kicad_monkey_core::PlotterTextVAlign::Bottom => BoardTextVAlign::Bottom,
                },
                pen_width_nm: value.pen_width_nm,
                italic: value.italic,
                bold: value.bold,
                multiline: value.multiline,
                font_face: value.font_face.clone(),
                layer: value.layer.clone(),
                mirror: value.mirror,
                text_as_polygons: false,
                polyline_per_segment: false,
                knockout: false,
                render_cache_polygons: Vec::new(),
                render_cache: None,
            };
            append_text_paths(&operation, placement, tolerance, output)?;
        }
        _ => {}
    }
    Ok(())
}

fn append_text_paths(
    operation: &BoardTextOperation,
    placement: Placement,
    tolerance: f64,
    output: &mut Vec<GeometerPath>,
) -> Result<()> {
    if let Some(cache) = &operation.render_cache {
        let cache_placement =
            if cache.coordinate_space == BoardTextRenderCacheCoordinateSpace::FootprintLocal {
                placement
            } else {
                Placement::IDENTITY
            };
        for polygon in &cache.polygons {
            for (index, contour) in polygon.iter().enumerate() {
                let points = contour
                    .iter()
                    .map(|point| {
                        cache_placement.apply(Point::new(
                            point[0] as f64 / 1_000_000.0,
                            point[1] as f64 / 1_000_000.0,
                        ))
                    })
                    .collect::<Vec<_>>();
                push_oriented(output, points, index == 0);
            }
        }
        return Ok(());
    }
    let realized = realize_newstroke_a0(
        NewstrokeRequest {
            text: &operation.text,
            position_x_mm: operation.x as f64 / 1_000_000.0,
            position_y_mm: operation.y as f64 / 1_000_000.0,
            size_x_mm: operation.size_x_nm as f64 / 1_000_000.0,
            size_y_mm: operation.size_y_nm as f64 / 1_000_000.0,
            angle_degrees: operation.orient_deg,
            horizontal_alignment: match operation.h_align {
                BoardTextHAlign::Left => TextHorizontalAlignment::Left,
                BoardTextHAlign::Center => TextHorizontalAlignment::Center,
                BoardTextHAlign::Right => TextHorizontalAlignment::Right,
            },
            vertical_alignment: match operation.v_align {
                BoardTextVAlign::Top => TextVerticalAlignment::Top,
                BoardTextVAlign::Center => TextVerticalAlignment::Center,
                BoardTextVAlign::Bottom => TextVerticalAlignment::Bottom,
            },
            mirrored: operation.mirror,
            italic: operation.italic,
            bold: operation.bold,
            stroke_width_mm: (operation.pen_width_nm > 0)
                .then_some(operation.pen_width_nm as f64 / 1_000_000.0),
        },
        NewstrokeLimits::default(),
    )
    .context("realize native KiCad NewStroke silkscreen text")?;
    for polyline in realized.polylines {
        let points = polyline
            .points
            .into_iter()
            .map(|point| placement.apply(Point::new(point.x_mm, point.y_mm)))
            .collect::<Vec<_>>();
        append_stroke(
            output,
            &points,
            realized.effective_stroke_width_mm,
            false,
            tolerance,
        );
    }
    Ok(())
}

fn append_stroke(
    output: &mut Vec<GeometerPath>,
    points: &[Point],
    width: f64,
    closed: bool,
    tolerance: f64,
) {
    if width <= 0.0 || points.len() < 2 {
        return;
    }
    let pairs = points
        .windows(2)
        .map(|pair| (pair[0], pair[1]))
        .chain(closed.then(|| (*points.last().unwrap(), points[0])));
    for (start, end) in pairs {
        output.push(to_path(capsule(start, end, width / 2.0, tolerance)));
    }
}

fn append_annulus(
    output: &mut Vec<GeometerPath>,
    center: Point,
    radius: f64,
    width: f64,
    tolerance: f64,
) {
    if width <= 0.0 || radius <= 0.0 {
        return;
    }
    push_oriented(
        output,
        circle(center, radius + width / 2.0, tolerance),
        true,
    );
    if radius > width / 2.0 {
        push_oriented(
            output,
            circle(center, radius - width / 2.0, tolerance),
            false,
        );
    }
}

fn push_oriented(output: &mut Vec<GeometerPath>, mut points: Vec<Point>, positive: bool) {
    if points.len() < 3 {
        return;
    }
    if (signed_area(&points) > 0.0) != positive {
        points.reverse();
    }
    output.push(to_path(points));
}

fn to_path(points: Vec<Point>) -> GeometerPath {
    points.into_iter().map(|point| [point.x, point.y]).collect()
}

fn append_silkscreen_mesh(
    mesh: &mut BoardMesh,
    paths: &[GeometerPath],
    y_mm: f64,
    top: bool,
    tolerance: f64,
) -> Result<()> {
    if paths.is_empty() {
        return Ok(());
    }
    let request = encode_boolean_request(&BooleanRequest {
        clip_type: ClipType::Union,
        fill_rule: FillRule::NonZero,
        decimal_precision: 6,
        cleanup_radius_mm: 0.0,
        cleanup_miter_limit: 2.0,
        cleanup_arc_tolerance_mm: tolerance,
        subjects: paths,
        clips: &[],
    })?;
    let regions = decode_boolean_response(&crate::geometer_ffi::clipper2_boolean(&request)?)?;
    for region in regions {
        let rings = std::iter::once(&region.outline)
            .chain(region.holes.iter())
            .filter(|ring| ring.len() >= 3)
            .collect::<Vec<_>>();
        let mut coordinates = Vec::new();
        let mut hole_indexes = Vec::new();
        let mut vertex_count = 0usize;
        for (index, ring) in rings.iter().enumerate() {
            if index != 0 {
                hole_indexes.push(vertex_count);
            }
            for point in ring.iter() {
                coordinates.extend_from_slice(point);
                vertex_count += 1;
            }
        }
        let triangles = earcutr::earcut(&coordinates, &hole_indexes, 2)
            .map_err(|error| anyhow::anyhow!("silkscreen triangulation failed: {error}"))?;
        append_surface(
            mesh,
            &coordinates,
            &triangles,
            y_mm,
            if top {
                [0.0, 1.0, 0.0]
            } else {
                [0.0, -1.0, 0.0]
            },
            top,
        )?;
    }
    Ok(())
}

fn append_extruded_region(
    mesh: &mut BoardMesh,
    outer: &GeometerPath,
    holes: &[GeometerPath],
    thickness_mm: f64,
) -> Result<()> {
    let rings = std::iter::once(outer)
        .chain(holes.iter())
        .filter(|ring| ring.len() >= 3)
        .collect::<Vec<_>>();
    let mut coordinates = Vec::new();
    let mut hole_indexes = Vec::new();
    let mut vertex_count = 0usize;
    for (index, ring) in rings.iter().enumerate() {
        if index != 0 {
            hole_indexes.push(vertex_count);
        }
        for point in ring.iter() {
            coordinates.extend_from_slice(point);
            vertex_count += 1;
        }
    }
    let triangles = earcutr::earcut(&coordinates, &hole_indexes, 2)
        .map_err(|error| anyhow::anyhow!("board surface triangulation failed: {error}"))?;
    let top = thickness_mm / 2.0;
    append_surface(mesh, &coordinates, &triangles, top, [0.0, 1.0, 0.0], true)?;
    append_surface(
        mesh,
        &coordinates,
        &triangles,
        -top,
        [0.0, -1.0, 0.0],
        false,
    )?;
    append_walls(mesh, outer, top, false)?;
    for hole in holes {
        append_walls(mesh, hole, top, true)?;
    }
    Ok(())
}

fn append_surface(
    mesh: &mut BoardMesh,
    coordinates: &[f64],
    triangles: &[usize],
    y_mm: f64,
    normal: [f32; 3],
    top: bool,
) -> Result<()> {
    let base = mesh.positions.len() / 3;
    if base + coordinates.len() / 2 > u32::MAX as usize {
        bail!("board mesh exceeds uint32 vertex range");
    }
    for point in coordinates.chunks_exact(2) {
        mesh.positions.extend_from_slice(&[
            (point[0] / 1000.0) as f32,
            (y_mm / 1000.0) as f32,
            (point[1] / 1000.0) as f32,
        ]);
        mesh.normals.extend_from_slice(&normal);
    }
    for triangle in triangles.chunks_exact(3) {
        let mut values = [triangle[0], triangle[1], triangle[2]];
        let a = [coordinates[values[0] * 2], coordinates[values[0] * 2 + 1]];
        let b = [coordinates[values[1] * 2], coordinates[values[1] * 2 + 1]];
        let c = [coordinates[values[2] * 2], coordinates[values[2] * 2 + 1]];
        let upward = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) > 0.0;
        if upward != top {
            values.swap(1, 2);
        }
        mesh.indices
            .extend(values.into_iter().map(|index| (base + index) as u32));
    }
    Ok(())
}

fn append_walls(
    mesh: &mut BoardMesh,
    ring: &GeometerPath,
    half_height_mm: f64,
    hole: bool,
) -> Result<()> {
    let area = path_area(ring);
    for index in 0..ring.len() {
        let first = ring[index];
        let second = ring[(index + 1) % ring.len()];
        let dx = second[0] - first[0];
        let dz = second[1] - first[1];
        let length = dx.hypot(dz);
        if length <= f64::EPSILON {
            continue;
        }
        let mut normal = if area >= 0.0 {
            [dz / length, 0.0, -dx / length]
        } else {
            [-dz / length, 0.0, dx / length]
        };
        if hole {
            normal[0] = -normal[0];
            normal[2] = -normal[2];
        }
        let base = mesh.positions.len() / 3;
        if base + 4 > u32::MAX as usize {
            bail!("board mesh exceeds uint32 vertex range");
        }
        for (point, y) in [
            (first, half_height_mm),
            (first, -half_height_mm),
            (second, -half_height_mm),
            (second, half_height_mm),
        ] {
            mesh.positions.extend_from_slice(&[
                (point[0] / 1000.0) as f32,
                (y / 1000.0) as f32,
                (point[1] / 1000.0) as f32,
            ]);
            mesh.normals
                .extend_from_slice(&[normal[0] as f32, 0.0, normal[2] as f32]);
        }
        mesh.indices.extend_from_slice(&[
            base as u32,
            (base + 1) as u32,
            (base + 2) as u32,
            base as u32,
            (base + 2) as u32,
            (base + 3) as u32,
        ]);
    }
    Ok(())
}

fn sample_curve(points: Vec<Point>, tolerance: f64) -> Vec<Point> {
    let [p0, p1, p2, p3] = points.as_slice() else {
        return points;
    };
    let length = distance(*p0, *p1) + distance(*p1, *p2) + distance(*p2, *p3);
    let count = ((length / tolerance.max(0.01)).ceil() as usize + 1).clamp(9, 2049);
    (0..count)
        .map(|index| {
            let t = index as f64 / (count - 1) as f64;
            let opposite = 1.0 - t;
            Point::new(
                opposite.powi(3) * p0.x
                    + 3.0 * opposite.powi(2) * t * p1.x
                    + 3.0 * opposite * t.powi(2) * p2.x
                    + t.powi(3) * p3.x,
                opposite.powi(3) * p0.y
                    + 3.0 * opposite.powi(2) * t * p1.y
                    + 3.0 * opposite * t.powi(2) * p2.y
                    + t.powi(3) * p3.y,
            )
        })
        .collect()
}

fn write_mesh(path: &Path, mesh: &BoardMesh) -> Result<()> {
    let mut output = BufWriter::new(fs::File::create(path)?);
    output.write_all(MAGIC)?;
    output.write_all(&VERSION.to_le_bytes())?;
    output.write_all(&((mesh.positions.len() / 3) as u32).to_le_bytes())?;
    output.write_all(&(mesh.indices.len() as u32).to_le_bytes())?;
    output.write_all(&0u32.to_le_bytes())?;
    for value in &mesh.positions {
        output.write_all(&value.to_le_bytes())?;
    }
    for value in &mesh.normals {
        output.write_all(&value.to_le_bytes())?;
    }
    for value in &mesh.indices {
        output.write_all(&value.to_le_bytes())?;
    }
    output.flush()?;
    Ok(())
}

fn mesh_bounds(positions: &[f32]) -> [f64; 6] {
    let mut bounds = [
        f64::INFINITY,
        f64::INFINITY,
        f64::INFINITY,
        f64::NEG_INFINITY,
        f64::NEG_INFINITY,
        f64::NEG_INFINITY,
    ];
    for point in positions.chunks_exact(3) {
        for axis in 0..3 {
            let value = point[axis] as f64;
            bounds[axis] = bounds[axis].min(value);
            bounds[axis + 3] = bounds[axis + 3].max(value);
        }
    }
    bounds
}

fn point_key(point: Point) -> (i64, i64) {
    (
        (point.x * POINT_SCALE).round() as i64,
        (point.y * POINT_SCALE).round() as i64,
    )
}

fn signed_area(points: &[Point]) -> f64 {
    points
        .iter()
        .zip(points.iter().cycle().skip(1))
        .take(points.len())
        .map(|(left, right)| left.x * right.y - right.x * left.y)
        .sum::<f64>()
        / 2.0
}

fn path_area(points: &GeometerPath) -> f64 {
    points
        .iter()
        .zip(points.iter().cycle().skip(1))
        .take(points.len())
        .map(|(left, right)| left[0] * right[1] - right[0] * left[1])
        .sum::<f64>()
        / 2.0
}

fn distance(first: Point, second: Point) -> f64 {
    (first.x - second.x).hypot(first.y - second.y)
}

#[cfg(test)]
mod tests {
    use super::*;

    const BOARD: &str = r#"(kicad_pcb
  (version 20241229)
  (generator pcbnew)
  (general (thickness 1.6))
  (layers
    (0 "F.Cu" signal)
    (31 "B.Cu" signal)
    (44 "Edge.Cuts" user)
  )
  (footprint "Fixture:Slot"
    (layer "F.Cu")
    (at 5 4 90)
    (pad "1" thru_hole oval
      (at 1 0 30)
      (size 2 1)
      (drill oval 1.2 0.6 (offset 0.1 0))
      (layers "*.Cu" "*.Mask")
    )
  )
  (gr_line (start 0 0) (end 10 0) (stroke (width 0.05) (type default)) (layer "Edge.Cuts"))
  (gr_line (start 10 0) (end 10 8) (stroke (width 0.05) (type default)) (layer "Edge.Cuts"))
  (gr_line (start 10 8) (end 0 8) (stroke (width 0.05) (type default)) (layer "Edge.Cuts"))
  (gr_line (start 0 8) (end 0 0) (stroke (width 0.05) (type default)) (layer "Edge.Cuts"))
)"#;

    fn parsed_board() -> (PcbView<'static>, Vec<PcbFootprint>) {
        let selection = PcbSelection::none()
            .with(PcbFamily::Footprints)
            .with(PcbFamily::Profile)
            .with(PcbFamily::Holes);
        let view = PcbView::parse_selected(BOARD, Default::default(), selection).unwrap();
        let footprints = view.footprints().collect::<Result<Vec<_>, _>>().unwrap();
        (view, footprints)
    }

    #[test]
    fn profile_segments_are_stitched_and_pad_slots_are_transformed() {
        let (view, footprints) = parsed_board();
        let profiles = profile_rings(&view, &footprints, 0.005).unwrap();
        let holes = drill_rings(&view, &footprints, 0.005).unwrap();

        assert_eq!(profiles.len(), 1);
        assert_eq!(profiles[0].len(), 4);
        assert_eq!(holes.len(), 1);
        let bounds = holes[0].iter().fold(
            [
                f64::INFINITY,
                f64::INFINITY,
                f64::NEG_INFINITY,
                f64::NEG_INFINITY,
            ],
            |mut bounds, point| {
                bounds[0] = bounds[0].min(point[0]);
                bounds[1] = bounds[1].min(point[1]);
                bounds[2] = bounds[2].max(point[0]);
                bounds[3] = bounds[3].max(point[1]);
                bounds
            },
        );
        assert!(bounds[0] > 4.0 && bounds[2] < 6.0);
        assert!(bounds[1] > 2.0 && bounds[3] < 4.0);
    }

    #[test]
    fn extrusion_generates_top_bottom_and_wall_geometry() {
        let mut mesh = BoardMesh::default();
        let outline = vec![[0.0, 0.0], [10.0, 0.0], [10.0, 8.0], [0.0, 8.0]];
        let hole = vec![[4.0, 3.0], [4.0, 5.0], [6.0, 5.0], [6.0, 3.0]];

        append_extruded_region(&mut mesh, &outline, &[hole], 1.6).unwrap();

        assert!(!mesh.positions.is_empty());
        assert_eq!(mesh.positions.len(), mesh.normals.len());
        assert_eq!(mesh.indices.len() % 3, 0);
        assert!((mesh_bounds(&mesh.positions)[1] + 0.0008).abs() < 1.0e-9);
        assert!((mesh_bounds(&mesh.positions)[4] - 0.0008).abs() < 1.0e-9);
    }
}
