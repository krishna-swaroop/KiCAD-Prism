//! `stroke-text` and `drawing-sheet` (cli-spec.md §5.9): the core's NewStroke
//! font and default worksheet as one JSON document each.
//!
//! The request file validates against its contract before any work (exit 3,
//! `input-invalid`); the facades live in `prism-artwork`, over
//! `prism-kicad-core`. A facade's resource-limit failure is exit 4; a defect
//! is exit 1.

use crate::args::{Args, Command};
use crate::inputs;
use prism_artwork::{ArtworkError, ArtworkErrorKind};
use prism_bundle::reader::BundleReader;
use prism_bundle::zip::FileSource;
use prism_bundle::{Category, Failure, LimitName, Outcome, schema, temp};
use prism_kicad_contracts::generated::prism_artwork_config_a0::ArtworkConfigA0;
use prism_kicad_contracts::generated::prism_assembly_hlr_a0::AssemblyHlrA0;
use prism_kicad_contracts::generated::prism_bundle_manifest_a3::BundleManifestStageStatus;
use prism_kicad_contracts::generated::prism_drawing_sheet_request_a0::DrawingSheetRequestA0;
use prism_kicad_contracts::generated::prism_occurrences_a0::OccurrencesA0;
use prism_kicad_contracts::generated::prism_placements_a1::PlacementsA1;
use prism_kicad_contracts::generated::prism_stroke_text_request_a0::StrokeTextRequestA0;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static SERIAL: AtomicU64 = AtomicU64::new(0);

/// The `stroke-text --request` schema id.
const STROKE_REQUEST: &str = "prism.stroke_text.request.a0";
/// The `drawing-sheet --request` schema id.
const DRAWING_SHEET_REQUEST: &str = "prism.drawing_sheet.request.a0";
/// The `artwork --config` schema id.
const ARTWORK_CONFIG: &str = "prism.artwork.config.a0";
const OCCURRENCES: &str = "projections/occurrences.json";
const PLACEMENTS: &str = "projections/placements.json";
const ASSEMBLY_HLR: &str = "models/assembly-hlr.json";

/// `artwork`, `stroke-text` or `drawing-sheet` in one dispatch arm.
pub fn any(args: &Args) -> Outcome<(Value, u8)> {
    if args.command == Command::Artwork {
        artwork(args)
    } else {
        run(args)
    }
}

/// `stroke-text` or `drawing-sheet` (cli-spec.md §5.9).
pub fn run(args: &Args) -> Outcome<(Value, u8)> {
    if args.command == crate::args::Command::DrawingSheet {
        drawing_sheet(args)
    } else {
        stroke_text(args)
    }
}

/// `stroke-text --request` or `--metrics`.
pub fn stroke_text(args: &Args) -> Outcome<(Value, u8)> {
    let document = if args.metrics {
        document(prism_artwork::stroke_font_metrics())?
    } else {
        let request: StrokeTextRequestA0 = read_request(args, STROKE_REQUEST)?;
        document(prism_artwork::render_stroke_text(&request).map_err(failure)?)?
    };
    Ok((document, 0))
}

/// `drawing-sheet --request`.
pub fn drawing_sheet(args: &Args) -> Outcome<(Value, u8)> {
    let request: DrawingSheetRequestA0 = read_request(args, DRAWING_SHEET_REQUEST)?;
    let result = prism_artwork::render_drawing_sheet(&request).map_err(failure)?;
    Ok((document(result)?, 0))
}

/// Read, bound, validate and decode `--request`.
fn read_request<T: DeserializeOwned>(args: &Args, schema_id: &str) -> Outcome<T> {
    let path = Path::new(args.option("request").unwrap_or_default());
    let bytes = inputs::read(path, "request", LimitName::MaxMemberBytes, &args.limits)?;
    prism_bundle::reader::json_bounds(&bytes, &args.limits, false, "--request").map_err(
        |mut failure| {
            failure.argument = Some("request");
            failure.finding.location = None;
            failure
        },
    )?;
    let value: Value = serde_json::from_slice(&bytes).map_err(|error| {
        Failure::input("input-invalid", format!("--request is not JSON: {error}"))
            .argument("request")
    })?;
    schema::validate(schema_id, &value).map_err(|violation| {
        Failure::input(
            "input-invalid",
            format!("--request breaks {schema_id}: {}", violation.message),
        )
        .argument("request")
    })?;
    serde_json::from_value(value).map_err(|error| {
        Failure::input(
            "input-invalid",
            format!("--request does not fit its contract: {error}"),
        )
        .argument("request")
    })
}

fn document<T: serde::Serialize>(value: T) -> Outcome<Value> {
    serde_json::to_value(value)
        .map_err(|error| Failure::internal(format!("the result does not serialize: {error}")))
}

