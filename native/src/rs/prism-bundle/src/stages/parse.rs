//! Stage `parse` (cli-spec.md §5.2.2): select the source set, read the
//! design once, build `design.json` and every projection, and record the
//! closure the build read as `sources/` (bundle-format.md §2.2).
//!
//! Order of work, which fixes which failure is reported first:
//! 1. the project file (UTF-8, JSON);
//! 2. the root schematic and every sheet it reaches, breadth first;
//! 3. the board;
//! 4. the rules beside the project, its two library tables and every jobset;
//! 5. the model, `design.json` and the eight projections;
//! 6. the files `projections/project.json` references inside the sources.
//!
//! A content failure in 1–3 ends the stage `failed` with the archive holding
//! the files read so far plus the project file, root schematic, board and
//! jobsets that exist; a failing producer in 5 marks that member failed.

use super::design::{self, Text};
use super::keys::{source_entry, upgrade_invalid};
use super::producers::ProjectionResult;
use super::sexpr_check::{self, BOARD_FORMAT, CheckError, SCHEMATIC_FORMAT};
use super::sheets::{Unresolved, resolve};
use super::sources::SourceTree;
use super::{Built, Generator, MemberData, Reporter, internal, producers};
use crate::finding::{Failure, Finding, Location, Outcome};
use crate::limits::{LimitName, Limits};
use crate::manifest::{
    BOARD_ID, DESIGN_PATH, DESIGN_SCHEMA, MANIFEST_SCHEMA, PROJECTIONS, Role, SOURCES_PREFIX,
    Stage, Status, a3, json_bytes, member_failure, models_stage, pending_board, retype,
    skipped_board, sort_warnings, source_role, warning,
};
use crate::paths::{file_name, is_within, join, parent};
use crate::revision_key::{EffectiveConfig, default_config};
use prism_kicad_contracts::generated::prism_revision_key_effective_config_a1 as cfg;
use prism_kicad_contracts::generated::prism_revision_key_record_a1 as rk;
use prism_kicad_contracts::generated::prism_semantic_index_a2::SemanticIndexA2;
use prism_kicad_core::{PcbLimits, PcbView, ProjectDocument, ProjectLimits};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// The inputs of stage parse.
pub struct ParseRequest<'a> {
    /// `<project.kicad_pro>`, a host path.
    pub project: &'a Path,
    /// `--source-root`; the project file's directory when absent.
    pub source_root: Option<&'a Path>,
    /// `--config`, validated.
    pub config: Option<EffectiveConfig>,
    /// `--revision-key`.
    pub revision_key: Option<String>,
    /// `--key-record`, validated against its schema.
    pub key_record: Option<rk::RevisionKeyRecordA1>,
    /// `--upgraded`: the original `(version N)` of each source K upgraded.
    pub upgraded: BTreeMap<String, u64>,
    /// This binary's generator id.
    pub generator: &'a Generator,
    /// The invocation's limits.
    pub limits: &'a Limits,
    /// Diagnostics sink.
    pub reporter: &'a dyn Reporter,
    /// The projection members to produce, by path; `None` produces all of
    /// them. `compare` on a source tree asks for the five it reads (amendment
    /// C2r §2 item 4); a member not asked for is neither written nor failed.
    /// Without `design.json` among them, only the `components` and `nets` the
    /// semantic index reads are built.
    pub projections: Option<&'a [&'a str]>,
}

/// What stage parse produced.
#[derive(Debug)]
pub enum ParseOutcome {
    /// A bundle, `complete`, `partial` or `failed`.
    Built(Box<Built>),
    /// Nothing is at the project path: the project is absent (exit 10).
    ProjectAbsent(String),
}

