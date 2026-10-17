//! `bundle verify`: every reader check of bundle-format.md §9 on every
//! member, plus the manifest invariants I1–I12 of §3.4 (cli-spec.md §5.3).

use crate::finding::Finding;
use crate::generator::{bundle_key, canonical};
use crate::limits::{LimitName, Limits};
use crate::manifest::{
    DESIGN_PATH, MANIFEST_PATH, MANIFEST_SCHEMA, MATERIALIZATION_PATH, MODELS_PATH, Manifest,
    PROJECTIONS, REFILLED_PREFIX, Role, SOURCES_PREFIX, Stage, Status, a3, is_source_role,
    role_for_source, role_stage,
};
use crate::reader::{OpenError, check_listing, check_structured, read_checked, read_manifest};
use crate::zip::{ReadAt, ZipIndex};

/// What to check.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Depth {
    /// Every check (`bundle verify`).
    Full,
    /// Checks 1–3 and 5: no member schema validation (the self-verify of
    /// cli-spec.md §5.2.5).
    SelfVerify,
}

/// The outcome of a verification.
#[derive(Clone, Debug)]
pub struct Report {
    /// The `schema` `bundle.json` declares, when it could be read.
    pub manifest_schema: Option<String>,
    /// The manifest, when it is a valid a3 document.
    pub manifest: Option<Manifest>,
    /// Whether its generator equals `generator_bytes`.
    pub generator_matches: Option<bool>,
    /// Members whose size and digest were checked.
    pub members_checked: u64,
    /// Every failed check, sorted, truncated at `max-findings`.
    pub findings: Vec<Finding>,
}

impl Report {
    /// Whether every check passed.
    #[must_use]
    pub fn valid(&self) -> bool {
        self.findings.is_empty()
    }
}

/// Verify the archive in `source` against this binary's `generator_bytes`.
pub fn verify<R: ReadAt + ?Sized>(
    source: &R,
    limits: &Limits,
    generator_bytes: &[u8],
    depth: Depth,
) -> Report {
    let mut report = Report {
        manifest_schema: None,
        manifest: None,
        generator_matches: None,
        members_checked: 0,
        findings: Vec::new(),
    };
    let index = match ZipIndex::open(source, limits) {
        Ok(index) => index,
        Err(error) => {
            report.findings.push(error.finding());
            return finish(report, limits);
        }
    };
    let read = match read_manifest(source, &index, limits) {
        Ok(read) => read,
        Err(error) => {
            if let OpenError::Unsupported(_) = &error {
                report.manifest_schema = declared_schema(source, &index);
            }
            report.findings.extend(error.findings());
            return finish(report, limits);
        }
    };
    report.manifest_schema = Some(MANIFEST_SCHEMA.to_owned());
    report.generator_matches = Some(canonical(&read.value["generator"]) == generator_bytes);
    report
        .findings
        .extend(check_listing(&index, &read.manifest));
    let pack_version = read.manifest.generator.pack_format_version;
    for member in &read.manifest.members {
        let Some(entry) = index.entry(&member.path) else {
            continue;
        };
        report.members_checked += 1;
        match read_checked(source, &index, entry, member) {
            Ok(bytes) if depth == Depth::Full => {
                if let Err(finding) = check_structured(member, &bytes, pack_version, limits) {
                    report.findings.push(finding);
                }
            }
            Ok(_) => {}
            Err(finding) => report.findings.push(finding),
        }
    }
    report.findings.extend(invariants(&read.manifest));
    report.manifest = Some(read.manifest);
    finish(report, limits)
}

fn declared_schema<R: ReadAt + ?Sized>(source: &R, index: &ZipIndex) -> Option<String> {
    let first = index.entries.first()?;
    let bytes = index.read(source, first).ok()?;
    let value: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    let schema = value.get("schema")?.as_str()?.to_owned();
    let well_formed = schema.split('.').all(|part| {
        !part.is_empty()
            && part
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
    });
    (well_formed && schema.matches('.').count() >= 2).then_some(schema)
}

