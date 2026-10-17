//! The parse stage's projection producers and how they run: all at once,
//! with `design.json` built beside them (amendment C2r §2 item 8).
//!
//! The semantic index stays typed (`SemanticIndexA2`) until every producer
//! has finished: its `designKey` covers the whole read set, so stage parse
//! sets the field and serializes the member once, after the run
//! (bundle-format.md §2.3).

use super::design;
use super::parse::Design;
use crate::manifest::{DESIGN_PATH, PROJECTIONS};
use prism_kicad_contracts::generated::prism_semantic_index_a2::SemanticIndexA2;
use prism_projections::Produced;
use serde_json::Value;

/// One producer's output.
pub(super) enum ProjectionResult {
    /// A document already kept as JSON, as the other seven producers build it.
    Json {
        /// The document.
        value: Value,
        /// Its recorded warnings.
        warnings: Vec<prism_projections::ProducerWarning>,
    },
    /// The semantic index, still typed.
    SemanticIndex {
        /// The document; stage parse sets `designKey` before serializing it.
        document: Box<SemanticIndexA2>,
        /// Its recorded warnings.
        warnings: Vec<prism_projections::ProducerWarning>,
    },
}

type Producer = fn(
    &prism_projections::ProjectionInput<'_>,
) -> Result<(Value, Vec<prism_projections::ProducerWarning>), String>;

type SemanticProducer = fn(
    &prism_projections::ProjectionInput<'_>,
)
    -> Result<Produced<SemanticIndexA2>, prism_projections::ProjectionError>;

#[derive(Clone, Copy)]
enum ProducerKind {
    Json(Producer),
    Semantic(SemanticProducer),
}

fn produced<T: serde::Serialize>(
    result: Result<Produced<T>, prism_projections::ProjectionError>,
) -> Result<(Value, Vec<prism_projections::ProducerWarning>), String> {
    let produced = result.map_err(|error| error.message)?;
    let value = serde_json::to_value(&produced.document).map_err(|error| error.to_string())?;
    Ok((value, produced.warnings))
}

fn semantic(
    result: Result<Produced<SemanticIndexA2>, prism_projections::ProjectionError>,
) -> Result<ProjectionResult, String> {
    let produced = result.map_err(|error| error.message)?;
    Ok(ProjectionResult::SemanticIndex {
        document: Box::new(produced.document),
        warnings: produced.warnings,
    })
}

fn board_objects(
    input: &prism_projections::ProjectionInput<'_>,
) -> Result<(Value, Vec<prism_projections::ProducerWarning>), String> {
    produced(prism_projections::board_objects::produce(input))
}

fn occurrences(
    input: &prism_projections::ProjectionInput<'_>,
) -> Result<(Value, Vec<prism_projections::ProducerWarning>), String> {
    produced(prism_projections::occurrences::produce(input))
}

fn placements(
    input: &prism_projections::ProjectionInput<'_>,
) -> Result<(Value, Vec<prism_projections::ProducerWarning>), String> {
    produced(prism_projections::placements::produce(input))
}

fn project(
    input: &prism_projections::ProjectionInput<'_>,
) -> Result<(Value, Vec<prism_projections::ProducerWarning>), String> {
    produced(prism_projections::project::produce(input))
}

fn route_metrics(
    input: &prism_projections::ProjectionInput<'_>,
) -> Result<(Value, Vec<prism_projections::ProducerWarning>), String> {
    produced(prism_projections::route_metrics::produce(input))
}

fn semantic_index(
    input: &prism_projections::ProjectionInput<'_>,
) -> Result<Produced<SemanticIndexA2>, prism_projections::ProjectionError> {
    prism_projections::semantic_index::produce(input)
}

fn stackup(
    input: &prism_projections::ProjectionInput<'_>,
) -> Result<(Value, Vec<prism_projections::ProducerWarning>), String> {
    produced(prism_projections::stackup::produce(input))
}

