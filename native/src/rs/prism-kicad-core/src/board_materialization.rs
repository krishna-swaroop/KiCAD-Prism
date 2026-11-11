//! Analytic board materialization (`kicad_monkey.materialization.a1`).
//!
//! Resolves the physical intent of a KiCad board into analytic material
//! operations: closed 2D shapes with one composed affine, a material role, a
//! stack slice, and a resolved net. The producer never runs Boolean,
//! offsetting, or tessellation work; removed material is expressed as
//! `subtract` operations that consumers resolve. Design:
//! `docs/design/rust-pcb-analytic-materializer.html`.
//!
//! Implemented products: copper (tracks, track arcs, via lands, stored zone
//! fills, pad lands), holes (vias and pads, with protection and
//! back-drill), dielectric (the closed board profile per dielectric slice,
//! minus crossing holes and back-drill bores), solder mask (the profile
//! minus pad, via, and mask-layer openings), paste (pad apertures and
//! paste-layer graphics), and silkscreen (graphics and text), with the full
//! stack, nets, binding, and component records. Design facts that are not
//! material (zone and pad rules, rule areas, courtyards, board rules) go in
//! the header's `design_facts` (a1).

mod apertures;
mod design_facts;
mod design_zones;
mod dielectric;
mod emit;
mod flash;
mod geometry;
mod graphics;
mod holes;
mod layers;
mod machining;
mod net_classes;
mod net_patterns;
mod net_ties;
mod nets;
mod pads;
mod parallel;
mod prepared;
mod producer;
mod profile;
mod routing;
mod sexpr_view;
mod source_graphics;
mod stack;
mod technical;
mod zone_ids;

pub use prepared::{PrepareLimits, PreparedBoard};
pub use prism_kicad_contracts::materialization_contract::{
    chunk_operations, filter_document, operation_bounds, operation_net, operation_product,
    operation_slice, scope_from_request,
};
pub use profile::{BoardProfile, board_profile};
pub use sexpr_view::materialization_sexpr;

use prism_kicad_contracts::generated::materialization_document::{
    DiagnosticSeverity, MaterialOperation, MaterialProduct, MaterializationCoordinateSystem,
    MaterializationDiagnostic, MaterializationDocumentA1, MaterializationProducer,
    MaterializationScope, MaterializationSource, PathSegment, Shape2d, Stack,
};
use prism_kicad_contracts::generated::materialization_request::MaterializationRequestA0;
use sha2::{Digest, Sha256};
use std::fmt;
use std::fmt::Write as _;

/// Schema identifier written into every materialization document.
pub const MATERIALIZATION_SCHEMA: &str = "kicad_monkey.materialization.a1";
/// Version written into every materialization document.
pub const MATERIALIZATION_VERSION: &str = "a1";
/// Document type identifier.
pub const MATERIALIZATION_DOCUMENT_TYPE: &str = "kicad_monkey.materialization.document";
/// Request type identifier.
pub const MATERIALIZATION_REQUEST_TYPE: &str = "kicad_monkey.materialization.request";
/// Producer name recorded in documents.
pub const MATERIALIZATION_PRODUCER: &str = "prism-kicad-core.board_materialization";

/// Structured materialization failure.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MaterializationError {
    pub code: &'static str,
    pub message: String,
}

impl fmt::Display for MaterializationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for MaterializationError {}

pub(crate) fn error(code: &'static str, message: impl Into<String>) -> MaterializationError {
    MaterializationError {
        code,
        message: message.into(),
    }
}

/// Products this producer emits; the rest are reported as diagnostics.
const IMPLEMENTED: [MaterialProduct; 7] = [
    MaterialProduct::Copper,
    MaterialProduct::Holes,
    MaterialProduct::Dielectric,
    MaterialProduct::SolderMask,
    MaterialProduct::Paste,
    MaterialProduct::Silkscreen,
    MaterialProduct::Components,
];

/// Identity of the board and project files, recorded in every document
/// made from them.
struct SourceIdentity {
    sha256: String,
    bytes: usize,
    project: Option<(String, usize)>,
}

impl SourceIdentity {
    fn of(source: &str, project: Option<&str>) -> Self {
        Self {
            sha256: sha256_hex(source.as_bytes()),
            bytes: source.len(),
            project: project.map(|text| (sha256_hex(text.as_bytes()), text.len())),
        }
    }

