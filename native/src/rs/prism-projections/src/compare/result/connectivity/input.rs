//! One revision's schematic view of the semantic index (D7) and the lookup
//! tables the connectivity diff needs, built once per revision and indexing
//! into the member's vectors.

use super::super::Revision;
use crate::compare::entry::Entry;
use prism_kicad_contracts::generated::prism_occurrences_a0::OccurrencesSymbol;
use prism_kicad_contracts::generated::prism_semantic_index_a2::{
    SemanticIndexA2, SemanticIndexTerminal,
};
use std::collections::{BTreeSet, HashMap};

/// A `(reference, pin)` terminal identity.
pub(super) type Pair<'a> = (&'a str, &'a str);

/// The terminals a net connects: its cross-revision connectivity identity.
pub(super) type Fingerprint<'a> = BTreeSet<Pair<'a>>;

/// One component occurrence's parent identity (`revision_components`'s
/// `schematicRefs`). [`View::components`] keeps the first per reference, as
/// `_semantic_lookups` does with `components_by_reference`.
pub(super) struct Component<'a> {
    /// The occurrence's `symbolUuid` (`_component_sources`).
    pub symbol_uuid: &'a str,
    /// The occurrence's document (`_component_page`).
    pub page: &'a str,
}

/// A revision's schematic view and hot lookup tables.
pub(super) struct View<'a> {
    /// The revision's semantic index; the schematic view is derived on demand.
    pub semantic: &'a SemanticIndexA2,
    /// Positions in `semantic.nets` of the schematic nets (`aliases` present, D7).
    pub nets: Vec<usize>,
    /// Positions in `semantic.terminals` of the netlist terminals
    /// (`schematicNetName` present, D7).
    pub terminals: Vec<usize>,
    /// `schematicNetName` -> the terminals that name it (`terminal_pairs_by_net`).
    pub pairs_by_net: HashMap<&'a str, Fingerprint<'a>>,
    /// `(reference, pin)` -> position in `semantic.terminals`, first wins.
    pub terminal_by_pair: HashMap<Pair<'a>, usize>,
    /// Reference -> its first occurrence's symbol (`components_by_reference`).
    pub components: HashMap<&'a str, Component<'a>>,
    /// Native object uuid -> its entry (`_native_index`).
    pub native: HashMap<&'a str, &'a Entry>,
}

impl<'a> View<'a> {
    /// Build the view and its lookup tables from one revision.
    pub(super) fn new(revision: &'a Revision) -> Self {
        Self::from_parts(
            &revision.semantic_index,
            &revision.occurrences,
            &revision.objects.0,
        )
    }

    /// Build the view from a revision's members directly.
    pub(super) fn from_parts(
        semantic: &'a SemanticIndexA2,
        occurrences: &'a prism_kicad_contracts::generated::prism_occurrences_a0::OccurrencesA0,
        objects: &'a [Entry],
    ) -> Self {
        let nets = schematic_nets(semantic);
        let terminals = schematic_terminals(semantic);
        let (pairs_by_net, terminal_by_pair) = terminal_lookups(semantic, &terminals);
        let components = component_lookups(&occurrences.symbols);
        let native = objects
            .iter()
            .map(|entry| (entry.uuid.as_str(), entry))
            .collect();
        Self {
            semantic,
            nets,
            terminals,
            pairs_by_net,
            terminal_by_pair,
            components,
            native,
        }
    }

    /// A schematic net's name.
    pub(super) fn name(&self, net: usize) -> &'a str {
        self.semantic.nets[net].name.as_str()
    }

    /// A schematic net's terminal fingerprint (`_net_connectivity_fingerprint`).
    pub(super) fn fingerprint(&self, net: usize) -> Fingerprint<'a> {
        self.pairs_by_net
            .get(self.name(net))
            .cloned()
            .unwrap_or_default()
    }
}

/// The schematic nets: the member's, where `aliases` is present (D7).
fn schematic_nets(semantic: &SemanticIndexA2) -> Vec<usize> {
    semantic
        .nets
        .iter()
        .enumerate()
        .filter(|(_, net)| net.aliases.is_some())
        .map(|(index, _)| index)
        .collect()
}

/// The netlist terminals: the member's, where `schematicNetName` is present (D7).
fn schematic_terminals(semantic: &SemanticIndexA2) -> Vec<usize> {
    semantic
        .terminals
        .iter()
        .enumerate()
        .filter(|(_, terminal)| terminal.schematic_net_name.is_some())
        .map(|(index, _)| index)
        .collect()
}

/// `terminal_pairs_by_net` and `terminals_by_pair`: the first terminal for a
/// `(reference, pin)` wins, and a terminal names its net by its schematic name.
fn terminal_lookups<'a>(
    semantic: &'a SemanticIndexA2,
    terminals: &[usize],
) -> (HashMap<&'a str, Fingerprint<'a>>, HashMap<Pair<'a>, usize>) {
    let mut pairs_by_net: HashMap<&'a str, Fingerprint<'a>> = HashMap::new();
    let mut terminal_by_pair: HashMap<Pair<'a>, usize> = HashMap::new();
    for &index in terminals {
        let terminal = &semantic.terminals[index];
        let name = terminal_name(terminal);
        let pair = terminal_pair(terminal);
        pairs_by_net.entry(name).or_default().insert(pair);
        terminal_by_pair.entry(pair).or_insert(index);
    }
    (pairs_by_net, terminal_by_pair)
}

/// A schematic terminal's net name (always present in the view).
pub(super) fn terminal_name(terminal: &SemanticIndexTerminal) -> &str {
    terminal
        .schematic_net_name
        .as_ref()
        .map_or("", |name| name.as_str())
}

/// A schematic terminal's `(reference, pin)`.
pub(super) fn terminal_pair(terminal: &SemanticIndexTerminal) -> (&str, &str) {
    (terminal.reference.as_str(), terminal.pin.as_str())
}

/// `components_by_reference`: the first symbol occurrence per reference, as
/// `revision_components` produces them and `_semantic_lookups` keeps them.
fn component_lookups<'a>(symbols: &'a [OccurrencesSymbol]) -> HashMap<&'a str, Component<'a>> {
    let mut components = HashMap::new();
    for symbol in symbols {
        let reference = symbol.reference.as_ref().map_or("", |value| value.as_str());
        if reference.is_empty() || is_power_symbol(symbol) {
            continue;
        }
        components.entry(reference).or_insert_with(|| Component {
            symbol_uuid: symbol.symbol_uuid.as_str(),
            page: symbol.document_path.as_str(),
        });
    }
    components
}

/// A power port or `PWR_FLAG`: lib id starting with `power:` after case folding
/// (`design_compare_occurrences.is_power_symbol`).
pub(super) fn is_power_symbol(symbol: &OccurrencesSymbol) -> bool {
    symbol
        .lib_id
        .as_str()
        .get(..6)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("power:"))
}
