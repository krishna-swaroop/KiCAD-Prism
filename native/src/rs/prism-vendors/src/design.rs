//! The shared core: one normalised assembly view from the bundle's
//! `occurrences` and `placements` members.
//!
//! The rules are Cruncher 2026.9.7's: `kicad_manufacturing_design.py`
//! (`to_bom`, `to_pnp`, `_include_pnp_component`, `_merged_parameters`,
//! `_footprint_position_from_aux_origin`) and `bom_pnp_model.py`
//! (normalisation, canonical fields, grouping and sorting). The bundle's
//! `occurrences` member already folds the schematic hierarchy's DNP / BOM /
//! board / position state and keeps each variant record unresolved, so this
//! module applies the selected variant exactly as `assemble(…)` does and
//! joins the board footprints through `placements`.

use crate::Error;
use prism_kicad_contracts::generated::prism_occurrences_a0::{
    KiCadUuid, OccurrencesA0, OccurrencesFootprint, OccurrencesReference, OccurrencesSymbol,
    OccurrencesVariantRecord,
};
use prism_kicad_contracts::generated::prism_placements_a1::{
    PlacementsA1, PlacementsFootprint, PointNm, Side,
};
use prism_kicad_core::{PcbLimits, PcbView};
use std::collections::BTreeMap;

/// Standard KiCad field names that are not BOM parameters
/// (`kicad_manufacturing_design.py` `_STANDARD_FIELD_NAMES`).
const STANDARD_FIELDS: [&str; 3] = ["reference", "value", "footprint"];

/// Cruncher's default canonical field aliases (`bom_pnp_model.py`
/// `_default_aliases`), in their fixed order.
const DEFAULT_ALIASES: [(&str, &[&str]); 6] = [
    (
        "manufacturer",
        &[
            "Manufacturer",
            "Mfr",
            "MFG",
            "Manufacturer Name",
            "Mfr Name",
        ],
    ),
    (
        "manufacturer_part_number",
        &[
            "Manufacturer Part Number",
            "MPN",
            "Mfr Part Number",
            "Mfr PN",
            "MFG PN",
            "Part Number",
        ],
    ),
    (
        "jlcpcb_part_number",
        &[
            "JLCPCB Part #",
            "JLCPCB Part Number",
            "JLC Part #",
            "JLC Part Number",
            "LCSC Part #",
            "LCSC Part Number",
            "LCSC",
        ],
    ),
    ("value", &["Value", "Comment"]),
    ("description", &["Description", "Desc"]),
    ("footprint", &["Footprint", "Pattern", "Package"]),
];

/// One footprint's authored fields, as the board source writes them.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct FootprintFacts {
    /// Every authored property, in the order the board writes it.
    pub properties: Vec<(String, String)>,
}

impl FootprintFacts {
    fn property(&self, name: &str) -> Option<&str> {
        self.properties
            .iter()
            .rev()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.as_str())
    }
}

/// The board's footprint fields, keyed by uuid and reference.
#[derive(Clone, Debug, Default)]
pub struct BoardFacts {
    /// By `(uuid …)`.
    pub by_uuid: BTreeMap<String, FootprintFacts>,
    /// By `Reference`, last in board order wins.
    pub by_reference: BTreeMap<String, FootprintFacts>,
}

impl BoardFacts {
    /// Read the board's footprint fields through the core's parser.
    pub fn parse(text: &str) -> Result<Self, Error> {
        let view = PcbView::parse(text, PcbLimits::default())
            .map_err(|error| Error::input(format!("the board does not parse: {error}")))?;
        let footprints: Vec<_> = view.decoded_footprints().to_vec();
        let mut properties: BTreeMap<usize, Vec<(String, String)>> = BTreeMap::new();
        for property in view.decoded_footprint_properties() {
            let property = property.clone().map_err(|error| {
                Error::input(format!("a footprint property does not parse: {error}"))
            })?;
            properties
                .entry(property.footprint_index)
                .or_default()
                .push((property.name, property.value));
        }
        let mut facts = Self::default();
        for (index, footprint) in footprints.into_iter().enumerate() {
            let footprint = footprint
                .map_err(|error| Error::input(format!("a footprint does not parse: {error}")))?;
            let mut authored = properties.remove(&index).unwrap_or_default();
            if footprint.value.is_some() && !authored.iter().any(|(name, _)| name == "Value") {
                authored.push((
                    "Value".to_string(),
                    footprint.value.clone().unwrap_or_default(),
                ));
            }
            if !footprint.description.is_empty()
                && !authored.iter().any(|(name, _)| name == "Description")
            {
                authored.push(("Description".to_string(), footprint.description.clone()));
            }
            let facts_one = FootprintFacts {
                properties: authored,
            };
            if let Some(uuid) = &footprint.uuid {
                facts.by_uuid.insert(uuid.clone(), facts_one.clone());
            }
            if let Some(reference) = &footprint.reference {
                facts.by_reference.insert(reference.clone(), facts_one);
            }
        }
        Ok(facts)
    }