fn finish(mut report: Report, limits: &Limits) -> Report {
    report
        .findings
        .sort_by(|a, b| (a.path(), &a.code, &a.message).cmp(&(b.path(), &b.code, &b.message)));
    report.findings.dedup();
    let max = limits.get_usize(LimitName::MaxFindings);
    if report.findings.len() > max {
        let dropped = report.findings.len() - max;
        report.findings.truncate(max);
        report.findings.push(Finding::new(
            "findings-truncated",
            format!("{dropped} more findings were not listed (max-findings {max})"),
        ));
    }
    report
}

fn inconsistent(invariant: u8, message: String) -> Finding {
    Finding::new("stage-inconsistent", format!("I{invariant}: {message}")).at_path(MANIFEST_PATH)
}

/// The fixed-path members of a stage that apply to this bundle.
#[must_use]
pub fn applicable_members(manifest: &Manifest, stage: Stage) -> Vec<String> {
    match stage {
        Stage::Parse => {
            let mut paths: Vec<String> = PROJECTIONS
                .iter()
                .map(|(path, _)| (*path).to_owned())
                .collect();
            if manifest.config.root_schematic.is_some() {
                paths.push(DESIGN_PATH.to_owned());
            }
            paths
        }
        Stage::Board => {
            let mut paths = vec![MATERIALIZATION_PATH.to_owned()];
            if manifest.config.zone_fills.is_none()
                && let Some(board) = &manifest.config.board
            {
                paths.push(format!(
                    "{REFILLED_PREFIX}{}",
                    crate::paths::file_name(board)
                ));
            }
            paths
        }
        Stage::Models => vec![MODELS_PATH.to_owned()],
    }
}

/// Every fixed path a stage could write (I6).
fn fixed_paths(manifest: &Manifest, stage: Stage) -> Vec<String> {
    let mut paths = applicable_members(manifest, stage);
    if stage == Stage::Parse && !paths.iter().any(|path| path == DESIGN_PATH) {
        paths.push(DESIGN_PATH.to_owned());
    }
    paths
}

struct StageView<'a> {
    stage: Stage,
    status: Status,
    skip_reason: Option<a3::BundleManifestSkipReason>,
    has_error: bool,
    warnings: &'a [a3::Warning],
    failed: &'a [a3::BundleManifestMemberFailure],
}

fn stage_views(manifest: &Manifest) -> [StageView<'_>; 3] {
    let stages = &manifest.stages;
    [
        StageView {
            stage: Stage::Parse,
            status: stages.parse.status,
            skip_reason: None,
            has_error: stages.parse.error.is_some(),
            warnings: &stages.parse.warnings,
            failed: &stages.parse.failed_members,
        },
        StageView {
            stage: Stage::Board,
            status: stages.board.status,
            skip_reason: stages.board.skip_reason,
            has_error: stages.board.error.is_some(),
            warnings: &stages.board.warnings,
            failed: &stages.board.failed_members,
        },
        StageView {
            stage: Stage::Models,
            status: stages.models.status,
            skip_reason: stages.models.skip_reason,
            has_error: stages.models.error.is_some(),
            warnings: &stages.models.warnings,
            failed: &stages.models.failed_members,
        },
    ]
}

/// The manifest invariants I1–I12 (bundle-format.md §3.4).
#[must_use]
pub fn invariants(manifest: &Manifest) -> Vec<Finding> {
    let mut findings = Vec::new();
    i1_order(manifest, &mut findings);
    i2_roles(manifest, &mut findings);
    i3_schemas(manifest, &mut findings);
    i4_config_members(manifest, &mut findings);
    i5_statuses(manifest, &mut findings);
    let views = stage_views(manifest);
    for view in &views {
        i6_records(manifest, view, &mut findings);
        i7_members(manifest, view, &mut findings);
    }
    i8_fills(manifest, &mut findings);
    i9_cross_check(manifest, &mut findings);
    i10_sorted(manifest, &views, &mut findings);
    i11_bundle_key(manifest, &mut findings);
    i12_sources(manifest, &mut findings);
    i13_read_set(manifest, &mut findings);
    findings
}

