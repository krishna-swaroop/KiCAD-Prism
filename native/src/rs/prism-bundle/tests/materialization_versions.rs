//! The reader's step 7 for the materialization: a member declared
//! `kicad_monkey.materialization.a1` or `.a0` is a pack of format 0 whose
//! header declares the same schema; any other materialization id is not a
//! pack this reader knows.

use prism_bundle::manifest::{MATERIALIZATION_SCHEMA, MATERIALIZATION_SCHEMAS, a3};
use prism_bundle::reader::check_structured;
use prism_bundle::{Limits, Work};
use prism_kicad_contracts::generated::materialization_document::MaterializationDocumentA1;
use prism_kicad_materialization_pack::{PACK_FORMAT_VERSION, encode_pack};
use serde_json::json;

fn document(version: &str) -> MaterializationDocumentA1 {
    let mut value = json!({
        "schema": format!("kicad_monkey.materialization.{version}"),
        "type": "kicad_monkey.materialization.document",
        "version": version,
        "producer": { "name": "test", "version": "0" },
        "source": { "sha256": "0".repeat(64), "source_bytes": "0" },
        "coordinate_system": { "unit": "nm", "x_axis": "board_right", "y_axis": "board_down" },
        "scope": { "products": ["copper"], "tile_size_nm": 10_000_000, "complete": false },
        "stack": { "slices": [ { "key": "copper.front", "role": "conductor", "order": 0 } ],
                   "regions": [ { "key": "rigid", "kind": "rigid",
                                  "slice_keys": ["copper.front"], "bend_lines": [] } ] },
        "nets": [], "net_classes": [], "diff_pairs": [], "components": [],
        "operations": [], "binding": [], "chunks": [], "diagnostics": []
    });
    if version == "a1" {
        value["design_facts"] = json!({ "zones": [], "pad_rules": [], "footprint_rules": [],
                                         "courtyards": [] });
    }
    serde_json::from_value(value).expect("document")
}

fn member(schema: &str, bytes: &[u8]) -> a3::BundleManifestMember {
    serde_json::from_value(json!({
        "path": "materialization/board.kmpack",
        "role": "materialization",
        "stage": "board",
        "sha256": "0".repeat(64),
        "bytes": bytes.len(),
        "member_schema": schema,
    }))
    .expect("member")
}

fn check(schema: &str, version: &str) -> Result<(), String> {
    let pack = encode_pack(&document(version)).expect("pack");
    let limits = Limits::defaults(Work::Verify);
    check_structured(&member(schema, &pack), &pack, PACK_FORMAT_VERSION, &limits)
        .map_err(|finding| finding.code.clone())
}

#[test]
fn the_generator_writes_a1_and_readers_accept_a1_and_a0() {
    assert_eq!(MATERIALIZATION_SCHEMA, "kicad_monkey.materialization.a1");
    assert_eq!(
        MATERIALIZATION_SCHEMAS,
        [
            "kicad_monkey.materialization.a1",
            "kicad_monkey.materialization.a0"
        ]
    );
    assert_eq!(check("kicad_monkey.materialization.a1", "a1"), Ok(()));
    assert_eq!(check("kicad_monkey.materialization.a0", "a0"), Ok(()));
}

#[test]
fn a_pack_must_declare_its_members_schema() {
    assert_eq!(
        check("kicad_monkey.materialization.a0", "a1"),
        Err("member-schema-invalid".to_owned())
    );
    assert_eq!(
        check("kicad_monkey.materialization.a1", "a0"),
        Err("member-schema-invalid".to_owned())
    );
}
