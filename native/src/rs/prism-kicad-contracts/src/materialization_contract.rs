//! Semantic validation for the analytic board materialization document.
//!
//! Structural decoding already enforces field presence, enum values, and the
//! literal `kind` of every shape, segment, and operation. This module checks
//! what decoding does not:
//!
//! - the schema's own ranges and lengths that the generated Rust types do
//!   not carry: every `NonNegativeNm` is in `0..=i32::MAX`, and contours and
//!   swept paths have segments;
//! - cross-record rules: dense operation indices, known slice and net
//!   references, materials on slices of their role, conductive net
//!   ownership, operations inside the recorded scope, the canonical scope,
//!   chunk order, tiles, nets, and coverage, binding order, and bounds that
//!   hold their shape.
//!
//! [`validate_materialization_header`] checks the operation-independent part,
//! for readers (such as the pack header) that see the chunk directory before
//! any operation.
//!
//! Decode documents through [`decode_materialization_document`]. The
//! workspace enables serde_json's `arbitrary_precision`, under which numbers
//! buffered inside untagged unions do not decode straight from text; the
//! decoder parses to a `Value` first, which does.

mod chunking;
mod design_facts;
mod records;
mod scope;
mod shapes;
mod stack;

use crate::generated::materialization_document::{
    Affine2D, ChunkEntry, HoleOperation, HolePlating, MaterialOperation, MaterialProduct,
    MaterializationDocumentA1, MaterializationScope, NmBounds, NonNegativeNm, Shape2d, SliceRole,
    SurfaceMaterial, SurfaceOperation,
};
use crate::{ValidationError, validation_error};
pub use chunking::{
    ChunkedOperations, chunk_operations, operation_bounds, operation_net, operation_product,
    operation_slice,
};
use scope::{ALL_PRODUCTS, intersects};
pub use scope::{ScopeFilter, canonical_scope, filter_document, scope_from_request};
use shapes::{check_bounds_hold_shape, in_length_range, validate_shape};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

/// Reject a `kind` that differs from the expected literal.
fn expect_kind<'de, D>(deserializer: D, expected: &'static str) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = <String as serde::Deserialize>::deserialize(deserializer)?;
    if value == expected {
        Ok(value)
    } else {
        Err(serde::de::Error::custom(format!(
            "expected kind {expected}"
        )))
    }
}

macro_rules! kind_deserializers {
    ($($name:ident => $expected:literal),+ $(,)?) => {
        $(
            #[doc(hidden)]
            pub fn $name<'de, D>(deserializer: D) -> Result<String, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                expect_kind(deserializer, $expected)
            }
        )+
    };
}

// Exact-kind deserializers referenced by the generated module.
kind_deserializers! {
    deserialize_disk_2d_kind => "disk_2d",
    deserialize_rect_2d_kind => "rect_2d",
    deserialize_rounded_rect_2d_kind => "rounded_rect_2d",
    deserialize_chamfered_rect_2d_kind => "chamfered_rect_2d",
    deserialize_trapezoid_2d_kind => "trapezoid_2d",
    deserialize_capsule_2d_kind => "capsule_2d",
    deserialize_annulus_2d_kind => "annulus_2d",
    deserialize_swept_path_2d_kind => "swept_path_2d",
    deserialize_planar_region_2d_kind => "planar_region_2d",
    deserialize_line_segment_kind => "line",
    deserialize_arc_segment_kind => "arc",
    deserialize_cubic_segment_kind => "cubic",
    deserialize_surface_operation_kind => "surface",
    deserialize_hole_operation_kind => "hole",
}

/// Schema id of the documents this crate's producer writes.
pub const MATERIALIZATION_SCHEMA_A1: &str = "kicad_monkey.materialization.a1";
/// Schema id of a0 documents, which a1 readers still read.
pub const MATERIALIZATION_SCHEMA_A0: &str = "kicad_monkey.materialization.a0";
/// Every schema id a reader of this crate accepts, newest first.
pub const MATERIALIZATION_SCHEMAS: [&str; 2] =
    [MATERIALIZATION_SCHEMA_A1, MATERIALIZATION_SCHEMA_A0];