    fn for_uuid(&self, uuid: &str) -> Option<&FootprintFacts> {
        self.by_uuid.get(uuid)
    }
}

/// A placement as the vendor outputs need it.
#[derive(Clone, Debug)]
pub struct Placement {
    /// True when the footprint is on the back.
    pub back: bool,
    /// Board-absolute anchor in nanometres.
    pub position_nm: PointNm,
    /// As written, not normalized.
    pub rotation_deg: f64,
}

/// One component of the assembly view.
#[derive(Clone, Debug)]
pub struct Component {
    /// Reference designator.
    pub reference: String,
    /// `<documentPath>#<uuid>` of its board footprint, or of its symbol when
    /// the board has no matching footprint.
    pub key: String,
    /// The BOM value (`Value`, then the footprint's `Value`).
    pub value: String,
    /// Its footprint name (`Footprint`, then the footprint's library link).
    pub footprint: String,
    /// Symbol library id, or the footprint name for a board-only part.
    pub library_ref: String,
    /// Its description.
    pub description: String,
    /// Merged symbol then footprint properties, minus the standard names.
    pub parameters: Vec<(String, String)>,
    /// Effective DNP in the selected variant.
    pub dnp: bool,
    /// Effective BOM eligibility in the selected variant.
    pub in_bom: bool,
    /// Effective board eligibility in the selected variant.
    pub on_board: bool,
    /// Effective position-file eligibility in the selected variant.
    pub in_pos: bool,
    /// Its placement, when the board has a matching footprint.
    pub placement: Option<Placement>,
}

impl Component {
    /// Cruncher's canonical fields (`bom_pnp_model.py`
    /// `_resolve_canonical_fields`).
    #[must_use]
    pub fn canonical_fields(&self) -> BTreeMap<String, String> {
        let lookup = casefold_lookup(&self.parameters);
        let intrinsic = [
            ("value", self.value.as_str()),
            ("description", self.description.as_str()),
            ("footprint", self.footprint.as_str()),
        ];
        let mut canonical = BTreeMap::new();
        for (name, aliases) in DEFAULT_ALIASES {
            let fallback = intrinsic
                .iter()
                .find(|(key, _)| *key == name)
                .map(|(_, value)| *value)
                .unwrap_or_default();
            if let Some(value) = resolve_one(name, aliases, &lookup)
                .or_else(|| (!fallback.is_empty()).then(|| fallback.to_string()))
            {
                canonical.insert(name.to_string(), value);
            }
        }
        canonical
    }
}

/// Whether a variant record's name selects `wanted`, ignoring ASCII case.
///
/// Footprints, artwork and the semantic index already match this way; symbols
/// use the same rule here so a mixed-case `--variant` applies both halves of
/// one component.
#[must_use]
pub fn variant_name_matches(record: &str, wanted: &str) -> bool {
    record.eq_ignore_ascii_case(wanted)
}

/// Whether `requested` selects a variant of a design that defines `names`.
///
/// `default` (any case) always does: it is the design without overrides, the
/// name Release Studio sends when a design has no variants, and the kicad-cli
/// steps already treat it as no variant.
#[must_use]
pub fn variant_known(names: &[String], requested: &str) -> bool {
    requested.eq_ignore_ascii_case("default")
        || names
            .iter()
            .any(|name| variant_name_matches(name, requested))
}

