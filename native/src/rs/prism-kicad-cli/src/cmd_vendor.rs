//! `vendor list` and `vendor run` (cli-spec.md §5.8, ADR amendment C3 §3.3).
//!
//! `vendor run` reads `projections/occurrences.json` and
//! `projections/placements.json` from the bundle, plus the board source when
//! the bundle carries it (the footprint fields Cruncher merged into the BOM),
//! maps them through the registered vendor and writes its files into `-o`
//! atomically. stdout is the validated `CliVendorRunResultA0`.
//!
//! An unknown id is a usage failure with code `vendor-unknown` (exit 2).

use crate::args::{Args, Command};
use crate::inputs;
use crate::output::Stderr;
use prism_bundle::reader::BundleReader;
use prism_bundle::zip::FileSource;
use prism_bundle::{Failure, Outcome, temp};
use prism_kicad_contracts::generated::prism_occurrences_a0::OccurrencesA0;
use prism_kicad_contracts::generated::prism_placements_a1::PlacementsA1;
use prism_vendors::design::BoardFacts;
use prism_vendors::{Run, VendorInput};
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static SERIAL: AtomicU64 = AtomicU64::new(0);

const OCCURRENCES: &str = "projections/occurrences.json";
const PLACEMENTS: &str = "projections/placements.json";

/// Run `vendor list` or `vendor run`; the stdout document and exit code.
pub fn run(args: &Args, _stderr: &Stderr) -> Outcome<(Value, u8)> {
    match args.command {
        Command::VendorList => Ok((
            serde_json::to_value(prism_vendors::list()).unwrap_or(Value::Null),
            0,
        )),
        Command::VendorRun => run_vendor(args),
        _ => Err(Failure::internal("not a vendor command")),
    }
}

/// `vendor run <vendor-id> --in … --config … -o …`.
fn run_vendor(args: &Args) -> Outcome<(Value, u8)> {
    let id = args
        .positional
        .first()
        .map(String::as_str)
        .ok_or_else(|| Failure::usage("usage", "vendor run takes one <vendor-id>"))?;
    let Some(vendor) = prism_vendors::find(id) else {
        return Err(Failure::usage(
            "vendor-unknown",
            format!("no vendor is registered as {id:?}"),
        ));
    };
    let (input, config) = read_inputs(args)?;
    let variant = args.option("variant");
    if let Some(requested) = variant {
        check_variant(&input.occurrences, requested)?;
    }
    let run = vendor
        .run(&input, &config, variant)
        .map_err(|error| Failure::input(error.code, error.message).argument("in"))?;
    let output = PathBuf::from(args.option("output").unwrap_or_default());
    write_files(&output, &run.files)?;
    Ok((result_document(vendor.id(), &run), 0))
}

/// Refuse `--variant` when the design defines no variant matching it, ignoring
/// case (`default` is always accepted); the message lists the names the design
/// does define.
fn check_variant(occurrences: &OccurrencesA0, requested: &str) -> Outcome<()> {
    let names = prism_vendors::design::variant_names(occurrences);
    if prism_vendors::design::variant_known(&names, requested) {
        return Ok(());
    }
    let message = if names.is_empty() {
        format!("the design has no variant {requested:?} and defines none")
    } else {
        format!(
            "the design has no variant {requested:?}; it defines {}",
            names.join(", ")
        )
    };
    Err(Failure::usage("variant-unknown", message).argument("variant"))
}

/// The bundle members, the board facts and the configuration.
fn read_inputs(args: &Args) -> Outcome<(VendorInput, Value)> {
    let bundle = Path::new(args.option("in").unwrap_or_default());
    inputs::regular_file(bundle, "in")?;
    let config_path = Path::new(args.option("config").unwrap_or_default());
    inputs::regular_file(config_path, "config")?;
    let source = FileSource::new(std::fs::File::open(bundle).map_err(|error| {
        Failure::input(
            "input-not-found",
            format!("--in could not be read: {error}"),
        )
        .argument("in")
    })?)
    .map_err(|error| {
        Failure::input(
            "input-not-found",
            format!("--in could not be read: {error}"),
        )
        .argument("in")
    })?;
    let reader = BundleReader::open(source, &args.limits).map_err(|error| error.failure("in"))?;
    let occurrences: OccurrencesA0 = read_member(&reader, OCCURRENCES)?;
    let placements: PlacementsA1 = read_member(&reader, PLACEMENTS)?;
    let board = board_facts(&reader, &occurrences)?;
    let config: Value = serde_json::from_slice(&std::fs::read(config_path).map_err(|error| {
        Failure::input(
            "input-not-found",
            format!("--config could not be read: {error}"),
        )
        .argument("config")
    })?)
    .map_err(|error| {
        Failure::input(
            "input-invalid",
            format!("--config is not a JSON document: {error}"),
        )
        .argument("config")
    })?;
    Ok((
        VendorInput {
            occurrences,
            placements,
            board,
        },
        config,
    ))
}