const TYPE: &str = "kicad_monkey.materialization.document";
const NM_MAX: i64 = i32::MAX as i64;

/// Known slices (with their order and role) and net keys of one document.
struct Keys<'a> {
    slices: BTreeMap<&'a str, (u32, SliceRole)>,
    nets: BTreeSet<&'a str>,
}

impl Keys<'_> {
    fn order(&self, key: &str) -> Option<u32> {
        self.slices.get(key).map(|(order, _)| *order)
    }
}

/// Decode JSON bytes, a1 or a0, and enforce the semantic rules of their
/// version.
pub fn decode_materialization_document(
    source: &[u8],
) -> Result<MaterializationDocumentA1, MaterializationDecodeError> {
    let value: serde_json::Value =
        serde_json::from_slice(source).map_err(MaterializationDecodeError::Transport)?;
    let document: MaterializationDocumentA1 =
        serde_json::from_value(value).map_err(MaterializationDecodeError::Transport)?;
    validate_materialization_document(&document).map_err(MaterializationDecodeError::Validation)?;
    Ok(document)
}

/// Failure to decode or validate a materialization document.
#[derive(Debug)]
pub enum MaterializationDecodeError {
    Transport(serde_json::Error),
    Validation(ValidationError),
}

impl fmt::Display for MaterializationDecodeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Transport(error) => write!(formatter, "materialization transport: {error}"),
            Self::Validation(error) => write!(formatter, "materialization validation: {error}"),
        }
    }
}

impl std::error::Error for MaterializationDecodeError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Transport(error) => Some(error),
            Self::Validation(error) => Some(error),
        }
    }
}

/// Enforce every rule of `kicad_monkey.materialization.a1`, or of a0 for an
/// a0 document.
pub fn validate_materialization_document(
    document: &MaterializationDocumentA1,
) -> Result<(), ValidationError> {
    let keys = validate_header(document)?;
    let total: u64 = document
        .chunks
        .iter()
        .map(|chunk| u64::from(chunk.operation_count))
        .sum();
    if usize::try_from(total).ok() != Some(document.operations.len()) {
        return Err(validation_error(
            "uncovered_operations",
            "$.chunks",
            "every operation belongs to exactly one chunk",
        ));
    }
    for (position, operation) in document.operations.iter().enumerate() {
        validate_operation(position, operation, &document.scope, &keys)?;
    }
    validate_binding_nets(document)?;
    for (position, chunk) in document.chunks.iter().enumerate() {
        check_chunk_members(document, chunk, position)?;
    }
    Ok(())
}

/// Enforce the rules that hold without operations: identity, scope, stack,
/// nets, components, diagnostics, the chunk directory, and binding order.
/// The operation count is taken from the chunk directory, and
/// `operations` itself is ignored.
pub fn validate_materialization_header(
    document: &MaterializationDocumentA1,
) -> Result<(), ValidationError> {
    validate_header(document).map(|_| ())
}

fn validate_header(document: &MaterializationDocumentA1) -> Result<Keys<'_>, ValidationError> {
    let a1 = validate_identity(document)?;
    validate_scope(&document.scope)?;
    let keys = collect_keys(document)?;
    design_facts::validate_design_facts(document, &keys, a1)?;
    stack::validate_regions(&document.stack, &keys)?;
    validate_nets(document, &keys)?;
    records::validate_net_classes(document)?;
    validate_components(document)?;
    validate_diagnostics(document)?;
    let total = validate_chunk_directory(document, &keys)?;
    validate_binding_order(document, total)?;
    records::validate_binding_records(document, &keys)?;
    Ok(keys)
}

/// The identity is a1's or a0's, with the fixed coordinate system. Returns
/// whether the document is a1.
fn validate_identity(document: &MaterializationDocumentA1) -> Result<bool, ValidationError> {
    let system = &document.coordinate_system;
    let version = match document.schema.as_str() {
        MATERIALIZATION_SCHEMA_A1 => "a1",
        MATERIALIZATION_SCHEMA_A0 => "a0",
        _ => "",
    };
    if version.is_empty()
        || document.type_ != TYPE
        || document.version != version
        || system.unit != "nm"
        || system.x_axis != "board_right"
        || system.y_axis != "board_down"
    {
        return Err(validation_error(
            "unsupported_contract",
            "$",
            "materialization identity and coordinate system must match a1 or a0",
        ));
    }
    Ok(version == "a1")
}

