use crate::analytic_contract as analytic;
use crate::contract::{
    Board, CoordinateSystem, Diagnostic, Document, Drill, Feature, KICAD_MONKEY_REVISION, Layer,
    Metrics, Net, SCHEMA, SourceIdentity, StackupLayer,
};
use crate::geometry::{
    Point, capsule, chamfered_rectangle, circle, mm_to_nm, oval, point_to_nm, rectangle,
    ring_to_nm, rounded_rectangle, sample_arc, transform_footprint, trapezoid,
};
use anyhow::{Context, Result, bail};
use kicad_monkey_core::{
    BoardFootprintOperation, BoardPlotLimits, BoardPlotRecord, BoardViaOperationKind, PcbFamily,
    PcbFootprint, PcbNetRef, PcbPad, PcbPadPrimitiveGeometry, PcbPoint, PcbPolygonPoint,
    PcbResolvedPadCopperLayer, PcbRoutingArc, PcbSegment, PcbSelection, PcbVia, PcbView, PcbZone,
    Selector, board_plot_document, resolve_pad_copper_layer, scan_form_spans,
};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs;
use std::path::Path;
use std::time::Instant;

pub const DEFAULT_TOLERANCE_MM: f64 = 0.005;

/// Boundary consumed by the native semantic compiler.  The temporary producer
/// is intentionally Prism-owned; the future upstream implementation must emit
/// the same contract so the compiler and renderer do not change with it.
pub trait AnalyticProducer {
    fn produce(&self, path: &Path, terminal_tolerance_mm: f64) -> Result<analytic::Document>;
}

pub struct TemporaryPrismProducer;

#[allow(dead_code)]
pub struct UpstreamMonkeyProducer;

impl AnalyticProducer for UpstreamMonkeyProducer {
    fn produce(&self, _path: &Path, _terminal_tolerance_mm: f64) -> Result<analytic::Document> {
        bail!(
            "the public kicad_monkey analytic PCB materializer is not available at revision {}",
            KICAD_MONKEY_REVISION
        )
    }
}

pub fn materialize_analytic(path: &Path, terminal_tolerance_mm: f64) -> Result<analytic::Document> {
    TemporaryPrismProducer.produce(path, terminal_tolerance_mm)
}

#[derive(Default)]
struct FlashOverrides {
    vias: HashMap<String, Vec<String>>,
    pads: HashMap<String, Vec<String>>,
    used_oracle: bool,
}

struct NetCatalog {
    nets: Vec<Net>,
    by_key: HashMap<String, usize>,
}

impl NetCatalog {
    fn from_sources<'a>(
        source_nets: impl IntoIterator<Item = (i64, String)>,
        refs: impl IntoIterator<Item = &'a PcbNetRef>,
    ) -> Self {
        let mut source_ordinals = BTreeMap::<String, i64>::new();
        for (ordinal, name) in source_nets {
            if !name.is_empty() {
                source_ordinals.entry(name).or_insert(ordinal);
            }
        }
        let mut keys = BTreeSet::new();
        keys.extend(source_ordinals.keys().cloned());
        for net in refs {
            if let Some(key) = net_key(net) {
                keys.insert(key);
            }
        }
        let nets = keys
            .into_iter()
            .enumerate()
            .map(|(index, key)| Net {
                index,
                name: key.clone(),
                source_ordinal: source_ordinals.get(&key).copied(),
                key,
            })
            .collect::<Vec<_>>();
        let by_key = nets
            .iter()
            .map(|net| (net.key.clone(), net.index))
            .collect();
        Self { nets, by_key }
    }

    fn index(&self, net: &PcbNetRef) -> Option<usize> {
        net_key(net).and_then(|key| self.by_key.get(&key).copied())
    }
}

