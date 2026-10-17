//! Stage `board` (cli-spec.md §5.2.3): check the backend's refilled board (or
//! use the saved fills when the config says so), materialize it, compare the
//! fills and cross-check the binding table against `design.json`.

use super::chain::{self, Input};
use super::crosscheck::{CrossCheckReport, DesignView, cross_check, manifest_report};
use super::materialize::{DEFAULT_TILE_SIZE_NM, compare_fills, materialize_complete};
use super::sexpr_check::{self, BOARD_FORMAT, CheckError};
use super::{Built, Generator, MemberData, Reporter, internal};
use crate::finding::{Failure, Finding, Outcome};
use crate::limits::{LimitName, Limits};
use crate::manifest::{
    DESIGN_PATH, MATERIALIZATION_PATH, MATERIALIZATION_SCHEMA, REFILLED_PREFIX, Role,
    SOURCES_PREFIX, Stage, Status, a3, member_failure, models_stage, sort_warnings, warning,
};
use crate::paths::file_name;
use crate::revision_key::EffectiveConfig;
use prism_kicad_core::{PcbLimits, PcbView};
use std::collections::BTreeMap;

/// The backend's refilled board (`--refilled-board`, `--refill-tool`).
pub struct Refilled {
    /// Its bytes.
    pub bytes: Vec<u8>,
    /// `--refill-tool`.
    pub tool: String,
}

/// The inputs of stage board.
pub struct BoardRequest<'a> {
    /// The loaded `--in` bundle.
    pub input: &'a Input,
    /// The refilled board, in refill mode.
    pub refilled: Option<Refilled>,
    /// `--revision-key`, an assertion.
    pub revision_key: Option<&'a str>,
    /// `--config`, an assertion.
    pub config: Option<&'a EffectiveConfig>,
    /// This binary's generator.
    pub generator: &'a Generator,
    /// Limits.
    pub limits: &'a Limits,
    /// Diagnostics.
    pub reporter: &'a dyn Reporter,
}

fn footprint_ids(text: &str) -> Result<BTreeMap<Option<String>, usize>, String> {
    let view = PcbView::parse(text, PcbLimits::default()).map_err(|error| error.to_string())?;
    let mut ids = BTreeMap::new();
    for footprint in view.footprints() {
        let footprint = footprint.map_err(|error| error.to_string())?;
        *ids.entry(footprint.uuid).or_insert(0) += 1;
    }
    Ok(ids)
}

fn check_mode(request: &BoardRequest<'_>) -> Outcome<()> {
    let saved = request.input.manifest.config.zone_fills.is_some();
    match (&request.refilled, saved) {
        (Some(_), true) => Err(Failure::precondition(
            "zone-fills-mismatch",
            "the bundle's configuration uses the saved zone fills; --refilled-board is refused",
        )
        .argument("refilled-board")),
        (None, false) => Err(Failure::precondition(
            "zone-fills-mismatch",
            "the bundle's configuration refills zones; --refilled-board and --refill-tool are required",
        )
        .argument("refilled-board")),
        (Some(refilled), false) if !super::same_kicad_release(&refilled.tool, &request.generator.document.kicad_version.0) => {
            Err(Failure::precondition(
                "kicad-version-mismatch",
                format!(
                    "--refill-tool {} is not the major.minor of the generator's KiCad {}",
                    refilled.tool, request.generator.document.kicad_version.0
                ),
            )
            .argument("refill-tool"))
        }
        _ => Ok(()),
    }
}

fn refilled_text(
    refilled: &Refilled,
    member: &str,
    source_board: &str,
    limits: &Limits,
) -> Outcome<String> {
    let invalid = |finding: Finding| {
        let mut failure = Failure::input(
            "refilled-board-invalid",
            format!(
                "the refilled board is not a parsable board: {}",
                finding.message
            ),
        )
        .argument("refilled-board");
        failure.finding.location = finding.location;
        failure
    };
    match sexpr_check::check(member, &refilled.bytes, BOARD_FORMAT, limits) {
        Ok(_) => {}
        Err(CheckError::Content(finding)) => return Err(invalid(finding)),
        Err(CheckError::Limit(failure)) => return Err(failure.argument("refilled-board")),
    }
    let text = String::from_utf8(refilled.bytes.clone()).map_err(internal)?;
    let refilled_ids = footprint_ids(&text).map_err(|message| {
        invalid(Finding::new("refilled-board-invalid", message).at_path(member))
    })?;
    let source_ids = footprint_ids(source_board).map_err(internal)?;
    if refilled_ids != source_ids {
        return Err(Failure::precondition(
            "refilled-board-mismatch",
            "the refilled board's footprint UUIDs differ from the source board's",
        )
        .argument("refilled-board"));
    }
    Ok(text)
}