fn strictly_ascending<T: Ord>(values: &[T]) -> bool {
    values.windows(2).all(|pair| pair[0] < pair[1])
}

/// The scope is canonical (sorted, distinct lists) and `complete` is true
/// exactly when every product is named with no slice, net, or region filter.
fn validate_scope(scope: &MaterializationScope) -> Result<(), ValidationError> {
    if scope.products.is_empty() {
        return Err(validation_error(
            "empty_scope",
            "$.scope.products",
            "a materialization names at least one product",
        ));
    }
    check_canonical_scope(scope)?;
    if *scope.tile_size_nm <= 0 || *scope.tile_size_nm > NM_MAX {
        return Err(validation_error(
            "invalid_tile_size",
            "$.scope.tile_size_nm",
            "tile size is a positive 32-bit nanometre length",
        ));
    }
    if let Some(region) = &scope.region {
        validate_bounds(region, "$.scope.region")?;
    }
    Ok(())
}

fn check_canonical_scope(scope: &MaterializationScope) -> Result<(), ValidationError> {
    if !strictly_ascending(&scope.products)
        || !strictly_ascending(&scope.slice_keys)
        || !strictly_ascending(&scope.net_keys)
    {
        return Err(validation_error(
            "noncanonical_scope",
            "$.scope",
            "scope products, slice keys, and net keys are sorted and distinct",
        ));
    }
    let unfiltered =
        scope.slice_keys.is_empty() && scope.net_keys.is_empty() && scope.region.is_none();
    let everything = ALL_PRODUCTS
        .iter()
        .all(|product| scope.products.contains(product));
    if scope.complete != (unfiltered && everything) {
        return Err(validation_error(
            "inconsistent_scope",
            "$.scope.complete",
            "complete is true exactly when every product is named without filters",
        ));
    }
    Ok(())
}

fn check_length(value: i64, path: &str) -> Result<(), ValidationError> {
    if in_length_range(value) {
        return Ok(());
    }
    Err(validation_error(
        "invalid_length",
        path.to_owned(),
        "lengths are non-negative 32-bit nanometre values",
    ))
}

fn check_optional_length(value: Option<&NonNegativeNm>, path: &str) -> Result<(), ValidationError> {
    value.map_or(Ok(()), |value| check_length(**value, path))
}

fn collect_keys(document: &MaterializationDocumentA1) -> Result<Keys<'_>, ValidationError> {
    check_optional_length(
        document.stack.board_thickness_nm.as_ref(),
        "$.stack.board_thickness_nm",
    )?;
    let mut slices = BTreeMap::new();
    for (position, slice) in document.stack.slices.iter().enumerate() {
        let path = format!("$.stack.slices[{position}]");
        if usize::try_from(slice.order).ok() != Some(position) {
            return Err(validation_error(
                "invalid_slice_order",
                format!("{path}.order"),
                "slices are listed front to back with dense orders",
            ));
        }
        check_optional_length(slice.thickness_nm.as_ref(), &format!("{path}.thickness_nm"))?;
        if slices
            .insert(slice.key.as_str(), (slice.order, slice.role))
            .is_some()
        {
            return Err(validation_error(
                "duplicate_slice",
                format!("{path}.key"),
                "slice keys are unique",
            ));
        }
    }
    let mut nets = BTreeSet::new();
    for (position, net) in document.nets.iter().enumerate() {
        if !nets.insert(net.key.as_str()) {
            return Err(validation_error(
                "duplicate_net",
                format!("$.nets[{position}].key"),
                "net keys are unique",
            ));
        }
    }
    Ok(Keys { slices, nets })
}

