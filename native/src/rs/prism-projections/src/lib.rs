//! Prism's design-bundle projections, one module per `projections/*.json`
//! member (ADR §6). Each producer reads the single parsed model and writes
//! its contract in `native/src/tsp/prism/`; the rules for every field are in
//! `native/contracts/prism/field-maps/`. WP-F2 declared every module once,
//! WP-B fixed the shared interface below, and the Wave 2 producers (P1–P5)
//! each fill only their own file.
//!
//! # The interface (fixed by WP-B)
//!
//! Every module exports exactly one producer with this signature:
//!
//! ```text
//! pub fn produce(input: &ProjectionInput<'_>) -> Result<Produced<Root>, ProjectionError>
//! ```
//!
//! | Module | Member | `Root` (generated in `prism-kicad-contracts`) | WP |
//! |---|---|---|---|
//! | [`semantic_index`] | `projections/semantic-index.json` | `prism_semantic_index_a2::SemanticIndexA2` | P1 |
//! | [`board_objects`] | `projections/board-objects.json` | `prism_board_objects_a0::BoardObjectsA0` | P2 |
//! | [`occurrences`] | `projections/occurrences.json` | `prism_occurrences_a0::OccurrencesA0` | P2 |
//! | [`route_metrics`] | `projections/route-metrics.json` | `prism_route_metrics_a0::RouteMetricsA0` | P2 |
//! | [`stackup`] | `projections/stackup.json` | `prism_stackup_a0::StackupA0` | P3 |
//! | [`placements`] | `projections/placements.json` | `prism_placements_a0::PlacementsA0` | P3 |
//! | [`project`] | `projections/project.json` | `prism_project_a0::ProjectA0` | P4 |
//! | [`system_interface`] | `projections/system-interface.json` | `prism_system_interface_v1::SystemInterfaceV1` | P5 |
//!
//! Rules every producer follows:
//!
//! - **Inputs.** [`ProjectionInput`] holds everything stage parse parsed, once:
//!   the effective configuration, the project file, the schematic model
//!   (source bundle, hierarchy index and design facts) when there is a root
//!   schematic, the board view when there is a board, and `design.json` when
//!   it was built. A producer parses nothing else, except the extra files it
//!   reads through [`Sources`] (library tables, drawing sheets, the
//!   libraries they name). Every file read through [`Sources::read`] becomes a
//!   `sources/` member: the bundle carries exactly the closure the build read
//!   (bundle-format.md §2.2).
//! - **Empty form.** A projection whose inputs are absent (no board, no root
//!   schematic) returns its contract's empty form; it is never left out
//!   (bundle-format.md §2.1). Until a P-WP fills its module, the module
//!   returns that empty form for every project.
//! - **Failure.** A producer that cannot build its document from the model
//!   returns [`ProjectionError`]; the bundle records that member in
//!   `stages.parse.failed_members` with code `projection-failed` and writes
//!   every other member (stage parse `partial`). This includes a model input
//!   the configuration names but `input` lacks: `config.root_schematic` set
//!   while [`ProjectionInput::schematic`] is `None` means the core could not
//!   build the schematic model (`design.json` then failed as well).
//! - **Warnings.** [`Produced::warnings`] go to `stages.parse.warnings`, with
//!   the codes the projection's field map documents. Messages name files by
//!   their repository path, never a host path.
//! - **Determinism.** The document serializes with `serde_json` in
//!   declaration order (maps are `BTreeMap`), and its bytes are the same on
//!   every architecture: transcendental functions go through the `libm` crate
//!   (conventions.md §14). No wall-clock time, host path or provenance (the
//!   manifest records provenance once; the semantic index's `designKey` is
//!   filled by stage parse from the final read set and configuration).
//! - **Paths.** Every path is a repository-relative `RepoPath`; files belong to
//!   the project only through `config` (conventions.md §8).

pub mod board_objects;
pub mod compare;
pub mod occurrences;
pub mod placements;
pub mod project;
pub mod route_metrics;
pub mod semantic_index;
pub mod stackup;
pub mod system_interface;

mod python;

use prism_kicad_contracts::generated::prism_revision_key_effective_config_a1::RevisionKeyEffectiveConfigA1;
use prism_kicad_core::{
    KiCadDesignFacts, PcbView, ProjectDocument, SchematicBundleIndex, Sexp, SourceBundle,
};
use serde::de::DeserializeOwned;
use std::fmt;
use std::sync::{Arc, OnceLock};

