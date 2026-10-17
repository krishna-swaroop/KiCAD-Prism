//! `bundle.json` (`prism.bundle.manifest.a3`): the generated contract types,
//! the fixed member paths, the role and stage rules of bundle-format.md §2,
//! and the compact serialization of conventions.md §13.

use crate::finding::Finding;
use crate::revision_key::Category;
pub use prism_kicad_contracts::generated::prism_bundle_manifest_a3 as a3;
use serde::Serialize;
use serde::de::DeserializeOwned;

/// The manifest document.
pub type Manifest = a3::BundleManifestA3;
/// A member role.
pub type Role = a3::BundleManifestMemberRole;
/// A stage.
pub type Stage = a3::BundleManifestStage;
/// A stage status.
pub type Status = a3::BundleManifestStageStatus;

/// Archive path of the manifest.
pub const MANIFEST_PATH: &str = "bundle.json";
/// Schema id of the manifest.
pub const MANIFEST_SCHEMA: &str = "prism.bundle.manifest.a3";
/// Archive path of the design JSON.
pub const DESIGN_PATH: &str = "design.json";
/// Schema id of the design JSON.
pub const DESIGN_SCHEMA: &str = "kicad_monkey.design.a0";
/// Archive path of the packed materialization.
pub const MATERIALIZATION_PATH: &str = "materialization/board.kmpack";
/// Schema id of the materialization.
pub const MATERIALIZATION_SCHEMA: &str = "kicad_monkey.materialization.a0";
/// Archive path of the component GLB.
pub const MODELS_PATH: &str = "viewer/models/components.glb";
/// Prefix of the source members.
pub const SOURCES_PREFIX: &str = "sources/";
/// Prefix of the refilled board.
pub const REFILLED_PREFIX: &str = "refilled/";
/// The bundle's one board id.
pub const BOARD_ID: &str = "main";

/// The eight projections: archive path and schema id (ADR §6).
pub const PROJECTIONS: [(&str, &str); 8] = [
    ("projections/board-objects.json", "prism.board_objects.a0"),
    ("projections/occurrences.json", "prism.occurrences.a0"),
    ("projections/placements.json", "prism.placements.a0"),
    ("projections/project.json", "prism.project.a0"),
    ("projections/route-metrics.json", "prism.route_metrics.a0"),
    ("projections/semantic-index.json", "prism.semantic_index.a2"),
    ("projections/stackup.json", "prism.stackup.a0"),
    (
        "projections/system-interface.json",
        "prism.system_interface.v1",
    ),
];

/// Every member the generator writes with a schema, sorted by path:
/// `generator.member_schemas` (cli-spec.md §5.1.1).
#[must_use]
pub fn member_schemas() -> Vec<(&'static str, &'static str)> {
    let mut schemas = vec![
        (MANIFEST_PATH, MANIFEST_SCHEMA),
        (DESIGN_PATH, DESIGN_SCHEMA),
        (MATERIALIZATION_PATH, MATERIALIZATION_SCHEMA),
    ];
    schemas.extend(PROJECTIONS);
    schemas.sort_by(|a, b| a.0.cmp(b.0));
    schemas
}

/// The stage that writes members of `role`.
#[must_use]
pub fn role_stage(role: Role) -> Stage {
    match role {
        Role::RefilledBoard | Role::Materialization => Stage::Board,
        Role::ComponentModels => Stage::Models,
        _ => Stage::Parse,
    }
}

/// Whether `role` is a `source-*` role.
#[must_use]
pub fn is_source_role(role: Role) -> bool {
    !matches!(
        role,
        Role::Design
            | Role::Projection
            | Role::RefilledBoard
            | Role::Materialization
            | Role::ComponentModels
    )
}

/// The role of a source of `category` (bundle-format.md §2.2).
#[must_use]
pub fn source_role(category: Category) -> Option<Role> {
    SOURCE_ROLES
        .iter()
        .find(|(candidate, _)| *candidate == category)
        .map(|(_, role)| *role)
}

