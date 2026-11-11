//! Board materialization driver: parse, emit requested products, chunk.

use super::apertures::BoardMargins;
use super::design_facts::{FactInputs, ProjectRules, design_facts};
use super::design_zones::ZoneInputs;
use super::dielectric::dielectric_regions;
use super::emit::{Emitter, Origin, source_uid};
use super::flash::{FlashLayers, flash_layers, presentation_plot};
use super::geometry::footprint_affine;
use super::holes::{HoleSpec, ViaDefaults, pad_hole, via_holes};
use super::layers::board_stack;
use super::machining::copper_knockouts;
use super::net_classes::{NetClassSettings, assign_classes, diff_pairs};
use super::net_ties::{NetTies, jumper_groups, net_tie_groups};
use super::nets::{NetNames, net_table};
use super::pads::{PadFrame, land, npth_without_copper, place_pad, reference};
use super::parallel;
use super::profile::close_profile;
use super::routing::{route_copper, routes, via_lands, zone_fills};
use super::source_graphics::{copper_graphics, outline_bounds};
use super::stack::CopperStack;
use super::technical::{
    FootprintTextFacts, SourceGraphics, TECHNICAL_LAYERS, TechnicalBoard, TextContext,
    document_graphics, emit_copper_text, technical_graphics,
};
use super::zone_ids::ZoneIds;
use super::{MaterializationError, error};
use crate::board_plotter_ir::BoardPlotDocument;
use crate::board_plotter_ir::FlashInputs;
use crate::pcb::{
    PcbFamily, PcbFootprint, PcbFootprintGraphic, PcbFootprintZone, PcbGraphic, PcbGraphicKind,
    PcbPad, PcbRoutingArc, PcbSegment, PcbSelection, PcbSetup, PcbVia, PcbView, PcbZone,
    resolve_pad_copper_layer,
};
use crate::sexpr::Sexp;
use prism_kicad_contracts::generated::materialization_document::{
    BoardSide, Component, DesignFacts, DiffPair, MaterialProduct, Net, NetClass, NmBounds,
    PlanarRegion2d, Stack,
};

/// Everything emitted from one board before chunking.
pub(crate) struct Emitted {
    pub stack: Stack,
    pub nets: Vec<Net>,
    pub net_classes: Vec<NetClass>,
    pub diff_pairs: Vec<DiffPair>,
    pub components: Vec<Component>,
    /// Board facts that are not material (a1), whatever the products.
    pub design_facts: DesignFacts,
    pub emitter: Emitter,
}

fn parse_error(cause: impl std::fmt::Display) -> MaterializationError {
    error("source_parse", cause.to_string())
}

fn selection() -> PcbSelection {
    [
        PcbFamily::Layers,
        PcbFamily::Setup,
        PcbFamily::Nets,
        PcbFamily::Footprints,
        PcbFamily::FootprintProperties,
        PcbFamily::FootprintGraphics,
        PcbFamily::Graphics,
        PcbFamily::FootprintTexts,
        PcbFamily::Pads,
        PcbFamily::Segments,
        PcbFamily::Arcs,
        PcbFamily::Vias,
        PcbFamily::Zones,
        PcbFamily::Profile,
    ]
    .into_iter()
    .fold(PcbSelection::none(), PcbSelection::with)
}

fn collect<T, E: std::fmt::Display>(
    items: impl Iterator<Item = Result<T, E>>,
) -> Result<Vec<T>, MaterializationError> {
    items.collect::<Result<Vec<_>, _>>().map_err(parse_error)
}

/// Decoded source families used by the producer.
struct Sources<'v> {
    footprints: Vec<PcbFootprint>,
    pads: Vec<PcbPad>,
    segments: Vec<PcbSegment>,
    arcs: Vec<PcbRoutingArc>,
    vias: Vec<PcbVia>,
    /// Zones borrow the view's decoded family: their fill geometry is far
    /// larger than the rest of a record, so keeping it once matters.
    zones: Vec<&'v PcbZone>,
    technical_zones: Vec<&'v PcbZone>,
    /// Rule areas owned by footprints.
    footprint_zones: Vec<PcbFootprintZone>,
    zone_ids: ZoneIds,
}

