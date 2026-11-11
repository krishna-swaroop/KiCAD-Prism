//! A board decoded and emitted once, answering any number of requests.
//!
//! Preparation emits the complete board. Each request then keeps the
//! operations its scope selects, in emission order, and chunks them with
//! the request's tile size. Rule 2 makes that the same document
//! [`super::materialize_board`] returns for the request.

use super::producer::{Emitted, emit_board};
use super::{
    IMPLEMENTED, MaterializationError, SourceIdentity, assemble, error, too_many_operations,
    validate_request,
};
use prism_kicad_contracts::generated::materialization_document::{
    MaterialProduct, MaterializationDocumentA1, MaterializationScope,
};
use prism_kicad_contracts::generated::materialization_request::MaterializationRequestA0;
use prism_kicad_contracts::materialization_contract::{ScopeFilter, scope_from_request};
use std::collections::BTreeMap;

/// Bounds on preparing a board, which emits every product at once.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PrepareLimits {
    /// Largest accepted source, in bytes.
    pub max_source_bytes: u64,
    /// Most operations the complete board may emit.
    pub max_operations: usize,
}

/// One board source, decoded and emitted once.
///
/// For every request, [`Self::materialize`] returns exactly what
/// [`super::materialize_board`] returns for the same source and request,
/// except that source errors (parse failures, a board without copper
/// layers) are reported once, by [`Self::prepare`]. Holding the complete
/// emission costs memory proportional to the complete document.
pub struct PreparedBoard {
    identity: SourceIdentity,
    complete: Emitted,
}

impl PreparedBoard {
    /// Decode `source` and emit every product.
    pub fn prepare(source: &str, limits: &PrepareLimits) -> Result<Self, MaterializationError> {
        Self::prepare_project(source, None, limits)
    }

    /// [`Self::prepare`] with the board's `.kicad_pro` project file, which
    /// supplies net classes. `max_source_bytes` bounds both files together.
    pub fn prepare_project(
        source: &str,
        project: Option<&str>,
        limits: &PrepareLimits,
    ) -> Result<Self, MaterializationError> {
        let identity = SourceIdentity::of(source, project);
        if u64::try_from(identity.total_bytes())
            .map_or(true, |length| length > limits.max_source_bytes)
        {
            return Err(error(
                "source_too_large",
                format!(
                    "source exceeds max_source_bytes ({})",
                    limits.max_source_bytes
                ),
            ));
        }
        let complete = emit_board(source, project, &IMPLEMENTED, Some(limits.max_operations))?;
        if complete.emitter.overflowed {
            return Err(too_many_operations(limits.max_operations));
        }
        Ok(Self { identity, complete })
    }

    /// The materialization `request` selects from this board.
    pub fn materialize(
        &self,
        request: &MaterializationRequestA0,
    ) -> Result<MaterializationDocumentA1, MaterializationError> {
        validate_request(self.identity.total_bytes(), request)?;
        let scope = scope_from_request(request);
        assemble(
            selected(&self.complete, &scope),
            &self.identity,
            &scope,
            request,
        )
    }
}

/// Stack order of each slice key, for scope filtering.
fn slice_order(emitted: &Emitted) -> BTreeMap<String, u32> {
    emitted
        .stack
        .slices
        .iter()
        .map(|slice| (slice.key.clone(), slice.order))
        .collect()
}

/// The part of `emitted` that `scope` keeps, in emission order: its
/// operations, their binding re-pointed, component records when requested,
/// and the diagnostics of no product or a requested one.
pub(super) fn selected(emitted: &Emitted, scope: &MaterializationScope) -> Emitted {
    let order = slice_order(emitted);
    let filter = ScopeFilter::new(scope, &order);
    let keep: Vec<bool> = emitted
        .emitter
        .operations
        .iter()
        .map(|operation| filter.keeps(operation))
        .collect();
    let mut narrowed = Emitted {
        stack: emitted.stack.clone(),
        nets: emitted.nets.clone(),
        net_classes: emitted.net_classes.clone(),
        diff_pairs: emitted.diff_pairs.clone(),
        components: Vec::new(),
        design_facts: emitted.design_facts.clone(),
        emitter: Default::default(),
    };
    narrowed.emitter.operations = emitted
        .emitter
        .operations
        .iter()
        .zip(&keep)
        .filter(|(_, kept)| **kept)
        .map(|(operation, _)| operation.clone())
        .collect();
    if filter.keeps_product(MaterialProduct::Components) {
        narrowed.components = emitted.components.clone();
    }
    let new_index = renumbered(&keep);
    narrowed.emitter.binding = emitted
        .emitter
        .binding
        .iter()
        .filter_map(|entry| {
            let index = *new_index.get(usize::try_from(entry.operation_index).ok()?)?;
            let mut entry = entry.clone();
            entry.operation_index = index?;
            Some(entry)
        })
        .collect();
    narrowed.emitter.diagnostics = emitted
        .emitter
        .diagnostics
        .iter()
        .filter(|diagnostic| {
            diagnostic
                .product
                .is_none_or(|product| filter.keeps_product(product))
        })
        .cloned()
        .collect();
    narrowed
}

/// The new index of each kept operation, `None` for a dropped one.
fn renumbered(keep: &[bool]) -> Vec<Option<u32>> {
    let mut next = 0u32;
    keep.iter()
        .map(|kept| {
            kept.then(|| {
                let index = next;
                next = next.saturating_add(1);
                index
            })
        })
        .collect()
}