fn lexical(path: &Path) -> PathBuf {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir().unwrap_or_default().join(path)
    };
    let mut out = PathBuf::new();
    for component in absolute.components() {
        match component {
            std::path::Component::ParentDir => {
                out.pop();
            }
            std::path::Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// The canonical form of `path`: its existing parent resolved, the name kept.
fn anchored(path: &Path) -> PathBuf {
    let path = lexical(path);
    match (path.parent(), path.file_name()) {
        (Some(dir), Some(name)) => {
            std::fs::canonicalize(dir).map_or(path.clone(), |dir| dir.join(name))
        }
        _ => path,
    }
}

fn repo_path(path: &Path, root: &Path) -> Option<String> {
    let relative = path.strip_prefix(root).ok()?;
    let parts: Option<Vec<&str>> = relative
        .components()
        .map(|part| part.as_os_str().to_str())
        .collect();
    let joined = parts?.join("/");
    (!joined.is_empty()).then_some(joined)
}

struct Located {
    root: PathBuf,
    project: String,
}

fn locate(request: &ParseRequest<'_>) -> Outcome<Result<Located, String>> {
    let name = request
        .project
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();
    if !name.to_ascii_lowercase().ends_with(".kicad_pro") {
        return Err(Failure::input(
            "project-not-kicad-pro",
            "the project file does not end in .kicad_pro",
        )
        .argument("project-file"));
    }
    let root_argument = match request.source_root {
        Some(root) => root.to_path_buf(),
        None => lexical(request.project)
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_default(),
    };
    let root = std::fs::canonicalize(&root_argument).map_err(|_| {
        Failure::input("input-not-found", "the source root does not exist").argument("source-root")
    })?;
    if !root.is_dir() {
        return Err(Failure::input(
            "input-not-regular-file",
            "the source root is not a directory",
        )
        .argument("source-root"));
    }
    let project = repo_path(&anchored(request.project), &root).ok_or_else(|| {
        Failure::input(
            "source-outside-root",
            "the project file is outside the source root",
        )
        .argument("project-file")
    })?;
    if let Some(config) = &request.config
        && config.project_file.0 != project
    {
        return Err(Failure::precondition(
            "config-mismatch",
            format!(
                "--config names project file {:?}, not {project:?}",
                config.project_file.0
            ),
        )
        .argument("config"));
    }
    match std::fs::symlink_metadata(root.join(&project)) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Err(project)),
        Ok(metadata) if !metadata.file_type().is_file() => {
            return Err(Failure::input(
                "input-not-regular-file",
                "the project file is not a regular file",
            )
            .argument("project-file"));
        }
        Err(error) => {
            return Err(Failure::input(
                "input-not-found",
                format!("the project file could not be read: {error}"),
            )
            .argument("project-file"));
        }
        Ok(_) => {}
    }
    Ok(Ok(Located { root, project }))
}

/// Run stage parse.
pub fn run(request: &ParseRequest<'_>) -> Outcome<ParseOutcome> {
    let located = match locate(request)? {
        Ok(located) => located,
        Err(project) => return Ok(ParseOutcome::ProjectAbsent(project)),
    };
    let excluded: Vec<String> = request
        .config
        .as_ref()
        .map(|config| {
            config
                .excluded_dirs
                .iter()
                .map(|dir| dir.0.clone())
                .collect()
        })
        .unwrap_or_default();
    let tree = SourceTree::scan(&located.root, &excluded, request.limits)?;
    let config = match &request.config {
        Some(config) => config.clone(),
        None => default_config(&located.project, |path| tree.exists(path)),
    };
    check_key_record(request, &config)?;
    request.reporter.info(
        "sources-selected",
        &format!("{} files are in the source set", tree.selected().count()),
    );
    let mut stage = ParseRun {
        request,
        tree: &tree,
        config,
        warnings: Vec::new(),
        failed: Vec::new(),
        derived: Vec::new(),
        pending_index: None,
    };
    let error = stage.parse()?;
    stage
        .finish(error)
        .map(|built| ParseOutcome::Built(Box::new(built)))
}