pub fn materialize(path: &Path, curve_tolerance_mm: f64) -> Result<Document> {
    if curve_tolerance_mm <= 0.0 || !curve_tolerance_mm.is_finite() {
        bail!("curve tolerance must be finite and positive");
    }
    let total_started = Instant::now();
    let read_started = Instant::now();
    let bytes = fs::read(path).with_context(|| format!("read {}", path.display()))?;
    let source_read_ms = read_started.elapsed().as_secs_f64() * 1000.0;
    let source =
        std::str::from_utf8(&bytes).with_context(|| format!("{} is not UTF-8", path.display()))?;
    let digest_sha256 = Sha256::digest(&bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();

    let parse_started = Instant::now();
    let selection = PcbSelection::none()
        .with(PcbFamily::Layers)
        .with(PcbFamily::Setup)
        .with(PcbFamily::Nets)
        .with(PcbFamily::Footprints)
        .with(PcbFamily::Pads)
        .with(PcbFamily::Segments)
        .with(PcbFamily::Arcs)
        .with(PcbFamily::Vias)
        .with(PcbFamily::Zones)
        .with(PcbFamily::Holes)
        .with(PcbFamily::FootprintTransforms);
    let view = PcbView::parse_selected(source, Default::default(), selection)
        .context("parse selected PCB source families with kicad-monkey-core")?;
    let parse_index_ms = parse_started.elapsed().as_secs_f64() * 1000.0;

    let extraction_started = Instant::now();
    let source_layers = view.layers().collect::<Result<Vec<_>, _>>()?;
    let layers = contract_layers(&source_layers);
    let copper_names = layers
        .iter()
        .filter(|layer| layer.name.ends_with(".Cu"))
        .map(|layer| layer.name.clone())
        .collect::<Vec<_>>();
    if copper_names.is_empty() {
        bail!("board exposes no copper layers");
    }
    let layer_index = layers
        .iter()
        .map(|layer| (layer.name.clone(), layer.index))
        .collect::<HashMap<_, _>>();

    let source_nets = view.nets().collect::<Result<Vec<_>, _>>()?;
    let footprints = view.footprints().collect::<Result<Vec<_>, _>>()?;
    let pads = view.pads().collect::<Result<Vec<_>, _>>()?;
    let segments = view.segments().collect::<Result<Vec<_>, _>>()?;
    let arcs = view.arcs().collect::<Result<Vec<_>, _>>()?;
    let vias = view.vias().collect::<Result<Vec<_>, _>>()?;
    let zones = copper_zones(&view, source, selection)?;
    let metadata = view.metadata().context("decode board metadata")?;
    let setup = view.setup().context("decode board setup")?;
    let board = Board {
        thickness_mm: metadata.thickness,
        aux_axis_origin_nm: setup
            .as_ref()
            .map(|value| point_to_nm(point(value.aux_axis_origin)))
            .unwrap_or([0, 0]),
        stackup_layers: setup
            .as_ref()
            .and_then(|value| value.stackup.as_ref())
            .map(|stackup| {
                stackup
                    .layers
                    .iter()
                    .map(|layer| StackupLayer {
                        name: layer.name.clone(),
                        type_name: layer.type_name.clone(),
                        thickness_mm: layer.thickness,
                        material: layer.material.clone(),
                        epsilon_r: layer.epsilon_r,
                        loss_tangent: layer.loss_tangent,
                        color: layer.color.clone(),
                    })
                    .collect()
            })
            .unwrap_or_default(),
        copper_finish: setup
            .as_ref()
            .and_then(|value| value.stackup.as_ref())
            .map(|value| value.copper_finish.clone())
            .unwrap_or_default(),
        edge_connector: setup
            .as_ref()
            .and_then(|value| value.stackup.as_ref())
            .map(|value| value.edge_connector.clone())
            .unwrap_or_default(),
        edge_plating: setup
            .as_ref()
            .and_then(|value| value.stackup.as_ref())
            .is_some_and(|value| value.edge_plating),
    };

    let net_refs = segments
        .iter()
        .map(|item| &item.net)
        .chain(arcs.iter().map(|item| &item.net))
        .chain(vias.iter().map(|item| &item.net))
        .chain(pads.iter().map(|item| &item.net))
        .chain(zones.iter().map(|item| &item.net));
    let net_catalog = NetCatalog::from_sources(
        source_nets.into_iter().map(|net| (net.code, net.name)),
        net_refs,
    );

    let mut diagnostics = Vec::new();
    let overrides = flash_overrides(source, &view, &vias, &pads, &mut diagnostics)?;
    let mut features = Vec::new();
    let mut drills = Vec::new();
    let mut source_order = 0usize;

    for segment in &segments {
        append_segment(
            segment,
            curve_tolerance_mm,
            &layer_index,
            &net_catalog,
            &mut source_order,
            &mut features,
        );
    }
    for arc in &arcs {
        append_arc(
            arc,
            curve_tolerance_mm,
            &layer_index,
            &net_catalog,
            &mut source_order,
            &mut features,
            &mut diagnostics,
        );
    }
    for via in &vias {
        append_via(
            via,
            curve_tolerance_mm,
            &copper_names,
            &layer_index,
            &net_catalog,
            &overrides,
            &mut source_order,
            &mut features,
            &mut drills,
        );
    }
    for zone in &zones {
        append_zone(
            zone,
            &layer_index,
            &net_catalog,
            &mut source_order,
            &mut features,
        );
    }
    for (pad_index, pad) in pads.iter().enumerate() {
        let Some(footprint) = footprints.get(pad.footprint_index) else {
            diagnostics.push(Diagnostic {
                severity: "error",
                code: "missing_footprint",
                message: format!(
                    "pad index {pad_index} references missing footprint {}",
                    pad.footprint_index
                ),
                source_uid: pad.uuid.clone(),
            });
            continue;
        };
        append_pad(
            pad,
            footprint,
            pad_index,
            curve_tolerance_mm,
            &copper_names,
            &layer_index,
            &net_catalog,
            &overrides,
            &mut source_order,
            &mut features,
            &mut drills,
            &mut diagnostics,
        );
    }

    let bounds_nm = feature_bounds(&features);
    let mut stats = BTreeMap::new();
    stats.insert("tracks".to_owned(), segments.len());
    stats.insert("track_arcs".to_owned(), arcs.len());
    stats.insert("vias".to_owned(), vias.len());
    stats.insert("pads".to_owned(), pads.len());
    stats.insert(
        "zone_fills".to_owned(),
        zones.iter().map(|zone| zone.filled_polygons.len()).sum(),
    );
    stats.insert("features".to_owned(), features.len());
    stats.insert("drills".to_owned(), drills.len());
    stats.insert("nets".to_owned(), net_catalog.nets.len());
    stats.insert("layers".to_owned(), layers.len());
    stats.insert("copper_layers".to_owned(), copper_names.len());
    stats.insert(
        "unsupported_features".to_owned(),
        diagnostics
            .iter()
            .filter(|item| item.code.starts_with("unsupported_") || item.severity == "error")
            .count(),
    );
    let extraction_ms = extraction_started.elapsed().as_secs_f64() * 1000.0;

    Ok(Document {
        schema: SCHEMA,
        kicad_monkey_revision: KICAD_MONKEY_REVISION,
        kicad_monkey_engine_version: kicad_monkey_core::ENGINE_VERSION,
        source: SourceIdentity {
            path: path.display().to_string(),
            digest_sha256,
            bytes: bytes.len(),
        },
        coordinate_system: CoordinateSystem::default(),
        curve_tolerance_mm,
        board,
        bounds_nm,
        layers,
        nets: net_catalog.nets,
        features,
        drills,
        diagnostics,
        stats,
        metrics: Metrics {
            source_read_ms,
            parse_index_ms,
            extraction_ms,
            serialization_ms: 0.0,
            total_ms: total_started.elapsed().as_secs_f64() * 1000.0,
            used_plot_facts_flash_oracle: overrides.used_oracle,
        },
    })
}

impl AnalyticProducer for TemporaryPrismProducer {
    fn produce(&self, path: &Path, terminal_tolerance_mm: f64) -> Result<analytic::Document> {
        if terminal_tolerance_mm <= 0.0 || !terminal_tolerance_mm.is_finite() {
            bail!("terminal tolerance must be finite and positive");
        }
        let total_started = Instant::now();
        let read_started = Instant::now();
        let bytes = fs::read(path).with_context(|| format!("read {}", path.display()))?;
        let source_read_ms = read_started.elapsed().as_secs_f64() * 1000.0;
        let source = std::str::from_utf8(&bytes)
            .with_context(|| format!("{} is not UTF-8", path.display()))?;
        let digest_sha256 = Sha256::digest(&bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();

        let parse_started = Instant::now();
        let selection = PcbSelection::none()
            .with(PcbFamily::Layers)
            .with(PcbFamily::Setup)
            .with(PcbFamily::Nets)
            .with(PcbFamily::Footprints)
            .with(PcbFamily::Pads)
            .with(PcbFamily::Segments)
            .with(PcbFamily::Arcs)
            .with(PcbFamily::Vias)
            .with(PcbFamily::Zones)
            .with(PcbFamily::Holes)
            .with(PcbFamily::FootprintTransforms);
        let view = PcbView::parse_selected(source, Default::default(), selection)
            .context("parse selected PCB source families with kicad-monkey-core")?;
        let parse_index_ms = parse_started.elapsed().as_secs_f64() * 1000.0;

        let analytics_started = Instant::now();
        let source_layers = view.layers().collect::<Result<Vec<_>, _>>()?;
        let legacy_layers = contract_layers(&source_layers);
        let copper_names = legacy_layers
            .iter()
            .filter(|layer| layer.name.ends_with(".Cu"))
            .map(|layer| layer.name.clone())
            .collect::<Vec<_>>();
        if copper_names.is_empty() {
            bail!("board exposes no copper layers");
        }
        let layer_index = legacy_layers
            .iter()
            .map(|layer| (layer.name.clone(), layer.index))
            .collect::<HashMap<_, _>>();

        let source_nets = view.nets().collect::<Result<Vec<_>, _>>()?;
        let footprints = view.footprints().collect::<Result<Vec<_>, _>>()?;
        let pads = view.pads().collect::<Result<Vec<_>, _>>()?;
        let segments = view.segments().collect::<Result<Vec<_>, _>>()?;
        let arcs = view.arcs().collect::<Result<Vec<_>, _>>()?;
        let vias = view.vias().collect::<Result<Vec<_>, _>>()?;
        let zones = copper_zones(&view, source, selection)?;
        let metadata = view.metadata().context("decode board metadata")?;
        let setup = view.setup().context("decode board setup")?;

        let net_refs = segments
            .iter()
            .map(|item| &item.net)
            .chain(arcs.iter().map(|item| &item.net))
            .chain(vias.iter().map(|item| &item.net))
            .chain(pads.iter().map(|item| &item.net))
            .chain(zones.iter().map(|item| &item.net));
        let net_catalog = NetCatalog::from_sources(
            source_nets.into_iter().map(|net| (net.code, net.name)),
            net_refs,
        );

        let mut legacy_diagnostics = Vec::new();
        let overrides = flash_overrides(source, &view, &vias, &pads, &mut legacy_diagnostics)?;
        let mut diagnostics = legacy_diagnostics
            .into_iter()
            .map(|item| analytic::Diagnostic {
                severity: item.severity,
                code: item.code,
                message: item.message,
                source_uid: item.source_uid,
            })
            .collect::<Vec<_>>();
        let mut operations = Vec::new();
        let mut drills = Vec::new();
        let mut source_order = 0usize;

        for segment in &segments {
            append_analytic_segment(
                segment,
                &layer_index,
                &net_catalog,
                &mut source_order,
                &mut operations,
            );
        }
        for arc in &arcs {
            append_analytic_arc(
                arc,
                &layer_index,
                &net_catalog,
                &mut source_order,
                &mut operations,
                &mut diagnostics,
            );
        }
        for via in &vias {
            append_analytic_via(
                via,
                &copper_names,
                &layer_index,
                &net_catalog,
                &overrides,
                &mut source_order,
                &mut operations,
                &mut drills,
            );
        }
        for zone in &zones {
            append_analytic_zone(
                zone,
                &layer_index,
                &net_catalog,
                &mut source_order,
                &mut operations,
            );
        }
        for (pad_index, pad) in pads.iter().enumerate() {
            let Some(footprint) = footprints.get(pad.footprint_index) else {
                diagnostics.push(analytic::Diagnostic {
                    severity: "error",
                    code: "missing_footprint",
                    message: format!(
                        "pad index {pad_index} references missing footprint {}",
                        pad.footprint_index
                    ),
                    source_uid: pad.uuid.clone(),
                });
                continue;
            };
            append_analytic_pad(
                pad,
                footprint,
                terminal_tolerance_mm,
                &copper_names,
                &layer_index,
                &net_catalog,
                &overrides,
                &mut source_order,
                &mut operations,
                &mut drills,
                &mut diagnostics,
            );
        }

        let bounds_nm = analytic_operation_bounds(&operations);
        let mut stats = BTreeMap::new();
        stats.insert("tracks".to_owned(), segments.len());
        stats.insert("track_arcs".to_owned(), arcs.len());
        stats.insert("vias".to_owned(), vias.len());
        stats.insert("pads".to_owned(), pads.len());
        stats.insert(
            "zone_fills".to_owned(),
            zones.iter().map(|zone| zone.filled_polygons.len()).sum(),
        );
        stats.insert("operations".to_owned(), operations.len());
        stats.insert("drills".to_owned(), drills.len());
        stats.insert("nets".to_owned(), net_catalog.nets.len());
        stats.insert("layers".to_owned(), legacy_layers.len());
        stats.insert("copper_layers".to_owned(), copper_names.len());
        stats.insert(
            "unsupported_features".to_owned(),
            diagnostics
                .iter()
                .filter(|item| item.code.starts_with("unsupported_") || item.severity == "error")
                .count(),
        );
        let analytics_ms = analytics_started.elapsed().as_secs_f64() * 1000.0;

        let board = analytic::Board {
            thickness_mm: metadata.thickness,
            aux_axis_origin_nm: setup
                .as_ref()
                .map(|value| point_to_nm(point(value.aux_axis_origin)))
                .unwrap_or([0, 0]),
            stackup_layers: setup
                .as_ref()
                .and_then(|value| value.stackup.as_ref())
                .map(|stackup| {
                    stackup
                        .layers
                        .iter()
                        .map(|layer| analytic::StackupLayer {
                            name: layer.name.clone(),
                            type_name: layer.type_name.clone(),
                            thickness_mm: layer.thickness,
                            material: layer.material.clone(),
                            epsilon_r: layer.epsilon_r,
                            loss_tangent: layer.loss_tangent,
                            color: layer.color.clone(),
                        })
                        .collect()
                })
                .unwrap_or_default(),
            copper_finish: setup
                .as_ref()
                .and_then(|value| value.stackup.as_ref())
                .map(|value| value.copper_finish.clone())
                .unwrap_or_default(),
            edge_connector: setup
                .as_ref()
                .and_then(|value| value.stackup.as_ref())
                .map(|value| value.edge_connector.clone())
                .unwrap_or_default(),
            edge_plating: setup
                .as_ref()
                .and_then(|value| value.stackup.as_ref())
                .is_some_and(|value| value.edge_plating),
        };

        Ok(analytic::Document {
            schema: analytic::SCHEMA,
            contract_revision: analytic::CONTRACT_REVISION,
            producer: "temporary_prism",
            kicad_monkey_revision: KICAD_MONKEY_REVISION,
            kicad_monkey_engine_version: kicad_monkey_core::ENGINE_VERSION,
            source: analytic::SourceIdentity {
                path: path.display().to_string(),
                digest_sha256,
                bytes: bytes.len(),
            },
            coordinate_system: analytic::CoordinateSystem::default(),
            terminal_tolerance_mm,
            board,
            bounds_nm,
            layers: legacy_layers
                .into_iter()
                .map(|layer| analytic::Layer {
                    index: layer.index,
                    key: layer.key,
                    name: layer.name,
                    source_ordinal: layer.source_ordinal,
                    layer_type: layer.layer_type,
                    user_name: layer.user_name,
                })
                .collect(),
            nets: net_catalog
                .nets
                .into_iter()
                .map(|net| analytic::Net {
                    index: net.index,
                    key: net.key,
                    name: net.name,
                    source_ordinal: net.source_ordinal,
                })
                .collect(),
            operations,
            drills,
            diagnostics,
            stats,
            metrics: analytic::Metrics {
                source_read_ms,
                parse_index_ms,
                analytics_ms,
                serialization_ms: 0.0,
                total_ms: total_started.elapsed().as_secs_f64() * 1000.0,
                used_plot_facts_flash_oracle: overrides.used_oracle,
            },
        })
    }
}

fn append_analytic_segment(
    segment: &PcbSegment,
    layer_index: &HashMap<String, usize>,
    nets: &NetCatalog,
    source_order: &mut usize,
    operations: &mut Vec<analytic::Operation>,
) {
    let (Some(layer), Some(width)) = (segment.layer.as_ref(), segment.width) else {
        return;
    };
    let Some(index) = layer_index.get(layer).copied() else {
        return;
    };
    if width <= 0.0 {
        return;
    }
    let uid = source_uid("track", segment.uuid.as_deref(), segment.source_range.start);
    push_analytic_operation(
        operations,
        source_order,
        "track",
        uid,
        nets.index(&segment.net),
        vec![index],
        analytic::Affine2D::default(),
        analytic::MaterialPolarity::Add,
        analytic::AnalyticPrimitive::Capsule {
            start_nm: [mm_to_nm(segment.start_x), mm_to_nm(segment.start_y)],
            end_nm: [mm_to_nm(segment.end_x), mm_to_nm(segment.end_y)],
            radius_nm: mm_to_nm(width / 2.0),
        },
        None,
        None,
        None,
        false,
    );
}

fn append_analytic_arc(
    arc: &PcbRoutingArc,
    layer_index: &HashMap<String, usize>,
    nets: &NetCatalog,
    source_order: &mut usize,
    operations: &mut Vec<analytic::Operation>,
    diagnostics: &mut Vec<analytic::Diagnostic>,
) {
    let (Some(layer), Some(width)) = (arc.layer.as_ref(), arc.width) else {
        return;
    };
    let Some(index) = layer_index.get(layer).copied() else {
        return;
    };
    if width <= 0.0 {
        return;
    }
    let uid = source_uid("track_arc", arc.uuid.as_deref(), arc.source_range.start);
    let primitive = if sample_arc(point(arc.start), point(arc.mid), point(arc.end), 0.005).is_some()
    {
        analytic::AnalyticPrimitive::CircularSweep {
            start_nm: point_to_nm(point(arc.start)),
            mid_nm: point_to_nm(point(arc.mid)),
            end_nm: point_to_nm(point(arc.end)),
            radius_nm: mm_to_nm(width / 2.0),
        }
    } else {
        diagnostics.push(analytic::Diagnostic {
            severity: "warning",
            code: "degenerate_arc",
            message: "routing arc is collinear and was represented as a straight capsule"
                .to_owned(),
            source_uid: Some(uid.clone()),
        });
        analytic::AnalyticPrimitive::Capsule {
            start_nm: point_to_nm(point(arc.start)),
            end_nm: point_to_nm(point(arc.end)),
            radius_nm: mm_to_nm(width / 2.0),
        }
    };
    push_analytic_operation(
        operations,
        source_order,
        "track_arc",
        uid,
        nets.index(&arc.net),
        vec![index],
        analytic::Affine2D::default(),
        analytic::MaterialPolarity::Add,
        primitive,
        None,
        None,
        None,
        false,
    );
}

#[allow(clippy::too_many_arguments)]
fn append_analytic_via(
    via: &PcbVia,
    copper_names: &[String],
    layer_index: &HashMap<String, usize>,
    nets: &NetCatalog,
    overrides: &FlashOverrides,
    source_order: &mut usize,
    operations: &mut Vec<analytic::Operation>,
    drills: &mut Vec<analytic::Drill>,
) {
    let uid = source_uid("via", via.uuid.as_deref(), via.source_range.start);
    let physical_layers = expand_layers(&via.layers, copper_names);
    let flash_layers = overrides
        .vias
        .get(&uid)
        .cloned()
        .unwrap_or_else(|| physical_layers.clone());
    let center_nm = [mm_to_nm(via.at_x), mm_to_nm(via.at_y)];
    for layer in flash_layers {
        let Some(index) = layer_index.get(&layer).copied() else {
            continue;
        };
        let diameter = via_diameter(via, &layer);
        if diameter <= 0.0 {
            continue;
        }
        push_analytic_operation(
            operations,
            source_order,
            "via",
            uid.clone(),
            nets.index(&via.net),
            vec![index],
            analytic::Affine2D::default(),
            analytic::MaterialPolarity::Add,
            analytic::AnalyticPrimitive::Disk {
                center_nm,
                radius_nm: mm_to_nm(diameter / 2.0),
            },
            None,
            None,
            None,
            false,
        );
    }
    if via.drill > 0.0 {
        drills.push(analytic::Drill {
            semantic_id: semantic_id("via_hole", &uid),
            source_uid: uid,
            kind: "via".to_owned(),
            center_nm,
            width_nm: mm_to_nm(via.drill),
            height_nm: mm_to_nm(via.drill),
            angle_deg: 0.0,
            oval: false,
            plated: true,
            layer_indexes: indexes(&physical_layers, layer_index),
            footprint_uid: None,
            component_ref: None,
            pad_number: None,
        });
    }
}

fn append_analytic_zone(
    zone: &PcbZone,
    layer_index: &HashMap<String, usize>,
    nets: &NetCatalog,
    source_order: &mut usize,
    operations: &mut Vec<analytic::Operation>,
) {
    let uid = source_uid("zone", zone.uuid.as_deref(), zone.source_range.start);
    for polygon in &zone.filled_polygons {
        let layer = if polygon.layer.is_empty() && zone.layers.len() == 1 {
            &zone.layers[0]
        } else {
            &polygon.layer
        };
        let Some(index) = layer_index.get(layer).copied() else {
            continue;
        };
        let outer_nm = ring_to_nm(polygon.points.iter().copied().map(point));
        if outer_nm.len() < 3 {
            continue;
        }
        push_analytic_operation(
            operations,
            source_order,
            "zone_fill",
            uid.clone(),
            nets.index(&zone.net),
            vec![index],
            analytic::Affine2D::default(),
            analytic::MaterialPolarity::Add,
            analytic::AnalyticPrimitive::PlanarRegion {
                outer_nm,
                holes_nm: Vec::new(),
            },
            None,
            None,
            None,
            polygon.island,
        );
    }
}

#[allow(clippy::too_many_arguments)]
fn append_analytic_pad(
    pad: &PcbPad,
    footprint: &PcbFootprint,
    terminal_tolerance_mm: f64,
    copper_names: &[String],
    layer_index: &HashMap<String, usize>,
    nets: &NetCatalog,
    overrides: &FlashOverrides,
    source_order: &mut usize,
    operations: &mut Vec<analytic::Operation>,
    drills: &mut Vec<analytic::Drill>,
    diagnostics: &mut Vec<analytic::Diagnostic>,
) {
    let uid = source_uid("pad", pad.uuid.as_deref(), pad.source_range.start);
    let footprint_uid = source_uid(
        "footprint",
        footprint.uuid.as_deref(),
        footprint.source_range.start,
    );
    let component_ref = footprint
        .reference
        .clone()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| footprint.library_link.clone());
    let authored_layers = expand_layers(&pad.layers, copper_names);
    let flash_layers = overrides.pads.get(&uid).cloned().unwrap_or(authored_layers);
    let footprint_origin = Point::new(
        footprint.at_x.unwrap_or_default(),
        footprint.at_y.unwrap_or_default(),
    );
    let footprint_angle = footprint.angle.unwrap_or_default();
    let pad_anchor = transform_footprint(
        Point::new(pad.at_x, pad.at_y),
        footprint_origin,
        footprint_angle,
    );

    if pad.kind != "np_thru_hole" {
        for layer in flash_layers {
            let Some(index) = layer_index.get(&layer).copied() else {
                continue;
            };
            let resolved = match resolve_pad_copper_layer(pad, &layer) {
                Ok(value) => value,
                Err(error) => {
                    diagnostics.push(analytic::Diagnostic {
                        severity: "warning",
                        code: "unsupported_padstack",
                        message: format!("pad {uid} layer {layer}: {error}"),
                        source_uid: Some(uid.clone()),
                    });
                    continue;
                }
            };
            // kicad-monkey exposes the pad angle in the board coordinate
            // frame.  The footprint angle is still needed to place the pad's
            // local anchor, but applying it again here rotates the copper
            // shape twice (most visibly for 90-degree footprints).
            let world_angle = -pad.angle;
            let rotated_offset = crate::geometry::rotate(
                Point::new(resolved.offset.x, resolved.offset.y),
                world_angle,
            );
            let center = Point::new(
                pad_anchor.x + rotated_offset.x,
                pad_anchor.y + rotated_offset.y,
            );
            let transform =
                analytic::Affine2D::rotation_translation(world_angle, point_to_nm(center));
            let primitives =
                analytic_pad_primitives(pad, &resolved, terminal_tolerance_mm, &uid, diagnostics);
            for primitive in primitives {
                push_analytic_operation(
                    operations,
                    source_order,
                    "pad",
                    uid.clone(),
                    nets.index(&pad.net),
                    vec![index],
                    transform,
                    analytic::MaterialPolarity::Add,
                    primitive,
                    Some(footprint_uid.clone()),
                    Some(component_ref.clone()),
                    Some(pad.number.clone()),
                    false,
                );
            }
        }
    }

    if let Some(drill) = pad.drill.as_ref()
        && drill.width > 0.0
        && drill.height.unwrap_or(drill.width) > 0.0
    {
        let height = drill.height.unwrap_or(drill.width);
        let drill_offset =
            crate::geometry::rotate(Point::new(drill.offset.x, drill.offset.y), -pad.angle);
        let drill_center = Point::new(pad_anchor.x + drill_offset.x, pad_anchor.y + drill_offset.y);
        let plated = pad.plated.unwrap_or(pad.kind != "np_thru_hole");
        let mut physical_layers = if plated {
            copper_names.to_vec()
        } else {
            expand_layers(&pad.layers, copper_names)
        };
        if physical_layers.is_empty() {
            physical_layers = copper_names.to_vec();
        }
        drills.push(analytic::Drill {
            semantic_id: semantic_id("pad_hole", &uid),
            source_uid: uid,
            kind: if plated { "plated_pad" } else { "npth_pad" }.to_owned(),
            center_nm: point_to_nm(drill_center),
            width_nm: mm_to_nm(drill.width),
            height_nm: mm_to_nm(height),
            angle_deg: -pad.angle,
            oval: (drill.width - height).abs() > 1e-12,
            plated,
            layer_indexes: indexes(&physical_layers, layer_index),
            footprint_uid: Some(footprint_uid),
            component_ref: Some(component_ref),
            pad_number: Some(pad.number.clone()),
        });
    }
}

fn analytic_pad_primitives(
    pad: &PcbPad,
    resolved: &PcbResolvedPadCopperLayer<'_>,
    tolerance: f64,
    uid: &str,
    diagnostics: &mut Vec<analytic::Diagnostic>,
) -> Vec<analytic::AnalyticPrimitive> {
    let width_nm = mm_to_nm(resolved.size.x);
    let height_nm = mm_to_nm(resolved.size.y);
    if width_nm <= 0 || height_nm <= 0 {
        return Vec::new();
    }
    if resolved.shape == "roundrect"
        && resolved.roundrect_rratio.abs() <= f64::EPSILON
        && resolved.chamfer_ratio > 0.0
        && !resolved.chamfer_corners.is_empty()
    {
        return vec![analytic::AnalyticPrimitive::ChamferedRect {
            center_nm: [0, 0],
            width_nm,
            height_nm,
            ratio: resolved.chamfer_ratio,
            corners: resolved.chamfer_corners.to_vec(),
        }];
    }
    match resolved.shape {
        "circle" => vec![analytic::AnalyticPrimitive::Disk {
            center_nm: [0, 0],
            radius_nm: width_nm / 2,
        }],
        "oval" => {
            let (start_nm, end_nm, radius_nm) = if width_nm >= height_nm {
                let offset = (width_nm - height_nm) / 2;
                ([-offset, 0], [offset, 0], height_nm / 2)
            } else {
                let offset = (height_nm - width_nm) / 2;
                ([0, -offset], [0, offset], width_nm / 2)
            };
            vec![analytic::AnalyticPrimitive::Capsule {
                start_nm,
                end_nm,
                radius_nm,
            }]
        }
        "rect" => vec![analytic::AnalyticPrimitive::RoundedRect {
            center_nm: [0, 0],
            width_nm,
            height_nm,
            radius_nm: 0,
        }],
        "roundrect" => vec![analytic::AnalyticPrimitive::RoundedRect {
            center_nm: [0, 0],
            width_nm,
            height_nm,
            radius_nm: mm_to_nm(
                (resolved.size.x.min(resolved.size.y) * resolved.roundrect_rratio)
                    .clamp(0.0, resolved.size.x.min(resolved.size.y) / 2.0),
            ),
        }],
        "trapezoid" => vec![analytic::AnalyticPrimitive::Trapezoid {
            center_nm: [0, 0],
            width_nm,
            height_nm,
            delta_x_nm: mm_to_nm(resolved.rect_delta.x),
            delta_y_nm: mm_to_nm(resolved.rect_delta.y),
        }],
        "custom" => analytic_custom_pad_primitives(pad, resolved, tolerance, uid, diagnostics),
        shape => {
            diagnostics.push(analytic::Diagnostic {
                severity: "warning",
                code: "unsupported_pad_shape",
                message: format!("pad {uid} uses unsupported shape {shape}"),
                source_uid: Some(uid.to_owned()),
            });
            Vec::new()
        }
    }
}

fn analytic_custom_pad_primitives(
    _pad: &PcbPad,
    resolved: &PcbResolvedPadCopperLayer<'_>,
    tolerance: f64,
    uid: &str,
    diagnostics: &mut Vec<analytic::Diagnostic>,
) -> Vec<analytic::AnalyticPrimitive> {
    let mut output = Vec::new();
    for primitive in resolved.custom_primitives {
        let width = primitive.width.unwrap_or(0.0);
        let Some(geometry) = primitive.geometry.as_ref() else {
            diagnostics.push(analytic::Diagnostic {
                severity: "warning",
                code: "unsupported_custom_pad_primitive",
                message: format!(
                    "pad {uid} custom primitive {} has no supported geometry",
                    primitive.kind
                ),
                source_uid: Some(uid.to_owned()),
            });
            continue;
        };
        let value = match geometry {
            PcbPadPrimitiveGeometry::Line { start, end } if width > 0.0 => {
                Some(analytic::AnalyticPrimitive::Capsule {
                    start_nm: point_to_nm(point(*start)),
                    end_nm: point_to_nm(point(*end)),
                    radius_nm: mm_to_nm(width / 2.0),
                })
            }
            PcbPadPrimitiveGeometry::Arc { start, mid, end } if width > 0.0 => {
                Some(analytic::AnalyticPrimitive::CircularSweep {
                    start_nm: point_to_nm(point(*start)),
                    mid_nm: point_to_nm(point(*mid)),
                    end_nm: point_to_nm(point(*end)),
                    radius_nm: mm_to_nm(width / 2.0),
                })
            }
            PcbPadPrimitiveGeometry::Circle { center, end } => {
                let center = point(*center);
                let radius = (end.x - center.x).hypot(end.y - center.y);
                let outer_radius_nm = mm_to_nm(radius + width.max(0.0) / 2.0);
                let filled = primitive.fill.as_deref() != Some("none");
                if outer_radius_nm <= 0 {
                    None
                } else if filled || width <= 0.0 || radius <= width / 2.0 {
                    Some(analytic::AnalyticPrimitive::Disk {
                        center_nm: point_to_nm(center),
                        radius_nm: outer_radius_nm,
                    })
                } else {
                    Some(analytic::AnalyticPrimitive::Annulus {
                        center_nm: point_to_nm(center),
                        outer_radius_nm,
                        inner_radius_nm: mm_to_nm(radius - width / 2.0),
                    })
                }
            }
            PcbPadPrimitiveGeometry::Rect { start, end, radius } => {
                let start = point(*start);
                let end = point(*end);
                Some(analytic::AnalyticPrimitive::RoundedRect {
                    center_nm: point_to_nm(Point::new(
                        (start.x + end.x) / 2.0,
                        (start.y + end.y) / 2.0,
                    )),
                    width_nm: mm_to_nm((end.x - start.x).abs()),
                    height_nm: mm_to_nm((end.y - start.y).abs()),
                    radius_nm: mm_to_nm(radius.unwrap_or_default().max(0.0)),
                })
            }
            PcbPadPrimitiveGeometry::Polygon { points } => {
                let outer_nm = ring_to_nm(polygon_points(points, tolerance));
                (outer_nm.len() >= 3).then_some(analytic::AnalyticPrimitive::PlanarRegion {
                    outer_nm,
                    holes_nm: Vec::new(),
                })
            }
            PcbPadPrimitiveGeometry::Curve { points } if width > 0.0 => {
                Some(analytic::AnalyticPrimitive::SweptPath {
                    points_nm: bezier_path(*points).into_iter().map(point_to_nm).collect(),
                    radius_nm: mm_to_nm(width / 2.0),
                    closed: false,
                })
            }
            PcbPadPrimitiveGeometry::BoundingBoxProxy { .. }
            | PcbPadPrimitiveGeometry::VectorProxy { .. }
            | PcbPadPrimitiveGeometry::Line { .. }
            | PcbPadPrimitiveGeometry::Arc { .. }
            | PcbPadPrimitiveGeometry::Curve { .. } => None,
        };
        if let Some(value) = value {
            output.push(value);
        } else {
            diagnostics.push(analytic::Diagnostic {
                severity: "warning",
                code: "unsupported_custom_pad_primitive",
                message: format!(
                    "pad {uid} custom primitive {} cannot be materialized",
                    primitive.kind
                ),
                source_uid: Some(uid.to_owned()),
            });
        }
    }
    output
}

fn bezier_path(points: [PcbPoint; 4]) -> Vec<Point> {
    let samples = 24usize;
    (0..=samples)
        .map(|index| {
            let t = index as f64 / samples as f64;
            let mt = 1.0 - t;
            Point::new(
                mt.powi(3) * points[0].x
                    + 3.0 * mt.powi(2) * t * points[1].x
                    + 3.0 * mt * t.powi(2) * points[2].x
                    + t.powi(3) * points[3].x,
                mt.powi(3) * points[0].y
                    + 3.0 * mt.powi(2) * t * points[1].y
                    + 3.0 * mt * t.powi(2) * points[2].y
                    + t.powi(3) * points[3].y,
            )
        })
        .collect()
}

#[allow(clippy::too_many_arguments)]
fn push_analytic_operation(
    operations: &mut Vec<analytic::Operation>,
    source_order: &mut usize,
    kind: &str,
    source_uid: String,
    net_index: Option<usize>,
    layer_indexes: Vec<usize>,
    transform: analytic::Affine2D,
    polarity: analytic::MaterialPolarity,
    primitive: analytic::AnalyticPrimitive,
    footprint_uid: Option<String>,
    component_ref: Option<String>,
    pad_number: Option<String>,
    island: bool,
) {
    let bounds_nm = primitive_bounds(&primitive, transform);
    operations.push(analytic::Operation {
        source_order: *source_order,
        semantic_id: semantic_id(kind, &source_uid),
        kind: kind.to_owned(),
        source_uid,
        net_index,
        layer_indexes,
        transform,
        bounds_nm,
        polarity,
        primitive,
        footprint_uid,
        component_ref,
        pad_number,
        island,
    });
    *source_order += 1;
}

fn primitive_bounds(
    primitive: &analytic::AnalyticPrimitive,
    transform: analytic::Affine2D,
) -> [i64; 4] {
    let local = match primitive {
        analytic::AnalyticPrimitive::Disk {
            center_nm,
            radius_nm,
        } => expand_point_bounds(*center_nm, *radius_nm),
        analytic::AnalyticPrimitive::Annulus {
            center_nm,
            outer_radius_nm,
            ..
        } => expand_point_bounds(*center_nm, *outer_radius_nm),
        analytic::AnalyticPrimitive::Capsule {
            start_nm,
            end_nm,
            radius_nm,
        } => expand_bounds(points_bounds(&[*start_nm, *end_nm]), *radius_nm),
        analytic::AnalyticPrimitive::CircularSweep {
            start_nm,
            mid_nm,
            end_nm,
            radius_nm,
        } => arc_sweep_bounds(*start_nm, *mid_nm, *end_nm, *radius_nm),
        analytic::AnalyticPrimitive::SweptPath {
            points_nm,
            radius_nm,
            ..
        } => expand_bounds(points_bounds(points_nm), *radius_nm),
        analytic::AnalyticPrimitive::RoundedRect {
            center_nm,
            width_nm,
            height_nm,
            ..
        }
        | analytic::AnalyticPrimitive::ChamferedRect {
            center_nm,
            width_nm,
            height_nm,
            ..
        } => [
            center_nm[0] - width_nm.abs() / 2,
            center_nm[1] - height_nm.abs() / 2,
            center_nm[0] + width_nm.abs() / 2,
            center_nm[1] + height_nm.abs() / 2,
        ],
        analytic::AnalyticPrimitive::Trapezoid {
            center_nm,
            width_nm,
            height_nm,
            delta_x_nm,
            delta_y_nm,
        } => [
            center_nm[0] - (width_nm.abs() + delta_y_nm.abs()) / 2,
            center_nm[1] - (height_nm.abs() + delta_x_nm.abs()) / 2,
            center_nm[0] + (width_nm.abs() + delta_y_nm.abs()) / 2,
            center_nm[1] + (height_nm.abs() + delta_x_nm.abs()) / 2,
        ],
        analytic::AnalyticPrimitive::PlanarRegion { outer_nm, holes_nm } => {
            let mut points = outer_nm.clone();
            for hole in holes_nm {
                points.extend(hole);
            }
            points_bounds(&points)
        }
    };
    transform_bounds(local, transform)
}

fn points_bounds(points: &[analytic::NmPoint]) -> [i64; 4] {
    let Some(first) = points.first() else {
        return [0, 0, 0, 0];
    };
    points
        .iter()
        .skip(1)
        .fold([first[0], first[1], first[0], first[1]], |bounds, point| {
            [
                bounds[0].min(point[0]),
                bounds[1].min(point[1]),
                bounds[2].max(point[0]),
                bounds[3].max(point[1]),
            ]
        })
}

fn expand_point_bounds(point: analytic::NmPoint, radius: i64) -> [i64; 4] {
    [
        point[0] - radius,
        point[1] - radius,
        point[0] + radius,
        point[1] + radius,
    ]
}

fn expand_bounds(bounds: [i64; 4], amount: i64) -> [i64; 4] {
    [
        bounds[0] - amount,
        bounds[1] - amount,
        bounds[2] + amount,
        bounds[3] + amount,
    ]
}

fn arc_sweep_bounds(
    start: analytic::NmPoint,
    mid: analytic::NmPoint,
    end: analytic::NmPoint,
    stroke_radius: i64,
) -> [i64; 4] {
    let sx = start[0] as f64;
    let sy = start[1] as f64;
    let mx = mid[0] as f64;
    let my = mid[1] as f64;
    let ex = end[0] as f64;
    let ey = end[1] as f64;
    let determinant = 2.0 * (sx * (my - ey) + mx * (ey - sy) + ex * (sy - my));
    if determinant.abs() <= f64::EPSILON {
        return expand_bounds(points_bounds(&[start, mid, end]), stroke_radius);
    }
    let ss = sx * sx + sy * sy;
    let ms = mx * mx + my * my;
    let es = ex * ex + ey * ey;
    let cx = (ss * (my - ey) + ms * (ey - sy) + es * (sy - my)) / determinant;
    let cy = (ss * (ex - mx) + ms * (sx - ex) + es * (mx - sx)) / determinant;
    let radius = ((sx - cx).hypot(sy - cy)).ceil() as i64 + stroke_radius;
    expand_point_bounds([cx.round() as i64, cy.round() as i64], radius)
}

fn transform_bounds(bounds: [i64; 4], transform: analytic::Affine2D) -> [i64; 4] {
    points_bounds(&[
        transform.apply([bounds[0], bounds[1]]),
        transform.apply([bounds[2], bounds[1]]),
        transform.apply([bounds[2], bounds[3]]),
        transform.apply([bounds[0], bounds[3]]),
    ])
}

fn analytic_operation_bounds(operations: &[analytic::Operation]) -> Option<[i64; 4]> {
    operations
        .iter()
        .map(|operation| operation.bounds_nm)
        .reduce(|a, b| {
            [
                a[0].min(b[0]),
                a[1].min(b[1]),
                a[2].max(b[2]),
                a[3].max(b[3]),
            ]
        })
}

fn net_key(net: &PcbNetRef) -> Option<String> {
    net.name
        .as_ref()
        .filter(|name| !name.is_empty())
        .cloned()
        .or_else(|| {
            net.ordinal
                .filter(|ordinal| *ordinal != 0)
                .map(|ordinal| format!("#{ordinal}"))
        })
}

fn source_uid(kind: &str, uuid: Option<&str>, source_start: usize) -> String {
    uuid.filter(|value| !value.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| format!("{kind}@{source_start}"))
}

fn semantic_id(kind: &str, source_uid: &str) -> String {
    format!("{kind}:{source_uid}")
}

fn expand_layers(requested: &[String], copper: &[String]) -> Vec<String> {
    if requested.iter().any(|name| name == "*.Cu") {
        return copper.to_vec();
    }
    if requested.iter().any(|name| name == "F&B.Cu") {
        return copper
            .iter()
            .filter(|name| matches!(name.as_str(), "F.Cu" | "B.Cu"))
            .cloned()
            .collect();
    }
    if requested.len() == 2
        && requested.iter().all(|name| copper.contains(name))
        && requested[0] != requested[1]
    {
        let first = copper
            .iter()
            .position(|name| name == &requested[0])
            .unwrap();
        let last = copper
            .iter()
            .position(|name| name == &requested[1])
            .unwrap();
        let low = first.min(last);
        let high = first.max(last);
        return copper[low..=high].to_vec();
    }
    requested
        .iter()
        .filter(|name| copper.contains(name))
        .cloned()
        .collect()
}

fn indexes(names: &[String], layer_index: &HashMap<String, usize>) -> Vec<usize> {
    names
        .iter()
        .filter_map(|name| layer_index.get(name).copied())
        .collect()
}

fn append_segment(
    segment: &PcbSegment,
    tolerance: f64,
    layer_index: &HashMap<String, usize>,
    nets: &NetCatalog,
    source_order: &mut usize,
    features: &mut Vec<Feature>,
) {
    let (Some(layer), Some(width)) = (segment.layer.as_ref(), segment.width) else {
        return;
    };
    let Some(index) = layer_index.get(layer).copied() else {
        return;
    };
    if width <= 0.0 {
        return;
    }
    let uid = source_uid("track", segment.uuid.as_deref(), segment.source_range.start);
    features.push(Feature {
        source_order: *source_order,
        semantic_id: semantic_id("track", &uid),
        kind: "track".to_owned(),
        source_uid: uid,
        net_index: nets.index(&segment.net),
        layer_indexes: vec![index],
        outer_nm: ring_to_nm(capsule(
            Point::new(segment.start_x, segment.start_y),
            Point::new(segment.end_x, segment.end_y),
            width / 2.0,
            tolerance,
        )),
        holes_nm: Vec::new(),
        footprint_uid: None,
        component_ref: None,
        pad_number: None,
        island: false,
    });
    *source_order += 1;
}

fn append_arc(
    arc: &PcbRoutingArc,
    tolerance: f64,
    layer_index: &HashMap<String, usize>,
    nets: &NetCatalog,
    source_order: &mut usize,
    features: &mut Vec<Feature>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let (Some(layer), Some(width)) = (arc.layer.as_ref(), arc.width) else {
        return;
    };
    let Some(index) = layer_index.get(layer).copied() else {
        return;
    };
    if width <= 0.0 {
        return;
    }
    let uid = source_uid("track_arc", arc.uuid.as_deref(), arc.source_range.start);
    let Some(points) = sample_arc(point(arc.start), point(arc.mid), point(arc.end), tolerance)
    else {
        diagnostics.push(Diagnostic {
            severity: "warning",
            code: "degenerate_arc",
            message: "routing arc is collinear and was lowered as a straight capsule".to_owned(),
            source_uid: Some(uid.clone()),
        });
        let outer = capsule(point(arc.start), point(arc.end), width / 2.0, tolerance);
        push_arc_feature(
            &uid,
            index,
            nets.index(&arc.net),
            outer,
            source_order,
            features,
        );
        return;
    };
    for pair in points.windows(2) {
        let outer = capsule(pair[0], pair[1], width / 2.0, tolerance);
        push_arc_feature(
            &uid,
            index,
            nets.index(&arc.net),
            outer,
            source_order,
            features,
        );
    }
}

fn push_arc_feature(
    uid: &str,
    layer_index: usize,
    net_index: Option<usize>,
    outer: Vec<Point>,
    source_order: &mut usize,
    features: &mut Vec<Feature>,
) {
    features.push(Feature {
        source_order: *source_order,
        semantic_id: semantic_id("track_arc", uid),
        kind: "track_arc".to_owned(),
        source_uid: uid.to_owned(),
        net_index,
        layer_indexes: vec![layer_index],
        outer_nm: ring_to_nm(outer),
        holes_nm: Vec::new(),
        footprint_uid: None,
        component_ref: None,
        pad_number: None,
        island: false,
    });
    *source_order += 1;
}

#[allow(clippy::too_many_arguments)]
fn append_via(
    via: &PcbVia,
    tolerance: f64,
    copper_names: &[String],
    layer_index: &HashMap<String, usize>,
    nets: &NetCatalog,
    overrides: &FlashOverrides,
    source_order: &mut usize,
    features: &mut Vec<Feature>,
    drills: &mut Vec<Drill>,
) {
    let uid = source_uid("via", via.uuid.as_deref(), via.source_range.start);
    let physical_layers = expand_layers(&via.layers, copper_names);
    let flash_layers = overrides
        .vias
        .get(&uid)
        .cloned()
        .unwrap_or_else(|| physical_layers.clone());
    let hole = (via.drill > 0.0).then(|| {
        ring_to_nm(circle(
            Point::new(via.at_x, via.at_y),
            via.drill / 2.0,
            tolerance,
        ))
    });
    for layer in flash_layers {
        let Some(index) = layer_index.get(&layer).copied() else {
            continue;
        };
        let diameter = via_diameter(via, &layer);
        if diameter <= 0.0 {
            continue;
        }
        features.push(Feature {
            source_order: *source_order,
            semantic_id: semantic_id("via", &uid),
            kind: "via".to_owned(),
            source_uid: uid.clone(),
            net_index: nets.index(&via.net),
            layer_indexes: vec![index],
            outer_nm: ring_to_nm(circle(
                Point::new(via.at_x, via.at_y),
                diameter / 2.0,
                tolerance,
            )),
            holes_nm: hole.clone().into_iter().collect(),
            footprint_uid: None,
            component_ref: None,
            pad_number: None,
            island: false,
        });
        *source_order += 1;
    }
    if via.drill > 0.0 {
        drills.push(Drill {
            semantic_id: semantic_id("via_hole", &uid),
            source_uid: uid,
            kind: "via".to_owned(),
            center_nm: [mm_to_nm(via.at_x), mm_to_nm(via.at_y)],
            width_nm: mm_to_nm(via.drill),
            height_nm: mm_to_nm(via.drill),
            oval: false,
            plated: true,
            layer_indexes: indexes(&physical_layers, layer_index),
            footprint_uid: None,
            component_ref: None,
            pad_number: None,
        });
    }
}

fn via_diameter(via: &PcbVia, layer: &str) -> f64 {
    let Some(stack) = via.padstack.as_ref() else {
        return via.size;
    };
    let selector =
        if stack.mode.as_deref() == Some("front_inner_back") && !matches!(layer, "F.Cu" | "B.Cu") {
            "Inner"
        } else {
            layer
        };
    stack
        .layers
        .iter()
        .find(|row| row.layer == selector)
        .and_then(|row| row.size)
        .unwrap_or(via.size)
}

fn append_zone(
    zone: &PcbZone,
    layer_index: &HashMap<String, usize>,
    nets: &NetCatalog,
    source_order: &mut usize,
    features: &mut Vec<Feature>,
) {
    let uid = source_uid("zone", zone.uuid.as_deref(), zone.source_range.start);
    for polygon in &zone.filled_polygons {
        let layer = if polygon.layer.is_empty() && zone.layers.len() == 1 {
            &zone.layers[0]
        } else {
            &polygon.layer
        };
        let Some(index) = layer_index.get(layer).copied() else {
            continue;
        };
        let outer_nm = ring_to_nm(polygon.points.iter().copied().map(point));
        if outer_nm.len() < 3 {
            continue;
        }
        features.push(Feature {
            source_order: *source_order,
            semantic_id: semantic_id("zone_fill", &uid),
            kind: "zone_fill".to_owned(),
            source_uid: uid.clone(),
            net_index: nets.index(&zone.net),
            layer_indexes: vec![index],
            outer_nm,
            holes_nm: Vec::new(),
            footprint_uid: None,
            component_ref: None,
            pad_number: None,
            island: polygon.island,
        });
        *source_order += 1;
    }
}

#[allow(clippy::too_many_arguments)]
fn append_pad(
    pad: &PcbPad,
    footprint: &PcbFootprint,
    pad_index: usize,
    tolerance: f64,
    copper_names: &[String],
    layer_index: &HashMap<String, usize>,
    nets: &NetCatalog,
    overrides: &FlashOverrides,
    source_order: &mut usize,
    features: &mut Vec<Feature>,
    drills: &mut Vec<Drill>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let uid = source_uid("pad", pad.uuid.as_deref(), pad.source_range.start);
    let footprint_uid = source_uid(
        "footprint",
        footprint.uuid.as_deref(),
        footprint.source_range.start,
    );
    let component_ref = footprint
        .reference
        .clone()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| footprint.library_link.clone());
    let authored_layers = expand_layers(&pad.layers, copper_names);
    let flash_layers = overrides.pads.get(&uid).cloned().unwrap_or(authored_layers);
    let footprint_origin = Point::new(
        footprint.at_x.unwrap_or_default(),
        footprint.at_y.unwrap_or_default(),
    );
    let footprint_angle = footprint.angle.unwrap_or_default();
    let pad_anchor = transform_footprint(
        Point::new(pad.at_x, pad.at_y),
        footprint_origin,
        footprint_angle,
    );
    let hole = pad.drill.as_ref().and_then(|drill| {
        (drill.width > 0.0 && drill.height.unwrap_or(drill.width) > 0.0).then(|| {
            let height = drill.height.unwrap_or(drill.width);
            let world_ring = oval(pad_anchor, drill.width, height, -pad.angle, tolerance);
            (drill, height, pad_anchor, ring_to_nm(world_ring))
        })
    });

    // KiCad may serialize `*.Cu` selectors on NPTH mechanical holes, but they
    // do not flash copper. The drill remains part of the contract below.
    if pad.kind != "np_thru_hole" {
        for layer in flash_layers {
            let Some(index) = layer_index.get(&layer).copied() else {
                continue;
            };
            let resolved = match resolve_pad_copper_layer(pad, &layer) {
                Ok(value) => value,
                Err(error) => {
                    diagnostics.push(Diagnostic {
                        severity: "warning",
                        code: "unsupported_padstack",
                        message: format!("pad {uid} layer {layer}: {error}"),
                        source_uid: Some(uid.clone()),
                    });
                    continue;
                }
            };
            let rings = pad_rings(pad, &resolved, pad_anchor, tolerance, &uid, diagnostics);
            for ring in rings {
                let outer_nm = ring_to_nm(ring);
                if outer_nm.len() < 3 {
                    continue;
                }
                features.push(Feature {
                    source_order: *source_order,
                    semantic_id: semantic_id("pad", &uid),
                    kind: "pad".to_owned(),
                    source_uid: uid.clone(),
                    net_index: nets.index(&pad.net),
                    layer_indexes: vec![index],
                    outer_nm,
                    holes_nm: hole
                        .as_ref()
                        .map(|(_, _, _, ring)| ring.clone())
                        .into_iter()
                        .collect(),
                    footprint_uid: Some(footprint_uid.clone()),
                    component_ref: Some(component_ref.clone()),
                    pad_number: Some(pad.number.clone()),
                    island: false,
                });
                *source_order += 1;
            }
        }
    }

    if let Some((drill, height, center, _)) = hole {
        let plated = pad.plated.unwrap_or(pad.kind != "np_thru_hole");
        let mut physical_layers = if plated {
            copper_names.to_vec()
        } else {
            expand_layers(&pad.layers, copper_names)
        };
        if physical_layers.is_empty() {
            // Mask-only NPTH declarations still pass mechanically through the
            // complete board even though they flash no copper.
            physical_layers = copper_names.to_vec();
        }
        drills.push(Drill {
            semantic_id: semantic_id("pad_hole", &uid),
            source_uid: uid,
            kind: if plated { "plated_pad" } else { "npth_pad" }.to_owned(),
            center_nm: point_to_nm(center),
            width_nm: mm_to_nm(drill.width),
            height_nm: mm_to_nm(height),
            oval: (drill.width - height).abs() > 1e-12,
            plated,
            layer_indexes: indexes(&physical_layers, layer_index),
            footprint_uid: Some(footprint_uid),
            component_ref: Some(component_ref),
            pad_number: Some(pad.number.clone()),
        });
    }
    let _ = pad_index;
}

