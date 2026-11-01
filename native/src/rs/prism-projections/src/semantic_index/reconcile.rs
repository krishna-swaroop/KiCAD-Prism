//! Split-net reconciliation, a port of `semantic_index_nets.py`
//! (`SplitNetClaims` :30-66 and `reconcile_split_nets` :69-163).
//!
//! The board is the authority on which nets exist and what they are called;
//! the schematic netlist supplies the schematic side. When a netlister stops a
//! bus member at a sheet boundary the two views name one physical net twice.
//! The pads they share still identify it: [`SplitNetClaims`] records those
//! pads during the board pass, and [`SplitNetClaims::reconcile`] folds each
//! schematic record into the board net it belongs to, leaving one record per
//! net.

use super::{State, string};
use serde_json::{Map, Value, json};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

/// Today's `SplitNetClaims` (semantic_index_nets.py:30-66): which schematic
/// nets the board renamed.
#[derive(Debug, Default)]
pub(super) struct SplitNetClaims {
    /// `self._schematic_names`, snapshotted when the claim set is built.
    schematic_names: BTreeSet<String>,
    /// `self.claims`: board net name → schematic net names whose pins sit on
    /// it, in first-seen order. A `Vec` alongside `positions` is an ordered set.
    claims: Vec<(String, Vec<String>)>,
    /// Board net name → its position in `claims`.
    positions: HashMap<String, usize>,
}

impl SplitNetClaims {
    /// `SplitNetClaims(net_by_name)` (semantic_index_nets.py:37-41), taken
    /// after the schematic passes and before the board pass.
    pub fn new(state: &State) -> Self {
        Self {
            schematic_names: state.net_index_by_name.keys().cloned().collect(),
            claims: Vec::new(),
            positions: HashMap::new(),
        }
    }

    /// `note_pad(board_name, schematic_name)` (semantic_index_nets.py:43-48):
    /// record a pad whose board net is not a netlist net but whose pin is on
    /// one. Both names are checked against the schematic snapshot.
    pub fn note_pad(&mut self, board_name: &str, schematic_name: &str) {
        if self.schematic_names.contains(board_name)
            || !self.schematic_names.contains(schematic_name)
        {
            return;
        }
        let position = match self.positions.get(board_name) {
            Some(&position) => position,
            None => {
                self.claims.push((board_name.to_owned(), Vec::new()));
                let position = self.claims.len() - 1;
                self.positions.insert(board_name.to_owned(), position);
                position
            }
        };
        let names = &mut self.claims[position].1;
        if !names.iter().any(|name| name == schematic_name) {
            names.push(schematic_name.to_owned());
        }
    }

    /// `reconcile(nets, terminals, indexes)` (semantic_index_nets.py:50-66).
    /// The `merged` report only feeds a log line, so it is not returned.
    pub fn reconcile(self, state: &mut State) {
        reconcile_split_nets(state, &self.claims);
    }
}

/// `reconcile_split_nets` (semantic_index_nets.py:69-163): fold each board net
/// and the schematic nets it is the same net as into one record.
fn reconcile_split_nets(state: &mut State, claims: &[(String, Vec<String>)]) {
    if claims.is_empty() {
        return;
    }
    // `index_by_name = {net["name"]: index}` (:101), a later duplicate winning.
    let mut index_by_name: HashMap<String, usize> = HashMap::with_capacity(state.nets.len());
    for (index, net) in state.nets.iter().enumerate() {
        if let Some(name) = net.get("name").and_then(Value::as_str) {
            index_by_name.insert(name.to_owned(), index);
        }
    }
    // `boards_by_schematic` (:102-105).
    let mut boards_by_schematic: HashMap<String, HashSet<String>> = HashMap::new();
    for (board_name, schematic_names) in claims {
        for schematic_name in schematic_names {
            boards_by_schematic
                .entry(schematic_name.clone())
                .or_default()
                .insert(board_name.clone());
        }
    }

    let mut absorbed: HashMap<usize, usize> = HashMap::new();
    let mut target_by_absorbed_uid: HashMap<String, usize> = HashMap::new();
    absorb_claims(
        state,
        claims,
        &index_by_name,
        &boards_by_schematic,
        &mut absorbed,
        &mut target_by_absorbed_uid,
    );
    if absorbed.is_empty() {
        return;
    }

    // Drop the absorbed records and renumber every net index around them
    // (:140-150).
    let renumbered = drop_absorbed(state, &absorbed);

    // `for key in (netByName, netByNetCode, netBySchematicUuid, netByPcbUuid)`
    // (:151-152).
    remap(&mut state.indexes.net_by_name, &renumbered);
    remap(&mut state.indexes.net_by_net_code, &renumbered);
    remap(&mut state.indexes.net_by_schematic_uuid, &renumbered);
    remap(&mut state.indexes.net_by_pcb_uuid, &renumbered);
    // Every kept net's aliases resolve to it (:153-155).
    for index in 0..state.nets.len() {
        let aliases: Vec<String> = state.nets[index]
            .get("aliases")
            .and_then(Value::as_array)
            .map(|items| items.iter().map(|value| string(Some(value))).collect())
            .unwrap_or_default();
        for alias in aliases {
            state.indexes.net_by_name.entry(alias).or_insert(index);
        }
    }

    // Terminals on the schematic side only (no pad) still name the old record;
    // the padded ones were moved by the board pass (:156-162).
    let targets = resolve_targets(state, &target_by_absorbed_uid, &renumbered);
    rewrite_terminals(state, &targets);
}