fn has_member(manifest: &Manifest, path: &str) -> bool {
    manifest
        .members
        .iter()
        .any(|member| member.path.as_str() == path)
}

fn i1_order(manifest: &Manifest, findings: &mut Vec<Finding>) {
    for pair in manifest.members.windows(2) {
        if pair[0].path.as_bytes() >= pair[1].path.as_bytes() {
            findings.push(inconsistent(
                1,
                format!(
                    "members are not sorted by path without duplicates at {}",
                    pair[1].path.as_str()
                ),
            ));
            return;
        }
    }
}

fn role_path_ok(manifest: &Manifest, member: &a3::BundleManifestMember) -> bool {
    let path = member.path.as_str();
    match member.role {
        Role::Design => path == DESIGN_PATH,
        Role::Projection => PROJECTIONS
            .iter()
            .any(|(projection, _)| *projection == path),
        Role::Materialization => path == MATERIALIZATION_PATH,
        Role::ComponentModels => path == MODELS_PATH,
        Role::RefilledBoard => manifest.config.board.as_ref().is_some_and(|board| {
            path == format!("{REFILLED_PREFIX}{}", crate::paths::file_name(board))
        }),
        role => path
            .strip_prefix(SOURCES_PREFIX)
            .is_some_and(|repo| role_for_source(repo) == Some(role)),
    }
}

fn i2_roles(manifest: &Manifest, findings: &mut Vec<Finding>) {
    for member in &manifest.members {
        if member.stage != role_stage(member.role) {
            findings.push(inconsistent(
                2,
                format!("{} has the stage of another role", member.path.as_str()),
            ));
        }
        if !role_path_ok(manifest, member) {
            findings.push(inconsistent(
                2,
                format!(
                    "{} does not have the path form of its role",
                    member.path.as_str()
                ),
            ));
        }
    }
}

fn i3_schemas(manifest: &Manifest, findings: &mut Vec<Finding>) {
    let declared: Vec<(&str, &str)> = manifest
        .generator
        .member_schemas
        .iter()
        .map(|entry| (entry.path.as_str(), entry.schema.0.as_str()))
        .collect();
    if !declared.contains(&(MANIFEST_PATH, MANIFEST_SCHEMA)) {
        findings.push(inconsistent(
            3,
            "generator.member_schemas does not list bundle.json".to_owned(),
        ));
    }
    for member in &manifest.members {
        let structured = matches!(
            member.role,
            Role::Design | Role::Materialization | Role::Projection
        );
        let expected = declared
            .iter()
            .find(|(path, _)| *path == member.path.as_str())
            .map(|(_, schema)| *schema);
        let actual = member
            .member_schema
            .as_ref()
            .map(|schema| schema.0.as_str());
        let ok = if structured {
            actual.is_some() && actual == expected
        } else {
            actual.is_none()
        };
        if !ok {
            findings.push(inconsistent(
                3,
                format!(
                    "{} has a member_schema that does not follow its role and generator.member_schemas",
                    member.path.as_str()
                ),
            ));
        }
    }
}

/// Whether stage parse failed with `source-missing` at `sources/<path>`.
fn missing_at(manifest: &Manifest, path: &str) -> bool {
    manifest.stages.parse.error.as_ref().is_some_and(|error| {
        error.code.0 == "source-missing"
            && error
                .location
                .as_ref()
                .and_then(|location| location.path.as_ref())
                .is_some_and(|at| at.as_str().strip_prefix(SOURCES_PREFIX) == Some(path))
    })
}

