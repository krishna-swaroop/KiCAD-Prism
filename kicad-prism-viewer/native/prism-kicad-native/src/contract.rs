use serde::Serialize;
use std::collections::BTreeMap;

pub const SCHEMA: &str = "prism.pcb_geometry.v1";
pub const KICAD_MONKEY_REVISION: &str = "bc6796c1b8ce55bfbcb8b1771f3ecbc70658d34d";

pub type NmPoint = [i64; 2];
pub type NmRing = Vec<NmPoint>;

#[derive(Debug, Serialize)]
pub struct SourceIdentity {
    pub path: String,
    pub digest_sha256: String,
    pub bytes: usize,
}

#[derive(Debug, Serialize)]
pub struct CoordinateSystem {
    pub unit: &'static str,
    pub nm_per_mm: i64,
    pub x_axis: &'static str,
    pub y_axis: &'static str,
    pub rings_closed: bool,
    pub ring_roles_explicit: bool,
}

impl Default for CoordinateSystem {
    fn default() -> Self {
        Self {
            unit: "nm",
            nm_per_mm: 1_000_000,
            x_axis: "board-right",
            y_axis: "board-down",
            rings_closed: false,
            ring_roles_explicit: true,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct Layer {
    pub index: usize,
    pub key: String,
    pub name: String,
    pub source_ordinal: i64,
    pub layer_type: String,
    pub user_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct StackupLayer {
    pub name: String,
    pub type_name: String,
    pub thickness_mm: f64,
    pub material: String,
    pub epsilon_r: Option<f64>,
    pub loss_tangent: Option<f64>,
    pub color: String,
}

#[derive(Debug, Serialize)]
pub struct Board {
    pub thickness_mm: f64,
    pub aux_axis_origin_nm: NmPoint,
    pub stackup_layers: Vec<StackupLayer>,
    pub copper_finish: String,
    pub edge_connector: String,
    pub edge_plating: bool,
}

#[derive(Debug, Serialize)]
pub struct Net {
    pub index: usize,
    pub key: String,
    pub name: String,
    pub source_ordinal: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct Feature {
    pub source_order: usize,
    pub semantic_id: String,
    pub kind: String,
    pub source_uid: String,
    pub net_index: Option<usize>,
    pub layer_indexes: Vec<usize>,
    pub outer_nm: NmRing,
    pub holes_nm: Vec<NmRing>,
    pub footprint_uid: Option<String>,
    pub component_ref: Option<String>,
    pub pad_number: Option<String>,
    pub island: bool,
}

#[derive(Debug, Serialize)]
pub struct Drill {
    pub semantic_id: String,
    pub source_uid: String,
    pub kind: String,
    pub center_nm: NmPoint,
    pub width_nm: i64,
    pub height_nm: i64,
    pub oval: bool,
    pub plated: bool,
    pub layer_indexes: Vec<usize>,
    pub footprint_uid: Option<String>,
    pub component_ref: Option<String>,
    pub pad_number: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Diagnostic {
    pub severity: &'static str,
    pub code: &'static str,
    pub message: String,
    pub source_uid: Option<String>,
}

#[derive(Debug, Default, Serialize)]
pub struct Metrics {
    pub source_read_ms: f64,
    pub parse_index_ms: f64,
    pub extraction_ms: f64,
    pub serialization_ms: f64,
    pub total_ms: f64,
    pub used_plot_facts_flash_oracle: bool,
}

#[derive(Debug, Serialize)]
pub struct Document {
    pub schema: &'static str,
    pub kicad_monkey_revision: &'static str,
    pub kicad_monkey_engine_version: &'static str,
    pub source: SourceIdentity,
    pub coordinate_system: CoordinateSystem,
    pub curve_tolerance_mm: f64,
    pub board: Board,
    pub bounds_nm: Option<[i64; 4]>,
    pub layers: Vec<Layer>,
    pub nets: Vec<Net>,
    pub features: Vec<Feature>,
    pub drills: Vec<Drill>,
    pub diagnostics: Vec<Diagnostic>,
    pub stats: BTreeMap<String, usize>,
    pub metrics: Metrics,
}
