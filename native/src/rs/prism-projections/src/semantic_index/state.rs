//! The document under construction, shared by every pass, and today's two
//! helpers (`_stable_uid`, `_string`).

use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

/// `_stable_uid(prefix, *parts)` (semantic_index_service.py:358-361): the first
/// 20 hex of sha256 over the parts joined by U+001F, after the prefix and a
/// colon. Pass `""` for a part today's code gets as `None`.
pub(crate) fn stable_uid(prefix: &str, parts: &[&str]) -> String {
    let digest = Sha256::digest(parts.join("\u{1f}").as_bytes());
    let mut uid = String::with_capacity(prefix.len() + 21);
    uid.push_str(prefix);
    uid.push(':');
    for byte in &digest[..10] {
        uid.push_str(&format!("{byte:02x}"));
    }
    uid
}

/// `_string(value)` (semantic_index_service.py:364-369) over a `design.json`
/// value: null and absent are `""`, booleans `true`/`false`, numbers their
/// JSON text, strings themselves; arrays and objects their JSON text.
pub(crate) fn string(value: Option<&Value>) -> String {
    match value {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(text)) => text.clone(),
        Some(Value::Bool(flag)) => flag.to_string(),
        Some(other) => other.to_string(),
    }
}

/// Where one schematic source item sits: one entry of today's `placements`
/// map (semantic_index_service.py:582-588).
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Placement {
    pub sheet_instance_path: String,
    pub sheet_path: String,
    pub page: String,
}

/// Source uuid → its placements in first-seen order, no repeats.
pub(crate) type Placements = BTreeMap<String, Vec<Placement>>;

/// The twelve `indexes` maps (keys serialize in code point order).
#[derive(Default, Debug)]
pub(crate) struct Indexes {
    pub component_by_reference: BTreeMap<String, usize>,
    pub component_by_schematic_uuid: BTreeMap<String, usize>,
    pub component_by_pcb_footprint_uuid: BTreeMap<String, usize>,
    pub terminal_by_schematic_pin_uuid: BTreeMap<String, usize>,
    pub terminal_by_pcb_pad_uuid: BTreeMap<String, usize>,
    pub terminal_by_reference_pin: BTreeMap<String, usize>,
    pub net_by_name: BTreeMap<String, usize>,
    pub net_by_net_code: BTreeMap<String, usize>,
    pub net_by_schematic_uuid: BTreeMap<String, usize>,
    pub net_by_pcb_uuid: BTreeMap<String, usize>,
    pub sheet_instance_by_path: BTreeMap<String, usize>,
    pub bus_by_uid: BTreeMap<String, usize>,
}

/// The document so far. Entries are JSON objects with today's keys; the
/// contract type fixes the final key order.
#[derive(Default, Debug)]
pub(crate) struct State {
    pub components: Vec<Value>,
    pub nets: Vec<Value>,
    pub terminals: Vec<Value>,
    pub sheet_instances: Vec<Value>,
    pub buses: Vec<Value>,
    pub indexes: Indexes,
    /// `component_by_reference`: reference → position in `components`
    /// (later wins, as today's dict).
    pub component_by_reference: BTreeMap<String, usize>,
    /// `net_index_by_name`: name → position in `nets`.
    pub net_index_by_name: BTreeMap<String, usize>,
    /// `terminal_index_by_pair`: `<reference>:<pin>` → position in `terminals`.
    pub terminal_index_by_pair: BTreeMap<String, usize>,
}

impl State {
    /// The component uid for `reference`, or the reference-only uid when no
    /// component has it (semantic_index_service.py:996, :1093).
    pub fn component_uid_for(&self, reference: &str) -> String {
        self.component_by_reference
            .get(reference)
            .and_then(|&index| self.components[index].get("componentUid"))
            .and_then(Value::as_str)
            .map_or_else(|| stable_uid("cmp", &[reference]), str::to_owned)
    }

    /// Everything but `designKey` and `assembly`.
    pub fn into_document(self) -> Value {
        let index = |map: BTreeMap<String, usize>| -> Value {
            Value::Object(
                map.into_iter()
                    .map(|(k, v)| (k, json!(v)))
                    .collect::<Map<_, _>>(),
            )
        };
        let indexes = self.indexes;
        json!({
            "schema": super::SCHEMA,
            "components": self.components,
            "nets": self.nets,
            "terminals": self.terminals,
            "sheetInstances": self.sheet_instances,
            "buses": self.buses,
            "indexes": {
                "componentByReference": index(indexes.component_by_reference),
                "componentBySchematicUuid": index(indexes.component_by_schematic_uuid),
                "componentByPcbFootprintUuid": index(indexes.component_by_pcb_footprint_uuid),
                "terminalBySchematicPinUuid": index(indexes.terminal_by_schematic_pin_uuid),
                "terminalByPcbPadUuid": index(indexes.terminal_by_pcb_pad_uuid),
                "terminalByReferencePin": index(indexes.terminal_by_reference_pin),
                "netByName": index(indexes.net_by_name),
                "netByNetCode": index(indexes.net_by_net_code),
                "netBySchematicUuid": index(indexes.net_by_schematic_uuid),
                "netByPcbUuid": index(indexes.net_by_pcb_uuid),
                "sheetInstanceByPath": index(indexes.sheet_instance_by_path),
                "busByUid": index(indexes.bus_by_uid),
            },
        })
    }
}
