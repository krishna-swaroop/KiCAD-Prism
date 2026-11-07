//! `compare` (cli-spec.md §5.6, ADR amendment C2r §3): every Design
//! Comparison tab except fabrication, as `DesignCompareResultA1`.
//!
//! Each side is a bundle (`--base`, `--head`) or, when its commit has no
//! bundle yet, a source tree (`--base-src`, `--head-src`). A source tree runs
//! the parse stage's own code with only the five producers `compare` reads,
//! in memory (no archive, no deflate, no verify), so both kinds of side give
//! the same member bytes and the same result.
//!
//! Checks run in the spec's order: a bundle's reader and manifest checks
//! (exit 3, `bundle-invalid`); the same generator id in canonical form (exit
//! 7, `generator-mismatch`); project files in one directory (exit 7,
//! `anchor-mismatch`); every member present (exit 7, `member-not-found`).
//! `-o` is written atomically and streamed; stdout carries the
//! `CliCompareResultA1`, validated, after the rename.

use crate::args::Args;
use crate::inputs;
use crate::output::{Diagnostic, Severity, Stderr};
use crate::version;
use prism_bundle::finding::Finding;
use prism_bundle::limits::compare::result::{self, Options, Output, Revision, RevisionIdentity};
use prism_bundle::limits::compare::{CompareError, anchor_directory, entries};
use prism_bundle::manifest::{Manifest, Status};
use prism_bundle::reader::BundleReader;
use prism_bundle::stages::Document;
use prism_bundle::stages::parse::{ParseOutcome, ParseRequest};
use prism_bundle::zip::FileSource;
use prism_bundle::{Failure, Outcome, generator, schema, temp};
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;

const BOARD_OBJECTS: &str = "projections/board-objects.json";
const SEMANTIC_INDEX: &str = "projections/semantic-index.json";
const OCCURRENCES: &str = "projections/occurrences.json";
const STACKUP: &str = "projections/stackup.json";
const ROUTE_METRICS: &str = "projections/route-metrics.json";
/// The members `compare` reads, the only producers a source tree runs.
const MEMBERS: [&str; 5] = [
    BOARD_OBJECTS,
    SEMANTIC_INDEX,
    OCCURRENCES,
    STACKUP,
    ROUTE_METRICS,
];
/// The stdout document's schema id.
const RESULT_SCHEMA: &str = "prism.cli.compare_result.a1";
/// The project's committed settings, which hold the BOM columns.
const PRISM_SETTINGS: &str = ".prism.json";

/// One member as a side holds it: a bundle's bytes, or the document a source
/// tree's in-memory parse produced (no JSON text in between).
enum Member {
    Bytes(Arc<[u8]>),
    Document(Document),
}

/// One side, whichever kind: its members and what the result says about it.
struct Side {
    name: &'static str,
    generator: Vec<u8>,
    identity: RevisionIdentity,
    members: BTreeMap<&'static str, Member>,
    prism_settings: Option<Arc<[u8]>>,
    sources: Vec<String>,
}

/// Run `compare`; the process exit code.
pub fn run(args: &Args, stderr: &Stderr) -> Outcome<u8> {
    let base = open(args, "base", stderr)?;
    let head = open(args, "head", stderr)?;
    if base.generator != head.generator {
        return Err(Failure::precondition(
            "generator-mismatch",
            "--base and --head were written by different generator ids",
        ));
    }
    // Object keys and `documentPath` are relative to the anchor's directory
    // (C2 D1): two project files in one directory share a key space.
    if anchor_directory(&base.identity.project_file)
        != anchor_directory(&head.identity.project_file)
    {
        return Err(Failure::precondition(
            "anchor-mismatch",
            "--base and --head are of project files in different directories",
        ));
    }
    let options = Options {
        include_unchanged: args.include_unchanged,
    };
    let (base_key, head_key) = (base.identity.clone(), head.identity.clone());
    let output = result::build(revision(base)?, revision(head)?, options).map_err(engine)?;
    write_json(
        Path::new(args.option("output").unwrap_or_default()),
        &output.result,
    )?;
    emit_result(&output, &base_key, &head_key, stderr)
}

fn engine(error: CompareError) -> Failure {
    Failure::internal(format!("the compare engine failed: {}", error.message))
}

