//! Cross-check behaviour, moved from a1 (sim: `src/prism-bundle/tests/
//! crosscheck.rs`): mismatches between the binding table and `design.json`,
//! built from the demo project through stage parse and edited per case, and
//! the a2 record of a failing cross-check in stage board.

use prism_bundle::Limits;
use prism_bundle::manifest::{DESIGN_PATH, a3};
use prism_bundle::stages::board::{BoardRequest, Refilled};
use prism_bundle::stages::chain::Input;
use prism_bundle::stages::crosscheck::{
    CrossCheckOutcome, CrossCheckStatus, DesignView, IssueKind, cross_check,
};
use prism_bundle::stages::materialize::materialize_complete;
use prism_bundle::stages::parse::{ParseOutcome, ParseRequest};
use prism_bundle::stages::{Built, Generator, Silent};
use prism_kicad_contracts::generated::materialization_document::MaterializationDocumentA0;
use serde::Deserialize;
use serde_json::{Value, json};
use std::path::{Path, PathBuf};

fn generator() -> Generator {
    let document: a3::CliVersionA0 = serde_json::from_str(include_str!(
        "../../../../contracts/prism/examples/CliVersionA0.example.json"
    ))
    .unwrap();
    Generator::new(document).unwrap()
}

fn scratch(label: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("prism-bundle-{label}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(dir.join("sub")).unwrap();
    let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/demo");
    for file in [
        "demo.kicad_pro",
        "demo.kicad_sch",
        "demo.kicad_pcb",
        "sub/power.kicad_sch",
    ] {
        std::fs::copy(fixture.join(file), dir.join(file)).unwrap();
    }
    dir
}

fn parse(dir: &Path) -> Built {
    let limits = Limits::defaults(prism_bundle::Work::Parse);
    let generator = generator();
    let request = ParseRequest {
        project: &dir.join("demo.kicad_pro"),
        source_root: None,
        config: None,
        revision_key: None,
        key_record: None,
        upgraded: Default::default(),
        generator: &generator,
        limits: &limits,
        reporter: &Silent,
        projections: None,
    };
    match prism_bundle::stages::parse::run(&request).unwrap() {
        ParseOutcome::Built(built) => *built,
        ParseOutcome::ProjectAbsent(path) => panic!("{path} is absent"),
    }
}

struct Demo {
    dir: PathBuf,
}

impl Demo {
    fn new(label: &str) -> Self {
        Self {
            dir: scratch(label),
        }
    }

    fn board(&self) -> String {
        std::fs::read_to_string(self.dir.join("demo.kicad_pcb")).unwrap()
    }

    fn set_board(&self, text: &str) {
        std::fs::write(self.dir.join("demo.kicad_pcb"), text).unwrap();
    }

    fn header(&self) -> MaterializationDocumentA0 {
        let project = std::fs::read_to_string(self.dir.join("demo.kicad_pro")).unwrap();
        materialize_complete(&self.board(), &project, 10_000_000, u32::MAX)
            .unwrap()
            .header
    }

    fn design(&self) -> Value {
        let built = parse(&self.dir);
        let member = built
            .members
            .iter()
            .find(|member| member.path == DESIGN_PATH)
            .unwrap();
        serde_json::from_slice(&member.bytes).unwrap()
    }
}

fn check(header: &MaterializationDocumentA0, design: &Value) -> CrossCheckOutcome {
    cross_check(header, &DesignView::deserialize(design).unwrap())
}

fn kinds(outcome: &CrossCheckOutcome) -> Vec<(IssueKind, String)> {
    outcome
        .errors
        .iter()
        .map(|issue| (issue.kind, issue.subject.clone()))
        .collect()
}

fn net_mut<'a>(design: &'a mut Value, name: &str) -> &'a mut Value {
    design["nets"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|net| net["name"] == name)
        .unwrap()
}

fn terminal_mut<'a>(design: &'a mut Value, refdes: &str, pin: &str) -> &'a mut Value {
    design["nets"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .flat_map(|net| net["terminals"].as_array_mut().unwrap().iter_mut())
        .find(|t| t["designator"] == refdes && t["pin"] == pin)
        .unwrap()
}

#[test]
fn agreeing_sources_pass() {
    let demo = Demo::new("agree");
    let outcome = check(&demo.header(), &demo.design());
    assert!(outcome.errors.is_empty(), "{:?}", outcome.errors);
    assert_eq!(outcome.report.status, CrossCheckStatus::PassedWithWarnings);
}

#[test]
fn renamed_and_split_nets_are_known_mappings() {
    let demo = Demo::new("mappings");
    let mut design = demo.design();
    net_mut(&mut design, "VIN")["name"] = json!("VIN_RENAMED");
    let outcome = check(&demo.header(), &design);
    assert!(outcome.errors.is_empty(), "{:?}", outcome.errors);
    assert!(
        outcome
            .report
            .mappings
            .iter()
            .any(|m| m.kind == "same-pins-net-name"
                && m.board == "VIN"
                && m.design == "VIN_RENAMED")
    );
    let mut design = demo.design();
    let vin = net_mut(&mut design, "VIN").clone();
    let terminals = vin["terminals"].as_array().unwrap().clone();
    let mut piece = vin;
    piece["name"] = json!("/sheet/VIN");
    piece["terminals"] = json!([terminals[0].clone()]);
    net_mut(&mut design, "VIN")["terminals"] = json!(terminals[1..].to_vec());
    design["nets"].as_array_mut().unwrap().push(piece);
    let outcome = check(&demo.header(), &design);
    assert!(outcome.errors.is_empty(), "{:?}", outcome.errors);
    assert!(
        outcome
            .report
            .mappings
            .iter()
            .any(|m| m.kind == "split-net" && m.design == "/sheet/VIN")
    );
}