/// Category to role, one to one; links and gitlinks have no member.
const SOURCE_ROLES: [(Category, Role); 11] = [
    (Category::KicadProject, Role::SourceProject),
    (Category::KicadSchematic, Role::SourceSchematic),
    (Category::KicadBoard, Role::SourceBoard),
    (Category::KicadDesignRules, Role::SourceDesignRules),
    (Category::KicadWorksheet, Role::SourceWorksheet),
    (Category::KicadJobset, Role::SourceJobset),
    (Category::LibraryTable, Role::SourceLibraryTable),
    (Category::SymbolLibrary, Role::SourceSymbolLibrary),
    (Category::Footprint, Role::SourceFootprint),
    (Category::Model3d, Role::Source3dModel),
    (Category::PrismSettings, Role::SourcePrismSettings),
];

/// The role the name rules give a source file at repository path `path`.
#[must_use]
pub fn role_for_source(path: &str) -> Option<Role> {
    crate::revision_key::category_for_name(crate::paths::file_name(path).as_bytes(), false)
        .and_then(source_role)
}

/// The schema id the generator gives `path`, when it has one.
#[must_use]
pub fn schema_for(path: &str) -> Option<&'static str> {
    member_schemas()
        .into_iter()
        .find(|(member, _)| *member == path)
        .map(|(_, schema)| schema)
}

/// `bundle.json` bytes: compact JSON, one LF (conventions.md §13).
#[must_use]
pub fn to_bytes(manifest: &Manifest) -> Vec<u8> {
    json_bytes(manifest)
}

/// Any document as compact JSON plus one LF.
#[must_use]
pub fn json_bytes<T: Serialize + ?Sized>(document: &T) -> Vec<u8> {
    let mut bytes = serde_json::to_vec(document).unwrap_or_default();
    bytes.push(b'\n');
    bytes
}

/// Re-type a document between two generated modules that each carry their
/// own copy of a shared model (for example `CliFinding`).
pub fn retype<A: Serialize, B: DeserializeOwned>(value: &A) -> Result<B, String> {
    serde_json::to_value(value)
        .and_then(serde_json::from_value)
        .map_err(|error| error.to_string())
}

/// The `CliFinding` of `finding`.
pub fn cli_finding(finding: &Finding) -> Result<a3::CliFinding, String> {
    serde_json::from_value(finding_json(finding)).map_err(|error| error.to_string())
}

/// `finding` as `CliFinding` JSON.
#[must_use]
pub fn finding_json(finding: &Finding) -> serde_json::Value {
    let mut value = serde_json::json!({
        "code": finding.code,
        "message": finding.message,
    });
    if let Some(location) = &finding.location {
        value["location"] = location_json(location);
    }
    value
}

/// A location as `CliLocation` JSON.
#[must_use]
pub fn location_json(location: &crate::finding::Location) -> serde_json::Value {
    let mut value = serde_json::Map::new();
    if let Some(path) = &location.path {
        value.insert("path".to_owned(), path.clone().into());
    }
    if let Some(line) = location.line {
        value.insert("line".to_owned(), line.into());
    }
    if let Some(column) = location.column {
        value.insert("column".to_owned(), column.into());
    }
    if let Some(offset) = location.offset {
        value.insert("offset".to_owned(), offset.into());
    }
    if let Some(pointer) = &location.pointer {
        value.insert("pointer".to_owned(), pointer.clone().into());
    }
    if let Some(uuid) = &location.uuid {
        value.insert("uuid".to_owned(), uuid.clone().into());
    }
    serde_json::Value::Object(value)
}

/// The finding of a manifest `CliFinding`.
#[must_use]
pub fn finding_of(finding: &a3::CliFinding) -> Finding {
    let location = finding
        .location
        .as_ref()
        .map(|location| crate::finding::Location {
            path: location.path.as_ref().map(|path| path.0.clone()),
            line: location.line.as_ref().map(|line| line.0.get()),
            column: location.column.as_ref().map(|column| column.0.get()),
            offset: location.offset.as_ref().map(|offset| offset.0),
            pointer: location.pointer.as_ref().map(|pointer| pointer.0.clone()),
            uuid: location.uuid.as_ref().map(|uuid| uuid.0.clone()),
        });
    Finding {
        code: finding.code.0.clone(),
        message: finding.message.to_string(),
        location,
    }
}