fn check_key_record(request: &ParseRequest<'_>, config: &EffectiveConfig) -> Outcome<()> {
    let Some(record) = &request.key_record else {
        return Ok(());
    };
    if request.revision_key.as_deref() != Some(record.revision_key.0.as_str()) {
        return Err(Failure::precondition(
            "revision-key-mismatch",
            "--key-record holds another revision key than --revision-key",
        )
        .argument("key-record"));
    }
    let canonical = |config: &EffectiveConfig| crate::revision_key::canonical_config(config);
    if canonical(&record.config) != canonical(config) {
        return Err(Failure::precondition(
            "config-mismatch",
            "--key-record was computed for another effective configuration",
        )
        .argument("key-record"));
    }
    Ok(())
}

pub(super) struct Design {
    pub(super) project: Text,
    pub(super) sheets: Vec<Text>,
    pub(super) board: Option<Text>,
}

struct ParseRun<'a> {
    request: &'a ParseRequest<'a>,
    tree: &'a SourceTree,
    config: EffectiveConfig,
    warnings: Vec<a3::Warning>,
    failed: Vec<a3::BundleManifestMemberFailure>,
    derived: Vec<MemberData>,
    /// The semantic index, typed, until the read set is final and its
    /// `designKey` can be set (bundle-format.md §2.3).
    pending_index: Option<Box<SemanticIndexA2>>,
}

pub(super) fn member(path: &str) -> String {
    format!("{SOURCES_PREFIX}{path}")
}

fn missing(path: &str, at: Option<Location>) -> Finding {
    let finding = Finding::new(
        "source-missing",
        format!("{} is not in the source set", member(path)),
    );
    finding.at(at.unwrap_or_else(|| Location::path(member(path))))
}

fn recorded(error: CheckError) -> Outcome<Finding> {
    match error {
        CheckError::Content(finding) => Ok(finding),
        CheckError::Limit(failure) => Err(failure),
    }
}