/// The source set stage parse may read: every file under the source root that
/// the revision key's name rules select, minus the excluded directories.
///
/// A producer asks for exactly what it needs through these three queries
/// (ADR amendment K2 §3.1), never for the set as a whole: a successful [`read`]
/// becomes a `sources/` member, a miss or an [`exists`] is a *probe*, and every
/// [`list`] is a *listing*. Stage parse records all three so a bundle's read
/// set is exact.
///
/// [`read`]: Sources::read
/// [`exists`]: Sources::exists
/// [`list`]: Sources::list
pub trait Sources: Sync {
    /// The bytes of `path`, shared, or `None` when it is not in the source set.
    fn read(&self, path: &str) -> Option<Arc<[u8]>>;

    /// Whether `path` is in the source set.
    fn exists(&self, path: &str) -> bool;

    /// The source-set paths under `dir` (`""` = the repository root), at any
    /// depth, whose lowered name ends with one of `suffixes` (any name when
    /// empty), in code point order.
    fn list(&self, dir: &str, suffixes: &[&str]) -> Vec<String>;
}

/// The project file.
pub struct ProjectModel<'a> {
    /// Its repository path: `config.project_file`.
    pub path: &'a str,
    /// Its text.
    pub text: &'a str,
    /// The core's parse.
    pub document: &'a ProjectDocument,
}

/// The schematic model, built once from the root schematic and every sheet
/// it reaches.
pub struct SchematicModel<'a> {
    /// The root schematic's repository path: `config.root_schematic`.
    pub root: &'a str,
    /// The project file and every reached schematic, as the core reads them;
    /// the source paths are repository paths.
    pub bundle: &'a SourceBundle,
    /// The realized hierarchy.
    pub index: &'a SchematicBundleIndex,
    /// The compiled graph and netlist.
    pub facts: &'a KiCadDesignFacts<'a>,
}

/// The board.
pub struct BoardModel<'a> {
    /// Its repository path: `config.board`.
    pub path: &'a str,
    /// Its text as committed (stage parse never sees the refilled board).
    pub text: &'a str,
    /// The core's indexed view of it.
    pub view: &'a PcbView<'a>,
    /// Its S-expression tree, parsed once from [`BoardModel::text`] on first
    /// use by [`BoardModel::tree`] and shared by every producer that needs the
    /// tokens, so a bundle build parses the board at most once more than the
    /// view already does.
    tree: OnceLock<Result<Sexp, ProjectionError>>,
    /// The assembly footprint inputs, built once on first use by
    /// `semantic_index::assembly::state::footprints::board_footprints` and
    /// shared with `occurrences`, whose producer runs in parallel.
    pub(crate) assembly_footprints: OnceLock<
        Result<Arc<[crate::semantic_index::assembly::variants::FootprintInput]>, ProjectionError>,
    >,
}

impl<'a> BoardModel<'a> {
    /// A board model whose tree is not built yet.
    pub fn new(path: &'a str, text: &'a str, view: &'a PcbView<'a>) -> Self {
        Self {
            path,
            text,
            view,
            tree: OnceLock::new(),
            assembly_footprints: OnceLock::new(),
        }
    }

    /// The board's S-expression tree (`prism_kicad_core::parse`), parsed from
    /// [`BoardModel::text`] on first use and reused by every later caller.
    ///
    /// The fork parser is the one `stackup` and the system-interface outline
    /// used directly before, so the tokens are identical; the error carries
    /// only the parser's own message, so each caller keeps its own wording.
    pub fn tree(&self) -> Result<&Sexp, ProjectionError> {
        self.tree
            .get_or_init(|| {
                prism_kicad_core::parse(self.text)
                    .map_err(|error| ProjectionError::new(error.to_string()))
            })
            .as_ref()
            .map_err(ProjectionError::clone)
    }
}

/// Everything a producer may read: the single parse of one revision.
pub struct ProjectionInput<'a> {
    /// The effective configuration the bundle records.
    pub config: &'a RevisionKeyEffectiveConfigA1,
    /// The design revision key the build was given, if any.
    pub revision_key: Option<&'a str>,
    /// The source set, for producers that read further files.
    pub sources: &'a dyn Sources,
    /// The project file.
    pub project: &'a ProjectModel<'a>,
    /// The schematic model, when `config.root_schematic` is set and the core
    /// built it.
    pub schematic: Option<&'a SchematicModel<'a>>,
    /// The board, when `config.board` is set.
    pub board: Option<&'a BoardModel<'a>>,
    /// `design.json` (`kicad_monkey.design.a0`), when it was built.
    pub design: Option<&'a serde_json::Value>,
}