fn failure(error: ArtworkError) -> Failure {
    match error.kind {
        ArtworkErrorKind::InvalidInput => {
            Failure::input("input-invalid", error.message).argument("request")
        }
        ArtworkErrorKind::ResourceLimit => {
            Failure::new(Category::ResourceLimit, "limit-exceeded", error.message)
        }
        ArtworkErrorKind::Internal => Failure::internal(error.message),
    }
}

// ------------------------------------------------------------------ artwork

/// `artwork --in … --config … --view … -o …` (cli-spec.md §5.7).
pub fn artwork(args: &Args) -> Outcome<(Value, u8)> {
    let config: ArtworkConfigA0 = read_config(args)?;
    let bundle = Path::new(args.option("in").unwrap_or_default());
    inputs::regular_file(bundle, "in")?;
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
    for view in &args.views {
        if !config.views.iter().any(|candidate| &candidate.name == view) {
            return Err(Failure::usage(
                "view-unknown",
                format!("the configuration has no view {view:?}"),
            )
            .argument("view"));
        }
    }
    let reader = BundleReader::open(source, &args.limits).map_err(|error| error.failure("in"))?;
    check_stages(&reader)?;
    let board = read_board(&reader)?;
    let placements: PlacementsA1 = read_member(&reader, PLACEMENTS)?;
    let hlr: AssemblyHlrA0 = read_member(&reader, ASSEMBLY_HLR)?;
    let occurrences: Option<OccurrencesA0> = read_optional_member(&reader, OCCURRENCES)?;
    let document_path = reader
        .manifest()
        .config
        .board
        .as_ref()
        .map(|board| board.0.clone())
        .ok_or_else(|| Failure::precondition("stage-order", "the bundle records no board file"))?;
    let rendered = prism_artwork::artwork::render(&prism_artwork::artwork::ArtworkInput {
        board: &board,
        document_path: &document_path,
        config: &config,
        hlr: &hlr,
        placements: &placements,
        occurrences: occurrences.as_ref(),
        variant: args.option("variant"),
        views: &args.views,
        paper_scale: args.paper_scale,
    })
    .map_err(artwork_failure)?;
    let output = PathBuf::from(args.option("output").unwrap_or_default());
    let mut views = Vec::with_capacity(rendered.len());
    for view in &rendered {
        if Path::new(&view.name).components().count() != 1 {
            return Err(Failure::input(
                "input-invalid",
                format!("the view name {:?} is not a file name", view.name),
            )
            .argument("view"));
        }
        let file = format!("{}.svg", view.name);
        write_file(&output, &file, view.svg.as_bytes())?;
        views.push(json!({
            "name": view.name,
            "file": file,
            "sha256": prism_bundle::generator::sha256_hex(view.svg.as_bytes()),
            "footprints_drawn": view.footprints_drawn,
            "designators_placed": view.designators_placed,
            "dnp_footprints_hatched": view.dnp_footprints_hatched,
            "footprints_without_outline": view.footprints_without_outline,
        }));
    }
    let mut result = json!({
        "schema": "prism.cli.artwork_result.a0",
        "views": views,
    });
    if let Some(paper_scale) = args.paper_scale {
        result["paper_scale"] = json!(paper_scale);
    }
    Ok((result, 0))
}

fn artwork_failure(error: prism_artwork::artwork::ArtworkViewError) -> Failure {
    match error {
        prism_artwork::artwork::ArtworkViewError::UnknownView(name) => Failure::usage(
            "view-unknown",
            format!("the configuration has no view {name:?}"),
        )
        .argument("view"),
        prism_artwork::artwork::ArtworkViewError::InvalidInput(message) => {
            Failure::input("input-invalid", message).argument("in")
        }
        prism_artwork::artwork::ArtworkViewError::Internal(message) => Failure::internal(message),
    }
}

/// Read, bound, validate and decode `--config`.
fn read_config(args: &Args) -> Outcome<ArtworkConfigA0> {
    let path = Path::new(args.option("config").unwrap_or_default());
    let bytes = inputs::read(path, "config", LimitName::MaxMemberBytes, &args.limits)?;
    prism_bundle::reader::json_bounds(&bytes, &args.limits, false, "--config").map_err(
        |mut failure| {
            failure.argument = Some("config");
            failure.finding.location = None;
            failure
        },
    )?;
    let value: Value = serde_json::from_slice(&bytes).map_err(|error| {
        Failure::input("input-invalid", format!("--config is not JSON: {error}")).argument("config")
    })?;
    schema::validate(ARTWORK_CONFIG, &value).map_err(|violation| {
        Failure::input(
            "input-invalid",
            format!("--config breaks {ARTWORK_CONFIG}: {}", violation.message),
        )
        .argument("config")
    })?;
    serde_json::from_value(value).map_err(|error| {
        Failure::input(
            "input-invalid",
            format!("--config does not fit its contract: {error}"),
        )
        .argument("config")
    })
}