/// Every variant name the design defines, in first-seen order: the project
/// registries' declarations, then the records on sheets, symbols and
/// footprints (occurrences-a0 does not repeat record-only names in
/// `variantDeclarations`). Names that differ only in case collapse to the
/// first one seen.
#[must_use]
pub fn variant_names(occurrences: &OccurrencesA0) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    let mut push = |name: &str| {
        if !names
            .iter()
            .any(|existing| variant_name_matches(existing, name))
        {
            names.push(name.to_string());
        }
    };
    for declaration in &occurrences.variant_declarations {
        push(&declaration.name);
    }
    for sheet in &occurrences.sheets {
        for record in &sheet.variants {
            push(&record.name);
        }
    }
    for symbol in &occurrences.symbols {
        for record in &symbol.variants {
            push(&record.name);
        }
    }
    for footprint in &occurrences.footprints {
        for record in &footprint.variants {
            push(&record.name);
        }
    }
    names
}

/// The normalised design view of one bundle at one variant.
#[derive(Clone, Debug)]
pub struct Design {
    /// `(setup (aux_axis_origin x y))`, or 0,0 when absent.
    pub aux_axis_origin_nm: PointNm,
    /// One component per reference, in code point order.
    pub components: Vec<Component>,
}

impl Design {
    /// Build the view from the bundle members and the board facts.
    pub fn build(
        occurrences: &OccurrencesA0,
        placements: &PlacementsA1,
        board: Option<&BoardFacts>,
        variant: Option<&str>,
    ) -> Result<Self, Error> {
        let placements_by_uuid: BTreeMap<&str, &PlacementsFootprint> = placements
            .footprints
            .iter()
            .map(|footprint| (footprint.uuid.0.as_str(), footprint))
            .collect();
        let occurrences_by_uuid: BTreeMap<&str, &OccurrencesFootprint> = occurrences
            .footprints
            .iter()
            .map(|footprint| (footprint.uuid.0.as_str(), footprint))
            .collect();
        let mut symbols: BTreeMap<&str, &OccurrencesSymbol> = BTreeMap::new();
        for symbol in &occurrences.symbols {
            if let Some(reference) = symbol.reference.as_ref() {
                // `assemble` is last-writer-wins across multi-unit symbols.
                symbols.insert(reference.as_str(), symbol);
            }
        }
        let references: BTreeMap<&str, &OccurrencesReference> = occurrences
            .references
            .iter()
            .map(|reference| (reference.reference.as_str(), reference))
            .collect();
        let components = ordered_references(occurrences)
            .into_iter()
            .map(|reference| {
                build_component(
                    reference,
                    symbols.get(reference).copied(),
                    references.get(reference).copied(),
                    &placements_by_uuid,
                    &occurrences_by_uuid,
                    board,
                    variant,
                )
            })
            .collect();
        Ok(Self {
            aux_axis_origin_nm: placements.aux_axis_origin.clone().unwrap_or(PointNm {
                x_nm: 0.into(),
                y_nm: 0.into(),
            }),
            components,
        })
    }
}

/// The references in assembly order: symbol occurrences first, then the
/// board-only references, each once.
fn ordered_references(occurrences: &OccurrencesA0) -> Vec<&str> {
    let mut names: Vec<&str> = Vec::new();
    for symbol in &occurrences.symbols {
        if let Some(reference) = symbol.reference.as_ref()
            && !names.contains(&reference.as_str())
        {
            names.push(reference.as_str());
        }
    }
    for footprint in &occurrences.footprints {
        if let Some(reference) = footprint.reference.as_ref()
            && !names.contains(&reference.as_str())
        {
            names.push(reference.as_str());
        }
    }
    names
}

/// Apply a footprint variant's field overrides to its authored fields
/// (`resolve_footprint` + `to_bom`'s `footprint_fields`).
fn footprint_variant_facts(
    facts: Option<FootprintFacts>,
    footprint: Option<&OccurrencesFootprint>,
    variant: Option<&str>,
) -> Option<FootprintFacts> {
    let mut facts = facts?;
    let Some(record) = variant.and_then(|name| {
        footprint?
            .variants
            .iter()
            .find(|record| variant_name_matches(&record.name, name))
    }) else {
        return Some(facts);
    };
    for (name, value) in record.fields.iter() {
        match facts.properties.iter_mut().find(|(key, _)| key == name) {
            Some(existing) => existing.1 = value.clone(),
            None => facts.properties.push((name.clone(), value.clone())),
        }
    }
    Some(facts)
}