impl ParseRun<'_> {
    fn limits(&self) -> &Limits {
        self.request.limits
    }

    fn read(&self, path: &str) -> Outcome<Arc<[u8]>> {
        self.tree
            .read(path)?
            .ok_or_else(|| internal(format!("{} vanished from the source set", member(path))))
    }

    /// Read and check the project file, the hierarchy and the board.
    fn parse(&mut self) -> Outcome<Option<Finding>> {
        let design = match self.read_design()? {
            Ok(design) => design,
            Err(finding) => {
                self.read_anchors()?;
                self.read_jobsets()?;
                return Ok(Some(finding));
            }
        };
        self.read_companions()?;
        self.read_jobsets()?;
        self.build_model(&design)
    }

    fn read_anchors(&self) -> Outcome<()> {
        let config = &self.config;
        for path in [
            Some(&config.project_file),
            config.root_schematic.as_ref(),
            config.board.as_ref(),
        ]
        .into_iter()
        .flatten()
        {
            self.tree.read(path)?;
        }
        Ok(())
    }

    fn read_jobsets(&self) -> Outcome<()> {
        for path in self.tree.list("", &[".kicad_jobset"]) {
            self.tree.read(&path)?;
        }
        Ok(())
    }

    /// The rules file beside the project and its two library tables.
    fn read_companions(&self) -> Outcome<()> {
        let project = &self.config.project_file.0;
        let dir = parent(project);
        let name = file_name(project);
        let stem = &name[..name.len() - ".kicad_pro".len()];
        for companion in [
            format!("{stem}.kicad_dru"),
            "fp-lib-table".to_owned(),
            "sym-lib-table".to_owned(),
        ] {
            self.tree.read(&join(dir, &companion))?;
        }
        Ok(())
    }

    fn read_project(&self) -> Outcome<Result<Text, Finding>> {
        let path = self.config.project_file.0.clone();
        let at = member(&path);
        let bytes = self.read(&path)?;
        let Ok(text) = String::from_utf8(bytes.to_vec()) else {
            let valid = std::str::from_utf8(&bytes).map_or_else(|error| error.valid_up_to(), |_| 0);
            return Ok(Err(Finding::new(
                "source-not-utf8",
                format!("{at} is not UTF-8 text"),
            )
            .at(Location::at_offset(&at, &bytes, valid))));
        };
        crate::reader::json_bounds(text.as_bytes(), self.limits(), true, &at)?;
        if let Err(error) = serde_json::from_str::<serde::de::IgnoredAny>(&text) {
            return Ok(Err(json_error(&at, &text, &error)));
        }
        Ok(Ok(Text { path, text }))
    }

    fn read_design(&mut self) -> Outcome<Result<Design, Finding>> {
        let project = match self.read_project()? {
            Ok(project) => project,
            Err(finding) => return Ok(Err(finding)),
        };
        let sheets = match &self.config.root_schematic {
            Some(root) => match self.read_hierarchy(&root.0.clone())? {
                Ok(sheets) => sheets,
                Err(finding) => return Ok(Err(finding)),
            },
            None => Vec::new(),
        };
        let board = match self.config.board.clone() {
            Some(board) => match self.read_checked(&board.0, BOARD_FORMAT, None)? {
                Ok((text, _)) => Some(Text {
                    path: board.0,
                    text,
                }),
                Err(finding) => return Ok(Err(finding)),
            },
            None => None,
        };
        Ok(Ok(Design {
            project,
            sheets,
            board,
        }))
    }

    /// Read one KiCad file, failing `source-missing` (at `referrer`, when a
    /// reference led to it) if it is not in the source set.
    fn read_checked(
        &self,
        path: &str,
        format: u64,
        referrer: Option<Location>,
    ) -> Outcome<Result<(String, Vec<sexpr_check::SheetReference>), Finding>> {
        if !self.tree.exists(path) {
            return Ok(Err(missing(path, referrer)));
        }
        let bytes = self.read(path)?;
        match sexpr_check::check(&member(path), &bytes, format, self.limits()) {
            Ok(scanned) => {
                let text = String::from_utf8(bytes.to_vec()).map_err(internal)?;
                Ok(Ok((text, scanned.sheets)))
            }
            Err(error) => recorded(error).map(Err),
        }
    }

    fn read_hierarchy(&self, root: &str) -> Outcome<Result<Vec<Text>, Finding>> {
        let mut seen = BTreeSet::from([root.to_owned()]);
        let mut queue = VecDeque::from([(root.to_owned(), None)]);
        let mut sheets = Vec::new();
        while let Some((path, referrer)) = queue.pop_front() {
            let (text, references) = match self.read_checked(&path, SCHEMATIC_FORMAT, referrer)? {
                Ok(read) => read,
                Err(finding) => return Ok(Err(finding)),
            };
            for reference in references {
                let at = Location::at_offset(member(&path), text.as_bytes(), reference.offset);
                let child = resolve(&path, &reference.file)
                    .map_err(|why| outside(&path, &reference.file, why, &at))?;
                if seen.insert(child.clone()) {
                    queue.push_back((child, Some(at)));
                }
            }
            sheets.push(Text { path, text });
        }
        Ok(Ok(sheets))
    }
}

fn outside(parent_path: &str, reference: &str, why: Unresolved, at: &Location) -> Failure {
    let what = match why {
        Unresolved::Absolute => "is absolute",
        Unresolved::Outside => "leaves the source root",
        Unresolved::Empty => "is empty",
    };
    Failure::input(
        "source-outside-root",
        format!(
            "the sheet file {reference:?} in {} {what}",
            member(parent_path)
        ),
    )
    .argument("source-root")
    .at(at.clone())
}

fn json_error(at: &str, text: &str, error: &serde_json::Error) -> Finding {
    let line = error.line().max(1);
    let column = error.column().max(1);
    let line_start: usize = text
        .split_inclusive('\n')
        .take(line - 1)
        .map(str::len)
        .sum();
    let offset = text[line_start.min(text.len())..]
        .char_indices()
        .nth(column - 1)
        .map_or(text.len(), |(index, _)| line_start + index);
    let wide = |value: usize| u64::try_from(value).unwrap_or(u64::MAX);
    Finding::new(
        "source-unparseable",
        format!("{at} is not valid JSON: {error}"),
    )
    .at(Location::text(at, wide(line), wide(column), wide(offset)))
}