    /// Bytes counted against `max_source_bytes`: board and project.
    fn total_bytes(&self) -> usize {
        self.bytes
            .saturating_add(self.project.as_ref().map_or(0, |(_, bytes)| *bytes))
    }
}

/// Materialize one board source for `request`. The result is valid against
/// the a1 contract and equals the complete materialization filtered by the
/// request's scope. Callers with several requests for one board use
/// [`PreparedBoard`], which decodes and emits it once.
pub fn materialize_board(
    source: &str,
    request: &MaterializationRequestA0,
) -> Result<MaterializationDocumentA1, MaterializationError> {
    materialize_project(source, None, request)
}

/// [`materialize_board`] with the board's `.kicad_pro` project file, which
/// supplies net classes. `max_source_bytes` bounds both files together.
pub fn materialize_project(
    source: &str,
    project: Option<&str>,
    request: &MaterializationRequestA0,
) -> Result<MaterializationDocumentA1, MaterializationError> {
    let identity = SourceIdentity::of(source, project);
    validate_request(identity.total_bytes(), request)?;
    let scope = scope_from_request(request);
    let limit = operation_limit(request);
    // Products are pushed down into emission, so without slice, net, or
    // region filters the emitted count is the result count, and emission can
    // stop as soon as it passes the limit.
    let unfiltered =
        scope.slice_keys.is_empty() && scope.net_keys.is_empty() && scope.region.is_none();
    let emitted = producer::emit_board(
        source,
        project,
        &scope.products,
        unfiltered.then_some(limit),
    )?;
    if emitted.emitter.overflowed {
        return Err(too_many_operations(limit));
    }
    // Emission already holds exactly the requested products, so only slice,
    // net, and region filters need a selection pass (rule 2 checks this).
    let emitted = if unfiltered {
        emitted
    } else {
        prepared::selected(&emitted, &scope)
    };
    assemble(emitted, &identity, &scope, request)
}

fn operation_limit(request: &MaterializationRequestA0) -> usize {
    usize::try_from(request.max_operations).unwrap_or(usize::MAX)
}

/// Chunk the operations `scope` selected, in emission order, into the
/// request's document, and enforce its result limits.
fn assemble(
    emitted: producer::Emitted,
    identity: &SourceIdentity,
    scope: &MaterializationScope,
    request: &MaterializationRequestA0,
) -> Result<MaterializationDocumentA1, MaterializationError> {
    let limit = operation_limit(request);
    if emitted.emitter.operations.len() > limit {
        return Err(too_many_operations(limit));
    }
    let mut diagnostics = emitted.emitter.diagnostics;
    diagnostics.extend(
        scope
            .products
            .iter()
            .filter(|product| !IMPLEMENTED.contains(product))
            .map(|product| MaterializationDiagnostic {
                severity: DiagnosticSeverity::Warning,
                code: "product_not_materialized".to_owned(),
                message: format!("product {product} is not materialized by this producer yet"),
                product: Some(*product),
                source_uid: None,
            }),
    );
    let order = emitted
        .stack
        .slices
        .iter()
        .map(|slice| (slice.key.clone(), slice.order))
        .collect();
    let chunked = chunk_operations(emitted.emitter.operations, &order, *scope.tile_size_nm);
    let mut document = empty_document(identity, scope.clone(), diagnostics);
    document.stack = emitted.stack;
    document.nets = emitted.nets;
    document.net_classes = emitted.net_classes;
    document.diff_pairs = emitted.diff_pairs;
    document.components = emitted.components;
    document.design_facts = Some(emitted.design_facts);
    document.binding = remap_binding(emitted.emitter.binding, &chunked.new_index_of_input);
    document.operations = chunked.operations;
    document.chunks = chunked.chunks;
    let points: u64 = document.operations.iter().map(operation_points).sum();
    if points > u64::from(request.max_points) {
        return Err(error(
            "too_many_points",
            format!("result needs more than max_points ({})", request.max_points),
        ));
    }
    Ok(document)
}

fn too_many_operations(limit: usize) -> MaterializationError {
    error(
        "too_many_operations",
        format!("result needs more than max_operations ({limit})"),
    )
}