/// Zones split by what they contribute.
struct Zones<'v> {
    copper: Vec<&'v PcbZone>,
    technical: Vec<&'v PcbZone>,
    footprint_rule_areas: Vec<PcbFootprintZone>,
    ids: ZoneIds,
}

/// Copper zones, zones on technical layers, and footprint rule areas, with
/// board-wide zone UIDs. Other zones never contribute material. KiCad
/// neither fills nor plots zones owned by a footprint (they act only as
/// rule areas), so a stored fill on one is reported and left out. A zone
/// that fails to decode is reported, never silently dropped.
fn split_zones<'v>(view: &'v PcbView<'_>, emitter: &mut Emitter) -> Zones<'v> {
    let (mut copper, mut technical) = (Vec::new(), Vec::new());
    // Zones may be on any layer, so their warnings belong to no product.
    let product = emitter.product.take();
    let mut owned = Vec::new();
    for zone in view.footprint_zones() {
        match zone {
            Ok(zone) => owned.push(zone),
            Err(cause) => emitter.warn("zone_not_decoded", cause.to_string(), None),
        }
    }
    let decoded: Vec<&PcbZone> = view
        .decoded_zones()
        .iter()
        .filter_map(|zone| zone.as_ref().ok())
        .collect();
    let ids = ZoneIds::new(
        decoded
            .iter()
            .copied()
            .chain(owned.iter().map(|owned| &owned.zone)),
    );
    for owned in owned
        .iter()
        .filter(|owned| !owned.zone.filled_polygons.is_empty())
    {
        emitter.warn(
            "footprint_zone_fill_ignored",
            "KiCad does not plot fills of zones inside footprints".to_owned(),
            Some(ids.uid(&owned.zone)),
        );
    }
    for zone in view.decoded_zones() {
        match zone {
            Ok(zone) if zone.layers.iter().any(|layer| layer.ends_with(".Cu")) => copper.push(zone),
            Ok(zone)
                if zone
                    .layers
                    .iter()
                    .any(|layer| TECHNICAL_LAYERS.contains(&layer.as_str())) =>
            {
                technical.push(zone);
            }
            Ok(_) => {}
            Err(cause) => emitter.warn("zone_not_decoded", cause.to_string(), None),
        }
    }
    emitter.product = product;
    owned.retain(|owned| owned.zone.keepout.is_some());
    Zones {
        copper,
        technical,
        footprint_rule_areas: owned,
        ids,
    }
}

fn load<'v>(
    view: &'v PcbView<'_>,
    emitter: &mut Emitter,
) -> Result<Sources<'v>, MaterializationError> {
    emitter.product = Some(MaterialProduct::Copper);
    // Zones decode alongside the other families. Their warnings belong to
    // no product and keep their place ahead of everything load reports.
    let ((zones, zone_warnings), families) = parallel::join(
        || {
            let mut local = Emitter::default();
            let zones = split_zones(view, &mut local);
            (zones, local.diagnostics)
        },
        || -> Result<_, MaterializationError> {
            Ok((
                collect(view.footprints())?,
                collect(view.pads())?,
                collect(view.segments())?,
                collect(view.arcs())?,
                collect(view.vias())?,
            ))
        },
    );
    emitter.diagnostics.extend(zone_warnings);
    let (footprints, pads, segments, arcs, vias) = families?;
    Ok(Sources {
        footprints,
        pads,
        segments,
        arcs,
        vias,
        zones: zones.copper,
        technical_zones: zones.technical,
        footprint_zones: zones.footprint_rule_areas,
        zone_ids: zones.ids,
    })
}

fn nets(view: &PcbView<'_>, sources: &Sources<'_>) -> Result<Vec<Net>, MaterializationError> {
    let references = sources
        .segments
        .iter()
        .map(|item| &item.net)
        .chain(sources.arcs.iter().map(|item| &item.net))
        .chain(sources.vias.iter().map(|item| &item.net))
        .chain(sources.pads.iter().map(|item| &item.net))
        .chain(sources.zones.iter().map(|item| &item.net));
    Ok(net_table(&collect(view.nets())?, references))
}

fn stack_of(
    view: &PcbView<'_>,
    setup: Option<&PcbSetup>,
    copper: &CopperStack,
    emitter: &mut Emitter,
) -> Result<Stack, MaterializationError> {
    let thickness = view.metadata().map_err(parse_error)?.thickness;
    let built = board_stack(
        setup.and_then(|value| value.stackup.as_ref()),
        copper,
        thickness,
    );
    if let Some((code, message)) = built.warning {
        emitter.product = None;
        emitter.warn(code, message, None);
    }
    Ok(built.stack)
}

