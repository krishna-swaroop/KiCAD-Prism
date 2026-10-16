//! `projections/semantic-index.json` (`prism.semantic_index.a1`), WP-P1.
//!
//! A port of today's `backend/app/services/semantic_index_service.py`
//! (`build_semantic_index`), `semantic_index_nets.py`,
//! `semantic_index_variants.py` and `variant_catalog_service.py`. The rules
//! for every field, and the expected divergences, are in
//! `native/contracts/prism/field-maps/semantic-index.md`; the parity goldens
//! are `native/parity/goldens/<case>/semantic-index.json`.
//!
//! The build runs in today's order, one submodule per pass, all writing one
//! [`State`]:
//!
//! 1. [`sheets`]: sheet instances, buses and the source-uuid placements
//!    (`_schematic_semantic_projection`);
//! 2. [`fields`]: the placed-symbol field scan (`_schematic_instance_fields`);
//! 3. [`components`]: components from `design.json`;
//! 4. [`nets`]: schematic nets and terminals from `design.json`
//!    (`_group_schematic_refs` and the netlist pass);
//! 5. [`board`]: footprints, pads, tracks, arcs, vias and zones, then
//!    [`reconcile`] (`semantic_index_nets.py`);
//! 6. [`assembly`]: the variant catalog, the assembly state and its join onto
//!    the components (`assemble_semantic_index`).

mod assembly;
mod board;
mod components;
mod fields;
mod nets;
mod reconcile;
mod sheets;
mod state;

use crate::{Produced, ProjectionError, ProjectionInput, document};
use prism_kicad_contracts::generated::prism_semantic_index_a1::SemanticIndexA1;
use serde_json::Value;
pub(crate) use state::{Placement, Placements, State, stable_uid, string};

/// The member's schema id.
pub const SCHEMA: &str = "prism.semantic_index.a1";
const NAME: &str = "projections/semantic-index.json";

/// Build `projections/semantic-index.json` from the single parse of the revision.
pub fn produce(input: &ProjectionInput<'_>) -> Result<Produced<SemanticIndexA1>, ProjectionError> {
    // A build without `--revision-key` has no key; the all-zero key stands in
    // for it (local and test builds only, cli-spec.md §5.2.2).
    let key = input
        .revision_key
        .map_or_else(|| "0".repeat(64), str::to_owned);
    let (Some(schematic), Some(design)) = (input.schematic, input.design) else {
        if input.config.root_schematic.is_some() {
            return Err(ProjectionError::new(format!(
                "{NAME}: the schematic model could not be built"
            )));
        }
        return document(NAME, empty_form(&key));
    };
    let mut state = State::default();
    let placements = sheets::project(input, schematic, &mut state)?;
    let source_fields = fields::scan(input, schematic)?;
    components::project(design, &source_fields, &mut state);
    nets::project(design, &placements, &mut state);
    if let Some(board) = input.board {
        let mut claims = reconcile::SplitNetClaims::new(&state);
        board::project(board, &mut state, &mut claims)?;
        claims.reconcile(&mut state);
    }
    let assembly = assembly::build(input, schematic, &state, &placements)?;
    let mut value = state.into_document(&key);
    value["assembly"] = assembly;
    serde_json::from_value(value)
        .map(Produced::new)
        .map_err(|error| ProjectionError::new(format!("{NAME}: {error}")))
}

fn empty_form(key: &str) -> Value {
    let mut value = State::default().into_document(key);
    value["assembly"] = assembly::empty();
    value
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_empty_form_decodes() {
        crate::test_support::with_bare_project(|input| {
            let produced = super::produce(input).unwrap();
            let value = serde_json::to_value(&produced.document).unwrap();
            assert_eq!(value["schema"], super::SCHEMA);
            assert_eq!(value["assembly"]["schema"], "prism.assembly_state_a0");
        });
    }

    #[test]
    fn stable_uid_matches_today() {
        // Vectors from `_stable_uid` (semantic_index_service.py:358-361): parts
        // joined by U+001F, a missing part hashes as "", no separator for one part.
        use super::stable_uid;
        assert_eq!(stable_uid("net", &["GND"]), "net:ccdd8d41edbac58e6d53");
        assert_eq!(stable_uid("cmp", &["R1", ""]), "cmp:3e661ccfd941c00e1f0f");
        assert_eq!(stable_uid("cmp", &["R1"]), "cmp:a791366f6f6201254edc");
        assert_eq!(
            stable_uid("term", &["U1", "5"]),
            "term:e4b346d426274cc821b9"
        );
        assert_eq!(
            stable_uid("sheet-instance", &["/", "oracle.kicad_sch"]),
            "sheet-instance:b0b571a586b4a97f4dc7"
        );
    }
}