fn open(args: &Args, side: &'static str, stderr: &Stderr) -> Outcome<Side> {
    match args.option(side) {
        Some(path) => open_bundle(Path::new(path), args, side),
        None => open_source(args, side, stderr),
    }
}

// ------------------------------------------------------------------ bundles

/// A bundle side. Its identity is `--<side>-revision-key`, not the archive's
/// `revision_key`: through an alias, one bundle serves several revision keys
/// (ADR amendment K2 §3.6).
fn open_bundle(path: &Path, args: &Args, side: &'static str) -> Outcome<Side> {
    let limits = &args.limits;
    inputs::regular_file(path, side)?;
    let unreadable = |error: std::io::Error| {
        Failure::input(
            "input-not-found",
            format!("--{side} could not be read: {error}"),
        )
        .argument(side)
    };
    let file = std::fs::File::open(path).map_err(unreadable)?;
    let source = FileSource::new(file).map_err(unreadable)?;
    let reader = BundleReader::open(source, limits).map_err(|error| error.failure(side))?;
    let mut members = BTreeMap::new();
    for member in MEMBERS {
        match reader.member(member) {
            None => {}
            Some(Ok(bytes)) => {
                members.insert(member, Member::Bytes(Arc::from(bytes)));
            }
            Some(Err(finding)) => return Err(member_invalid(finding, side)),
        }
    }
    let manifest = reader.manifest();
    require_members(
        manifest,
        &members,
        |path| reader.index().entry(path).is_some(),
        side,
    )?;
    let generator = reader
        .manifest_read()
        .value
        .get("generator")
        .map(generator::canonical)
        .unwrap_or_default();
    let project_file = manifest.config.project_file.as_str().to_owned();
    let settings_path = format!("sources/{}", settings_path(&project_file));
    let prism_settings = match reader.member(&settings_path) {
        Some(Ok(bytes)) => Some(Arc::from(bytes)),
        Some(Err(finding)) => return Err(member_invalid(finding, side)),
        None => None,
    };
    let revision_key = args
        .option(&format!("{side}-revision-key"))
        .unwrap_or_default()
        .to_owned();
    let bundle_key = manifest
        .bundle_key
        .as_ref()
        .map(|key| key.0.clone())
        .or_else(|| {
            manifest
                .revision_key
                .as_ref()
                .map(|key| generator::bundle_key(key.as_str(), &generator))
        });
    Ok(Side {
        name: side,
        generator,
        identity: RevisionIdentity {
            revision_key,
            bundle_key,
            project_file,
        },
        members,
        prism_settings,
        sources: source_paths(manifest),
    })
}

fn member_invalid(finding: Finding, side: &'static str) -> Failure {
    let mut failure = Failure::input(
        "bundle-invalid",
        format!("the bundle is invalid: {}", finding.message),
    )
    .argument(side);
    failure.finding.location = finding.location;
    failure
}

/// Every member is listed and present, and stage `parse` holds it: `complete`,
/// or `partial` without it among `failed_members` (exit 7, `member-not-found`).
fn require_members(
    manifest: &Manifest,
    members: &BTreeMap<&'static str, Member>,
    listed: impl Fn(&str) -> bool,
    side: &'static str,
) -> Outcome<()> {
    let parse = &manifest.stages.parse;
    for member in MEMBERS {
        let failed = parse
            .failed_members
            .iter()
            .any(|failed| failed.path.as_str() == member);
        let ready = match parse.status {
            Status::Complete => true,
            Status::Partial => !failed,
            _ => false,
        };
        if !(ready && listed(member) && members.contains_key(member)) {
            return Err(Failure::precondition(
                "member-not-found",
                format!("--{side} has no {member}"),
            )
            .argument(side));
        }
    }
    Ok(())
}

// ------------------------------------------------------------- source trees