/// First board format that stores footprint children in the library frame
/// with a `(transform ...)` that may scale or mirror them.
const FIRST_FP_AFFINE_TRANSFORM: i64 = 20_260_616;

/// Boards from that format on may carry footprint scale or mirroring, which
/// the producer does not apply yet; only rotation and translation are.
fn warn_footprint_transforms(view: &PcbView<'_>, emitter: &mut Emitter) {
    let version = view.metadata().map_or(0, |metadata| metadata.version);
    if version >= FIRST_FP_AFFINE_TRANSFORM {
        emitter.product = None;
        emitter.warn(
            "footprint_transform_partial",
            format!(
                "board format {version} may scale or mirror footprints; only rotation and \
                 translation are applied"
            ),
            None,
        );
    }
}

/// Emit `products` of the board in `source`, with net classes from
/// `project` when given, recording at most `operation_cap` operations when
/// given.
pub(crate) fn emit_board(
    source: &str,
    project: Option<&str>,
    products: &[MaterialProduct],
    operation_cap: Option<usize>,
) -> Result<Emitted, MaterializationError> {
    let settings = project.map(NetClassSettings::from_project).transpose()?;
    let rules = project.map(ProjectRules::from_project).transpose()?;
    let view =
        PcbView::parse_selected(source, Default::default(), selection()).map_err(parse_error)?;
    let project = ProjectFacts {
        settings,
        rules: rules.unwrap_or_default(),
    };
    emit_view(source, project, &view, products, operation_cap)
}

/// What the project file contributes.
#[derive(Default)]
struct ProjectFacts {
    settings: Option<NetClassSettings>,
    rules: ProjectRules,
}

/// Give nets their classes and pair them. Classes come from the project
/// and any board `(net_class)` forms.
fn classify(
    settings: Option<NetClassSettings>,
    view: &PcbView<'_>,
    nets: &mut [Net],
    emitter: &mut Emitter,
) -> (Vec<NetClass>, Vec<DiffPair>) {
    emitter.product = None;
    let settings = match settings {
        Some(settings) => Some(settings.with_board_classes(view)),
        None => NetClassSettings::from_board(view),
    };
    // Without either source, classes stay unknown: nets carry none.
    let classes = settings.map_or_else(Vec::new, |settings| {
        assign_classes(&settings, nets, emitter)
    });
    (classes, diff_pairs(nets))
}

/// Emit `products` from an already parsed `view` of `source`. Correctness
/// rule 1: a projected view and a full-model view give the same result.
fn emit_view(
    source: &str,
    project: ProjectFacts,
    view: &PcbView<'_>,
    products: &[MaterialProduct],
    operation_cap: Option<usize>,
) -> Result<Emitted, MaterializationError> {
    let copper = CopperStack::from_layers(&collect(view.layers())?);
    if copper.names.is_empty() {
        return Err(error("no_copper_layers", "board declares no copper layers"));
    }
    let mut emitter = Emitter {
        cap: operation_cap,
        ..Emitter::default()
    };
    warn_footprint_transforms(view, &mut emitter);
    let wants = |product: MaterialProduct| products.contains(&product);
    let drawn =
        wants(MaterialProduct::Copper) || TECHNICAL_PRODUCTS.iter().any(|product| wants(*product));
    // The text plot document reads only the source, so it is built while the
    // board is decoded and its copper emitted.
    let (decoded, document) = parallel::join(
        || decode_and_emit_copper(view, &copper, products, drawn, &mut emitter),
        || drawn.then(|| presentation_plot(source, view)).flatten(),
    );
    let Decoded {
        sources,
        mut nets,
        setup,
        stack,
        graphics,
    } = decoded?;
    let (net_classes, diff_pairs) = classify(project.settings, view, &mut nets, &mut emitter);
    // Text of every drawn product comes from one plot document.
    let text = drawn.then(|| Text {
        context: text_context(source, view, &graphics.0),
        document,
    });
    if let Some(text) = text.as_ref().filter(|_| wants(MaterialProduct::Copper)) {
        text.emit_copper(&copper, &mut emitter);
    }
    let regions = profile_regions(view, &sources, products, &mut emitter)?;
    let vias = ViaDefaults::from_setup(
        setup.as_ref(),
        view.metadata().map_or(0, |metadata| metadata.version),
    );
    emit_drilled(
        &sources,
        &vias,
        &copper,
        &regions,
        &stack,
        products,
        &mut emitter,
    );
    let board = Board {
        sources: &sources,
        setup: setup.as_ref(),
        stack: &stack,
        regions: &regions,
        graphics: &graphics,
        text: text.as_ref(),
    };
    emit_technical(&board, products, &mut emitter);
    let version = view.metadata().map_or(0, |metadata| metadata.version);
    let components = if wants(MaterialProduct::Components) {
        components(&sources, &graphics.1, version)
    } else {
        Vec::new()
    };
    let design_facts = board_facts(
        &sources,
        &project.rules,
        &copper,
        &graphics.1,
        version,
        &mut emitter,
    );
    Ok(Emitted {
        stack,
        nets,
        net_classes,
        diff_pairs,
        components,
        design_facts,
        emitter,
    })
}