#[test]
fn moved_pins_and_missing_symbols_are_errors() {
    let demo = Demo::new("errors");
    let mut design = demo.design();
    let moved = terminal_mut(&mut design, "R1", "1").clone();
    for net in design["nets"].as_array_mut().unwrap() {
        net["terminals"]
            .as_array_mut()
            .unwrap()
            .retain(|t| *t != moved);
    }
    net_mut(&mut design, "GND")["terminals"]
        .as_array_mut()
        .unwrap()
        .push(moved);
    let outcome = check(&demo.header(), &design);
    assert!(kinds(&outcome).contains(&(IssueKind::NetMismatch, "R1.1".to_owned())));
    let mut design = demo.design();
    design["components"]
        .as_array_mut()
        .unwrap()
        .retain(|c| c["designator"] != "C1");
    let outcome = check(&demo.header(), &design);
    assert_eq!(
        kinds(&outcome),
        [(IssueKind::ComponentMissingFromSchematic, "C1".to_owned())]
    );
    let mut design = demo.design();
    let components = design["components"].as_array_mut().unwrap();
    components.push(json!({ "designator": "U9", "parameters": { "kicad_on_board": "true" } }));
    components.push(json!({ "designator": "TP1", "parameters": { "kicad_on_board": "false" } }));
    let outcome = check(&demo.header(), &design);
    assert_eq!(
        kinds(&outcome),
        [(IssueKind::ComponentMissingFromBoard, "U9".to_owned())]
    );
    let mut design = demo.design();
    terminal_mut(&mut design, "C1", "2")["pin"] = json!("3");
    let outcome = check(&demo.header(), &design);
    assert_eq!(
        kinds(&outcome),
        [(IssueKind::PadMissingFromSchematic, "C1.2".to_owned())]
    );
    assert!(
        outcome
            .report
            .warnings
            .iter()
            .any(|w| w.code == "pin-missing-from-board")
    );
}

#[test]
fn a_single_pin_unconnected_net_is_a_known_mapping() {
    let demo = Demo::new("single-pin");
    let renamed = demo
        .board()
        .replace("(net 3 \"GND\")\n", "(net 3 \"GND\")\n  (net 4 \"unconnected-(C1-Pad1)\")\n")
        .replace(
            "(net 2 \"VOUT\") (pintype \"passive\") (uuid \"00000000-0000-4000-8000-000000001110\")",
            "(net 4 \"unconnected-(C1-Pad1)\") (pintype \"passive\") (uuid \"00000000-0000-4000-8000-000000001110\")",
        );
    demo.set_board(&renamed);
    let mut design = demo.design();
    net_mut(&mut design, "VOUT")["terminals"]
        .as_array_mut()
        .unwrap()
        .retain(|t| t["designator"] != "C1");
    design["nets"].as_array_mut().unwrap().push(json!({
        "name": "Net-(C1-Pad1)",
        "terminals": [{ "designator": "C1", "pin": "1" }]
    }));
    let outcome = check(&demo.header(), &design);
    assert!(outcome.errors.is_empty(), "{:?}", outcome.errors);
    assert_eq!(outcome.report.mappings[0].kind, "single-pin-net-name");
}

#[test]
fn a_failing_cross_check_is_recorded_sorted_and_the_stage_completes() {
    let demo = Demo::new("failing");
    let swapped = demo
        .board()
        .replacen("(net 1 \"VIN\") (pintype", "(net 9 \"X\") (pintype", 1)
        .replacen("(net 2 \"VOUT\") (pintype", "(net 1 \"VIN\") (pintype", 1)
        .replacen("(net 9 \"X\") (pintype", "(net 2 \"VOUT\") (pintype", 1);
    demo.set_board(&swapped);
    let built = parse(&demo.dir);
    let input = Input {
        manifest: built.manifest.clone(),
        manifest_sha256: String::new(),
        members: built.members.clone(),
    };
    let limits = Limits::defaults(prism_bundle::Work::Board);
    let generator = generator();
    let board = prism_bundle::stages::board::run(&BoardRequest {
        input: &input,
        refilled: Some(Refilled {
            bytes: swapped.into_bytes(),
            tool: "10.0.6".to_owned(),
        }),
        revision_key: None,
        config: None,
        generator: &generator,
        limits: &limits,
        reporter: &Silent,
    })
    .unwrap();
    let record = &board.manifest.stages.board;
    assert_eq!(record.status, a3::BundleManifestStageStatus::Complete);
    let check = record.cross_check.as_ref().unwrap();
    assert_eq!(check.status, a3::BundleManifestCrossCheckStatus::Failed);
    let codes: Vec<&str> = check
        .errors
        .iter()
        .map(|error| error.code.0.as_str())
        .collect();
    assert_eq!(codes, ["net-mismatch", "net-mismatch"]);
    assert!(check.errors[0].message.contains("R1.1") && check.errors[1].message.contains("R1.2"));
    assert!(
        record
            .warnings
            .iter()
            .all(|warning| warning.code.0 != "net-mismatch")
    );
    assert!(prism_bundle::verify::invariants(&board.manifest).is_empty());
}
