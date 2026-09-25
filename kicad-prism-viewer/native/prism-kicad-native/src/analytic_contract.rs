use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const SCHEMA: &str = "prism.pcb_analytic_geometry.v2";
pub const CONTRACT_REVISION: &str = "2";

pub type NmPoint = [i64; 2];
pub type NmRing = Vec<NmPoint>;

#[derive(Clone, Debug, Serialize)]
pub struct SourceIdentity {
    pub path: String,
    pub digest_sha256: String,
    pub bytes: usize,
}

#[derive(Clone, Debug, Serialize)]
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

#[derive(Clone, Debug, Serialize)]
pub struct Layer {
    pub index: usize,
    pub key: String,
    pub name: String,
    pub source_ordinal: i64,
    pub layer_type: String,
    pub user_name: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct StackupLayer {
    pub name: String,
    pub type_name: String,
    pub thickness_mm: f64,
    pub material: String,
    pub epsilon_r: Option<f64>,
    pub loss_tangent: Option<f64>,
    pub color: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct Board {
    pub thickness_mm: f64,
    pub aux_axis_origin_nm: NmPoint,
    pub stackup_layers: Vec<StackupLayer>,
    pub copper_finish: String,
    pub edge_connector: String,
    pub edge_plating: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct Net {
    pub index: usize,
    pub key: String,
    pub name: String,
    pub source_ordinal: Option<i64>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
pub struct Affine2D {
    pub m11: f64,
    pub m12: f64,
    pub m21: f64,
    pub m22: f64,
    pub tx_nm: i64,
    pub ty_nm: i64,
}

impl Default for Affine2D {
    fn default() -> Self {
        Self {
            m11: 1.0,
            m12: 0.0,
            m21: 0.0,
            m22: 1.0,
            tx_nm: 0,
            ty_nm: 0,
        }
    }
}

impl Affine2D {
    pub fn rotation_translation(angle_degrees: f64, translation_nm: NmPoint) -> Self {
        let angle = angle_degrees.to_radians();
        Self {
            m11: angle.cos(),
            m12: -angle.sin(),
            m21: angle.sin(),
            m22: angle.cos(),
            tx_nm: translation_nm[0],
            ty_nm: translation_nm[1],
        }
    }

    pub fn apply(&self, point: NmPoint) -> NmPoint {
        [
            (self.m11 * point[0] as f64 + self.m12 * point[1] as f64).round() as i64 + self.tx_nm,
            (self.m21 * point[0] as f64 + self.m22 * point[1] as f64).round() as i64 + self.ty_nm,
        ]
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MaterialPolarity {
    Add,
    Subtract,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AnalyticPrimitive {
    Disk {
        center_nm: NmPoint,
        radius_nm: i64,
    },
    Annulus {
        center_nm: NmPoint,
        outer_radius_nm: i64,
        inner_radius_nm: i64,
    },
    Capsule {
        start_nm: NmPoint,
        end_nm: NmPoint,
        radius_nm: i64,
    },
    CircularSweep {
        start_nm: NmPoint,
        mid_nm: NmPoint,
        end_nm: NmPoint,
        radius_nm: i64,
    },
    SweptPath {
        points_nm: Vec<NmPoint>,
        radius_nm: i64,
        closed: bool,
    },
    RoundedRect {
        center_nm: NmPoint,
        width_nm: i64,
        height_nm: i64,
        radius_nm: i64,
    },
    ChamferedRect {
        center_nm: NmPoint,
        width_nm: i64,
        height_nm: i64,
        ratio: f64,
        corners: Vec<String>,
    },
    Trapezoid {
        center_nm: NmPoint,
        width_nm: i64,
        height_nm: i64,
        delta_x_nm: i64,
        delta_y_nm: i64,
    },
    PlanarRegion {
        outer_nm: NmRing,
        holes_nm: Vec<NmRing>,
    },
}

#[derive(Clone, Debug, Serialize)]
pub struct Operation {
    pub source_order: usize,
    pub semantic_id: String,
    pub kind: String,
    pub source_uid: String,
    pub net_index: Option<usize>,
    pub layer_indexes: Vec<usize>,
    pub transform: Affine2D,
    pub bounds_nm: [i64; 4],
    pub polarity: MaterialPolarity,
    pub primitive: AnalyticPrimitive,
    pub footprint_uid: Option<String>,
    pub component_ref: Option<String>,
    pub pad_number: Option<String>,
    pub island: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct Drill {
    pub semantic_id: String,
    pub source_uid: String,
    pub kind: String,
    pub center_nm: NmPoint,
    pub width_nm: i64,
    pub height_nm: i64,
    pub angle_deg: f64,
    pub oval: bool,
    pub plated: bool,
    pub layer_indexes: Vec<usize>,
    pub footprint_uid: Option<String>,
    pub component_ref: Option<String>,
    pub pad_number: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct Diagnostic {
    pub severity: &'static str,
    pub code: &'static str,
    pub message: String,
    pub source_uid: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize)]
pub struct Metrics {
    pub source_read_ms: f64,
    pub parse_index_ms: f64,
    pub analytics_ms: f64,
    pub serialization_ms: f64,
    pub total_ms: f64,
    pub used_plot_facts_flash_oracle: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct Document {
    pub schema: &'static str,
    pub contract_revision: &'static str,
    pub producer: &'static str,
    pub kicad_monkey_revision: &'static str,
    pub kicad_monkey_engine_version: &'static str,
    pub source: SourceIdentity,
    pub coordinate_system: CoordinateSystem,
    pub terminal_tolerance_mm: f64,
    pub board: Board,
    pub bounds_nm: Option<[i64; 4]>,
    pub layers: Vec<Layer>,
    pub nets: Vec<Net>,
    pub operations: Vec<Operation>,
    pub drills: Vec<Drill>,
    pub diagnostics: Vec<Diagnostic>,
    pub stats: BTreeMap<String, usize>,
    pub metrics: Metrics,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn affine_rotation_and_translation_are_explicit() {
        let transform = Affine2D::rotation_translation(90.0, [10, 20]);
        assert_eq!(transform.apply([4, 0]), [10, 24]);
    }

    #[test]
    fn primitives_serialize_without_polygon_lowering() {
        let value = serde_json::to_value(AnalyticPrimitive::Capsule {
            start_nm: [0, 0],
            end_nm: [1_000_000, 0],
            radius_nm: 100_000,
        })
        .unwrap();
        assert_eq!(value["type"], "capsule");
        assert!(value.get("outer_nm").is_none());
    }
}