struct Work {
    warnings: Vec<a3::Warning>,
    failed: Vec<a3::BundleManifestMemberFailure>,
    members: Vec<MemberData>,
    fill_check: Option<a3::BundleManifestFillCheck>,
    cross_check: Option<a3::BundleManifestCrossCheck>,
}

impl Work {
    fn warn(&mut self, reporter: &dyn Reporter, code: &str, message: String) -> Outcome<()> {
        reporter.warning(&Finding::new(code, message.clone()));
        self.warnings
            .push(warning(code, message).map_err(internal)?);
        Ok(())
    }
}

fn text_of<'a>(input: &'a Input, path: &str) -> Outcome<&'a str> {
    let bytes = input
        .member(&format!("{SOURCES_PREFIX}{path}"))
        .ok_or_else(|| internal(format!("sources/{path} is not in the input bundle")))?;
    std::str::from_utf8(bytes).map_err(internal)
}

fn fill_check(
    work: &mut Work,
    reporter: &dyn Reporter,
    saved: &str,
    refilled: &str,
    project: &str,
    max_operations: u32,
) -> Result<Outcome<()>, String> {
    let fills = compare_fills(saved, refilled, project, max_operations)?;
    let stale = !fills.matches();
    let wide = |value: usize| a3::Count(u64::try_from(value).unwrap_or(u64::MAX));
    work.fill_check = Some(a3::BundleManifestFillCheck {
        saved_operations: wide(fills.saved_operations),
        refilled_operations: wide(fills.refilled_operations),
        differing_operations: wide(fills.differing_operations),
        stale,
    });
    if stale {
        return Ok(work.warn(
            reporter,
            "stale-saved-fills",
            format!(
                "saved zone fills are stale: {} zone-fill operations differ between the saved \
                 fills ({} operations) and a fresh refill ({} operations); the refilled board \
                 was materialized",
                fills.differing_operations, fills.saved_operations, fills.refilled_operations
            ),
        ));
    }
    Ok(Ok(()))
}

fn report_cross_check(reporter: &dyn Reporter, report: &CrossCheckReport) {
    for finding in report.warnings.iter().chain(&report.errors) {
        reporter.warning(&Finding::new(&finding.code, finding.message.clone()));
    }
}

/// Run stage board.
pub fn run(request: &BoardRequest<'_>) -> Outcome<Built> {
    let input = request.input;
    chain::check(
        input,
        Stage::Board,
        request.generator,
        request.revision_key,
        request.config,
    )?;
    check_mode(request)?;
    let config = &input.manifest.config;
    let board_path = config
        .board
        .as_ref()
        .ok_or_else(|| internal("stage board runs without a board"))?
        .0
        .clone();
    let source_board = text_of(input, &board_path)?;
    let project = text_of(input, &config.project_file.0)?;
    let refilled_member = format!("{REFILLED_PREFIX}{}", file_name(&board_path));
    let refilled = match &request.refilled {
        Some(refilled) => Some(refilled_text(
            refilled,
            &refilled_member,
            source_board,
            request.limits,
        )?),
        None => None,
    };
    let mut work = Work {
        warnings: Vec::new(),
        failed: Vec::new(),
        members: chain::earlier_members(input, Stage::Board),
        fill_check: None,
        cross_check: None,
    };
    if let Some(refilled) = &request.refilled {
        work.members.push(MemberData {
            path: refilled_member.clone(),
            role: Role::RefilledBoard,
            bytes: std::sync::Arc::from(refilled.bytes.clone()),
            schema: None,
            source: None,
        });
    } else {
        work.warn(
            request.reporter,
            "saved-fills-used",
            "the project uses its saved zone fills: they were not refilled and may be stale"
                .to_owned(),
        )?;
    }
    let board = refilled.as_deref().unwrap_or(source_board);
    materialize(
        request,
        &mut work,
        board,
        source_board,
        project,
        refilled.is_some(),
    )?;
    finish(request, work, &refilled_member)
}