fn validate_nets(
    document: &MaterializationDocumentA1,
    keys: &Keys<'_>,
) -> Result<(), ValidationError> {
    for (position, class) in document.net_classes.iter().enumerate() {
        let path = format!("$.net_classes[{position}]");
        for (field, value) in [
            ("track_width_nm", &class.track_width_nm),
            ("clearance_nm", &class.clearance_nm),
            ("diff_pair_width_nm", &class.diff_pair_width_nm),
            ("diff_pair_gap_nm", &class.diff_pair_gap_nm),
            ("via_diameter_nm", &class.via_diameter_nm),
            ("via_drill_nm", &class.via_drill_nm),
        ] {
            check_optional_length(value.as_ref(), &format!("{path}.{field}"))?;
        }
    }
    let classes: BTreeSet<&str> = document
        .net_classes
        .iter()
        .map(|c| c.name.as_str())
        .collect();
    for (position, net) in document.nets.iter().enumerate() {
        if net
            .net_class
            .as_deref()
            .is_some_and(|name| !classes.contains(name))
        {
            return Err(validation_error(
                "unknown_net_class",
                format!("$.nets[{position}].net_class"),
                "a net's class is listed in net_classes",
            ));
        }
    }
    for (position, pair) in document.diff_pairs.iter().enumerate() {
        let known = keys.nets.contains(pair.positive_net_key.as_str())
            && keys.nets.contains(pair.negative_net_key.as_str());
        if !known || pair.positive_net_key == pair.negative_net_key {
            return Err(validation_error(
                "invalid_diff_pair",
                format!("$.diff_pairs[{position}]"),
                "a differential pair names two distinct known nets",
            ));
        }
    }
    Ok(())
}

/// Product membership of a record outside the scope's products.
fn out_of_scope(path: String) -> ValidationError {
    validation_error(
        "out_of_scope",
        path,
        "records belong to a product, slice, net, and region of the scope",
    )
}

fn validate_components(document: &MaterializationDocumentA1) -> Result<(), ValidationError> {
    let named = document
        .scope
        .products
        .contains(&MaterialProduct::Components);
    if !document.components.is_empty() && !named {
        return Err(out_of_scope("$.components".to_owned()));
    }
    for (position, component) in document.components.iter().enumerate() {
        let path = format!("$.components[{position}]");
        validate_affine(&component.affine, &format!("{path}.affine"))?;
        if let Some(bounds) = &component.body_bounds {
            validate_bounds(bounds, &format!("{path}.body_bounds"))?;
        }
        check_optional_length(
            component.body_height_nm.as_ref(),
            &format!("{path}.body_height_nm"),
        )?;
        records::validate_pad_groups(component, &path)?;
    }
    Ok(())
}

fn validate_diagnostics(document: &MaterializationDocumentA1) -> Result<(), ValidationError> {
    for (position, diagnostic) in document.diagnostics.iter().enumerate() {
        if diagnostic
            .product
            .is_some_and(|product| !document.scope.products.contains(&product))
        {
            return Err(out_of_scope(format!("$.diagnostics[{position}].product")));
        }
    }
    Ok(())
}

fn role_of(material: SurfaceMaterial) -> SliceRole {
    match material {
        SurfaceMaterial::Copper => SliceRole::Conductor,
        SurfaceMaterial::Dielectric => SliceRole::Dielectric,
        SurfaceMaterial::SolderMask => SliceRole::SolderMask,
        SurfaceMaterial::Paste => SliceRole::Paste,
        SurfaceMaterial::Silkscreen => SliceRole::Silkscreen,
    }
}

fn validate_operation(
    position: usize,
    operation: &MaterialOperation,
    scope: &MaterializationScope,
    keys: &Keys<'_>,
) -> Result<(), ValidationError> {
    let path = format!("$.operations[{position}]");
    match operation {
        MaterialOperation::SurfaceOperation(surface) => {
            check_index(surface.index, position, &path)?;
            validate_surface(surface, keys, &path)?;
        }
        MaterialOperation::HoleOperation(hole) => {
            check_index(hole.index, position, &path)?;
            validate_hole(hole, keys, &path)?;
        }
    }
    check_in_scope(operation, scope, keys, &path)
}