/// Stage parse, board and models must be present (cli-spec.md §5.7).
fn check_stages(reader: &BundleReader<FileSource>) -> Outcome<()> {
    let stages = &reader.manifest().stages;
    let present = |status: BundleManifestStageStatus| {
        matches!(
            status,
            BundleManifestStageStatus::Complete | BundleManifestStageStatus::Partial
        )
    };
    if !present(stages.parse.status) {
        return Err(stage_order("stage parse is not complete"));
    }
    if !present(stages.board.status) {
        return Err(stage_order("stage board is not complete"));
    }
    if stages.board.fill_provenance.is_none() {
        return Err(stage_order("stage board recorded no fill provenance"));
    }
    if !matches!(stages.models.status, BundleManifestStageStatus::Complete) {
        return Err(stage_order("stage models is not complete"));
    }
    Ok(())
}

fn stage_order(message: &str) -> Failure {
    Failure::precondition("stage-order", message)
}

/// The board text: `refilled/<stem>.kicad_pcb` when present, else `sources/`.
fn read_board(reader: &BundleReader<FileSource>) -> Outcome<String> {
    let board = reader
        .manifest()
        .config
        .board
        .as_ref()
        .map(|board| board.0.clone())
        .ok_or_else(|| stage_order("the bundle records no board file"))?;
    let name = Path::new(&board)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| stage_order("the bundle's board path is not a file name"))?;
    let refilled = format!("refilled/{name}");
    let bytes = match member_bytes(reader, &refilled)? {
        Some(bytes) => bytes,
        None => member_bytes(reader, &format!("sources/{board}"))?.ok_or_else(|| {
            stage_order("the bundle has neither a refilled board nor a source board")
        })?,
    };
    String::from_utf8(bytes).map_err(|error| {
        Failure::precondition(
            "bundle-invalid",
            format!("the board file is not UTF-8: {error}"),
        )
        .argument("in")
    })
}

fn member_bytes(reader: &BundleReader<FileSource>, path: &str) -> Outcome<Option<Vec<u8>>> {
    match reader.member(path) {
        None => Ok(None),
        Some(Ok(bytes)) => Ok(Some(bytes)),
        Some(Err(finding)) => {
            let mut failure = Failure::precondition("bundle-invalid", finding.message.clone());
            failure.finding.location = finding.location;
            Err(failure)
        }
    }
}

fn read_member<T: DeserializeOwned>(reader: &BundleReader<FileSource>, path: &str) -> Outcome<T> {
    let bytes = member_bytes(reader, path)?.ok_or_else(|| {
        Failure::precondition("member-not-found", format!("the bundle has no {path}"))
    })?;
    serde_json::from_slice(&bytes).map_err(|error| {
        Failure::precondition("bundle-invalid", format!("{path} does not decode: {error}"))
    })
}

fn read_optional_member<T: DeserializeOwned>(
    reader: &BundleReader<FileSource>,
    path: &str,
) -> Outcome<Option<T>> {
    let Some(bytes) = member_bytes(reader, path)? else {
        return Ok(None);
    };
    serde_json::from_slice(&bytes).map(Some).map_err(|error| {
        Failure::precondition("bundle-invalid", format!("{path} does not decode: {error}"))
    })
}

/// Write one file into `directory` through a hidden temp file and a rename.
fn write_file(directory: &Path, name: &str, bytes: &[u8]) -> Outcome<()> {
    std::fs::create_dir_all(directory).map_err(|error| {
        Failure::output(
            "output-write-failed",
            format!("-o could not be created: {error}"),
        )
        .argument("output")
    })?;
    let serial = SERIAL.fetch_add(1, Ordering::Relaxed);
    let temp = directory.join(format!(
        ".{name}.prism-kicad-{}-{serial}.tmp",
        std::process::id()
    ));
    temp::register(temp.clone());
    let result = (|| {
        let mut output = std::fs::File::create(&temp)?;
        output.write_all(bytes)?;
        output.sync_all()?;
        std::fs::rename(&temp, directory.join(name))
    })();
    if let Err(error) = result {
        let _ = std::fs::remove_file(&temp);
        temp::unregister(&temp);
        return Err(Failure::output(
            "output-write-failed",
            format!("{name} could not be written: {error}"),
        )
        .argument("output"));
    }
    temp::unregister(&temp);
    if let Ok(directory) = std::fs::File::open(directory) {
        let _ = directory.sync_all();
    }
    Ok(())
}