fn open_source(args: &Args, side: &'static str, stderr: &Stderr) -> Outcome<Side> {
    let option = |suffix: &str| args.option(&format!("{side}{suffix}"));
    let project = option("-src").unwrap_or_default();
    let config = option("-config")
        .map(|path| inputs::config(Path::new(path), &args.limits))
        .transpose()?;
    let revision_key = option("-revision-key").unwrap_or_default().to_owned();
    let generator = version::generator()?;
    let request = ParseRequest {
        project: Path::new(project),
        source_root: option("-source-root").map(Path::new),
        config,
        revision_key: Some(revision_key.clone()),
        key_record: None,
        upgraded: if side == "base" {
            args.base_upgraded.clone()
        } else {
            args.head_upgraded.clone()
        },
        generator: &generator,
        limits: &args.limits,
        reporter: stderr,
        projections: Some(&MEMBERS),
        in_memory: true,
    };
    let built = match prism_bundle::stages::parse::run(&request)? {
        ParseOutcome::Built(built) => built,
        ParseOutcome::ProjectAbsent(project_file) => {
            return Err(Failure::precondition(
                "member-not-found",
                format!("--{side}-src: the project {project_file} is absent from the source tree"),
            )
            .argument(side_source(side)));
        }
    };
    let mut by_path: BTreeMap<String, Arc<[u8]>> = built
        .members
        .into_iter()
        .filter_map(|member| member.bytes().cloned().map(|bytes| (member.path, bytes)))
        .collect();
    let mut documents = built.documents;
    let members: BTreeMap<&'static str, Member> = MEMBERS
        .iter()
        .filter_map(|member| {
            documents
                .remove(*member)
                .map(|document| (*member, Member::Document(document)))
        })
        .collect();
    let manifest = &built.manifest;
    require_members(manifest, &members, |path| members.contains_key(path), side)?;
    let project_file = manifest.config.project_file.as_str().to_owned();
    let prism_settings = by_path.remove(&format!("sources/{}", settings_path(&project_file)));
    let generator_bytes = serde_json::to_value(&manifest.generator)
        .map(|value| generator::canonical(&value))
        .map_err(|error| {
            Failure::internal(format!("the generator id does not serialize: {error}"))
        })?;
    Ok(Side {
        name: side,
        generator: generator_bytes,
        identity: RevisionIdentity {
            revision_key,
            bundle_key: None,
            project_file,
        },
        members,
        prism_settings,
        sources: source_paths(manifest),
    })
}

fn side_source(side: &'static str) -> &'static str {
    if side == "base" {
        "base-src"
    } else {
        "head-src"
    }
}

// -------------------------------------------------------------- both kinds

/// `.prism.json` beside the project file, as a repository path.
fn settings_path(project_file: &str) -> String {
    match anchor_directory(project_file) {
        "" => PRISM_SETTINGS.to_owned(),
        dir => format!("{dir}/{PRISM_SETTINGS}"),
    }
}

/// The repository paths of the manifest's `sources/` members, in code point
/// order.
fn source_paths(manifest: &Manifest) -> Vec<String> {
    let mut paths: Vec<String> = manifest
        .members
        .iter()
        .filter_map(|member| {
            member
                .path
                .as_str()
                .strip_prefix("sources/")
                .map(str::to_owned)
        })
        .collect();
    paths.sort();
    paths
}

/// The side's typed inputs; each member is dropped as soon as it is typed
/// (the board objects once rebuilt as entries).
fn revision(mut side: Side) -> Outcome<Revision> {
    let name = side.name;
    let mut take = |member: &'static str| {
        side.members.remove(member).ok_or_else(|| {
            Failure::internal(format!("{member} went missing after the member checks"))
        })
    };
    // An in-memory side's board objects are typed; they become a JSON tree only
    // here, one side at a time, for as long as the entries take to build.
    let board_objects: Value = typed(take(BOARD_OBJECTS)?, BOARD_OBJECTS, name)?;
    let objects = entries(
        &board_objects,
        anchor_directory(&side.identity.project_file),
    )
    .map_err(engine)?;
    drop(board_objects);
    let semantic_index = match take(SEMANTIC_INDEX)? {
        Member::Document(Document::SemanticIndex(index)) => *index,
        member => typed(member, SEMANTIC_INDEX, name)?,
    };
    let occurrences = typed(take(OCCURRENCES)?, OCCURRENCES, name)?;
    let stackup = typed(take(STACKUP)?, STACKUP, name)?;
    let route_metrics = typed(take(ROUTE_METRICS)?, ROUTE_METRICS, name)?;
    let prism_settings = side
        .prism_settings
        .as_deref()
        .and_then(|bytes| serde_json::from_slice(bytes).ok());
    Ok(Revision {
        identity: side.identity,
        sources: side.sources,
        prism_settings,
        objects,
        semantic_index,
        occurrences,
        stackup,
        route_metrics,
    })
}