fn i4_config_members(manifest: &Manifest, findings: &mut Vec<Finding>) {
    let config = &manifest.config;
    let required = [
        (Some(&config.project_file), Role::SourceProject),
        (config.root_schematic.as_ref(), Role::SourceSchematic),
        (config.board.as_ref(), Role::SourceBoard),
    ];
    for (path, role) in required {
        let Some(path) = path else { continue };
        let member = format!("{SOURCES_PREFIX}{}", path.as_str());
        let present = manifest
            .members
            .iter()
            .any(|candidate| candidate.path.as_str() == member && candidate.role == role);
        // A file the config names but the source set lacks fails stage parse
        // with `source-missing` there; it cannot be a member then.
        if !present && !missing_at(manifest, path.as_str()) {
            findings.push(inconsistent(
                4,
                format!("{member} is not a member of its role"),
            ));
        }
    }
}

/// Add the finding of invariant `invariant` unless `holds`.
fn require(findings: &mut Vec<Finding>, holds: bool, invariant: u8, message: &str) {
    if !holds {
        findings.push(inconsistent(invariant, message.to_owned()));
    }
}

fn board_status_ok(manifest: &Manifest) -> bool {
    use a3::BundleManifestSkipReason::{EarlierStageFailed, NoBoard};
    let stages = &manifest.stages;
    let skip = if stages.parse.status == Status::Failed {
        Some(EarlierStageFailed)
    } else {
        manifest.config.board.is_none().then_some(NoBoard)
    };
    match skip {
        Some(reason) => {
            stages.board.status == Status::Skipped && stages.board.skip_reason == Some(reason)
        }
        None => matches!(
            stages.board.status,
            Status::Pending | Status::Complete | Status::Partial
        ),
    }
}

fn models_status_ok(manifest: &Manifest) -> bool {
    use a3::BundleManifestSkipReason::EarlierStageFailed;
    let (board, models) = (&manifest.stages.board, &manifest.stages.models);
    let skipped_for = |reason| models.status == Status::Skipped && models.skip_reason == reason;
    let follows = match board.status {
        Status::Pending => models.status == Status::Pending,
        Status::Skipped => skipped_for(board.skip_reason),
        Status::Partial | Status::Failed => skipped_for(Some(EarlierStageFailed)),
        Status::Complete => matches!(models.status, Status::Pending | Status::Complete),
    };
    follows && !matches!(models.status, Status::Partial | Status::Failed)
}

fn i5_statuses(manifest: &Manifest, findings: &mut Vec<Finding>) {
    let parse_final = matches!(
        manifest.stages.parse.status,
        Status::Complete | Status::Partial | Status::Failed
    );
    require(
        findings,
        parse_final,
        5,
        "stage parse is pending or skipped",
    );
    require(
        findings,
        board_status_ok(manifest),
        5,
        "stage board's status does not follow stage parse and the config",
    );
    require(
        findings,
        models_status_ok(manifest),
        5,
        "stage models' status does not follow stage board",
    );
}

fn i6_records(manifest: &Manifest, view: &StageView<'_>, findings: &mut Vec<Finding>) {
    let name = crate::manifest::stage_name(view.stage);
    let failed = view.status == Status::Failed;
    let skipped = view.status == Status::Skipped;
    let partial = view.status == Status::Partial;
    if view.has_error != failed
        || view.skip_reason.is_some() != skipped
        || view.failed.is_empty() == partial
    {
        findings.push(inconsistent(
            6,
            format!("stage {name}'s error, skip_reason or failed_members do not follow its status"),
        ));
    }
    if matches!(view.status, Status::Pending | Status::Skipped) && !view.warnings.is_empty() {
        findings.push(inconsistent(
            6,
            format!("stage {name} is not run but has warnings"),
        ));
    }
    let fixed = fixed_paths(manifest, view.stage);
    for failure in view.failed {
        let path = failure.path.as_str();
        if !fixed.iter().any(|candidate| candidate == path) || has_member(manifest, path) {
            findings.push(inconsistent(
                6,
                format!("failed member {path} is not a missing fixed-path member of stage {name}"),
            ));
        }
    }
}