/// `CliVendorRunResultA0`.
fn result_document(vendor: &str, run: &Run) -> Value {
    let mut files: Vec<Value> = run
        .files
        .iter()
        .map(|file| {
            json!({
                "path": file.path,
                "sha256": prism_bundle::generator::sha256_hex(&file.bytes),
            })
        })
        .collect();
    files.sort_by(|left, right| {
        left["path"]
            .as_str()
            .unwrap_or_default()
            .cmp(right["path"].as_str().unwrap_or_default())
    });
    let rows: serde_json::Map<String, Value> = run
        .rows
        .iter()
        .map(|(name, count)| (name.clone(), json!(count)))
        .collect();
    let mut excluded: Vec<Value> = run
        .excluded
        .iter()
        .map(|item| {
            let mut document = json!({
                "key": item.key,
                "code": item.code,
                "message": item.message,
            });
            if let Some(reference) = &item.reference {
                document["reference"] = json!(reference);
            }
            document
        })
        .collect();
    excluded.sort_by(|left, right| {
        left["key"]
            .as_str()
            .unwrap_or_default()
            .cmp(right["key"].as_str().unwrap_or_default())
    });
    json!({
        "schema": "prism.cli.vendor_run_result.a0",
        "vendor": vendor,
        "files": files,
        "rows": rows,
        "excluded": excluded,
    })
}

fn read_member<T: DeserializeOwned>(reader: &BundleReader<FileSource>, path: &str) -> Outcome<T> {
    let bytes = match reader.member(path) {
        None => {
            return Err(Failure::precondition(
                "member-not-found",
                format!("the bundle has no {path}"),
            ));
        }
        Some(Ok(bytes)) => bytes,
        Some(Err(finding)) => {
            let mut failure = Failure::precondition("bundle-invalid", finding.message.clone());
            failure.finding.location = finding.location;
            return Err(failure);
        }
    };
    serde_json::from_slice(&bytes).map_err(|error| {
        Failure::precondition("bundle-invalid", format!("{path} does not decode: {error}"))
    })
}

/// The board source's footprint fields, when the bundle has the board.
fn board_facts(
    reader: &BundleReader<FileSource>,
    occurrences: &OccurrencesA0,
) -> Outcome<Option<BoardFacts>> {
    let Some(path) = occurrences
        .footprints
        .first()
        .map(|footprint| footprint.document_path.0.clone())
    else {
        return Ok(None);
    };
    let member = format!("sources/{path}");
    let Some(bytes) = reader.member(&member) else {
        return Ok(None);
    };
    let bytes = bytes.map_err(|finding| {
        Failure::precondition("bundle-invalid", finding.message).argument("in")
    })?;
    let text = String::from_utf8(bytes).map_err(|error| {
        Failure::precondition("bundle-invalid", format!("{member} is not UTF-8: {error}"))
    })?;
    BoardFacts::parse(&text)
        .map(Some)
        .map_err(|error| Failure::input(error.code, error.message).argument("in"))
}

/// Write every file into `directory` through a hidden temp file and a rename.
fn write_files(directory: &Path, files: &[prism_vendors::VendorFile]) -> Outcome<()> {
    std::fs::create_dir_all(directory).map_err(|error| {
        Failure::output(
            "output-write-failed",
            format!("-o could not be created: {error}"),
        )
        .argument("output")
    })?;
    for file in files {
        let name = Path::new(&file.path)
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| Failure::internal(format!("{} is not a file path", file.path)))?;
        let serial = SERIAL.fetch_add(1, Ordering::Relaxed);
        let temp = directory.join(format!(
            ".{name}.prism-kicad-{}-{serial}.tmp",
            std::process::id()
        ));
        temp::register(temp.clone());
        let result = (|| {
            let mut output = std::fs::File::create(&temp)?;
            output.write_all(&file.bytes)?;
            output.sync_all()?;
            std::fs::rename(&temp, directory.join(name))
        })();
        if let Err(error) = result {
            let _ = std::fs::remove_file(&temp);
            temp::unregister(&temp);
            return Err(Failure::output(
                "output-write-failed",
                format!("{} could not be written: {error}", file.path),
            )
            .argument("output"));
        }
        temp::unregister(&temp);
    }
    if let Ok(directory) = std::fs::File::open(directory) {
        let _ = directory.sync_all();
    }
    Ok(())
}