/// The operation's product is named, it lies on a selected slice (a hole
/// spans one), it carries a selected net, and it meets the region.
fn check_in_scope(
    operation: &MaterialOperation,
    scope: &MaterializationScope,
    keys: &Keys<'_>,
    path: &str,
) -> Result<(), ValidationError> {
    let product = scope.products.contains(&operation_product(operation));
    let selected: BTreeSet<u32> = scope
        .slice_keys
        .iter()
        .filter_map(|key| keys.order(key))
        .collect();
    let slice = scope.slice_keys.is_empty()
        || match operation {
            MaterialOperation::SurfaceOperation(surface) => {
                scope.slice_keys.binary_search(&surface.slice_key).is_ok()
            }
            MaterialOperation::HoleOperation(hole) => {
                let span = keys
                    .order(&hole.start_slice_key)
                    .zip(keys.order(&hole.end_slice_key));
                span.is_some_and(|(start, end)| {
                    selected
                        .range(start.min(end)..=start.max(end))
                        .next()
                        .is_some()
                })
            }
        };
    let net = scope.net_keys.is_empty()
        || operation_net(operation)
            .is_some_and(|net| scope.net_keys.binary_search(&net.to_owned()).is_ok());
    let region = scope
        .region
        .as_ref()
        .is_none_or(|region| intersects(region, operation_bounds(operation)));
    if product && slice && net && region {
        return Ok(());
    }
    Err(out_of_scope(path.to_owned()))
}

fn check_index(index: u32, position: usize, path: &str) -> Result<(), ValidationError> {
    if usize::try_from(index).ok() == Some(position) {
        return Ok(());
    }
    Err(validation_error(
        "invalid_operation_index",
        format!("{path}.index"),
        "operation indices are dense and equal to their position",
    ))
}

fn validate_surface(
    surface: &SurfaceOperation,
    keys: &Keys<'_>,
    path: &str,
) -> Result<(), ValidationError> {
    check_slice_role(
        keys,
        &surface.slice_key,
        role_of(surface.material),
        &format!("{path}.slice_key"),
    )?;
    let conductive = matches!(surface.material, SurfaceMaterial::Copper);
    match (&surface.net_key, conductive) {
        (None, true) => {
            return Err(validation_error(
                "missing_net",
                format!("{path}.net_key"),
                "conductive material always carries a net key",
            ));
        }
        (Some(_), false) => {
            return Err(validation_error(
                "unexpected_net",
                format!("{path}.net_key"),
                "only conductive material carries a net key",
            ));
        }
        (Some(net), true) => check_net(keys, net, &format!("{path}.net_key"))?,
        (None, false) => {}
    }
    let offset = surface.offset_nm.as_ref().map_or(0, |offset| **offset);
    if surface.offset_nm.is_some() && offset == 0 {
        return Err(validation_error(
            "invalid_offset",
            format!("{path}.offset_nm"),
            "a zero offset is written by omitting offset_nm",
        ));
    }
    validate_placed_shape(
        &surface.shape,
        &surface.affine,
        &surface.bounds,
        i64::from(offset),
        path,
    )
}

fn validate_placed_shape(
    shape: &Shape2d,
    affine: &Affine2D,
    bounds: &NmBounds,
    offset_nm: i64,
    path: &str,
) -> Result<(), ValidationError> {
    validate_affine(affine, &format!("{path}.affine"))?;
    validate_bounds(bounds, &format!("{path}.bounds"))?;
    validate_shape(shape, &format!("{path}.shape"))?;
    check_bounds_hold_shape(shape, affine, offset_nm, bounds, path)
}