/// The assembly row of one reference: symbol, footprint, variant and fields.
#[allow(
    clippy::too_many_arguments,
    reason = "the join carries the five lookup maps it was built from"
)]
fn build_component(
    reference: &str,
    symbol: Option<&OccurrencesSymbol>,
    joined: Option<&OccurrencesReference>,
    placements_by_uuid: &BTreeMap<&str, &PlacementsFootprint>,
    occurrences_by_uuid: &BTreeMap<&str, &OccurrencesFootprint>,
    board: Option<&BoardFacts>,
    variant: Option<&str>,
) -> Component {
    let footprint_uuid = joined.and_then(|joined| joined.footprints.last());
    let footprint =
        footprint_uuid.and_then(|uuid| placements_by_uuid.get(uuid.0.as_str()).copied());
    let current = footprint_uuid.and_then(|uuid| occurrences_by_uuid.get(uuid.0.as_str()).copied());
    let facts = footprint_variant_facts(
        footprint_uuid
            .and_then(|uuid| board.and_then(|facts| facts.for_uuid(&uuid.0)))
            .cloned(),
        current,
        variant,
    );
    let resolved_symbol = resolve_symbol(symbol, variant);
    let resolved_footprint = resolve_footprint(current, variant);
    let symbol_lib_id = symbol.map(|symbol| symbol.lib_id.as_str());
    let (value, description, footprint_name, library_ref) = row_fields(
        &resolved_symbol.properties,
        symbol_lib_id,
        facts.as_ref(),
        footprint,
    );
    let parameters = merged_parameters(&resolved_symbol.properties, facts.as_ref());
    let flags = flags(reference, &resolved_symbol, resolved_footprint.as_ref());
    let placement = footprint.map(|footprint| Placement {
        back: matches!(footprint.side, Side::Back),
        position_nm: footprint.position_nm.clone(),
        rotation_deg: footprint.rotation_deg.0,
    });
    Component {
        reference: reference.to_string(),
        key: component_key(footprint_uuid, symbol, occurrences_by_uuid),
        value,
        footprint: footprint_name,
        library_ref,
        description,
        parameters,
        dnp: flags.dnp,
        in_bom: flags.in_bom,
        on_board: flags.on_board,
        in_pos: flags.in_pos,
        placement,
    }
}

struct Flags {
    dnp: bool,
    in_bom: bool,
    on_board: bool,
    in_pos: bool,
}

/// Cruncher's `assemble` flags for one reference (`to_bom` / `to_pnp`).
fn flags(reference: &str, symbol: &ResolvedSymbol, footprint: Option<&ResolvedFootprint>) -> Flags {
    let virtual_reference = reference.starts_with('#');
    Flags {
        in_bom: !virtual_reference
            && !symbol.exclude_from_bom
            && footprint.is_none_or(|footprint| !footprint.exclude_from_bom),
        dnp: symbol.dnp || footprint.is_some_and(|footprint| footprint.dnp),
        on_board: symbol.on_board,
        in_pos: !virtual_reference
            && match footprint {
                Some(footprint) => !footprint.exclude_from_pos_files,
                None => symbol.in_pos_files,
            },
    }
}

fn component_key(
    footprint_uuid: Option<&KiCadUuid>,
    symbol: Option<&OccurrencesSymbol>,
    occurrences_by_uuid: &BTreeMap<&str, &OccurrencesFootprint>,
) -> String {
    if let Some(uuid) = footprint_uuid {
        occurrences_by_uuid
            .get(uuid.0.as_str())
            .map(|footprint| format!("{}#{}", footprint.document_path.0, uuid.0))
            .unwrap_or_default()
    } else {
        symbol
            .map(|symbol| format!("{}#{}", symbol.document_path.0, symbol.symbol_uuid.0))
            .unwrap_or_default()
    }
}

/// One symbol's variant-resolved flags and properties.
struct ResolvedSymbol {
    properties: Vec<(String, String)>,
    dnp: bool,
    exclude_from_bom: bool,
    on_board: bool,
    in_pos_files: bool,
}

fn resolve_symbol(symbol: Option<&OccurrencesSymbol>, variant: Option<&str>) -> ResolvedSymbol {
    let Some(symbol) = symbol else {
        return ResolvedSymbol {
            properties: Vec::new(),
            dnp: false,
            exclude_from_bom: false,
            on_board: true,
            in_pos_files: true,
        };
    };
    let record = variant.and_then(|name| {
        symbol
            .variants
            .iter()
            .find(|record| variant_name_matches(&record.name, name))
    });
    ResolvedSymbol {
        properties: apply_fields(&symbol.properties, record),
        dnp: record.and_then(|record| record.dnp).unwrap_or(symbol.dnp),
        exclude_from_bom: record
            .and_then(|record| record.exclude_from_bom)
            .unwrap_or(symbol.exclude_from_bom),
        on_board: !record
            .and_then(|record| record.exclude_from_board)
            .unwrap_or(symbol.exclude_from_board),
        in_pos_files: !record
            .and_then(|record| record.exclude_from_pos_files)
            .unwrap_or(symbol.exclude_from_pos_files),
    }
}