/// A producer warning for `stages.parse.warnings`.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct ProducerWarning {
    /// Stable kebab-case code from the projection's field map.
    pub code: String,
    /// One sentence; never a host path.
    pub message: String,
}

/// A produced document and its warnings.
#[derive(Clone, Debug)]
pub struct Produced<T> {
    /// The member's content.
    pub document: T,
    /// Warnings for the manifest.
    pub warnings: Vec<ProducerWarning>,
}

impl<T> Produced<T> {
    /// A document without warnings.
    pub fn new(document: T) -> Self {
        Self {
            document,
            warnings: Vec::new(),
        }
    }
}

/// Why a producer could not build its document from the model; recorded as
/// `projection-failed`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProjectionError {
    /// One sentence naming the projection and the cause; never a host path.
    pub message: String,
}

impl ProjectionError {
    /// An error with `message`.
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for ProjectionError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for ProjectionError {}

/// Decode a contract document from JSON (used by the empty forms).
pub(crate) fn document<T: DeserializeOwned>(
    name: &str,
    value: serde_json::Value,
) -> Result<Produced<T>, ProjectionError> {
    serde_json::from_value(value)
        .map(Produced::new)
        .map_err(|error| {
            ProjectionError::new(format!("{name}: the empty form does not decode: {error}"))
        })
}

#[cfg(test)]
pub(crate) mod test_support {
    use super::*;

    pub struct NoSources;

    impl Sources for NoSources {
        fn read(&self, _path: &str) -> Option<Arc<[u8]>> {
            None
        }

        fn exists(&self, _path: &str) -> bool {
            false
        }

        fn list(&self, _dir: &str, _suffixes: &[&str]) -> Vec<String> {
            Vec::new()
        }
    }

    /// A test source set over a fixed list of repository paths. It reads no
    /// bytes (a test that needs bytes builds them in), but answers `exists` and
    /// `list` like [`crate::Sources`]'s contract.
    #[derive(Default)]
    pub struct SetSources(pub std::collections::BTreeSet<String>);

    impl SetSources {
        /// The set of `paths`.
        pub fn of(paths: &[&str]) -> Self {
            Self(paths.iter().map(|path| (*path).to_owned()).collect())
        }
    }

    impl Sources for SetSources {
        fn read(&self, _path: &str) -> Option<Arc<[u8]>> {
            None
        }

        fn exists(&self, path: &str) -> bool {
            self.0.contains(path)
        }

        fn list(&self, dir: &str, suffixes: &[&str]) -> Vec<String> {
            let prefix = if dir.is_empty() {
                String::new()
            } else {
                format!("{dir}/")
            };
            let suffixes: Vec<String> = suffixes.iter().map(|s| s.to_ascii_lowercase()).collect();
            self.0
                .range(prefix.clone()..)
                .take_while(|path| path.starts_with(&prefix))
                .filter(|path| {
                    suffixes.is_empty() || {
                        let name = path.rsplit('/').next().unwrap_or(path);
                        let lowered = name.to_ascii_lowercase();
                        suffixes.iter().any(|suffix| lowered.ends_with(suffix))
                    }
                })
                .cloned()
                .collect()
        }
    }

    /// Run `check` with an input for a project that has no schematic and no
    /// board.
    pub fn with_bare_project(check: impl FnOnce(&ProjectionInput<'_>)) {
        let config: RevisionKeyEffectiveConfigA1 = serde_json::from_value(serde_json::json!({
            "schema": "prism.revision_key.effective_config.a1",
            "project_file": "dir/demo.kicad_pro",
            "excluded_dirs": [],
        }))
        .unwrap();
        let text = "{}";
        let document = ProjectDocument::parse(text.to_owned(), Default::default()).unwrap();
        let project = ProjectModel {
            path: "dir/demo.kicad_pro",
            text,
            document: &document,
        };
        let input = ProjectionInput {
            config: &config,
            revision_key: None,
            sources: &NoSources,
            project: &project,
            schematic: None,
            board: None,
            design: None,
        };
        check(&input);
    }
}
