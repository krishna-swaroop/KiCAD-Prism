//! Every Prism contract example deserializes into its generated Rust type and
//! serializes back to the same document: equal as JSON values with numbers
//! compared as IEEE doubles (conventions.md §14), and with every object's keys
//! in the same order (§13). The generated types carry every field.

use prism_kicad_contracts::generated;
use serde::{Serialize, de::DeserializeOwned};
use std::path::PathBuf;

fn round_trip<T: Serialize + DeserializeOwned>(root: &str) {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../contracts/prism/examples")
        .join(format!("{root}.example.json"));
    let text = std::fs::read_to_string(&path).expect("example");
    let expected: serde_json::Value = serde_json::from_str(&text).expect("example JSON");
    let typed: T = serde_json::from_value(expected.clone())
        .unwrap_or_else(|error| panic!("{root} does not fit its generated type: {error}"));
    let written = serde_json::to_string(&typed).expect("serialize");
    let actual: serde_json::Value = serde_json::from_str(&written).expect("written JSON");
    assert_eq!(
        normalized(&actual),
        normalized(&expected),
        "{root}: value changed in the round trip"
    );
    assert_eq!(
        key_order(&actual),
        key_order(&expected),
        "{root}: key order changed"
    );
}

#[test]
fn every_prism_example_round_trips_through_its_generated_type() {
    round_trip::<generated::prism_artwork_config_a0::ArtworkConfigA0>("ArtworkConfigA0");
    round_trip::<generated::prism_assembly_hlr_a0::AssemblyHlrA0>("AssemblyHlrA0");
    round_trip::<generated::prism_board_objects_a0::BoardObjectsA0>("BoardObjectsA0");
    round_trip::<generated::prism_bundle_manifest_a3::BundleManifestA3>("BundleManifestA3");
    round_trip::<generated::prism_cli_artwork_result_a0::CliArtworkResultA0>("CliArtworkResultA0");
    round_trip::<generated::prism_cli_build_result_a0::CliBuildResultA0>("CliBuildResultA0");
    round_trip::<generated::prism_cli_compare_result_a0::CliCompareResultA0>("CliCompareResultA0");
    round_trip::<generated::prism_cli_diagnostic_a0::CliDiagnosticA0>("CliDiagnosticA0");
    round_trip::<generated::prism_cli_drawing_sheet_result_a0::CliDrawingSheetResultA0>(
        "CliDrawingSheetResultA0",
    );
    round_trip::<generated::prism_cli_error_a0::CliErrorA0>("CliErrorA0");
    round_trip::<generated::prism_cli_extract_result_a0::CliExtractResultA0>("CliExtractResultA0");
    round_trip::<generated::prism_cli_project_absent_a0::CliProjectAbsentA0>("CliProjectAbsentA0");
    round_trip::<generated::prism_cli_reuse_result_a0::CliReuseResultA0>("CliReuseResultA0");
    round_trip::<generated::prism_cli_stroke_font_metrics_a0::CliStrokeFontMetricsA0>(
        "CliStrokeFontMetricsA0",
    );
    round_trip::<generated::prism_cli_stroke_text_result_a0::CliStrokeTextResultA0>(
        "CliStrokeTextResultA0",
    );
    round_trip::<generated::prism_cli_vendor_list_a0::CliVendorListA0>("CliVendorListA0");
    round_trip::<generated::prism_cli_vendor_run_result_a0::CliVendorRunResultA0>(
        "CliVendorRunResultA0",
    );
    round_trip::<generated::prism_cli_verify_report_a0::CliVerifyReportA0>("CliVerifyReportA0");
    round_trip::<generated::prism_cli_version_a0::CliVersionA0>("CliVersionA0");
    round_trip::<generated::prism_compare_object_delta_a0::CompareObjectDeltaA0>(
        "CompareObjectDeltaA0",
    );
    round_trip::<generated::prism_design_compare_result_a1::DesignCompareResultA1>(
        "DesignCompareResultA1",
    );
    round_trip::<generated::prism_drawing_sheet_request_a0::DrawingSheetRequestA0>(
        "DrawingSheetRequestA0",
    );
    round_trip::<generated::prism_occurrences_a0::OccurrencesA0>("OccurrencesA0");
    round_trip::<generated::prism_placements_a0::PlacementsA0>("PlacementsA0");
    round_trip::<generated::prism_project_a0::ProjectA0>("ProjectA0");
    round_trip::<generated::prism_revision_key_effective_config_a1::RevisionKeyEffectiveConfigA1>(
        "RevisionKeyEffectiveConfigA1",
    );
    round_trip::<generated::prism_revision_key_record_a1::RevisionKeyRecordA1>(
        "RevisionKeyRecordA1",
    );
    round_trip::<generated::prism_revision_key_vectors_a1::RevisionKeyVectorsA1>(
        "RevisionKeyVectorsA1",
    );
    round_trip::<generated::prism_route_metrics_a0::RouteMetricsA0>("RouteMetricsA0");
    round_trip::<generated::prism_semantic_index_a2::SemanticIndexA2>("SemanticIndexA2");
    round_trip::<generated::prism_stackup_a0::StackupA0>("StackupA0");
    round_trip::<generated::prism_stroke_text_request_a0::StrokeTextRequestA0>(
        "StrokeTextRequestA0",
    );
    round_trip::<generated::prism_system_interface_v1::SystemInterfaceV1>("SystemInterfaceV1");
    round_trip::<generated::prism_vendor_jlcpcb_config_a0::VendorJlcpcbConfigA0>(
        "VendorJlcpcbConfigA0",
    );
}

/// Numbers as doubles, so `0` and `0.0` compare equal (conventions.md §14).
fn normalized(value: &serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Number(number) => {
            serde_json::Value::from(number.as_f64().expect("finite number"))
        }
        serde_json::Value::Array(items) => items.iter().map(normalized).collect(),
        serde_json::Value::Object(object) => object
            .iter()
            .map(|(key, value)| (key.clone(), normalized(value)))
            .collect::<serde_json::Map<_, _>>()
            .into(),
        other => other.clone(),
    }
}

/// Every object's keys, in order, depth first.
fn key_order(value: &serde_json::Value) -> Vec<String> {
    let mut keys = Vec::new();
    collect_keys(value, &mut keys);
    keys
}

fn collect_keys(value: &serde_json::Value, keys: &mut Vec<String>) {
    match value {
        serde_json::Value::Array(items) => items.iter().for_each(|item| collect_keys(item, keys)),
        serde_json::Value::Object(object) => {
            for (key, value) in object {
                keys.push(key.clone());
                collect_keys(value, keys);
            }
        }
        _ => {}
    }
}