/// Coordinate points an operation's shape carries: its anchors plus every
/// segment end, arc mid, and cubic control point.
fn operation_points(operation: &MaterialOperation) -> u64 {
    let shape = match operation {
        MaterialOperation::SurfaceOperation(surface) => &surface.shape,
        MaterialOperation::HoleOperation(hole) => &hole.shape,
    };
    let segments = |segments: &[PathSegment]| -> u64 {
        segments
            .iter()
            .map(|segment| match segment {
                PathSegment::LineSegment(_) => 1,
                PathSegment::ArcSegment(_) => 2,
                PathSegment::CubicSegment(_) => 3,
            })
            .sum()
    };
    match shape {
        Shape2d::Capsule2d(_) => 2,
        Shape2d::SweptPath2d(path) => 1 + segments(&path.segments),
        Shape2d::PlanarRegion2d(region) => std::iter::once(&region.outer)
            .chain(&region.holes)
            .map(|contour| 1 + segments(&contour.segments))
            .sum(),
        _ => 1,
    }
}

fn remap_binding(
    mut binding: Vec<prism_kicad_contracts::generated::materialization_document::BindingEntry>,
    new_index_of_input: &[u32],
) -> Vec<prism_kicad_contracts::generated::materialization_document::BindingEntry> {
    for entry in &mut binding {
        if let Some(index) = usize::try_from(entry.operation_index)
            .ok()
            .and_then(|input| new_index_of_input.get(input))
        {
            entry.operation_index = *index;
        }
    }
    binding.sort_by_key(|entry| entry.operation_index);
    binding
}

fn validate_request(
    source_bytes: usize,
    request: &MaterializationRequestA0,
) -> Result<(), MaterializationError> {
    if request.type_ != MATERIALIZATION_REQUEST_TYPE || request.version != "a0" {
        return Err(error(
            "unsupported_request",
            "materialization request type and version must match a0",
        ));
    }
    if request.products.is_empty() {
        return Err(error("empty_scope", "a request names at least one product"));
    }
    if let Some(region) = &request.region
        && (*region.min_x_nm > *region.max_x_nm || *region.min_y_nm > *region.max_y_nm)
    {
        return Err(error(
            "invalid_region",
            "a region's minimum corner is at or below its maximum corner",
        ));
    }
    if *request.tile_size_nm <= 0 || *request.tile_size_nm > i64::from(i32::MAX) {
        return Err(error(
            "invalid_tile_size",
            "tile size is a positive 32-bit nanometre length",
        ));
    }
    let digits = &request.max_source_bytes;
    let limit: u64 = digits
        .bytes()
        .all(|byte| byte.is_ascii_digit())
        .then(|| digits.parse().ok())
        .flatten()
        .ok_or_else(|| error("invalid_limit", "max_source_bytes is a decimal uint64"))?;
    if u64::try_from(source_bytes).map_or(true, |length| length > limit) {
        return Err(error(
            "source_too_large",
            format!("source exceeds max_source_bytes ({limit})"),
        ));
    }
    Ok(())
}

fn empty_document(
    identity: &SourceIdentity,
    scope: MaterializationScope,
    diagnostics: Vec<MaterializationDiagnostic>,
) -> MaterializationDocumentA1 {
    MaterializationDocumentA1 {
        schema: MATERIALIZATION_SCHEMA.to_owned(),
        type_: MATERIALIZATION_DOCUMENT_TYPE.to_owned(),
        version: MATERIALIZATION_VERSION.to_owned(),
        producer: MaterializationProducer {
            name: MATERIALIZATION_PRODUCER.to_owned(),
            version: crate::ENGINE_VERSION.to_owned(),
        },
        source: MaterializationSource {
            sha256: identity.sha256.clone(),
            source_bytes: identity.bytes.to_string(),
            project_sha256: identity.project.as_ref().map(|(sha, _)| sha.clone()),
            project_bytes: identity
                .project
                .as_ref()
                .map(|(_, bytes)| bytes.to_string()),
        },
        coordinate_system: MaterializationCoordinateSystem {
            unit: "nm".to_owned(),
            x_axis: "board_right".to_owned(),
            y_axis: "board_down".to_owned(),
        },
        scope,
        stack: Stack {
            slices: Vec::new(),
            regions: Vec::new(),
            board_thickness_nm: None,
            copper_finish: None,
            impedance_controlled: None,
            edge_plating: None,
        },
        nets: Vec::new(),
        net_classes: Vec::new(),
        diff_pairs: Vec::new(),
        components: Vec::new(),
        operations: Vec::new(),
        binding: Vec::new(),
        chunks: Vec::new(),
        diagnostics,
        design_facts: None,
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut hex = String::with_capacity(digest.len() * 2);
    for byte in digest {
        let _ = write!(hex, "{byte:02x}");
    }
    hex
}