fn pcb_limits(limits: &Limits) -> PcbLimits {
    PcbLimits {
        max_source_bytes: limits.get_usize(LimitName::MaxSourceFileBytes),
        max_depth: limits.get_usize(LimitName::MaxSexprDepth).saturating_add(1),
        ..PcbLimits::default()
    }
}

fn project_limits(limits: &Limits) -> ProjectLimits {
    ProjectLimits {
        max_source_bytes: limits.get_usize(LimitName::MaxSourceFileBytes),
        max_json_nodes: limits.get_usize(LimitName::MaxJsonNodes),
        max_json_depth: limits.get_usize(LimitName::MaxJsonDepth),
        ..ProjectLimits::default()
    }
}

/// The parsed model, borrowed by the projections.
struct Model<'d> {
    document: ProjectDocument,
    board: Option<PcbView<'d>>,
}

impl ParseRun<'_> {
    fn parse_model<'d>(&self, design: &'d Design) -> Outcome<Result<Model<'d>, Finding>> {
        let at = member(&design.project.path);
        let document = match ProjectDocument::parse(
            design.project.text.clone(),
            project_limits(self.limits()),
        ) {
            Ok(document) => document,
            Err(error) if error.kind == prism_kicad_core::ProjectErrorKind::ResourceLimit => {
                return Err(self
                    .limits()
                    .exceeded(LimitName::MaxJsonNodes, None, &at)
                    .at_path(at));
            }
            Err(error) => {
                return Ok(Err(Finding::new(
                    "source-unparseable",
                    format!("{at}: {}", error.message),
                )
                .at_path(at)));
            }
        };
        let board = match &design.board {
            Some(board) => match PcbView::parse(&board.text, pcb_limits(self.limits())) {
                Ok(view) => Some(view),
                Err(error) => {
                    let at = member(&board.path);
                    if error.kind == prism_kicad_core::sexpr::ErrorKind::ResourceLimit {
                        return Err(self
                            .limits()
                            .exceeded(LimitName::MaxSexprNodes, None, &at)
                            .at_path(at));
                    }
                    let finding = Finding::new("source-unparseable", error.message.to_string());
                    let wide = |value: usize| u64::try_from(value).unwrap_or(u64::MAX);
                    return Ok(Err(match error.position {
                        Some(position) => finding.at(Location::text(
                            at,
                            wide(position.line),
                            wide(position.column),
                            wide(position.offset),
                        )),
                        None => finding.at_path(at),
                    }));
                }
            },
            None => None,
        };
        Ok(Ok(Model { document, board }))
    }

    fn fail_member(&mut self, path: &str, code: &str, message: String) -> Outcome<()> {
        let finding = Finding::new(code, message.clone()).at_path(path);
        self.request.reporter.error(&finding);
        self.failed
            .push(member_failure(path, code, message).map_err(internal)?);
        Ok(())
    }

    fn add_json(&mut self, path: &str, schema: &str, value: &impl serde::Serialize) -> Outcome<()> {
        let bytes = json_bytes(value);
        self.limits().check(
            LimitName::MaxMemberBytes,
            u64::try_from(bytes.len()).unwrap_or(u64::MAX),
            path,
        )?;
        self.derived.push(MemberData {
            path: path.to_owned(),
            role: if path == DESIGN_PATH {
                Role::Design
            } else {
                Role::Projection
            },
            bytes: Arc::from(bytes),
            schema: Some(schema.to_owned()),
            source: None,
        });
        Ok(())
    }

    fn design_failed(&mut self, message: &str) -> Outcome<()> {
        self.fail_member(
            DESIGN_PATH,
            "design-build-failed",
            format!("design.json could not be built: {message}"),
        )
    }

    fn build_model(&mut self, design: &Design) -> Outcome<Option<Finding>> {
        let model = match self.parse_model(design)? {
            Ok(model) => model,
            Err(finding) => return Ok(Some(finding)),
        };
        let parts = self.schematic_parts(design);
        let facts = match &parts {
            Some(Ok((bundle, index))) => {
                Some(design::facts(index, bundle, project_limits(self.limits())))
            }
            _ => None,
        };
        let root = self
            .config
            .root_schematic
            .as_ref()
            .map(|root| root.0.clone())
            .unwrap_or_default();
        let schematic = match (&parts, &facts) {
            (Some(Ok((bundle, index))), Some(Ok(facts))) => {
                Some(prism_projections::SchematicModel {
                    root: &root,
                    bundle,
                    index,
                    facts,
                })
            }
            _ => None,
        };
        // `design.json` is built beside the producers that do not read it
        // (`project`); a schematic or facts failure is recorded first, as
        // before.
        let design_inputs = match (&parts, &facts) {
            (Some(Ok((_, index))), Some(Ok(facts))) => Some((index, facts)),
            (Some(Err(message)), _) | (_, Some(Err(message))) => {
                self.design_failed(message)?;
                None
            }
            _ => None,
        };
        self.project(design, &model, schematic.as_ref(), design_inputs)?;
        Ok(None)
    }

    fn schematic_parts(
        &self,
        design: &Design,
    ) -> Option<
        Result<
            (
                prism_kicad_core::SourceBundle,
                prism_kicad_core::SchematicBundleIndex,
            ),
            String,
        >,
    > {
        self.config.root_schematic.as_ref()?;
        Some(
            design::source_bundle(&design.project, &design.sheets, Default::default()).and_then(
                |bundle| {
                    let index = design::index(&bundle, Default::default())?;
                    Ok((bundle, index))
                },
            ),
        )
    }
}