/// A manifest warning.
pub fn warning(code: &str, message: impl Into<String>) -> Result<a3::Warning, String> {
    let message: String = message.into();
    serde_json::from_value(serde_json::json!({ "code": code, "message": message }))
        .map_err(|error| error.to_string())
}

/// Sort `warnings` by code, then message, and drop equal entries (I10).
pub fn sort_warnings(warnings: &mut Vec<a3::Warning>) {
    warnings.sort_by(|a, b| {
        (a.code.as_str(), a.message.as_str()).cmp(&(b.code.as_str(), b.message.as_str()))
    });
    warnings.dedup_by(|a, b| a.code.0 == b.code.0 && a.message.as_str() == b.message.as_str());
}

/// A member failure record.
pub fn member_failure(
    path: &str,
    code: &str,
    message: impl Into<String>,
) -> Result<a3::BundleManifestMemberFailure, String> {
    let message: String = message.into();
    serde_json::from_value(serde_json::json!({ "path": path, "code": code, "message": message }))
        .map_err(|error| error.to_string())
}

/// The record of a stage that has not run.
#[must_use]
pub fn pending_board() -> a3::BundleManifestBoardStage {
    a3::BundleManifestBoardStage {
        status: Status::Pending,
        skip_reason: None,
        error: None,
        fill_provenance: None,
        fill_check: None,
        cross_check: None,
        warnings: Vec::new(),
        failed_members: Vec::new(),
    }
}

/// The record of a board stage skipped for `reason`.
#[must_use]
pub fn skipped_board(reason: a3::BundleManifestSkipReason) -> a3::BundleManifestBoardStage {
    a3::BundleManifestBoardStage {
        status: Status::Skipped,
        skip_reason: Some(reason),
        ..pending_board()
    }
}

/// The record of a models stage in `status` (pending or skipped).
#[must_use]
pub fn models_stage(
    status: Status,
    reason: Option<a3::BundleManifestSkipReason>,
) -> a3::BundleManifestModelsStage {
    a3::BundleManifestModelsStage {
        status,
        skip_reason: reason,
        error: None,
        warnings: Vec::new(),
        failed_members: Vec::new(),
    }
}

/// The spelling of a status.
#[must_use]
pub fn status_name(status: Status) -> &'static str {
    match status {
        Status::Pending => "pending",
        Status::Complete => "complete",
        Status::Partial => "partial",
        Status::Failed => "failed",
        Status::Skipped => "skipped",
    }
}

/// The spelling of a stage.
#[must_use]
pub fn stage_name(stage: Stage) -> &'static str {
    match stage {
        Stage::Parse => "parse",
        Stage::Board => "board",
        Stage::Models => "models",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn member_schemas_match_the_contract_example() {
        let example: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../contracts/prism/examples/CliVersionA0.example.json"
        ))
        .unwrap();
        let listed: Vec<(String, String)> = example["member_schemas"]
            .as_array()
            .unwrap()
            .iter()
            .map(|entry| {
                (
                    entry["path"].as_str().unwrap().to_owned(),
                    entry["schema"].as_str().unwrap().to_owned(),
                )
            })
            .collect();
        let ours: Vec<(String, String)> = member_schemas()
            .into_iter()
            .map(|(path, schema)| (path.to_owned(), schema.to_owned()))
            .collect();
        assert_eq!(ours, listed);
    }

    #[test]
    fn the_example_manifest_parses_into_the_generated_types() {
        let manifest: Manifest = serde_json::from_str(include_str!(
            "../../../../contracts/prism/examples/BundleManifestA3.example.json"
        ))
        .unwrap();
        assert_eq!(manifest.schema, MANIFEST_SCHEMA);
        for member in &manifest.members {
            assert_eq!(role_stage(member.role), member.stage, "{}", member.path.0);
        }
    }
}