/// One footprint's variant-resolved flags.
struct ResolvedFootprint {
    dnp: bool,
    exclude_from_bom: bool,
    exclude_from_pos_files: bool,
}

fn resolve_footprint(
    footprint: Option<&OccurrencesFootprint>,
    variant: Option<&str>,
) -> Option<ResolvedFootprint> {
    let footprint = footprint?;
    let record = variant.and_then(|name| {
        footprint
            .variants
            .iter()
            .find(|record| variant_name_matches(&record.name, name))
    });
    Some(ResolvedFootprint {
        dnp: record
            .and_then(|record| record.dnp)
            .unwrap_or(footprint.dnp),
        exclude_from_bom: record
            .and_then(|record| record.exclude_from_bom)
            .unwrap_or(footprint.exclude_from_bom),
        exclude_from_pos_files: record
            .and_then(|record| record.exclude_from_pos_files)
            .unwrap_or(footprint.exclude_from_pos_files),
    })
}

/// Apply a variant record's field overrides to the symbol's properties.
fn apply_fields(
    properties: &BTreeMap<String, String>,
    record: Option<&OccurrencesVariantRecord>,
) -> Vec<(String, String)> {
    let mut result: Vec<(String, String)> = properties
        .iter()
        .map(|(name, value)| (name.clone(), value.clone()))
        .collect();
    if let Some(record) = record {
        for (name, value) in record.fields.iter() {
            if let Some(existing) = result.iter_mut().find(|(key, _)| key == name) {
                existing.1 = value.clone();
            } else {
                result.push((name.clone(), value.clone()));
            }
        }
    }
    result
}

/// Cruncher's `to_bom` row fields (`kicad_manufacturing_design.py`).
fn row_fields(
    symbol: &[(String, String)],
    symbol_lib_id: Option<&str>,
    footprint: Option<&FootprintFacts>,
    placement: Option<&PlacementsFootprint>,
) -> (String, String, String, String) {
    let symbol_property = |name: &str| {
        symbol
            .iter()
            .rev()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.as_str())
            .unwrap_or_default()
    };
    let footprint_property = |name: &str| {
        footprint
            .and_then(|footprint| footprint.property(name))
            .unwrap_or_default()
    };
    let placement_lib_id = placement
        .and_then(|placement| placement.lib_id.as_ref().map(|id| id.as_str()))
        .unwrap_or_default();
    let value = first_text(&[symbol_property("Value"), footprint_property("Value")]);
    let description = first_text(&[
        symbol_property("Description"),
        footprint_property("Description"),
    ]);
    let library_ref = if symbol_lib_id.is_some() {
        symbol_lib_id.unwrap_or_default().to_string()
    } else {
        placement_lib_id.to_string()
    };
    let footprint_name = first_text(&[symbol_property("Footprint"), placement_lib_id]);
    (value, description, footprint_name, library_ref)
}

/// `_merged_parameters` for symbol then footprint fields.
fn merged_parameters(
    symbol: &[(String, String)],
    footprint: Option<&FootprintFacts>,
) -> Vec<(String, String)> {
    let mut merged: Vec<(String, String)> = Vec::new();
    let mut push = |name: &str, value: &str| {
        if name.is_empty() || STANDARD_FIELDS.contains(&name.to_ascii_lowercase().as_str()) {
            return;
        }
        if value.is_empty() || merged.iter().any(|(key, _)| key == name) {
            return;
        }
        merged.push((name.to_string(), value.to_string()));
    };
    for (name, value) in symbol {
        push(name, value);
    }
    if let Some(footprint) = footprint {
        for (name, value) in &footprint.properties {
            push(name, value);
        }
    }
    merged
}

/// `_first_text`: the first non-empty trimmed value.
fn first_text(values: &[&str]) -> String {
    for value in values {
        let text = value.trim();
        if !text.is_empty() {
            return text.to_string();
        }
    }
    String::new()
}

