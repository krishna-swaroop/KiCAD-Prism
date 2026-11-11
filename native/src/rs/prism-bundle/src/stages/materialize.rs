//! Complete analytic materialization of the board, its pack, and the
//! saved-versus-refilled zone-fill comparison. Moved from a1 (sim:
//! `src/prism-bundle/src/materialize.rs`); the operation bound now comes from
//! `max-materialization-operations` (cli-spec.md §7.2) and failures are the
//! content outcome `materialization-failed` (bundle-format.md §3.2).

use prism_kicad_contracts::generated::materialization_document::{
    BindingSourceKind, MaterialOperation, MaterializationDocumentA1,
};
use prism_kicad_contracts::generated::materialization_request::MaterializationRequestA0;
use prism_kicad_contracts::materialization_contract::validate_materialization_document;
use prism_kicad_core::board_materialization::materialize_project;
use prism_kicad_materialization_pack::{PackLimits, PackReader, encode_pack};
use std::collections::{BTreeMap, HashSet};

/// How a failure caused by `max-materialization-operations` begins: the
/// core's `MaterializationError` code. Such a failure is a limit (exit 4),
/// never the recorded `materialization-failed`.
pub const OPERATION_LIMIT: &str = "too_many_operations";

/// Default tile edge: 10 mm, in nanometres.
pub const DEFAULT_TILE_SIZE_NM: i64 = 10_000_000;

/// Every product the materializer knows; a bundle always holds all of them.
const ALL_PRODUCTS: [&str; 7] = [
    "components",
    "copper",
    "dielectric",
    "holes",
    "paste",
    "silkscreen",
    "solder_mask",
];

fn request(
    products: &[&str],
    tile_size_nm: i64,
    max_operations: u32,
) -> Result<MaterializationRequestA0, String> {
    let value = serde_json::json!({
        "type": "kicad_monkey.materialization.request",
        "version": "a0",
        "products": products,
        "tile_size_nm": tile_size_nm,
        "max_source_bytes": "4294967296",
        "max_operations": max_operations,
        "max_points": u32::MAX,
    });
    serde_json::from_value(value).map_err(|error| error.to_string())
}

fn materialize(
    board: &str,
    project: &str,
    products: &[&str],
    tile_size_nm: i64,
    max_operations: u32,
) -> Result<MaterializationDocumentA1, String> {
    let request = request(products, tile_size_nm, max_operations)?;
    let document =
        materialize_project(board, Some(project), &request).map_err(|error| error.to_string())?;
    validate_materialization_document(&document).map_err(|error| error.to_string())?;
    Ok(document)
}

/// The complete materialization and its bundle member.
#[derive(Debug)]
pub struct Materialized {
    /// Header document as re-read from the pack: stack, nets, net classes,
    /// diff pairs, components, binding, and chunk directory; no operations.
    pub header: MaterializationDocumentA1,
    /// Canonical packed encoding (`materialization/board.kmpack`).
    pub pack: Vec<u8>,
    /// Number of operations.
    pub operation_count: usize,
}

/// Materialize every product of `board`, encode the pack, and re-open it
/// so the bundle carries exactly what readers will see.
pub fn materialize_complete(
    board: &str,
    project: &str,
    tile_size_nm: i64,
    max_operations: u32,
) -> Result<Materialized, String> {
    let document = materialize(board, project, &ALL_PRODUCTS, tile_size_nm, max_operations)?;
    let operation_count = document.operations.len();
    let pack =
        encode_pack(&document).map_err(|error| format!("the pack does not encode: {error}"))?;
    drop(document);
    let header = PackReader::open(&pack, PackLimits::default())
        .map_err(|error| format!("the pack does not re-open: {error}"))?
        .header()
        .clone();
    Ok(Materialized {
        header,
        pack,
        operation_count,
    })
}

/// How the saved fills compare with a fresh refill.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FillComparison {
    /// Zone-fill operations materialized from the saved board.
    pub saved_operations: usize,
    /// Zone-fill operations materialized from the refilled board.
    pub refilled_operations: usize,
    /// Operations present in one and not the other (multiset difference).
    pub differing_operations: usize,
    /// Saved operations with no identical operation in the refill: the part
    /// of `differing_operations` a reader can relate to `saved_operations`.
    /// The `stale-saved-fills` warning should report this instead, but its
    /// text is part of the pinned bundle bytes, so the change waits for the
    /// next generator id.
    pub stale_saved_operations: usize,
}