/// `for board_name, schematic_names in claims` (:109-136): mark each schematic
/// net the board absorbs and fold its record into the board's.
fn absorb_claims(
    state: &mut State,
    claims: &[(String, Vec<String>)],
    index_by_name: &HashMap<String, usize>,
    boards_by_schematic: &HashMap<String, HashSet<String>>,
    absorbed: &mut HashMap<usize, usize>,
    target_by_absorbed_uid: &mut HashMap<String, usize>,
) {
    for (board_name, schematic_names) in claims {
        let Some(&board_index) = index_by_name.get(board_name.as_str()) else {
            continue;
        };
        for schematic_name in schematic_names {
            let Some(&schematic_index) = index_by_name.get(schematic_name.as_str()) else {
                continue;
            };
            if absorbed.contains_key(&schematic_index)
                || boards_by_schematic
                    .get(schematic_name.as_str())
                    .map_or(0, HashSet::len)
                    != 1
                || (schematic_names.len() > 1 && leaf(schematic_name) != leaf(board_name))
            {
                continue;
            }
            absorbed.insert(schematic_index, board_index);
            let uid = string(state.nets[schematic_index].get("netUid"));
            target_by_absorbed_uid.insert(uid, board_index);
            absorb(state, board_index, schematic_index, schematic_name);
        }
    }
}

/// `_leaf` (semantic_index_nets.py): a net name without its sheet path.
fn leaf(name: &str) -> &str {
    name.rsplit('/').next().unwrap_or(name)
}

/// Drop the absorbed records and return every old net index's new position
/// (semantic_index_nets.py:141-150).
fn drop_absorbed(state: &mut State, absorbed: &HashMap<usize, usize>) -> HashMap<usize, usize> {
    let mut kept: Vec<Value> = Vec::with_capacity(state.nets.len() - absorbed.len());
    let mut renumbered: HashMap<usize, usize> = HashMap::new();
    for (index, net) in std::mem::take(&mut state.nets).into_iter().enumerate() {
        if absorbed.contains_key(&index) {
            continue;
        }
        renumbered.insert(index, kept.len());
        kept.push(net);
    }
    for (&index, &target) in absorbed {
        if let Some(&new_index) = renumbered.get(&target) {
            renumbered.insert(index, new_index);
        }
    }
    state.nets = kept;
    renumbered
}

/// The board net each absorbed uid resolves to, as `(netUid, name)` pairs
/// (semantic_index_nets.py:107-108, :158-159).
fn resolve_targets(
    state: &State,
    target_by_absorbed_uid: &HashMap<String, usize>,
    renumbered: &HashMap<usize, usize>,
) -> HashMap<String, (Value, Value)> {
    target_by_absorbed_uid
        .iter()
        .map(|(uid, &board_index)| {
            // `target` is the board record itself in Python; after the
            // renumbering its position is `renumbered[board_index]`.
            let board_index = renumbered.get(&board_index).copied().unwrap_or(board_index);
            let net = &state.nets[board_index];
            (
                uid.clone(),
                (
                    net.get("netUid").cloned().unwrap_or(Value::Null),
                    net.get("name").cloned().unwrap_or(Value::Null),
                ),
            )
        })
        .collect()
}

/// Move every terminal still naming an absorbed record to the board net
/// (semantic_index_nets.py:158-162).
fn rewrite_terminals(state: &mut State, targets: &HashMap<String, (Value, Value)>) {
    for terminal in &mut state.terminals {
        let uid = string(terminal.get("netUid"));
        if let Some((net_uid, name)) = targets.get(&uid)
            && let Some(object) = terminal.as_object_mut()
        {
            object.insert("netUid".to_owned(), net_uid.clone());
            object.insert("netName".to_owned(), name.clone());
        }
    }
}

