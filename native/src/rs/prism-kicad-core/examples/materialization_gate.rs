//! Corpus gate for the analytic board materializer.
//!
//! Usage: `cargo run --release -p prism-kicad-core --example
//! materialization_gate -- BOARD.kicad_pcb [OUT.json]`. A `.kicad_pro` next
//! to the board supplies its net classes.
//!
//! Materializes the complete board, validates it against the a0 contract,
//! checks binding coverage and determinism, checks rule 2 (selective equals
//! filtered complete) for one scope per copper slice and per product,
//! checks that a prepared board answers each scope exactly as a direct
//! materialization does, and prints a JSON summary. With `OUT.json`, writes the complete document.

use prism_kicad_contracts::generated::materialization_document::MaterializationDocumentA1;
use prism_kicad_contracts::generated::materialization_request::MaterializationRequestA0;
use prism_kicad_contracts::materialization_contract::validate_materialization_document;
use prism_kicad_core::board_materialization::{
    PrepareLimits, PreparedBoard, filter_document, materialize_project,
};

/// The board and, when one sits beside it, its project file.
struct Input {
    board: String,
    project: Option<String>,
}

impl Input {
    fn bytes(&self) -> usize {
        self.board.len() + self.project.as_ref().map_or(0, String::len)
    }

    fn materialize(&self, request: &MaterializationRequestA0) -> MaterializationDocumentA1 {
        materialize_project(&self.board, self.project.as_deref(), request)
            .unwrap_or_else(|error| fail(&error.to_string()))
    }
}
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::time::Instant;

const PRODUCTS: [&str; 7] = [
    "components",
    "copper",
    "dielectric",
    "holes",
    "paste",
    "silkscreen",
    "solder_mask",
];

fn request(products: &[&str], slices: &[String], source_bytes: usize) -> MaterializationRequestA0 {
    let value = json!({
        "type": "kicad_monkey.materialization.request",
        "version": "a0",
        "products": products,
        "slice_keys": slices,
        "tile_size_nm": 10_000_000,
        "max_source_bytes": source_bytes.to_string(),
        "max_operations": 50_000_000,
        "max_points": 500_000_000
    });
    match serde_json::from_value(value) {
        Ok(request) => request,
        Err(error) => fail(&format!("request: {error}")),
    }
}

fn fail(message: &str) -> ! {
    eprintln!("materialization gate failed: {message}");
    std::process::exit(1);
}

fn shape_counts(document: &Value) -> BTreeMap<String, usize> {
    let mut counts = BTreeMap::new();
    for operation in document["operations"].as_array().into_iter().flatten() {
        let key = format!(
            "{}/{}",
            operation["kind"].as_str().unwrap_or("?"),
            operation["shape"]["kind"].as_str().unwrap_or("?")
        );
        *counts.entry(key).or_insert(0) += 1;
    }
    counts
}

/// Regions and cutouts on the first dielectric slice, plus stack shape.
fn profile_summary(document: &Value) -> Value {
    let first = document["stack"]["slices"]
        .as_array()
        .and_then(|slices| slices.iter().find(|slice| slice["role"] == "dielectric"))
        .and_then(|slice| slice["key"].as_str())
        .unwrap_or_default()
        .to_owned();
    let adds: Vec<&Value> = document["operations"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|op| op["slice_key"] == first.as_str() && op["action"] == "add")
        .collect();
    let cutouts: usize = adds
        .iter()
        .filter_map(|op| op["shape"]["holes"].as_array().map(Vec::len))
        .sum();
    let known_thickness = document["stack"]["slices"].as_array().map_or(0, |slices| {
        slices
            .iter()
            .filter(|s| s["thickness_nm"].is_number())
            .count()
    });
    json!({ "regions": adds.len(), "cutouts": cutouts, "slices_with_thickness": known_thickness })
}