/// The decoded board, and its graphics when a drawn product needs them.
struct Decoded<'v> {
    sources: Sources<'v>,
    nets: Vec<Net>,
    setup: Option<PcbSetup>,
    stack: Stack,
    graphics: (Vec<PcbGraphic>, Vec<PcbFootprintGraphic>),
}

/// Decode the board and emit its copper, all but the text, which needs
/// the plot document.
fn decode_and_emit_copper<'v>(
    view: &'v PcbView<'_>,
    copper: &CopperStack,
    products: &[MaterialProduct],
    drawn: bool,
    emitter: &mut Emitter,
) -> Result<Decoded<'v>, MaterializationError> {
    let sources = load(view, emitter)?;
    let nets = nets(view, &sources)?;
    let setup = view.setup().map_err(parse_error)?;
    let stack = stack_of(view, setup.as_ref(), copper, emitter)?;
    // Components and the design facts read footprint courtyards and
    // fabrication outlines; drawn products also read board graphics.
    let graphics = if drawn || products.contains(&MaterialProduct::Components) {
        source_graphics(view)?
    } else {
        (Vec::new(), collect(view.footprint_graphics())?)
    };
    if products.contains(&MaterialProduct::Copper) {
        emit_copper(view, &sources, copper, emitter)?;
        // Hole problems are reported by the holes product.
        let version = view.metadata().map_or(0, |metadata| metadata.version);
        let vias = ViaDefaults::from_setup(setup.as_ref(), version);
        let holes = hole_specs(&sources, &vias, copper, &mut Emitter::default());
        emitter.product = Some(MaterialProduct::Copper);
        copper_knockouts(&holes, &stack, emitter);
        let names = NetNames::new(&collect(view.nets())?, &nets);
        let ties = NetTies::new(&sources.footprints, &sources.pads, copper, version);
        copper_graphics(
            &graphics.0,
            &graphics.1,
            &sources.footprints,
            copper,
            &names,
            &ties,
            emitter,
        );
    }
    Ok(Decoded {
        sources,
        nets,
        setup,
        stack,
        graphics,
    })
}

/// Holes, and the dielectric they are cut from.
fn emit_drilled(
    sources: &Sources<'_>,
    vias: &ViaDefaults,
    copper: &CopperStack,
    regions: &[PlanarRegion2d],
    stack: &Stack,
    products: &[MaterialProduct],
    emitter: &mut Emitter,
) {
    let (holes_wanted, dielectric_wanted) = (
        products.contains(&MaterialProduct::Holes),
        products.contains(&MaterialProduct::Dielectric),
    );
    if !holes_wanted && !dielectric_wanted {
        return;
    }
    let holes = hole_specs(sources, vias, copper, emitter);
    if holes_wanted {
        emitter.product = Some(MaterialProduct::Holes);
        holes.iter().for_each(|hole| emitter.hole(hole));
    }
    if dielectric_wanted {
        emitter.product = Some(MaterialProduct::Dielectric);
        dielectric_regions(regions, &holes, stack, emitter);
    }
}