impl ParseRun<'_> {
    fn project(
        &mut self,
        design: &Design,
        model: &Model<'_>,
        schematic: Option<&prism_projections::SchematicModel<'_>>,
        design_inputs: Option<(
            &prism_kicad_core::SchematicBundleIndex,
            &prism_kicad_core::KiCadDesignFacts<'_>,
        )>,
    ) -> Outcome<()> {
        let config: cfg::RevisionKeyEffectiveConfigA1 = retype(&self.config).map_err(internal)?;
        let project = prism_projections::ProjectModel {
            path: &design.project.path,
            text: &design.project.text,
            document: &model.document,
        };
        let board = design
            .board
            .as_ref()
            .zip(model.board.as_ref())
            .map(|(text, view)| prism_projections::BoardModel::new(&text.path, &text.text, view));
        let design_board = design
            .board
            .as_ref()
            .zip(model.board.as_ref())
            .map(|(text, view)| (text.path.as_str(), view));
        let input = prism_projections::ProjectionInput {
            config: &config,
            revision_key: self.request.revision_key.as_deref(),
            sources: self.tree,
            project: &project,
            schematic,
            board: board.as_ref(),
            design: None,
        };
        // The producers only read their input, so they run at once; their
        // results are then recorded one by one, in the fixed order, so the
        // members, warnings and failures do not depend on which finished first.
        let only = self.request.projections;
        let wanted = move |path: &str| only.is_none_or(|paths| paths.contains(&path));
        let (design_json, results) =
            producers::run(&input, design_inputs, design, design_board, &wanted);
        match design_json {
            Some(Ok(value)) => self.add_json(DESIGN_PATH, DESIGN_SCHEMA, &value)?,
            Some(Err(message)) => self.design_failed(&message)?,
            None => {}
        }
        if let Some(failure) = self.tree.take_failure() {
            return Err(failure);
        }
        self.record_projections(results)
    }

    /// Record each producer's result, in `PROJECTIONS` order (bundle-format.md
    /// §3.1): its warnings, the typed semantic index held aside for its
    /// `designKey`, or a failed member when it could not build.
    fn record_projections(
        &mut self,
        results: Vec<Option<Result<ProjectionResult, String>>>,
    ) -> Outcome<()> {
        for ((path, schema), result) in PROJECTIONS.into_iter().zip(results) {
            let Some(result) = result else {
                continue;
            };
            match result {
                Ok(ProjectionResult::SemanticIndex { document, warnings }) => {
                    for produced in warnings {
                        self.warn(&produced.code, produced.message)?;
                    }
                    self.pending_index = Some(document);
                }
                Ok(ProjectionResult::Json { value, warnings })
                    if value.get("schema").and_then(Value::as_str) == Some(schema) =>
                {
                    for produced in warnings {
                        self.warn(&produced.code, produced.message)?;
                    }
                    if path == "projections/project.json" {
                        self.read_references(&value)?;
                    }
                    self.add_json(path, schema, &value)?;
                }
                Ok(ProjectionResult::Json { .. }) => {
                    return Err(internal(format!(
                        "the {path} producer wrote another schema"
                    )));
                }
                Err(message) => self.fail_member(
                    path,
                    "projection-failed",
                    format!("{path} could not be built: {message}"),
                )?,
            }
        }
        Ok(())
    }

    fn warn(&mut self, code: &str, message: String) -> Outcome<()> {
        self.request
            .reporter
            .warning(&Finding::new(code, message.clone()));
        self.warnings
            .push(warning(code, message).map_err(internal)?);
        Ok(())
    }

    /// Read every repository target `projections/project.json` finds in the
    /// sources, and warn `model-unavailable` for a model the key lists but
    /// the source root lacks (bundle-format.md §2.2).
    fn read_references(&mut self, project: &Value) -> Outcome<()> {
        let references = project
            .get("references")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        for reference in references {
            let target = &reference["target"];
            if target["kind"] != "repository" {
                continue;
            }
            let Some(path) = target["path"].as_str() else {
                continue;
            };
            if target["inSources"] == true {
                self.read_target(path)?;
            } else if reference["kind"] == "model-3d" && self.key_lists(path) {
                self.warn(
                    "model-unavailable",
                    format!("the 3D model {} is in the revision key but was not materialized; the bundle is built without it", member(path)),
                )?;
            }
        }
        Ok(())
    }

    fn read_target(&self, path: &str) -> Outcome<()> {
        if self.tree.exists(path) {
            self.tree.read(path)?;
            return Ok(());
        }
        for candidate in self.tree.list(path, &[]) {
            self.tree.read(&candidate)?;
        }
        Ok(())
    }

    fn key_lists(&self, path: &str) -> bool {
        self.request.key_record.as_ref().is_some_and(|record| {
            record.entries.iter().any(|entry| {
                entry.path.0 == path
                    || (entry.kind == rk::RevisionKeyEntryKind::Gitlink
                        && is_within(path, &entry.path.0))
            })
        })
    }
}