fn main() {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    let Some(path) = arguments.first() else {
        fail("usage: materialization_gate BOARD.kicad_pcb [OUT.json]");
    };
    let board = std::fs::read_to_string(path).unwrap_or_else(|error| fail(&error.to_string()));
    let project =
        std::fs::read_to_string(std::path::Path::new(path).with_extension("kicad_pro")).ok();
    let source = Input { board, project };
    let started = Instant::now();
    let complete = source.materialize(&request(&PRODUCTS, &[], source.bytes()));
    let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
    validate_materialization_document(&complete).unwrap_or_else(|error| fail(&error.to_string()));
    if complete.binding.len() != complete.operations.len() {
        fail("binding does not cover every operation");
    }
    let again = source.materialize(&request(&PRODUCTS, &[], source.bytes()));
    let text = serde_json::to_string(&complete).unwrap_or_else(|error| fail(&error.to_string()));
    if serde_json::to_string(&again).ok().as_deref() != Some(text.as_str()) {
        fail("output is not deterministic");
    }
    let pack_bytes = check_pack(&complete, &text);
    let slice_keys: Vec<String> = complete
        .stack
        .slices
        .iter()
        .map(|slice| slice.key.clone())
        .collect();
    // KM_GATE_SKIP_RULE2=1 skips the rule-2 scopes, for quick document dumps.
    let rule_two = std::env::var_os("KM_GATE_SKIP_RULE2").is_none();
    let scopes = if rule_two {
        rule_two_scopes(&slice_keys)
    } else {
        Vec::new()
    };
    let prepared = check_prepared(&source, &complete, &text);
    check_scopes(&source, &complete, &prepared.board, &scopes);
    let scopes = scopes.len();
    if let Some(out) = arguments.get(1) {
        std::fs::write(out, &text).unwrap_or_else(|error| fail(&error.to_string()));
    }
    let value: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
    let mut diagnostics = BTreeMap::new();
    for diagnostic in &complete.diagnostics {
        *diagnostics.entry(diagnostic.code.clone()).or_insert(0usize) += 1;
    }
    let summary = json!({
        "board": path,
        "materialize_ms": elapsed_ms,
        "operations": complete.operations.len(),
        "chunks": complete.chunks.len(),
        "nets": complete.nets.len(),
        "project": source.project.is_some(),
        "net_classes": complete.net_classes.len(),
        "diff_pairs": complete.diff_pairs.len(),
        "components": complete.components.len(),
        "slices": slice_keys,
        "shapes": shape_counts(&value),
        "diagnostics": diagnostics,
        "rule2_scopes_checked": scopes,
        "prepare_ms": prepared.prepare_ms,
        "prepared_complete_ms": prepared.complete_ms,
        "profile": profile_summary(&value),
        "materials": material_counts(&value),
        "json_bytes": text.len(),
        "pack_bytes": pack_bytes,
    });
    println!("{summary}");
}

/// Rule-2 scopes: every slice with copper, holes, both, and dielectric;
/// then every technical slice, one copper slice, and the whole board with
/// each technical product, alone and with copper.
fn rule_two_scopes(slice_keys: &[String]) -> Vec<(&'static [&'static str], Vec<String>)> {
    let mut scopes: Vec<(&'static [&'static str], Vec<String>)> = Vec::new();
    for key in slice_keys {
        for products in [
            &["copper"][..],
            &["holes"][..],
            &["copper", "holes"][..],
            &["dielectric"][..],
        ] {
            scopes.push((products, vec![key.clone()]));
        }
    }
    let technical_keys = slice_keys
        .iter()
        .filter(|key| !key.starts_with("dielectric") && !key.starts_with("copper.in"))
        .cloned()
        .chain(std::iter::once(String::new()));
    for key in technical_keys {
        for products in [
            &["solder_mask"][..],
            &["paste"][..],
            &["silkscreen"][..],
            &["copper", "solder_mask"][..],
        ] {
            scopes.push((
                products,
                (!key.is_empty()).then(|| key.clone()).into_iter().collect(),
            ));
        }
    }
    scopes
}

struct Prepared {
    board: PreparedBoard,
    prepare_ms: f64,
    complete_ms: f64,
}