fn system_interface(
    input: &prism_projections::ProjectionInput<'_>,
) -> Result<(Value, Vec<prism_projections::ProducerWarning>), String> {
    produced(prism_projections::system_interface::produce(input))
}

const PRODUCERS: [ProducerKind; 8] = [
    ProducerKind::Json(board_objects),
    ProducerKind::Json(occurrences),
    ProducerKind::Json(placements),
    ProducerKind::Json(project),
    ProducerKind::Json(route_metrics),
    ProducerKind::Semantic(semantic_index),
    ProducerKind::Json(stackup),
    ProducerKind::Json(system_interface),
];

impl ProducerKind {
    fn run(
        self,
        input: &prism_projections::ProjectionInput<'_>,
    ) -> Result<ProjectionResult, String> {
        match self {
            Self::Json(producer) => {
                producer(input).map(|(value, warnings)| ProjectionResult::Json { value, warnings })
            }
            Self::Semantic(producer) => semantic(producer(input)),
        }
    }
}

/// What [`PRODUCERS`] and `design.json` give: `design.json` (absent without
/// a schematic model, or when the semantic index is not wanted) and each
/// producer's result, in [`PROJECTIONS`] order (`None` for a producer that is
/// not wanted).
pub(super) type ProducerResults = (
    Option<Result<Value, String>>,
    Vec<Option<Result<ProjectionResult, String>>>,
);

/// Run the producers at once, and build `design.json` beside them. Only the
/// semantic index reads `design.json`, so it starts once that exists. The
/// producers only read their input; their results come back in
/// [`PROJECTIONS`] order, so nothing recorded depends on which finished first.
pub(super) fn run(
    input: &prism_projections::ProjectionInput<'_>,
    design_inputs: Option<(
        &prism_kicad_core::SchematicBundleIndex,
        &prism_kicad_core::KiCadDesignFacts<'_>,
    )>,
    design: &Design,
    design_board: Option<(&str, &prism_kicad_core::PcbView<'_>)>,
    wanted: &(dyn Fn(&str) -> bool + Sync),
) -> ProducerResults {
    std::thread::scope(|scope| {
        let joined = |handle: std::thread::ScopedJoinHandle<'_, _>| {
            handle
                .join()
                .unwrap_or_else(|panic| std::panic::resume_unwind(panic))
        };
        // Only the semantic index reads `design.json`; it starts once
        // `design.json` exists, the others at once.
        let semantic = PROJECTIONS
            .iter()
            .position(|(path, _)| *path == "projections/semantic-index.json");
        let semantic = semantic.filter(|index| wanted(PROJECTIONS[*index].0));
        let handles: Vec<_> = PRODUCERS
            .into_iter()
            .zip(PROJECTIONS)
            .enumerate()
            .map(|(index, (producer, (path, _)))| {
                if Some(index) == semantic || !wanted(path) {
                    None
                } else {
                    Some(scope.spawn(move || producer.run(input)))
                }
            })
            .collect();
        // A run that does not write `design.json` (`compare`) builds only the
        // `components` and `nets` the semantic index reads; its failure is
        // still reported as `design.json`'s.
        let full = wanted(DESIGN_PATH);
        let design_json = design_inputs
            .filter(|_| semantic.is_some())
            .map(|(index, facts)| {
                if full {
                    design::design_json(index, facts, &design.project, &design.sheets, design_board)
                } else {
                    design::semantic_inputs(index, facts)
                }
            });
        let with_design = prism_projections::ProjectionInput {
            design: design_json.as_ref().and_then(|built| built.as_ref().ok()),
            ..*input
        };
        let semantic_result = semantic.map(|index| PRODUCERS[index].run(&with_design));
        let mut semantic_result = semantic_result;
        let results = handles
            .into_iter()
            .enumerate()
            .map(|(index, handle)| match handle {
                Some(handle) => Some(joined(handle)),
                None if Some(index) == semantic => semantic_result.take(),
                None => None,
            })
            .collect();
        let design_json = design_json.filter(|built| full || built.is_err());
        (design_json, results)
    })
}
