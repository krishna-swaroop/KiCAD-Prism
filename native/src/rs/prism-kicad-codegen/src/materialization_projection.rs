//! Exact-kind projection for the materialization contract's unions.

use crate::{project_kind_deserializer, validate_operation_union};
use anyhow::Result;
use serde_json::Value;

const MATERIALIZATION_SHAPE_KINDS: [(&str, &str, &str); 9] = [
    (
        "Disk2d",
        "disk_2d",
        "materialization_contract::deserialize_disk_2d_kind",
    ),
    (
        "Rect2d",
        "rect_2d",
        "materialization_contract::deserialize_rect_2d_kind",
    ),
    (
        "RoundedRect2d",
        "rounded_rect_2d",
        "materialization_contract::deserialize_rounded_rect_2d_kind",
    ),
    (
        "ChamferedRect2d",
        "chamfered_rect_2d",
        "materialization_contract::deserialize_chamfered_rect_2d_kind",
    ),
    (
        "Trapezoid2d",
        "trapezoid_2d",
        "materialization_contract::deserialize_trapezoid_2d_kind",
    ),
    (
        "Capsule2d",
        "capsule_2d",
        "materialization_contract::deserialize_capsule_2d_kind",
    ),
    (
        "Annulus2d",
        "annulus_2d",
        "materialization_contract::deserialize_annulus_2d_kind",
    ),
    (
        "SweptPath2d",
        "swept_path_2d",
        "materialization_contract::deserialize_swept_path_2d_kind",
    ),
    (
        "PlanarRegion2d",
        "planar_region_2d",
        "materialization_contract::deserialize_planar_region_2d_kind",
    ),
];

const MATERIALIZATION_SEGMENT_KINDS: [(&str, &str, &str); 3] = [
    (
        "LineSegment",
        "line",
        "materialization_contract::deserialize_line_segment_kind",
    ),
    (
        "ArcSegment",
        "arc",
        "materialization_contract::deserialize_arc_segment_kind",
    ),
    (
        "CubicSegment",
        "cubic",
        "materialization_contract::deserialize_cubic_segment_kind",
    ),
];

const MATERIALIZATION_OPERATION_KINDS: [(&str, &str, &str); 2] = [
    (
        "SurfaceOperation",
        "surface",
        "materialization_contract::deserialize_surface_operation_kind",
    ),
    (
        "HoleOperation",
        "hole",
        "materialization_contract::deserialize_hole_operation_kind",
    ),
];

/// The document schema Rust is generated from: the newest version, a1. An
/// a1 reader holds a0 documents in the same types (a0 lacks only
/// `design_facts`), so `MaterializationDocument.json` (a0) stays a
/// published schema without Rust types of its own.
const DOCUMENT_SCHEMA: &str = "MaterializationDocumentA1.json";

/// Materialization schemas and their generated modules.
pub(crate) const SCHEMAS: [(&str, &str); 2] = [
    ("MaterializationRequest.json", "materialization_request.rs"),
    (DOCUMENT_SCHEMA, "materialization_document.rs"),
];

/// `others` followed by the materialization schemas.
pub(crate) fn with_schemas<const N: usize>(
    others: [(&'static str, &'static str); N],
) -> impl Iterator<Item = (&'static str, &'static str)> {
    others.into_iter().chain(SCHEMAS)
}

pub(crate) fn is_schema(schema_name: &str) -> bool {
    SCHEMAS.iter().any(|(name, _)| *name == schema_name)
}

/// Check the document's exact-kind unions and promote them from `anyOf` to
/// `oneOf`, as the plot record unions are, so typify emits proper enums.
pub(crate) fn project_schema(schema_name: &str, schema: &mut Value) -> Result<()> {
    if schema_name != DOCUMENT_SCHEMA {
        return Ok(());
    }
    validate_kinds(schema_name, schema)?;
    for pointer in [
        "/$defs/Shape2d",
        "/$defs/PathSegment",
        "/$defs/MaterialOperation",
    ] {
        if let Some(record) = schema.pointer_mut(pointer).and_then(Value::as_object_mut)
            && let Some(members) = record.remove("anyOf")
        {
            record.insert("oneOf".to_owned(), members);
        }
    }
    Ok(())
}

fn validate_kinds(schema_name: &str, schema: &Value) -> Result<()> {
    validate_operation_union(schema_name, schema, "Shape2d", &MATERIALIZATION_SHAPE_KINDS)?;
    validate_operation_union(
        schema_name,
        schema,
        "PathSegment",
        &MATERIALIZATION_SEGMENT_KINDS,
    )?;
    validate_operation_union(
        schema_name,
        schema,
        "MaterialOperation",
        &MATERIALIZATION_OPERATION_KINDS,
    )
}

pub(crate) fn project_kinds(schema_name: &str, mut source: String) -> Result<String> {
    if schema_name != DOCUMENT_SCHEMA {
        return Ok(source);
    }
    for table in [
        &MATERIALIZATION_SHAPE_KINDS[..],
        &MATERIALIZATION_SEGMENT_KINDS[..],
        &MATERIALIZATION_OPERATION_KINDS[..],
    ] {
        for (structure, _, deserializer) in table {
            source = project_kind_deserializer(source, structure, deserializer)?;
        }
    }
    Ok(source)
}