fn pad_rings(
    pad: &PcbPad,
    resolved: &PcbResolvedPadCopperLayer<'_>,
    pad_anchor: Point,
    tolerance: f64,
    uid: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Vec<Vec<Point>> {
    let rotated_offset =
        crate::geometry::rotate(Point::new(resolved.offset.x, resolved.offset.y), -pad.angle);
    let center = Point::new(
        pad_anchor.x + rotated_offset.x,
        pad_anchor.y + rotated_offset.y,
    );
    let width = resolved.size.x;
    let height = resolved.size.y;
    if width <= 0.0 || height <= 0.0 {
        return Vec::new();
    }
    if resolved.shape == "roundrect"
        && resolved.roundrect_rratio.abs() <= f64::EPSILON
        && resolved.chamfer_ratio > 0.0
        && !resolved.chamfer_corners.is_empty()
    {
        return vec![chamfered_rectangle(
            center,
            width,
            height,
            resolved.chamfer_ratio,
            resolved.chamfer_corners,
            -pad.angle,
        )];
    }
    match resolved.shape {
        "circle" => vec![circle(center, width / 2.0, tolerance)],
        "oval" => vec![oval(center, width, height, -pad.angle, tolerance)],
        "rect" => vec![rectangle(center, width, height, -pad.angle)],
        "roundrect" => vec![rounded_rectangle(
            center,
            width,
            height,
            width.min(height) * resolved.roundrect_rratio,
            -pad.angle,
            tolerance,
        )],
        "trapezoid" => vec![trapezoid(
            center,
            width,
            height,
            resolved.rect_delta.x,
            resolved.rect_delta.y,
            -pad.angle,
        )],
        "custom" => custom_pad_rings(pad, resolved, center, tolerance, uid, diagnostics),
        shape => {
            diagnostics.push(Diagnostic {
                severity: "warning",
                code: "unsupported_pad_shape",
                message: format!("pad {uid} uses unsupported shape {shape}"),
                source_uid: Some(uid.to_owned()),
            });
            Vec::new()
        }
    }
}

fn custom_pad_rings(
    pad: &PcbPad,
    resolved: &PcbResolvedPadCopperLayer<'_>,
    pad_anchor: Point,
    tolerance: f64,
    uid: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Vec<Vec<Point>> {
    let mut rings = Vec::new();
    for primitive in resolved.custom_primitives {
        let width = primitive.width.unwrap_or(0.0);
        let Some(geometry) = primitive.geometry.as_ref() else {
            diagnostics.push(Diagnostic {
                severity: "warning",
                code: "unsupported_custom_pad_primitive",
                message: format!(
                    "pad {uid} custom primitive {} has no supported geometry",
                    primitive.kind
                ),
                source_uid: Some(uid.to_owned()),
            });
            continue;
        };
        let local_rings = match geometry {
            PcbPadPrimitiveGeometry::Line { start, end } if width > 0.0 => {
                vec![capsule(point(*start), point(*end), width / 2.0, tolerance)]
            }
            PcbPadPrimitiveGeometry::Arc { start, mid, end } if width > 0.0 => {
                sample_arc(point(*start), point(*mid), point(*end), tolerance)
                    .map(|points| {
                        points
                            .windows(2)
                            .map(|pair| capsule(pair[0], pair[1], width / 2.0, tolerance))
                            .collect()
                    })
                    .unwrap_or_default()
            }
            PcbPadPrimitiveGeometry::Circle { center, end } => {
                let center = point(*center);
                let radius = (end.x - center.x).hypot(end.y - center.y);
                vec![circle(center, radius + width.max(0.0) / 2.0, tolerance)]
            }
            PcbPadPrimitiveGeometry::Rect { start, end, radius } => {
                let start = point(*start);
                let end = point(*end);
                let center = Point::new((start.x + end.x) / 2.0, (start.y + end.y) / 2.0);
                let width = (end.x - start.x).abs();
                let height = (end.y - start.y).abs();
                vec![rounded_rectangle(
                    center,
                    width,
                    height,
                    radius.unwrap_or_default(),
                    0.0,
                    tolerance,
                )]
            }
            PcbPadPrimitiveGeometry::Polygon { points } => {
                vec![polygon_points(points, tolerance)]
            }
            PcbPadPrimitiveGeometry::Curve { points } if width > 0.0 => {
                bezier_rings(*points, width, tolerance)
            }
            PcbPadPrimitiveGeometry::BoundingBoxProxy { .. }
            | PcbPadPrimitiveGeometry::VectorProxy { .. }
            | PcbPadPrimitiveGeometry::Line { .. }
            | PcbPadPrimitiveGeometry::Arc { .. }
            | PcbPadPrimitiveGeometry::Curve { .. } => {
                diagnostics.push(Diagnostic {
                    severity: "warning",
                    code: "unsupported_custom_pad_primitive",
                    message: format!(
                        "pad {uid} custom primitive {} cannot be materialized",
                        primitive.kind
                    ),
                    source_uid: Some(uid.to_owned()),
                });
                Vec::new()
            }
        };
        for ring in local_rings {
            rings.push(
                ring.into_iter()
                    .map(|point| {
                        let rotated = crate::geometry::rotate(point, -pad.angle);
                        Point::new(rotated.x + pad_anchor.x, rotated.y + pad_anchor.y)
                    })
                    .collect(),
            );
        }
    }
    rings
}

fn polygon_points(points: &[PcbPolygonPoint], tolerance: f64) -> Vec<Point> {
    let mut output = Vec::new();
    for item in points {
        match item {
            PcbPolygonPoint::Xy(value) => output.push(point(*value)),
            PcbPolygonPoint::Arc { start, mid, end } => {
                if let Some(sampled) =
                    sample_arc(point(*start), point(*mid), point(*end), tolerance)
                {
                    if output.last().is_some() {
                        output.extend(sampled.into_iter().skip(1));
                    } else {
                        output.extend(sampled);
                    }
                }
            }
        }
    }
    output
}

fn bezier_rings(points: [PcbPoint; 4], width: f64, tolerance: f64) -> Vec<Vec<Point>> {
    let samples = 24usize;
    let path = (0..=samples)
        .map(|index| {
            let t = index as f64 / samples as f64;
            let mt = 1.0 - t;
            Point::new(
                mt.powi(3) * points[0].x
                    + 3.0 * mt.powi(2) * t * points[1].x
                    + 3.0 * mt * t.powi(2) * points[2].x
                    + t.powi(3) * points[3].x,
                mt.powi(3) * points[0].y
                    + 3.0 * mt.powi(2) * t * points[1].y
                    + 3.0 * mt * t.powi(2) * points[2].y
                    + t.powi(3) * points[3].y,
            )
        })
        .collect::<Vec<_>>();
    path.windows(2)
        .map(|pair| capsule(pair[0], pair[1], width / 2.0, tolerance))
        .collect()
}

fn point(value: PcbPoint) -> Point {
    Point::new(value.x, value.y)
}

fn contract_layers(source_layers: &[kicad_monkey_core::PcbLayer]) -> Vec<Layer> {
    if source_layers.is_empty() {
        return [("F.Cu", 0, "signal"), ("B.Cu", 31, "signal")]
            .into_iter()
            .enumerate()
            .map(|(index, (name, ordinal, layer_type))| Layer {
                index,
                key: name.to_owned(),
                name: name.to_owned(),
                source_ordinal: ordinal,
                layer_type: layer_type.to_owned(),
                user_name: None,
            })
            .collect();
    }
    source_layers
        .iter()
        .enumerate()
        .map(|(index, layer)| Layer {
            index,
            key: layer.name.clone(),
            name: layer.name.clone(),
            source_ordinal: layer.ordinal,
            layer_type: layer.kind.clone(),
            user_name: layer.user_name.clone(),
        })
        .collect()
}

fn flash_overrides(
    source: &str,
    view: &PcbView<'_>,
    vias: &[PcbVia],
    pads: &[PcbPad],
    diagnostics: &mut Vec<Diagnostic>,
) -> Result<FlashOverrides> {
    let required = vias.iter().any(|via| {
        via.remove_unused_layers == Some(true)
            || via.keep_end_layers.is_some()
            || via.start_end_only == Some(true)
            || via.zone_layer_connections.is_some()
    }) || pads.iter().any(|pad| {
        pad.remove_unused_layers == Some(true)
            || pad.keep_end_layers.is_some()
            || pad.zone_layer_connections.is_some()
    });
    if !required {
        return Ok(FlashOverrides::default());
    }
    let plot_source = blank_top_level_forms(source, view, |head, _| {
        head == "zone"
            || head.starts_with("gr_")
            || matches!(head, "image" | "dimension" | "target")
    });
    let plot_source = blank_forms_by_head(
        &plot_source,
        &[
            "zone",
            "fp_arc",
            "fp_circle",
            "fp_curve",
            "fp_image",
            "fp_line",
            "fp_poly",
            "fp_rect",
            "fp_text",
            "fp_text_box",
            "model",
            "property",
            "embedded_files",
            "embedded_fonts",
        ],
    )?;
    if plot_source.as_bytes() != source.as_bytes() {
        diagnostics.push(Diagnostic {
            severity: "warning",
            code: "plot_facts_ignored_presentation_geometry",
            message: "ignored zones and board presentation geometry while resolving pad/via copper flashing"
                .to_owned(),
            source_uid: None,
        });
    }
    let mut limits = BoardPlotLimits::default();
    limits.max_source_bytes = limits
        .max_source_bytes
        .max(plot_source.len().saturating_add(1));
    // Plot facts are used here only as the upstream authority for conditional
    // pad/via flashing. Large authored boards can legitimately exceed the
    // plotter's presentation-oriented default operation ceiling before that
    // authority is available, so admit a larger but still bounded document.
    limits.max_operations = limits.max_operations.max(1_000_000);
    let document = match board_plot_document(&plot_source, limits) {
        Ok(document) => document,
        Err(error)
            if error.to_string().contains(
                "Board text-box render-cache wrapping requires the outline-font bridge",
            ) =>
        {
            let filtered =
                blank_top_level_forms(&plot_source, view, |head, _| head == "gr_text_box");
            diagnostics.push(Diagnostic {
                severity: "warning",
                code: "plot_facts_ignored_text_boxes",
                message:
                    "ignored visual-only board text boxes while resolving pad/via copper flashing"
                        .to_owned(),
                source_uid: None,
            });
            board_plot_document(&filtered, limits).context(
                "resolve effective pad/via flash layers with kicad-monkey board facts after excluding visual-only board text boxes",
            )?
        }
        Err(error) => {
            return Err(error)
                .context("resolve effective pad/via flash layers with kicad-monkey board facts");
        }
    };
    let mut result = FlashOverrides {
        used_oracle: true,
        ..FlashOverrides::default()
    };
    for record in document.records {
        match record {
            BoardPlotRecord::Via(via) => {
                let layers = via
                    .operations
                    .iter()
                    .find(|operation| operation.kind == BoardViaOperationKind::Aperture)
                    .map(|operation| copper_plot_layers(&operation.layers))
                    .unwrap_or_default();
                result.vias.insert(via.uuid, layers);
            }
            BoardPlotRecord::Footprint(footprint) => {
                for operation in footprint.operations {
                    if let BoardFootprintOperation::StartBlock(block) = operation
                        && block.data_ref == "pad"
                    {
                        result
                            .pads
                            .insert(block.data_uuid, copper_plot_layers(&block.layers));
                    }
                }
            }
            _ => {}
        }
    }
    diagnostics.push(Diagnostic {
        severity: "warning",
        code: "plot_facts_flash_oracle",
        message:
            "used kicad-monkey board plot facts only to resolve conditional pad/via copper flashing"
                .to_owned(),
        source_uid: None,
    });
    Ok(result)
}

fn copper_zones(view: &PcbView<'_>, source: &str, selection: PcbSelection) -> Result<Vec<PcbZone>> {
    let filtered = blank_top_level_forms(source, view, |head, text| {
        head == "zone" && !form_mentions_copper_layer(text)
    });
    if filtered.len() == source.len() && filtered.as_bytes() == source.as_bytes() {
        return view
            .zones()
            .collect::<Result<Vec<_>, _>>()
            .map_err(Into::into);
    }
    let filtered_view = PcbView::parse_selected(&filtered, Default::default(), selection)
        .context("parse PCB source after excluding non-copper zones")?;
    filtered_view
        .zones()
        .collect::<Result<Vec<_>, _>>()
        .map_err(Into::into)
}

fn form_mentions_copper_layer(text: &str) -> bool {
    text.lines().any(|line| {
        (line.contains("(layer ") || line.contains("(layers ")) && line.contains(".Cu\"")
    })
}

pub(crate) fn blank_top_level_forms(
    source: &str,
    view: &PcbView<'_>,
    predicate: impl Fn(&str, &str) -> bool,
) -> String {
    let mut bytes = source.as_bytes().to_vec();
    for span in view.top_level_forms() {
        let Some(head) = span.head.as_deref() else {
            continue;
        };
        let Ok(text) = span.text(source) else {
            continue;
        };
        if !predicate(head, text) {
            continue;
        }
        for byte in &mut bytes[span.range.clone()] {
            if !matches!(*byte, b'\n' | b'\r') {
                *byte = b' ';
            }
        }
    }
    String::from_utf8(bytes).expect("replacing source bytes with ASCII spaces preserves UTF-8")
}

pub(crate) fn blank_forms_by_head(source: &str, heads: &[&str]) -> Result<String> {
    let selector = Selector {
        heads: Some(heads.iter().map(|head| (*head).to_owned()).collect()),
        ..Selector::default()
    };
    let spans = scan_form_spans(source, &selector).context("select presentation-only PCB forms")?;
    let mut bytes = source.as_bytes().to_vec();
    for span in spans {
        for byte in &mut bytes[span.range] {
            if !matches!(*byte, b'\n' | b'\r') {
                *byte = b' ';
            }
        }
    }
    Ok(String::from_utf8(bytes).expect("replacing source bytes with ASCII spaces preserves UTF-8"))
}

fn copper_plot_layers(layers: &[String]) -> Vec<String> {
    layers
        .iter()
        .filter(|layer| layer.ends_with(".Cu"))
        .cloned()
        .collect()
}

fn feature_bounds(features: &[Feature]) -> Option<[i64; 4]> {
    let mut bounds: Option<[i64; 4]> = None;
    for point in features.iter().flat_map(|feature| feature.outer_nm.iter()) {
        bounds = Some(match bounds {
            None => [point[0], point[1], point[0], point[1]],
            Some(current) => [
                current[0].min(point[0]),
                current[1].min(point[1]),
                current[2].max(point[0]),
                current[3].max(point[1]),
            ],
        });
    }
    bounds
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layer_selectors_expand_without_inventing_non_copper_layers() {
        let copper = vec!["F.Cu".to_owned(), "In1.Cu".to_owned(), "B.Cu".to_owned()];
        assert_eq!(expand_layers(&["*.Cu".to_owned()], &copper), copper);
        assert_eq!(
            expand_layers(&["F&B.Cu".to_owned()], &copper),
            vec!["F.Cu".to_owned(), "B.Cu".to_owned()]
        );
        assert_eq!(
            expand_layers(&["F.Cu".to_owned(), "B.Cu".to_owned()], &copper),
            copper
        );
    }

    #[test]
    fn plot_fact_flash_overrides_discard_non_copper_layers() {
        assert_eq!(
            copper_plot_layers(&[
                "F.Cu".to_owned(),
                "F.Mask".to_owned(),
                "B.Cu".to_owned(),
                "B.Paste".to_owned(),
            ]),
            vec!["F.Cu".to_owned(), "B.Cu".to_owned()]
        );
    }

    #[test]
    fn copper_layer_detection_ignores_non_layer_text() {
        assert!(form_mentions_copper_layer("(zone\n  (layer \"F.Cu\")\n)"));
        assert!(form_mentions_copper_layer(
            "(zone\n  (layers \"F.Cu\" \"B.Cu\")\n)"
        ));
        assert!(!form_mentions_copper_layer(
            "(zone\n  (net_name \"signal.Cu\")\n  (layer \"F.SilkS\")\n)"
        ));
    }

    #[test]
    fn blanked_forms_preserve_source_offsets_and_newlines() {
        let source = "(kicad_pcb\n  (version 20240108)\n  (zone (layer \"F.SilkS\"))\n  (zone (layer \"F.Cu\"))\n)";
        let selection = PcbSelection::none().with(PcbFamily::Zones);
        let view = PcbView::parse_selected(source, Default::default(), selection).unwrap();
        let filtered = blank_top_level_forms(source, &view, |head, text| {
            head == "zone" && !form_mentions_copper_layer(text)
        });

        assert_eq!(filtered.len(), source.len());
        assert_eq!(
            filtered.bytes().filter(|byte| *byte == b'\n').count(),
            source.bytes().filter(|byte| *byte == b'\n').count()
        );
        assert!(!filtered.contains("F.SilkS"));
        assert!(filtered.contains("(zone (layer \"F.Cu\"))"));
    }

    #[test]
    fn nested_presentation_forms_can_be_removed_without_touching_pads() {
        let source = "(kicad_pcb\n  (footprint \"X\"\n    (fp_line (start 0 0) (end 1 1))\n    (pad \"1\" smd rect (at 0 0) (size 1 1) (layers \"F.Cu\"))\n  )\n)";
        let filtered = blank_forms_by_head(source, &["fp_line"]).unwrap();

        assert_eq!(filtered.len(), source.len());
        assert!(!filtered.contains("fp_line"));
        assert!(filtered.contains("(pad \"1\" smd rect"));
    }

    #[test]
    fn empty_board_gets_a_synthetic_copper_pair() {
        let layers = contract_layers(&[]);
        assert_eq!(
            layers
                .iter()
                .map(|layer| (layer.name.as_str(), layer.source_ordinal))
                .collect::<Vec<_>>(),
            vec![("F.Cu", 0), ("B.Cu", 31)]
        );
    }

    #[test]
    fn authoritative_net_name_wins_over_ordinal() {
        assert_eq!(
            net_key(&PcbNetRef {
                ordinal: Some(7),
                name: Some("GND".to_owned()),
            }),
            Some("GND".to_owned())
        );
    }

    #[test]
    fn default_tolerance_is_the_contract_value() {
        assert_eq!(DEFAULT_TOLERANCE_MM, 0.005);
    }
}