/// Prepare the board once and check its complete answer.
fn check_prepared(source: &Input, complete: &MaterializationDocumentA1, text: &str) -> Prepared {
    let started = Instant::now();
    let limits = PrepareLimits {
        max_source_bytes: u64::MAX,
        max_operations: 50_000_000,
    };
    let board = PreparedBoard::prepare_project(&source.board, source.project.as_deref(), &limits)
        .unwrap_or_else(|error| fail(&error.to_string()));
    let prepare_ms = started.elapsed().as_secs_f64() * 1000.0;
    let started = Instant::now();
    let answer = board
        .materialize(&request(&PRODUCTS, &[], source.bytes()))
        .unwrap_or_else(|error| fail(&error.to_string()));
    let complete_ms = started.elapsed().as_secs_f64() * 1000.0;
    if answer.operations.len() != complete.operations.len()
        || serde_json::to_string(&answer).ok().as_deref() != Some(text)
    {
        fail("prepared complete document differs");
    }
    Prepared {
        board,
        prepare_ms,
        complete_ms,
    }
}

/// Materialize each scope, validate it, check rule 2 against the complete
/// result, and check the prepared board's answer, on as many threads as the
/// machine offers.
fn check_scopes(
    source: &Input,
    complete: &MaterializationDocumentA1,
    prepared: &PreparedBoard,
    scopes: &[(&'static [&'static str], Vec<String>)],
) {
    let workers = std::thread::available_parallelism().map_or(1, usize::from);
    let next = std::sync::atomic::AtomicUsize::new(0);
    std::thread::scope(|threads| {
        for _ in 0..workers {
            threads.spawn(|| {
                loop {
                    let index = next.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                    let Some((products, slices)) = scopes.get(index) else {
                        break;
                    };
                    let request = request(products, slices, source.bytes());
                    let selective = source.materialize(&request);
                    let answer = prepared
                        .materialize(&request)
                        .unwrap_or_else(|error| fail(&error.to_string()));
                    if serde_json::to_value(&answer).ok() != serde_json::to_value(&selective).ok() {
                        fail(&format!("prepared differs for {products:?} on {slices:?}"));
                    }
                    validate_materialization_document(&selective).unwrap_or_else(|error| {
                        fail(&format!("{products:?} on {slices:?}: {error}"))
                    });
                    let key = slices.first().map_or("", String::as_str);
                    check_rule_two(complete, &selective, products, key);
                }
            });
        }
    });
}

/// The complete document packs deterministically and reads back exactly.
fn check_pack(complete: &MaterializationDocumentA1, text: &str) -> usize {
    use prism_kicad_materialization_pack::{PackLimits, PackReader, encode_pack};
    let bytes = encode_pack(complete).unwrap_or_else(|error| fail(&error.to_string()));
    if encode_pack(complete).ok().as_deref() != Some(bytes.as_slice()) {
        fail("pack is not deterministic");
    }
    let limits = PackLimits {
        max_header_bytes: bytes.len(),
    };
    let reader = PackReader::open(&bytes, limits).unwrap_or_else(|error| fail(&error.to_string()));
    let decoded = reader
        .document()
        .unwrap_or_else(|error| fail(&error.to_string()));
    if serde_json::to_string(&decoded).ok().as_deref() != Some(text) {
        fail("pack does not round-trip");
    }
    bytes.len()
}

fn check_rule_two(
    complete: &MaterializationDocumentA1,
    selective: &MaterializationDocumentA1,
    products: &[&str],
    key: &str,
) {
    let filtered = filter_document(complete, &selective.scope);
    if serde_json::to_value(selective).ok() != serde_json::to_value(&filtered).ok() {
        fail(&format!("rule 2 failed for {products:?} on {key:?}"));
    }
}

/// Operation counts per (material, action, slice) for surface operations.
fn material_counts(document: &Value) -> BTreeMap<String, usize> {
    let mut counts = BTreeMap::new();
    for operation in document["operations"].as_array().into_iter().flatten() {
        if operation["kind"] != "surface" || operation["material"] == "copper" {
            continue;
        }
        let key = format!(
            "{}/{}/{}{}",
            operation["material"].as_str().unwrap_or("?"),
            operation["action"].as_str().unwrap_or("?"),
            operation["slice_key"].as_str().unwrap_or("?"),
            if operation["offset_nm"].is_null() {
                ""
            } else {
                "/offset"
            },
        );
        *counts.entry(key).or_insert(0usize) += 1;
    }
    counts
}