/// A case-insensitive parameter lookup, preserving the source name
/// (`bom_pnp_model.py` `_casefold_parameter_lookup`).
fn casefold_lookup(parameters: &[(String, String)]) -> BTreeMap<String, (String, String)> {
    let mut lookup = BTreeMap::new();
    for (name, value) in parameters {
        if value.is_empty() {
            continue;
        }
        lookup
            .entry(name.to_lowercase())
            .or_insert_with(|| (name.clone(), value.clone()));
    }
    lookup
}

/// `_resolve_canonical_field`: aliases first, then the intrinsic fallback.
fn resolve_one(
    name: &str,
    aliases: &[&str],
    lookup: &BTreeMap<String, (String, String)>,
) -> Option<String> {
    for alias in std::iter::once(&name).chain(aliases.iter()) {
        if let Some((_, value)) = lookup.get(&alias.to_lowercase()) {
            return Some(value.clone());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn symbol_with_variant() -> OccurrencesSymbol {
        serde_json::from_str(
            r#"{
                "kiidPath": "/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002",
                "sheetPath": "/00000000-0000-0000-0000-000000000001",
                "symbolUuid": "00000000-0000-0000-0000-000000000002",
                "documentPath": "board.kicad_sch",
                "libId": "Device:R",
                "reference": "R1",
                "instanceMatched": true,
                "unit": 1,
                "dnp": false,
                "excludeFromBom": false,
                "excludeFromBoard": false,
                "excludeFromSim": false,
                "excludeFromPosFiles": false,
                "properties": {"Reference": "R1", "Value": "10k"},
                "bomFields": {},
                "variants": [{
                    "name": "Pro",
                    "dnp": true,
                    "excludeFromBom": true,
                    "fields": {"Value": "22k"}
                }]
            }"#,
        )
        .unwrap()
    }

    fn footprint_with_variant() -> OccurrencesFootprint {
        serde_json::from_str(
            r#"{
                "uuid": "00000000-0000-0000-0000-000000000003",
                "documentPath": "board.kicad_pcb",
                "reference": "R1",
                "dnp": false,
                "excludeFromBom": false,
                "excludeFromPosFiles": false,
                "variants": [{
                    "name": "Pro",
                    "dnp": true,
                    "excludeFromBom": true,
                    "excludeFromPosFiles": true,
                    "fields": {"Tolerance": "1%"}
                }]
            }"#,
        )
        .unwrap()
    }

    #[test]
    fn default_is_known_even_when_the_design_defines_no_variants() {
        assert!(variant_known(&[], "default"));
        assert!(variant_known(&[], "Default"));
        assert!(!variant_known(&[], "pro"));
        let names = vec!["Pro".to_string()];
        assert!(variant_known(&names, "pro"));
        assert!(!variant_known(&names, "lite"));
    }

    #[test]
    fn a_mixed_case_variant_applies_symbol_and_footprint_overrides() {
        let symbol = symbol_with_variant();
        let resolved = resolve_symbol(Some(&symbol), Some("pro"));
        assert!(resolved.dnp);
        assert!(resolved.exclude_from_bom);
        assert!(
            resolved
                .properties
                .iter()
                .any(|(name, value)| name == "Value" && value == "22k")
        );

        let footprint = footprint_with_variant();
        let resolved_footprint = resolve_footprint(Some(&footprint), Some("pro")).unwrap();
        assert!(resolved_footprint.dnp);
        assert!(resolved_footprint.exclude_from_bom);
        assert!(resolved_footprint.exclude_from_pos_files);

        let facts = footprint_variant_facts(
            Some(FootprintFacts {
                properties: vec![("Value".to_string(), "10k".to_string())],
            }),
            Some(&footprint),
            Some("pro"),
        )
        .unwrap();
        assert_eq!(facts.property("Tolerance"), Some("1%"));
    }

    #[test]
    fn variant_names_collapse_names_that_differ_only_in_case() {
        let occurrences: OccurrencesA0 = serde_json::from_str(
            r#"{
                "schema": "prism.occurrences.a0",
                "sheets": [],
                "symbols": [],
                "footprints": [],
                "references": [],
                "variantDeclarations": [
                    {"name": "Pro", "source": "project"},
                    {"name": "pro", "source": "pcb"}
                ]
            }"#,
        )
        .unwrap();
        assert_eq!(variant_names(&occurrences), vec!["Pro".to_string()]);
    }
}