fn i7_members(manifest: &Manifest, view: &StageView<'_>, findings: &mut Vec<Finding>) {
    let name = crate::manifest::stage_name(view.stage);
    let applicable = applicable_members(manifest, view.stage);
    let failed = |path: &str| {
        view.failed
            .iter()
            .any(|failure| failure.path.as_str() == path)
    };
    match view.status {
        Status::Complete | Status::Partial => {
            for path in &applicable {
                let ok =
                    has_member(manifest, path) || (view.status == Status::Partial && failed(path));
                if !ok {
                    findings.push(inconsistent(7, format!("stage {name} lacks member {path}")));
                }
            }
        }
        Status::Pending | Status::Failed | Status::Skipped => {
            let stray = manifest
                .members
                .iter()
                .find(|member| member.stage == view.stage && !is_source_role(member.role));
            if let Some(member) = stray {
                findings.push(inconsistent(
                    7,
                    format!(
                        "stage {name} is {} but has member {}",
                        crate::manifest::status_name(view.status),
                        member.path.as_str()
                    ),
                ));
            }
        }
    }
}

fn has_warning(warnings: &[a3::Warning], code: &str) -> bool {
    warnings.iter().any(|warning| warning.code.0 == code)
}

fn i8_fills(manifest: &Manifest, findings: &mut Vec<Finding>) {
    use a3::BundleManifestFillProvenance::{Refilled, Saved};
    let board = &manifest.stages.board;
    let ran = matches!(board.status, Status::Complete | Status::Partial);
    let mode = if manifest.config.zone_fills.is_some() {
        Saved
    } else {
        Refilled
    };
    let refilled = board.fill_provenance == Some(Refilled);
    let is_saved = board.fill_provenance == Some(Saved);
    let pack = has_member(manifest, MATERIALIZATION_PATH);
    let refilled_member = manifest
        .members
        .iter()
        .any(|member| member.role == Role::RefilledBoard);
    let warnings_ok = has_warning(&board.warnings, "saved-fills-used") == is_saved
        && !(is_saved && has_warning(&board.warnings, "stale-saved-fills"));
    let rules = [
        (
            board.fill_provenance == ran.then_some(mode),
            "fill_provenance does not follow stage board and config.zone_fills",
        ),
        (
            refilled_member == refilled,
            "the refilled board is a member exactly when fill_provenance is refilled",
        ),
        (
            board.cross_check.is_some() == pack,
            "cross_check is present exactly with the materialization",
        ),
        (
            board.fill_check.is_some() == (pack && refilled),
            "fill_check is present exactly with the materialization of a refilled board",
        ),
        (
            warnings_ok,
            "saved-fills-used is a warning exactly with saved fills, without stale-saved-fills",
        ),
    ];
    for (holds, message) in rules {
        require(findings, holds, 8, message);
    }
}

fn cross_check_status_ok(check: &a3::BundleManifestCrossCheck) -> bool {
    use a3::BundleManifestCrossCheckStatus::{Failed, Passed, PassedWithWarnings, Skipped};
    let (warnings, errors) = (check.warnings.is_empty(), check.errors.is_empty());
    match check.status {
        Passed => [warnings, errors].iter().all(|holds| *holds),
        PassedWithWarnings => [!warnings, errors].iter().all(|holds| *holds),
        Failed => !errors,
        Skipped => [
            check.components_compared.0 == 0,
            check.pads_compared.0 == 0,
            check.nets_compared.0 == 0,
            check.mappings.is_empty(),
            warnings,
            errors,
        ]
        .iter()
        .all(|holds| *holds),
    }
}