/// A member as its contract's type: parsed from a bundle's bytes, or taken
/// from an in-memory document. A document reads exactly as its serialized
/// bytes would, since `json_bytes` is serde_json's own writer.
fn typed<T: DeserializeOwned>(member: Member, path: &str, side: &'static str) -> Outcome<T> {
    let result = match member {
        Member::Bytes(bytes) => serde_json::from_slice(&bytes),
        Member::Document(Document::Json(value)) => serde_json::from_value(value),
        Member::Document(Document::SemanticIndex(index)) => {
            serde_json::to_value(index).and_then(serde_json::from_value)
        }
        Member::Document(Document::BoardObjects(objects)) => {
            serde_json::to_value(objects).and_then(serde_json::from_value)
        }
    };
    result.map_err(|error| {
        Failure::input(
            "bundle-invalid",
            format!("{path} does not fit its contract: {error}"),
        )
        .argument(side)
    })
}

fn validate(schema_id: &str, document: &Value) -> Outcome<()> {
    schema::validate(schema_id, document).map_err(|violation| {
        Failure::internal(format!(
            "the {schema_id} document breaks its schema: {}",
            violation.message
        ))
    })
}

fn output_failed(message: impl Into<String>) -> Failure {
    Failure::output("output-write-failed", message).argument("output")
}

/// Write `document` to `-o` atomically: a hidden exclusive temp file in the
/// same directory, fsynced, then renamed (cli-spec.md §5.2.5, without the
/// self-verify). The document is streamed, compact, with one trailing LF.
fn write_json(path: &Path, document: &impl serde::Serialize) -> Outcome<()> {
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| output_failed("-o does not name a file"))?;
    let dir = match path.parent() {
        Some(dir) if !dir.as_os_str().is_empty() => dir.to_path_buf(),
        _ => PathBuf::from("."),
    };
    if !dir.is_dir() {
        return Err(output_failed("-o's directory does not exist"));
    }
    let temp = dir.join(format!(".{name}.prism-kicad-{}.tmp", std::process::id()));
    let file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(|error| output_failed(format!("the temp file could not be created: {error}")))?;
    temp::register(temp.clone());
    let mut writer = BufWriter::new(file);
    let written = serde_json::to_writer(&mut writer, document)
        .map_err(std::io::Error::other)
        .and_then(|()| writer.write_all(b"\n"))
        .and_then(|()| writer.into_inner().map_err(|error| error.into_error()))
        .and_then(|file| file.sync_all());
    if let Err(error) = written {
        cleanup(&temp);
        return Err(output_failed(format!(
            "the result could not be written: {error}"
        )));
    }
    if let Err(error) = std::fs::rename(&temp, path) {
        cleanup(&temp);
        return Err(output_failed(format!(
            "the result could not be renamed into place: {error}"
        )));
    }
    temp::unregister(&temp);
    if let Ok(directory) = std::fs::File::open(&dir) {
        let _ = directory.sync_all();
    }
    Ok(())
}

fn cleanup(temp: &Path) {
    let _ = std::fs::remove_file(temp);
    temp::unregister(temp);
}

fn emit_result(
    output: &Output,
    base: &RevisionIdentity,
    head: &RevisionIdentity,
    stderr: &Stderr,
) -> Outcome<u8> {
    let side = |identity: &RevisionIdentity, objects: usize| {
        let mut value = json!({"revision_key": identity.revision_key, "objects": objects});
        if let Some(key) = &identity.bundle_key {
            value["bundle_key"] = Value::from(key.clone());
        }
        value
    };
    let result = json!({
        "schema": RESULT_SCHEMA,
        "base": side(base, output.objects.0),
        "head": side(head, output.objects.1),
        "counts": &output.result.counts,
    });
    validate(RESULT_SCHEMA, &result)?;
    if crate::output::stdout(&result) {
        Ok(0)
    } else {
        stderr.emit(&Diagnostic {
            severity: Severity::Error,
            code: "stdout-write-failed",
            message: "stdout could not be written",
            stage: None,
            argument: None,
            location: None,
            limit: None,
        });
        Ok(6)
    }
}