/// Fold one schematic record into its board net: the board name stays the
/// net's name, the schematic name and aliases become aliases, and the
/// schematic refs, sheets and class move over
/// (semantic_index_nets.py:122-136).
fn absorb(state: &mut State, board_index: usize, schematic_index: usize, schematic_name: &str) {
    let (schematic_aliases, schematic_sheets, schematic_class, schematic_refs) = {
        let net = &state.nets[schematic_index];
        (
            net.get("aliases")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default(),
            net.get("sourceSheets")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default(),
            string(net.get("netClass")),
            net.get("schematicRefs")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default(),
        )
    };
    let Some(board) = state.nets[board_index].as_object_mut() else {
        return;
    };
    absorb_aliases(board, schematic_name, schematic_aliases);
    absorb_sheets(board, schematic_sheets);
    if string(board.get("netClass")).is_empty() {
        board.insert("netClass".to_owned(), Value::String(schematic_class));
    }
    if let Some(refs) = board.get_mut("schematicRefs").and_then(Value::as_array_mut) {
        refs.extend(schematic_refs);
    }
}

/// The schematic name and aliases become the board net's aliases, skipping the
/// board's own name and any repeat (semantic_index_nets.py:127-133).
fn absorb_aliases(
    board: &mut Map<String, Value>,
    schematic_name: &str,
    schematic_aliases: Vec<Value>,
) {
    let board_name = board
        .get("name")
        .map(|value| string(Some(value)))
        .unwrap_or_default();
    let Some(aliases) = board
        .entry("aliases".to_owned())
        .or_insert_with(|| json!([]))
        .as_array_mut()
    else {
        return;
    };
    for alias in std::iter::once(Value::String(schematic_name.to_owned())).chain(schematic_aliases)
    {
        let alias = string(Some(&alias));
        if !alias.is_empty()
            && alias != board_name
            && !aliases
                .iter()
                .any(|value| value.as_str() == Some(alias.as_str()))
        {
            aliases.push(Value::String(alias));
        }
    }
}

/// The schematic net's `sourceSheets` move over without repeats
/// (semantic_index_nets.py:134-136).
fn absorb_sheets(board: &mut Map<String, Value>, schematic_sheets: Vec<Value>) {
    board
        .entry("sourceSheets".to_owned())
        .or_insert_with(|| json!([]));
    if let Some(sheets) = board.get_mut("sourceSheets").and_then(Value::as_array_mut) {
        for sheet in schematic_sheets {
            if !sheets.iter().any(|value| value == &sheet) {
                sheets.push(sheet);
            }
        }
    }
}