fn materialize(
    request: &BoardRequest<'_>,
    work: &mut Work,
    board: &str,
    saved: &str,
    project: &str,
    refilled: bool,
) -> Outcome<()> {
    let implicit = super::stackup::with_default_stackup(board);
    if implicit.is_some() {
        work.warn(
            request.reporter,
            "kicad-default-stackup",
            format!(
                "The board states no stackup; KiCad's default was used ({} um copper, {} um mask). Set the stackup in Board Setup to record your own.",
                super::stackup::COPPER_MM * 1000.0,
                super::stackup::MASK_MM * 1000.0,
            ),
        )?;
    }
    let max_operations = u32::try_from(request.limits.get(LimitName::MaxMaterializationOperations))
        .unwrap_or(u32::MAX);
    let outcome = materialize_complete(
        implicit.as_deref().unwrap_or(board),
        project,
        DEFAULT_TILE_SIZE_NM,
        max_operations,
    )
    .and_then(|materialized| {
        if refilled {
            fill_check(
                work,
                request.reporter,
                saved,
                board,
                project,
                max_operations,
            )?
            .map_err(|failure| failure.finding.message)?;
        }
        Ok(materialized)
    });
    let materialized = match outcome {
        Ok(materialized) => materialized,
        Err(message) if message.starts_with(super::materialize::OPERATION_LIMIT) => {
            return Err(request
                .limits
                .exceeded(
                    LimitName::MaxMaterializationOperations,
                    None,
                    "the materialization",
                )
                .at_path(MATERIALIZATION_PATH));
        }
        Err(message) => {
            let message = format!("the board could not be materialized: {message}");
            request.reporter.error(
                &Finding::new("materialization-failed", message.clone())
                    .at_path(MATERIALIZATION_PATH),
            );
            work.failed.push(
                member_failure(MATERIALIZATION_PATH, "materialization-failed", message)
                    .map_err(internal)?,
            );
            work.fill_check = None;
            return Ok(());
        }
    };
    let report = match request.input.member(DESIGN_PATH) {
        Some(bytes) => {
            let view: DesignView = serde_json::from_slice(bytes).map_err(internal)?;
            cross_check(&materialized.header, &view).report
        }
        None => CrossCheckReport::skipped(),
    };
    report_cross_check(request.reporter, &report);
    work.cross_check = Some(manifest_report(&report).map_err(internal)?);
    request.limits.check(
        LimitName::MaxMemberBytes,
        u64::try_from(materialized.pack.len()).unwrap_or(u64::MAX),
        MATERIALIZATION_PATH,
    )?;
    work.members.push(MemberData {
        path: MATERIALIZATION_PATH.to_owned(),
        role: Role::Materialization,
        bytes: std::sync::Arc::from(materialized.pack),
        schema: Some(MATERIALIZATION_SCHEMA.to_owned()),
        source: None,
    });
    Ok(())
}

fn finish(request: &BoardRequest<'_>, mut work: Work, refilled_member: &str) -> Outcome<Built> {
    use a3::BundleManifestFillProvenance::{Refilled, Saved};
    sort_warnings(&mut work.warnings);
    let partial = !work.failed.is_empty();
    let mut manifest = request.input.manifest.clone();
    manifest.stages.board = a3::BundleManifestBoardStage {
        status: if partial {
            Status::Partial
        } else {
            Status::Complete
        },
        skip_reason: None,
        error: None,
        fill_provenance: Some(if request.refilled.is_some() {
            Refilled
        } else {
            Saved
        }),
        fill_check: work.fill_check,
        cross_check: work.cross_check,
        warnings: work.warnings,
        failed_members: work.failed,
    };
    manifest.stages.models = if partial {
        models_stage(
            Status::Skipped,
            Some(a3::BundleManifestSkipReason::EarlierStageFailed),
        )
    } else {
        chain::pending_models()
    };
    let mut written = Vec::new();
    if request.refilled.is_some() {
        written.push(refilled_member.to_owned());
    }
    if !partial {
        written.push(MATERIALIZATION_PATH.to_owned());
    }
    Ok(Built::assemble(
        Stage::Board,
        manifest,
        work.members,
        written,
    ))
}