fn emit_copper(
    view: &PcbView<'_>,
    sources: &Sources<'_>,
    copper: &CopperStack,
    emitter: &mut Emitter,
) -> Result<(), MaterializationError> {
    let flash = flash_layers(&FlashInputs {
        copper_stack: &copper.names,
        footprints: &sources.footprints,
        segments: &sources.segments,
        arcs: &sources.arcs,
        vias: &sources.vias,
        pads: &sources.pads,
    });
    emitter.product = Some(MaterialProduct::Copper);
    if let Some(cause) = &flash.unresolved {
        emitter.warn(
            "flash_layers_unresolved",
            format!("conditional pad and via flashing not resolved ({cause}); every padstack layer is kept"),
            None,
        );
    }
    if flash.used_plot_facts {
        emitter.warn(
            "plot_facts_flash_layers",
            "KiCad's connectivity rules resolved conditional pad and via flashing".to_owned(),
            None,
        );
    }
    let version = view.metadata().map_or(0, |metadata| metadata.version);
    route_copper(&routes(&sources.segments, &sources.arcs), copper, emitter);
    via_lands(&sources.vias, copper, &flash, emitter);
    zone_fills(&sources.zones, &sources.zone_ids, copper, version, emitter);
    let pads = Pads {
        copper,
        flash: &flash,
        footprints: &sources.footprints,
    };
    for pad in &sources.pads {
        if let Some((origin, frame)) = pads.placement(pad, emitter) {
            pads.lands(pad, &frame, &origin, emitter);
        }
    }
    Ok(())
}

fn hole_specs(
    sources: &Sources<'_>,
    vias: &ViaDefaults,
    copper: &CopperStack,
    emitter: &mut Emitter,
) -> Vec<HoleSpec> {
    emitter.product = Some(MaterialProduct::Holes);
    let mut holes = Vec::new();
    via_holes(&sources.vias, vias, copper, &mut holes, emitter);
    let flash = FlashLayers::default();
    let pads = Pads {
        copper,
        flash: &flash,
        footprints: &sources.footprints,
    };
    for pad in &sources.pads {
        if let Some((origin, frame)) = pads.placement(pad, emitter) {
            holes.extend(pad_hole(pad, &frame, origin, copper));
        }
    }
    holes
}

/// Closed board profile, computed once when the dielectric or the solder
/// mask needs it. Outline problems are reported for each of those products.
fn profile_regions(
    view: &PcbView<'_>,
    sources: &Sources<'_>,
    products: &[MaterialProduct],
    emitter: &mut Emitter,
) -> Result<Vec<PlanarRegion2d>, MaterializationError> {
    let users: Vec<MaterialProduct> = [MaterialProduct::Dielectric, MaterialProduct::SolderMask]
        .into_iter()
        .filter(|product| products.contains(product))
        .collect();
    if users.is_empty() {
        return Ok(Vec::new());
    }
    let primitives = collect(view.profile_primitives())?;
    let profile = close_profile(&primitives, &sources.footprints);
    for product in users {
        emitter.product = Some(product);
        if profile.unclosed_edges > 0 {
            emitter.warn(
                "outline_not_closed",
                format!(
                    "{} Edge.Cuts edges do not close into a loop",
                    profile.unclosed_edges
                ),
                None,
            );
        }
        if profile.regions.is_empty() {
            emitter.warn(
                "outline_absent",
                "board has no closed Edge.Cuts profile".to_owned(),
                None,
            );
        }
    }
    Ok(profile.regions)
}

/// Parsed board state shared by the technical products.
struct Board<'a, 'v> {
    sources: &'a Sources<'v>,
    setup: Option<&'a PcbSetup>,
    stack: &'a Stack,
    regions: &'a [PlanarRegion2d],
    graphics: &'a (Vec<PcbGraphic>, Vec<PcbFootprintGraphic>),
    /// Present whenever a drawn product is requested.
    text: Option<&'a Text>,
}

/// Text facts and the plot document that places board and footprint text.
struct Text {
    context: TextContext,
    /// `None` when the board cannot be plotted.
    document: Option<BoardPlotDocument>,
}

impl Text {
    fn emit_copper(&self, copper: &CopperStack, emitter: &mut Emitter) {
        if self.document.is_none() {
            emitter.warn(
                "text_not_plotted",
                "board text could not be plotted; copper text is not materialized".to_owned(),
                None,
            );
        }
        let on_copper = |layer: &str| copper.key(layer).is_some();
        let placed = document_graphics(self.document.as_ref(), &self.context, &on_copper);
        emit_copper_text(&placed, copper, emitter);
    }
}

