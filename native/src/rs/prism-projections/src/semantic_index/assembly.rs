//! Pass 6: `assembly`, a port of `assemble_semantic_index`
//! (semantic_index_variants.py:1040-1071): the catalog
//! (variant_catalog_service.py), the state (`build_assembly_state`,
//! semantic_index_variants.py:752-903) and the join onto the components
//! (`_project_onto_components`, :948-1037).

mod catalog;
mod scan;

use super::{Placements, State};
use crate::{ProjectionError, ProjectionInput, SchematicModel};
use serde_json::{Value, json};

/// The contract's empty `assembly`.
pub(super) fn empty() -> Value {
    json!({
        "schema": "prism.assembly_state_a0",
        "catalog": [],
        "footprintInventory": [],
        "default": {"occurrences": {}, "components": {}, "footprints": {}},
        "variants": [],
        "diagnostics": [],
    })
}

/// Build `assembly` for the revision.
pub(super) fn build(
    input: &ProjectionInput<'_>,
    _schematic: &SchematicModel<'_>,
    _state: &State,
    _placements: &Placements,
) -> Result<Value, ProjectionError> {
    let catalog = catalog::discover(input)?;
    let mut value = empty();
    value["catalog"] = Value::Array(catalog.entries);
    value["diagnostics"] = Value::Array(catalog.diagnostics);
    Ok(value)
}