/// `{name: renumbered[index] for name, index in indexes[key].items()}` (:152).
fn remap(map: &mut BTreeMap<String, usize>, renumbered: &HashMap<usize, usize>) {
    *map = map
        .iter()
        .map(|(key, &index)| {
            (
                key.clone(),
                renumbered.get(&index).copied().unwrap_or(index),
            )
        })
        .collect();
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::semantic_index::stable_uid;
    use serde_json::json;

    fn schematic_net(name: &str, uid: &str) -> Value {
        json!({
            "netUid": uid,
            "name": name,
            "netClass": "Default",
            "aliases": [],
            "sourceSheets": ["/"],
            "schematicRefs": [{"wireUuids": [], "labelUuids": [], "junctionUuids": [], "pinUuids": [], "labelInstanceCount": 0}],
            "pcbRefs": [{"trackUuids": [], "arcUuids": [], "viaUuids": [], "zoneUuids": [], "padUuids": []}],
            "webgpuRefs": [],
        })
    }

    fn board_only_net(name: &str) -> Value {
        json!({
            "netUid": stable_uid("net", &[name]),
            "name": name,
            "netCode": Value::Null,
            "netClass": "",
            "schematicRefs": [],
            "pcbRefs": [{"trackUuids": [], "arcUuids": [], "viaUuids": [], "zoneUuids": [], "padUuids": []}],
            "webgpuRefs": [],
        })
    }

    #[test]
    fn a_claim_folds_the_schematic_net_into_the_board_net() {
        // `SplitNetClaims.note_pad` and `reconcile_split_nets`
        // (semantic_index_nets.py:43-48, :98-163): the board keeps its name,
        // the schematic name becomes an alias, and the absorbed record is
        // dropped with every net index renumbered.
        let schematic_uid = stable_uid("net", &["A"]);
        let mut state = State {
            nets: vec![schematic_net("A", &schematic_uid)],
            ..Default::default()
        };
        state.net_index_by_name.insert("A".to_owned(), 0);
        state.indexes.net_by_name.insert("A".to_owned(), 0);
        // The schematic snapshot predates the board pass.
        let mut claims = SplitNetClaims::new(&state);
        state.nets.push(board_only_net("B"));
        state.net_index_by_name.insert("B".to_owned(), 1);
        state.indexes.net_by_name.insert("B".to_owned(), 1);
        state
            .indexes
            .net_by_schematic_uuid
            .insert("w1".to_owned(), 0);
        state.indexes.net_by_pcb_uuid.insert("p1".to_owned(), 1);
        state.terminals =
            vec![json!({"terminalUid": "t1", "netUid": schematic_uid, "netName": "A"})];

        claims.note_pad("B", "A");
        claims.reconcile(&mut state);

        assert_eq!(state.nets.len(), 1);
        assert_eq!(state.nets[0]["name"], "B");
        assert_eq!(state.nets[0]["aliases"], json!(["A"]));
        assert_eq!(state.nets[0]["sourceSheets"], json!(["/"]));
        assert_eq!(state.nets[0]["netClass"], "Default");
        // Every net index around the dropped record moved to the board net.
        assert_eq!(state.indexes.net_by_name.get("A"), Some(&0));
        assert_eq!(state.indexes.net_by_name.get("B"), Some(&0));
        assert_eq!(state.indexes.net_by_schematic_uuid.get("w1"), Some(&0));
        assert_eq!(state.indexes.net_by_pcb_uuid.get("p1"), Some(&0));
        // The schematic-only terminal moved with the record.
        assert_eq!(state.terminals[0]["netUid"], state.nets[0]["netUid"]);
        assert_eq!(state.terminals[0]["netName"], "B");
    }

    #[test]
    fn a_schematic_net_on_two_board_nets_is_left_alone() {
        // `len(boards_by_schematic[schematic_name]) != 1` (:116-121): a claim
        // the schematic side cannot place on one board net is not guessed at.
        let mut state = State {
            nets: vec![schematic_net("A", &stable_uid("net", &["A"]))],
            ..Default::default()
        };
        state.net_index_by_name.insert("A".to_owned(), 0);
        let mut claims = SplitNetClaims::new(&state);
        state.nets.push(board_only_net("B"));
        state.net_index_by_name.insert("B".to_owned(), 1);
        state.nets.push(board_only_net("C"));
        state.net_index_by_name.insert("C".to_owned(), 2);
        claims.note_pad("B", "A");
        claims.note_pad("C", "A");
        claims.reconcile(&mut state);
        assert_eq!(state.nets.len(), 3);
        assert_eq!(state.nets[0]["name"], "A");
    }

    #[test]
    fn distinct_schematic_nets_on_one_stale_board_net_stay_apart() {
        // A board behind its schematic puts two distinct nets on one stale
        // board net; only claimants with the board net's leaf name fold in.
        let mut state = State {
            nets: vec![
                schematic_net("/P/GND_A", &stable_uid("net", &["/P/GND_A"])),
                schematic_net("/P/GND_B", &stable_uid("net", &["/P/GND_B"])),
            ],
            ..Default::default()
        };
        state.net_index_by_name.insert("/P/GND_A".to_owned(), 0);
        state.net_index_by_name.insert("/P/GND_B".to_owned(), 1);
        let mut claims = SplitNetClaims::new(&state);
        state.nets.push(board_only_net("STALE"));
        state.net_index_by_name.insert("STALE".to_owned(), 2);
        claims.note_pad("STALE", "/P/GND_A");
        claims.note_pad("STALE", "/P/GND_B");
        claims.reconcile(&mut state);
        assert_eq!(state.nets.len(), 3);
        assert_eq!(state.nets[0]["name"], "/P/GND_A");
        assert_eq!(state.nets[1]["name"], "/P/GND_B");
    }

    #[test]
    fn a_bus_member_split_at_sheet_pins_still_folds() {
        let mut state = State {
            nets: vec![
                schematic_net("/Port/D0", &stable_uid("net", &["/Port/D0"])),
                schematic_net("/SOM/D0", &stable_uid("net", &["/SOM/D0"])),
            ],
            ..Default::default()
        };
        state.net_index_by_name.insert("/Port/D0".to_owned(), 0);
        state.net_index_by_name.insert("/SOM/D0".to_owned(), 1);
        let mut claims = SplitNetClaims::new(&state);
        state.nets.push(board_only_net("/D0"));
        state.net_index_by_name.insert("/D0".to_owned(), 2);
        claims.note_pad("/D0", "/Port/D0");
        claims.note_pad("/D0", "/SOM/D0");
        claims.reconcile(&mut state);
        assert_eq!(state.nets.len(), 1);
        assert_eq!(state.nets[0]["name"], "/D0");
    }
}