impl FillComparison {
    /// True when the saved fills equal the refilled ones.
    #[must_use]
    pub fn matches(&self) -> bool {
        self.differing_operations == 0
    }
}

/// Canonical text of each copper zone-fill operation, counted.
fn fill_signatures(
    document: &MaterializationDocumentA1,
) -> Result<BTreeMap<String, usize>, String> {
    let fills: HashSet<u32> = document
        .binding
        .iter()
        .filter(|entry| entry.source_kind == BindingSourceKind::ZoneFill)
        .map(|entry| entry.operation_index)
        .collect();
    let mut signatures = BTreeMap::new();
    for operation in &document.operations {
        if let MaterialOperation::SurfaceOperation(surface) = operation
            && fills.contains(&surface.index)
        {
            let key = serde_json::to_string(&(
                &surface.slice_key,
                &surface.net_key,
                &surface.action,
                &surface.affine,
                &surface.shape,
            ))
            .map_err(|error| error.to_string())?;
            *signatures.entry(key).or_insert(0) += 1;
        }
    }
    Ok(signatures)
}

/// Compare the copper zone fills of the saved and refilled boards, after
/// materialization, so file formatting and format upgrades do not count.
pub fn compare_fills(
    saved: &str,
    refilled: &str,
    project: &str,
    max_operations: u32,
) -> Result<FillComparison, String> {
    let tile = DEFAULT_TILE_SIZE_NM;
    let saved = fill_signatures(&materialize(
        saved,
        project,
        &["copper"],
        tile,
        max_operations,
    )?)?;
    let refilled = fill_signatures(&materialize(
        refilled,
        project,
        &["copper"],
        tile,
        max_operations,
    )?)?;
    Ok(compare_signatures(&saved, &refilled))
}

/// Count how two multisets of fill signatures differ.
fn compare_signatures(
    saved: &BTreeMap<String, usize>,
    refilled: &BTreeMap<String, usize>,
) -> FillComparison {
    let stale_saved = saved
        .iter()
        .map(|(key, count)| count.saturating_sub(refilled.get(key).copied().unwrap_or(0)))
        .sum();
    let differing = saved
        .iter()
        .map(|(key, count)| count.abs_diff(refilled.get(key).copied().unwrap_or(0)))
        .chain(
            refilled
                .iter()
                .filter(|(key, _)| !saved.contains_key(*key))
                .map(|(_, count)| *count),
        )
        .sum();
    FillComparison {
        saved_operations: saved.values().sum(),
        refilled_operations: refilled.values().sum(),
        differing_operations: differing,
        stale_saved_operations: stale_saved,
    }
}

#[cfg(test)]
mod fill_comparison_tests {
    use super::*;

    fn signatures(keys: &[&str]) -> BTreeMap<String, usize> {
        let mut map = BTreeMap::new();
        for key in keys {
            *map.entry((*key).to_owned()).or_insert(0) += 1;
        }
        map
    }

    #[test]
    fn stale_saved_counts_only_the_saved_side() {
        // 13 saved, 13 refilled, one shared: 12 stale on each side.
        let saved_keys: Vec<String> = (0..12).map(|i| format!("old{i}")).collect();
        let refilled_keys: Vec<String> = (0..12).map(|i| format!("new{i}")).collect();
        let mut saved: Vec<&str> = saved_keys.iter().map(String::as_str).collect();
        let mut refilled: Vec<&str> = refilled_keys.iter().map(String::as_str).collect();
        saved.push("same");
        refilled.push("same");

        let comparison = compare_signatures(&signatures(&saved), &signatures(&refilled));
        assert_eq!(comparison.saved_operations, 13);
        assert_eq!(comparison.refilled_operations, 13);
        assert_eq!(comparison.differing_operations, 24);
        assert_eq!(comparison.stale_saved_operations, 12);
        assert!(!comparison.matches());
    }

    #[test]
    fn duplicate_signatures_are_counted_as_a_multiset() {
        let comparison =
            compare_signatures(&signatures(&["a", "a", "b"]), &signatures(&["a", "b", "b"]));
        assert_eq!(comparison.differing_operations, 2);
        assert_eq!(comparison.stale_saved_operations, 1);
    }
}