fn validate_hole(hole: &HoleOperation, keys: &Keys<'_>, path: &str) -> Result<(), ValidationError> {
    check_slice_role(
        keys,
        &hole.start_slice_key,
        SliceRole::Conductor,
        &format!("{path}.start_slice_key"),
    )?;
    check_slice_role(
        keys,
        &hole.end_slice_key,
        SliceRole::Conductor,
        &format!("{path}.end_slice_key"),
    )?;
    let plated = matches!(hole.plating, HolePlating::Plated);
    match (&hole.net_key, plated) {
        (Some(net), true) => check_net(keys, net, &format!("{path}.net_key"))?,
        (None, false) => {}
        _ => {
            return Err(validation_error(
                "invalid_hole_net",
                format!("{path}.net_key"),
                "plated holes carry a net key and unplated holes do not",
            ));
        }
    }
    check_optional_length(
        hole.plating_thickness_nm.as_ref(),
        &format!("{path}.plating_thickness_nm"),
    )?;
    for (position, backdrill) in hole.backdrills.iter().enumerate() {
        let drill_path = format!("{path}.backdrills[{position}]");
        check_optional_length(
            backdrill.diameter_nm.as_ref(),
            &format!("{drill_path}.diameter_nm"),
        )?;
        if let Some(slice) = &backdrill.until_slice_key {
            check_slice_role(
                keys,
                slice,
                SliceRole::Conductor,
                &format!("{drill_path}.until_slice_key"),
            )?;
        }
    }
    records::validate_post_machining(hole, path)?;
    if !matches!(
        hole.shape,
        Shape2d::Disk2d(_)
            | Shape2d::Capsule2d(_)
            | Shape2d::SweptPath2d(_)
            | Shape2d::PlanarRegion2d(_)
    ) {
        return Err(validation_error(
            "invalid_hole_shape",
            format!("{path}.shape"),
            "holes are disks, capsules, swept paths, or planar regions",
        ));
    }
    validate_placed_shape(&hole.shape, &hole.affine, &hole.bounds, 0, path)
}

fn check_slice_role(
    keys: &Keys<'_>,
    key: &str,
    role: SliceRole,
    path: &str,
) -> Result<(), ValidationError> {
    match keys.slices.get(key) {
        Some((_, actual)) if *actual == role => Ok(()),
        Some(_) => Err(validation_error(
            "wrong_slice_role",
            path.to_owned(),
            "material lies on a slice of its role; holes span conductor slices",
        )),
        None => Err(validation_error(
            "unknown_slice",
            path.to_owned(),
            "operations reference slices listed in the stack",
        )),
    }
}

fn check_net(keys: &Keys<'_>, key: &str, path: &str) -> Result<(), ValidationError> {
    if keys.nets.contains(key) {
        return Ok(());
    }
    Err(validation_error(
        "unknown_net",
        path.to_owned(),
        "operations reference nets listed in the net table",
    ))
}

fn validate_affine(affine: &Affine2D, path: &str) -> Result<(), ValidationError> {
    let terms = [affine.m11, affine.m12, affine.m21, affine.m22];
    let determinant = affine.m11 * affine.m22 - affine.m12 * affine.m21;
    if terms.iter().all(|term| term.is_finite()) && determinant.abs() > f64::EPSILON {
        return Ok(());
    }
    Err(validation_error(
        "invalid_affine",
        path.to_owned(),
        "affine terms are finite and the matrix is invertible",
    ))
}

fn validate_bounds(bounds: &NmBounds, path: &str) -> Result<(), ValidationError> {
    if *bounds.min_x_nm <= *bounds.max_x_nm && *bounds.min_y_nm <= *bounds.max_y_nm {
        return Ok(());
    }
    Err(validation_error(
        "invalid_bounds",
        path.to_owned(),
        "bounds minima do not exceed their maxima",
    ))
}

/// Binding entries reference operations in ascending order, below the
/// operation count. Coverage is not required: geometry-only documents may
/// bind a subset (the producer binds every operation).
fn validate_binding_order(
    document: &MaterializationDocumentA1,
    total: u64,
) -> Result<(), ValidationError> {
    let mut previous: Option<u32> = None;
    for (position, entry) in document.binding.iter().enumerate() {
        let ascending = previous.is_none_or(|last| entry.operation_index > last);
        if !ascending || u64::from(entry.operation_index) >= total {
            return Err(validation_error(
                "invalid_binding",
                format!("$.binding[{position}].operation_index"),
                "binding entries reference existing operations in ascending order",
            ));
        }
        previous = Some(entry.operation_index);
    }
    Ok(())
}