const TECHNICAL_PRODUCTS: [MaterialProduct; 3] = [
    MaterialProduct::SolderMask,
    MaterialProduct::Paste,
    MaterialProduct::Silkscreen,
];

/// Board and footprint graphics for the technical products.
fn source_graphics(
    view: &PcbView<'_>,
) -> Result<(Vec<PcbGraphic>, Vec<PcbFootprintGraphic>), MaterializationError> {
    Ok((
        collect(view.graphics())?,
        collect(view.footprint_graphics())?,
    ))
}

/// Footprint text facts the plot document does not carry. Texts that fail
/// to decode keep KiCad's default (kept upright).
/// Whether a board text's `(layer ... knockout)` form carries the flag,
/// which the plot document keeps only for cached outline text.
fn layer_has_knockout(source: &str, graphic: &PcbGraphic) -> bool {
    let Some(text) = source.get(graphic.source_range.clone()) else {
        return false;
    };
    let Ok(Sexp::List(items)) = crate::sexpr::parse(text) else {
        return false;
    };
    items.iter().any(|item| match item {
        Sexp::List(layer) => {
            matches!(layer.first(), Some(Sexp::Atom(head)) if head.as_ref() == "layer")
                && layer
                    .iter()
                    .any(|value| matches!(value, Sexp::Atom(flag) if flag.as_ref() == "knockout"))
        }
        _ => false,
    })
}

fn text_context(source: &str, view: &PcbView<'_>, graphics: &[PcbGraphic]) -> TextContext {
    let texts = view.footprint_texts().flatten().filter_map(|text| {
        let facts = FootprintTextFacts {
            unlocked: text.unlocked,
            justify: text.effects.justify,
            knockout: text.knockout,
        };
        Some((text.uuid?, facts))
    });
    let properties = view
        .footprint_properties()
        .flatten()
        .filter_map(|property| {
            let facts = FootprintTextFacts {
                unlocked: property.unlocked,
                justify: property.effects.justify,
                knockout: property.knockout,
            };
            Some((property.uuid?, facts))
        });
    TextContext {
        version: view.metadata().map_or(0, |metadata| metadata.version),
        texts: texts.chain(properties).collect(),
        board_knockout: graphics
            .iter()
            .filter(|graphic| graphic.kind == PcbGraphicKind::Text)
            .filter(|graphic| layer_has_knockout(source, graphic))
            .filter_map(|graphic| graphic.uuid.clone())
            .collect(),
    }
}

fn emit_technical(board: &Board<'_, '_>, products: &[MaterialProduct], emitter: &mut Emitter) {
    let wanted: Vec<MaterialProduct> = TECHNICAL_PRODUCTS
        .into_iter()
        .filter(|product| products.contains(product))
        .collect();
    let Some(Text { context, document }) = board.text.filter(|_| !wanted.is_empty()) else {
        return;
    };
    let margins = BoardMargins::from_setup(board.setup, context.version);
    let graphics = SourceGraphics {
        board: &board.graphics.0,
        footprint: &board.graphics.1,
        footprints: &board.sources.footprints,
        zones: &board.sources.technical_zones,
        zone_ids: &board.sources.zone_ids,
        mask_margin_nm: margins.mask_nm,
    };
    let placed = technical_graphics(&graphics, document.as_ref(), context);
    let technical = TechnicalBoard {
        stack: board.stack,
        regions: board.regions,
        margins: &margins,
        footprints: &board.sources.footprints,
        pads: &board.sources.pads,
        vias: &board.sources.vias,
        routes: &routes(&board.sources.segments, &board.sources.arcs),
        graphics: &placed,
        text_plotted: document.is_some(),
    };
    for product in wanted {
        technical.emit(product, emitter);
    }
}

struct Pads<'a> {
    copper: &'a CopperStack,
    flash: &'a FlashLayers,
    footprints: &'a [PcbFootprint],
}