fn i9_cross_check(manifest: &Manifest, findings: &mut Vec<Finding>) {
    let Some(check) = &manifest.stages.board.cross_check else {
        return;
    };
    require(
        findings,
        cross_check_status_ok(check),
        9,
        "cross_check's status does not follow its findings",
    );
    let skipped = check.status == a3::BundleManifestCrossCheckStatus::Skipped;
    require(
        findings,
        skipped != has_member(manifest, DESIGN_PATH),
        9,
        "cross_check is skipped exactly when design.json is not a member",
    );
}

fn warnings_sorted(warnings: &[a3::Warning]) -> bool {
    warnings.windows(2).all(|pair| {
        (pair[0].code.as_str(), pair[0].message.as_str())
            < (pair[1].code.as_str(), pair[1].message.as_str())
    })
}

fn i10_sorted(manifest: &Manifest, views: &[StageView<'_>; 3], findings: &mut Vec<Finding>) {
    for view in views {
        let failed_sorted = view
            .failed
            .windows(2)
            .all(|pair| pair[0].path.as_bytes() < pair[1].path.as_bytes());
        if !warnings_sorted(view.warnings) || !failed_sorted {
            findings.push(inconsistent(
                10,
                format!(
                    "stage {}'s warnings or failed_members are not sorted",
                    crate::manifest::stage_name(view.stage)
                ),
            ));
        }
    }
    if let Some(check) = &manifest.stages.board.cross_check {
        let mappings_sorted = check.mappings.windows(2).all(|pair| {
            let key = |mapping: &a3::BundleManifestCrossCheckMapping| {
                (
                    crate::manifest::retype::<_, String>(&mapping.kind).unwrap_or_default(),
                    mapping.board.to_string(),
                    mapping.design.to_string(),
                )
            };
            key(&pair[0]) < key(&pair[1])
        });
        if !warnings_sorted(&check.warnings) || !warnings_sorted(&check.errors) || !mappings_sorted
        {
            findings.push(inconsistent(
                10,
                "cross_check's findings or mappings are not sorted".to_owned(),
            ));
        }
    }
}

fn i11_bundle_key(manifest: &Manifest, findings: &mut Vec<Finding>) {
    match (&manifest.revision_key, &manifest.bundle_key) {
        (None, None) => {}
        (Some(revision_key), Some(key)) => {
            let generator = serde_json::to_value(&manifest.generator).unwrap_or_default();
            let expected = bundle_key(&revision_key.0, &canonical(&generator));
            if key.0 != expected {
                findings.push(inconsistent(
                    11,
                    "bundle_key does not recompute from revision_key and generator".to_owned(),
                ));
            }
        }
        _ => findings.push(inconsistent(
            11,
            "bundle_key is present exactly when revision_key is".to_owned(),
        )),
    }
}

/// Whether `directory` (`""` = the repository root) holds `path` at any depth.
fn directory_reaches(directory: &str, path: &str) -> bool {
    if directory.is_empty() {
        !path.is_empty()
    } else {
        crate::paths::is_within(path, directory)
    }
}

fn strictly_sorted<T: Ord>(items: &[T]) -> bool {
    items.windows(2).all(|pair| pair[0] < pair[1])
}

/// I13: the read set's canonical order and membership (bundle-format.md §3.4).
fn i13_read_set(manifest: &Manifest, findings: &mut Vec<Finding>) {
    let read_set = &manifest.read_set;
    if !strictly_sorted(
        &read_set
            .probes
            .iter()
            .map(|probe| probe.path.0.as_str())
            .collect::<Vec<_>>(),
    ) {
        findings.push(inconsistent(
            13,
            "read_set.probes is not sorted by path without duplicates".to_owned(),
        ));
    }
    if !strictly_sorted(
        &read_set
            .gitlinks
            .iter()
            .map(|gitlink| gitlink.path.0.as_str())
            .collect::<Vec<_>>(),
    ) {
        findings.push(inconsistent(
            13,
            "read_set.gitlinks is not sorted by path without duplicates".to_owned(),
        ));
    }
    let listing_key = |listing: &a3::BundleManifestListing| {
        (
            listing.directory.to_string(),
            listing
                .suffixes
                .iter()
                .map(|suffix| suffix.0.clone())
                .collect::<Vec<_>>(),
        )
    };
    let keys: Vec<_> = read_set.listings.iter().map(listing_key).collect();
    if !strictly_sorted(&keys) {
        findings.push(inconsistent(
            13,
            "read_set.listings is not sorted by directory and suffixes without duplicates"
                .to_owned(),
        ));
    }
    let sources: std::collections::BTreeSet<&str> = manifest
        .members
        .iter()
        .filter_map(|member| {
            is_source_role(member.role)
                .then(|| member.path.as_str().strip_prefix(SOURCES_PREFIX))
                .flatten()
        })
        .collect();
    if read_set
        .probes
        .iter()
        .any(|probe| sources.contains(probe.path.0.as_str()))
    {
        findings.push(inconsistent(
            13,
            "a read_set probe names a source member's path".to_owned(),
        ));
    }
    for listing in &read_set.listings {
        let suffixes: Vec<&str> = listing
            .suffixes
            .iter()
            .map(|suffix| suffix.0.as_str())
            .collect();
        if !strictly_sorted(&suffixes) {
            findings.push(inconsistent(
                13,
                "a read_set listing's suffixes are not sorted without duplicates".to_owned(),
            ));
            return;
        }
        let paths: Vec<&str> = listing.paths.iter().map(|path| path.0.as_str()).collect();
        if !strictly_sorted(&paths) {
            findings.push(inconsistent(
                13,
                "a read_set listing's paths are not sorted without duplicates".to_owned(),
            ));
            return;
        }
        let directory = listing.directory.to_string();
        if let Some(path) = paths
            .iter()
            .find(|path| !directory_reaches(&directory, path))
        {
            findings.push(inconsistent(
                13,
                format!("the listed path {path} does not lie below its directory"),
            ));
            return;
        }
    }
}

fn i12_sources(manifest: &Manifest, findings: &mut Vec<Finding>) {
    for member in &manifest.members {
        let ok = match (&member.source, is_source_role(member.role)) {
            (Some(source), true) => {
                member.path.as_str().strip_prefix(SOURCES_PREFIX) == Some(source.path.as_str())
            }
            (None, false) => true,
            _ => false,
        };
        if !ok {
            findings.push(inconsistent(
                12,
                format!(
                    "{}'s source entry does not follow its role and path",
                    member.path.as_str()
                ),
            ));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn example() -> Manifest {
        serde_json::from_str(include_str!(
            "../../../../contracts/prism/examples/BundleManifestA3.example.json"
        ))
        .unwrap()
    }

    #[test]
    fn the_contract_example_satisfies_every_invariant() {
        assert_eq!(invariants(&example()), Vec::new());
    }

    #[test]
    fn broken_records_are_stage_inconsistent() {
        let mut manifest = example();
        manifest.stages.models.status = Status::Partial;
        let findings = invariants(&manifest);
        assert!(
            findings
                .iter()
                .all(|finding| finding.code == "stage-inconsistent")
        );
        assert!(
            findings
                .iter()
                .any(|finding| finding.message.starts_with("I5")),
            "{findings:?}"
        );
        let mut manifest = example();
        manifest.members.reverse();
        assert!(
            invariants(&manifest)
                .iter()
                .any(|finding| finding.message.starts_with("I1"))
        );
        let mut manifest = example();
        manifest.bundle_key = Some(a3::Sha256Hex("0".repeat(64)));
        assert!(
            invariants(&manifest)
                .iter()
                .any(|finding| finding.message.starts_with("I11"))
        );
        let mut manifest = example();
        manifest.stages.board.fill_provenance = None;
        assert!(
            invariants(&manifest)
                .iter()
                .any(|finding| finding.message.starts_with("I8"))
        );
    }

    fn i13(manifest: &Manifest) -> Vec<String> {
        invariants(manifest)
            .into_iter()
            .filter(|finding| finding.message.starts_with("I13"))
            .map(|finding| finding.message)
            .collect()
    }

    fn source_member(manifest: &Manifest) -> String {
        manifest
            .members
            .iter()
            .find(|member| is_source_role(member.role))
            .unwrap()
            .path
            .as_str()
            .strip_prefix(SOURCES_PREFIX)
            .unwrap()
            .to_owned()
    }

    #[test]
    fn i13_rejects_each_unsorted_or_stray_entry() {
        let probe = |path: &str| a3::BundleManifestProbe {
            path: a3::RepoPath(path.to_owned()),
            present: false,
        };
        let mut manifest = example();
        manifest.read_set.probes = vec![probe("b"), probe("a")];
        assert!(!i13(&manifest).is_empty(), "unsorted probes");

        let mut manifest = example();
        manifest.read_set.probes = vec![probe("a"), probe("a")];
        assert!(!i13(&manifest).is_empty(), "duplicate probes");

        let mut manifest = example();
        manifest.read_set.probes = vec![probe(&source_member(&manifest))];
        assert!(
            !i13(&manifest).is_empty(),
            "a probe names a source member's path"
        );

        let listing =
            |directory: &str, suffixes: Vec<&str>, paths: Vec<&str>| a3::BundleManifestListing {
                directory: if directory.is_empty() {
                    a3::BundleManifestListingDirectory::String(String::new())
                } else {
                    a3::BundleManifestListingDirectory::RepoPath(a3::RepoPath(directory.to_owned()))
                },
                suffixes: suffixes
                    .into_iter()
                    .map(|suffix| a3::BundleManifestListingSuffix(suffix.to_owned()))
                    .collect(),
                paths: paths
                    .into_iter()
                    .map(|path| a3::RepoPath(path.to_owned()))
                    .collect(),
            };
        let mut manifest = example();
        manifest.read_set.listings = vec![listing("", vec![".b", ".a"], vec![])];
        assert!(!i13(&manifest).is_empty(), "unsorted suffixes");

        let mut manifest = example();
        manifest.read_set.listings = vec![listing("", vec![".a", ".a"], vec![])];
        assert!(!i13(&manifest).is_empty(), "duplicate suffixes");

        let mut manifest = example();
        manifest.read_set.listings = vec![listing("lib", vec![], vec!["lib/b", "lib/a"])];
        assert!(!i13(&manifest).is_empty(), "unsorted paths");

        let mut manifest = example();
        manifest.read_set.listings = vec![listing("lib", vec![], vec!["lib/a", "lib/a"])];
        assert!(!i13(&manifest).is_empty(), "duplicate paths");

        let mut manifest = example();
        manifest.read_set.listings = vec![listing("lib", vec![], vec!["other/a"])];
        assert!(!i13(&manifest).is_empty(), "a path above its directory");

        let mut manifest = example();
        manifest.read_set.listings = vec![
            listing("lib", vec![".a"], vec![]),
            listing("lib", vec![".b"], vec![]),
        ];
        manifest.read_set.listings.reverse();
        assert!(!i13(&manifest).is_empty(), "unsorted listings");

        let gitlink = |path: &str| a3::BundleManifestGitlink {
            path: a3::RepoPath(path.to_owned()),
            commit: a3::GitObjectId("0".repeat(40)),
        };
        let mut manifest = example();
        manifest.read_set.gitlinks = vec![gitlink("b"), gitlink("a")];
        assert!(!i13(&manifest).is_empty(), "unsorted gitlinks");

        let mut manifest = example();
        manifest.read_set.gitlinks = vec![gitlink("a"), gitlink("a")];
        assert!(!i13(&manifest).is_empty(), "duplicate gitlinks");
    }
}