impl ParseRun<'_> {
    fn source_members(&self) -> Outcome<Vec<MemberData>> {
        let record = self.request.key_record.as_ref();
        let mut members = Vec::new();
        for (path, bytes) in self.tree.read_files() {
            let info = self
                .tree
                .info(&path)
                .ok_or_else(|| internal("a read file left the source set"))?;
            let role = source_role(info.category).ok_or_else(|| internal("a link was read"))?;
            let mut source = source_entry(&path, &bytes, info.executable, record)?;
            source.upgraded_from_version = self.upgraded_from(&path)?;
            self.limits().check(
                LimitName::MaxMemberBytes,
                u64::try_from(bytes.len()).unwrap_or(u64::MAX),
                &member(&path),
            )?;
            members.push(MemberData {
                path: member(&path),
                role,
                bytes,
                schema: None,
                source: Some(source),
            });
        }
        Ok(members)
    }

    /// The `--upgraded` version of `path`, checked against the generator's
    /// file formats (cli-spec.md §5.2.2 "Upgrades").
    fn upgraded_from(&self, path: &str) -> Outcome<Option<i64>> {
        let Some(&version) = self.request.upgraded.get(path) else {
            return Ok(None);
        };
        let formats = &self.request.generator.document.kicad_file_formats;
        let current = if path.to_ascii_lowercase().ends_with(".kicad_pcb") {
            formats.board
        } else {
            formats.schematic
        };
        let version = i64::try_from(version).unwrap_or(i64::MAX);
        if version >= current {
            return Err(upgrade_invalid(format!(
                "--upgraded gives {} version {version}, not older than the generator's format {current}",
                member(path)
            )));
        }
        Ok(Some(version))
    }

    /// Every `--upgraded` path must be a member.
    fn check_upgraded(&self) -> Outcome<()> {
        let read = self.tree.read_files();
        match self
            .request
            .upgraded
            .keys()
            .find(|path| !read.contains_key(*path))
        {
            Some(path) => Err(upgrade_invalid(format!(
                "--upgraded names {}, which is not a member",
                member(path)
            ))),
            None => Ok(()),
        }
    }

    fn stage_record(&mut self, error: Option<Finding>) -> Outcome<a3::BundleManifestParseStage> {
        sort_warnings(&mut self.warnings);
        self.failed.sort_by(|a, b| a.path.0.cmp(&b.path.0));
        let status = match (&error, self.failed.is_empty()) {
            (Some(_), _) => Status::Failed,
            (None, false) => Status::Partial,
            (None, true) => Status::Complete,
        };
        if let Some(finding) = &error {
            self.request.reporter.error(finding);
        }
        Ok(a3::BundleManifestParseStage {
            status,
            error: error
                .as_ref()
                .map(crate::manifest::cli_finding)
                .transpose()
                .map_err(internal)?,
            warnings: self.warnings.clone(),
            failed_members: if error.is_some() {
                Vec::new()
            } else {
                self.failed.clone()
            },
        })
    }

    fn finish(mut self, error: Option<Finding>) -> Outcome<Built> {
        use a3::BundleManifestSkipReason::{EarlierStageFailed, NoBoard};
        let failed = error.is_some();
        let parse = self.stage_record(error)?;
        let (board, models) = if failed {
            (
                skipped_board(EarlierStageFailed),
                models_stage(Status::Skipped, Some(EarlierStageFailed)),
            )
        } else if self.config.board.is_none() {
            (
                skipped_board(NoBoard),
                models_stage(Status::Skipped, Some(NoBoard)),
            )
        } else {
            (pending_board(), models_stage(Status::Pending, None))
        };
        self.check_upgraded()?;
        let mut members = self.source_members()?;
        let read_set = crate::read_set::complete(
            &self.tree.read_set(),
            &members,
            self.request.key_record.as_ref(),
        );
        if let Some(record) = &self.request.key_record
            && let Some(mismatch) = crate::read_set::check(&read_set, &members, record)
        {
            return Err(internal(format!(
                "I14: the read set does not hold in --key-record at {}: {}",
                mismatch.path, mismatch.message
            )));
        }
        let config_digest = self.request.key_record.as_ref().map_or_else(
            || crate::revision_key::config_digest(&self.config),
            |record| record.config_digest.0.clone(),
        );
        let design_key = crate::read_set::design_key(&config_digest, &members, &read_set);
        if let Some(mut index) = self.pending_index.take() {
            index.design_key = design_key.into();
            self.add_json(
                "projections/semantic-index.json",
                "prism.semantic_index.a2",
                &index,
            )?;
        }
        if !failed {
            members.append(&mut self.derived);
        }
        let generator = &self.request.generator;
        let revision_key = self.request.revision_key.clone();
        let bundle_key = revision_key
            .as_deref()
            .map(|key| crate::generator::bundle_key(key, &generator.bytes));
        let manifest = a3::BundleManifestA3 {
            schema: MANIFEST_SCHEMA.to_owned(),
            generator: generator.document.clone(),
            revision_key: revision_key.map(a3::Sha256Hex),
            bundle_key: bundle_key.map(a3::Sha256Hex),
            config: retype(&self.config).map_err(internal)?,
            board_id: a3::BundleManifestBoardId(BOARD_ID.to_owned()),
            stages: a3::BundleManifestStages {
                parse,
                board,
                models,
            },
            read_set: crate::read_set::contract(&read_set),
            members: Vec::new(),
        };
        let written = members.iter().map(|member| member.path.clone()).collect();
        Ok(Built::assemble(Stage::Parse, manifest, members, written))
    }
}