impl Pads<'_> {
    /// Origin and board placement of `pad`, or a diagnostic when its
    /// footprint is missing.
    fn placement(&self, pad: &PcbPad, emitter: &mut Emitter) -> Option<(Origin, PadFrame)> {
        place_pad(pad, self.footprints, emitter).map(|placed| (placed.origin, placed.frame))
    }

    fn lands(&self, pad: &PcbPad, frame: &PadFrame, origin: &Origin, emitter: &mut Emitter) {
        let layers = self
            .flash
            .pads
            .get(&origin.uid)
            .cloned()
            .unwrap_or_else(|| self.copper.expand(&pad.layers));
        let unknown = self.copper.unknown(&pad.layers);
        if !unknown.is_empty() {
            emitter.unknown_layers(&unknown, &origin.uid);
        }
        for layer in layers {
            let Some(slice) = self.copper.key(&layer) else {
                continue;
            };
            match resolve_pad_copper_layer(pad, &layer) {
                Ok(resolved) if npth_without_copper(pad, &resolved) => {}
                Ok(resolved) => land(&resolved, frame, origin, slice, emitter),
                Err(cause) => emitter.warn(
                    "unsupported_padstack",
                    format!("pad layer {layer}: {cause}"),
                    Some(origin.uid.clone()),
                ),
            }
        }
    }
}

/// The design facts (a1) of the decoded board.
fn board_facts(
    sources: &Sources<'_>,
    rules: &ProjectRules,
    copper: &CopperStack,
    graphics: &[PcbFootprintGraphic],
    version: i64,
    emitter: &mut Emitter,
) -> DesignFacts {
    let inputs = FactInputs {
        rules,
        zones: ZoneInputs {
            zones: &sources.zones,
            footprint_zones: &sources.footprint_zones,
            footprints: &sources.footprints,
            copper,
            ids: &sources.zone_ids,
            version,
        },
        pads: &sources.pads,
        graphics,
    };
    design_facts(&inputs, emitter)
}

/// Component records, with each footprint's net-tie and jumper groups.
fn components(
    sources: &Sources<'_>,
    graphics: &[PcbFootprintGraphic],
    version: i64,
) -> Vec<Component> {
    let mut pads: Vec<Vec<&PcbPad>> = vec![Vec::new(); sources.footprints.len()];
    for pad in &sources.pads {
        if let Some(owned) = pads.get_mut(pad.footprint_index) {
            owned.push(pad);
        }
    }
    let mut drawings: Vec<Vec<&PcbGraphic>> = vec![Vec::new(); sources.footprints.len()];
    for owned in graphics {
        if let Some(list) = drawings.get_mut(owned.footprint_index) {
            list.push(&owned.graphic);
        }
    }
    sources
        .footprints
        .iter()
        .zip(pads.iter().zip(&drawings))
        .map(|(footprint, (owned, drawn))| {
            let mut record = component(footprint);
            record.body_bounds = body_bounds(footprint, drawn);
            record.net_tie_groups = net_tie_groups(footprint, owned, version);
            record.jumper_groups = jumper_groups(footprint, owned);
            record
        })
        .collect()
}

/// Body extent in footprint-local coordinates: the courtyard on the
/// footprint's side, else its fabrication outline. KiCad stores no body
/// height, so that stays unknown.
fn body_bounds(footprint: &PcbFootprint, drawn: &[&PcbGraphic]) -> Option<NmBounds> {
    let back = footprint.layer.as_deref() == Some("B.Cu");
    let (courtyard, fabrication) = if back {
        ("B.CrtYd", "B.Fab")
    } else {
        ("F.CrtYd", "F.Fab")
    };
    outline_bounds(drawn.iter().copied(), courtyard)
        .or_else(|| outline_bounds(drawn.iter().copied(), fabrication))
}

fn component(footprint: &PcbFootprint) -> Component {
    Component {
        refdes: reference(footprint),
        footprint: footprint.library_link.clone(),
        side: if footprint.layer.as_deref() == Some("B.Cu") {
            BoardSide::Back
        } else {
            BoardSide::Front
        },
        affine: footprint_affine(footprint),
        source_uid: source_uid(
            "footprint",
            footprint.uuid.as_deref(),
            footprint.source_range.start,
        ),
        body_bounds: None,
        body_height_nm: None,
        net_tie_groups: Vec::new(),
        jumper_groups: Vec::new(),
    }
}

#[cfg(test)]
#[path = "rule_one_tests.rs"]
mod rule_one_tests;