/// Each binding entry carries its operation's net key.
fn validate_binding_nets(document: &MaterializationDocumentA1) -> Result<(), ValidationError> {
    for (position, entry) in document.binding.iter().enumerate() {
        let operation = usize::try_from(entry.operation_index)
            .ok()
            .and_then(|index| document.operations.get(index));
        if operation.is_none_or(|operation| entry.net_key.as_deref() != operation_net(operation)) {
            return Err(validation_error(
                "invalid_binding",
                format!("$.binding[{position}].net_key"),
                "a binding entry carries its operation's net key",
            ));
        }
    }
    Ok(())
}

/// Chunks are non-empty, contiguous from index 0, and strictly ordered by
/// (slice order, tile row, tile column), so each (slice, tile) appears
/// once. Their slices and nets are known, and their net lists are sorted
/// and distinct. Returns the operation count the directory covers.
fn validate_chunk_directory(
    document: &MaterializationDocumentA1,
    keys: &Keys<'_>,
) -> Result<u64, ValidationError> {
    let mut next = 0u64;
    let mut previous: Option<(u32, i32, i32)> = None;
    for (position, chunk) in document.chunks.iter().enumerate() {
        let path = format!("$.chunks[{position}]");
        validate_bounds(&chunk.bounds, &format!("{path}.bounds"))?;
        let Some(order) = keys.order(&chunk.slice_key) else {
            return Err(validation_error(
                "unknown_slice",
                format!("{path}.slice_key"),
                "chunks reference slices listed in the stack",
            ));
        };
        let key = (order, chunk.tile_y, chunk.tile_x);
        if u64::from(chunk.first_operation_index) != next
            || chunk.operation_count == 0
            || previous.is_some_and(|last| last >= key)
        {
            return Err(validation_error(
                "invalid_chunk_order",
                path,
                "chunks are non-empty, contiguous, and ordered by slice, tile row, and tile column",
            ));
        }
        if !strictly_ascending(&chunk.net_keys)
            || chunk
                .net_keys
                .iter()
                .any(|net| !keys.nets.contains(net.as_str()))
        {
            return Err(validation_error(
                "invalid_chunk_nets",
                format!("{path}.net_keys"),
                "chunk net keys are known, sorted, and distinct",
            ));
        }
        next += u64::from(chunk.operation_count);
        previous = Some(key);
    }
    Ok(next)
}

/// Members of a chunk lie on its slice, inside its bounds, in its tile, and
/// its net list is exactly their distinct nets.
fn check_chunk_members(
    document: &MaterializationDocumentA1,
    chunk: &ChunkEntry,
    position: usize,
) -> Result<(), ValidationError> {
    let path = format!("$.chunks[{position}]");
    let start = usize::try_from(chunk.first_operation_index).unwrap_or(usize::MAX);
    let end = start.saturating_add(usize::try_from(chunk.operation_count).unwrap_or(usize::MAX));
    let members = document.operations.get(start..end).ok_or_else(|| {
        validation_error(
            "invalid_chunk_order",
            path.clone(),
            "chunk range exceeds operations",
        )
    })?;
    let tile = (chunk.tile_x, chunk.tile_y);
    let mut nets = BTreeSet::new();
    for operation in members {
        let bounds = operation_bounds(operation);
        let inside = *chunk.bounds.min_x_nm <= *bounds.min_x_nm
            && *chunk.bounds.min_y_nm <= *bounds.min_y_nm
            && *chunk.bounds.max_x_nm >= *bounds.max_x_nm
            && *chunk.bounds.max_y_nm >= *bounds.max_y_nm;
        if operation_slice(operation) != chunk.slice_key
            || !inside
            || chunking::tile_of(bounds, *document.scope.tile_size_nm) != tile
        {
            return Err(validation_error(
                "invalid_chunk_member",
                path,
                "chunk members lie on the chunk slice, inside the chunk bounds, in the chunk tile",
            ));
        }
        nets.extend(operation_net(operation));
    }
    if !nets
        .into_iter()
        .eq(chunk.net_keys.iter().map(String::as_str))
    {
        return Err(validation_error(
            "invalid_chunk_nets",
            format!("{path}.net_keys"),
            "chunk net keys are the distinct nets of its operations",
        ));
    }
    Ok(())
}
