import "@typespec/json-schema";
import "./common.tsp";

using TypeSpec.JsonSchema;
using Prism.Contracts.Common;

/**
 * `projections/semantic-index.json`: the design's semantic identity index,
 * schema `prism.semantic_index.a2`. It is a parity document (conventions.md
 * §4, §5, §14): every field keeps the name, unit, null-versus-absent
 * behaviour and value of today's `prism.semantic_index_a0`
 * (`backend/app/services/semantic_index_service.py:784-1171`,
 * `semantic_index_nets.py`, `semantic_index_variants.py`), except the
 * changes listed in `field-maps/semantic-index.md` ("Expected divergences"):
 *
 * - the envelope: `schema` becomes `prism.semantic_index.a2`,
 *   `sourceRevisionKey` is replaced by `designKey` (a2, ADR amendment K2
 *   §3.6), and `commit`, `generator` and `generatedAt` are not member
 *   fields;
 * - the fields ADR §6 adds: `components[].libraryRef`,
 *   `terminals[].pinName`, `terminals[].pinType` and
 *   `terminals[].schematicNetName` (`netName` stays the pad-resolved name);
 * - every map is serialized with its keys in code point order.
 *
 * Coordinates in `buses` are schematic millimetres as today (a parity
 * document keeps today's units); no other field holds a length.
 */
namespace Prism.Contracts.SemanticIndexA2;

// ------------------------------------------------------------------ scalars

/**
 * Component id: `cmp:` followed by the first 20 hex digits of the SHA-256 of
 * `<reference>\u001f<symbolUuid>` (UTF-8), as
 * `_stable_uid("cmp", reference, symbol_uuid)` computes it
 * (`semantic_index_service.py:358-361`, `:890`).
 * A terminal or assembly entry whose reference has no component uses
 * `_stable_uid("cmp", reference)`: the hash of `<reference>` alone.
 */
@pattern("^cmp:[0-9a-f]{20}$")
scalar SemanticIndexComponentUid extends string;

/**
 * Net id: `net:` followed by the first 20 hex digits of the SHA-256 of the
 * net's full name (UTF-8), `_stable_uid("net", name)`
 * (`semantic_index_service.py:936`, `:1050`).
 */
@pattern("^net:[0-9a-f]{20}$")
scalar SemanticIndexNetUid extends string;

/**
 * Terminal id: `term:` followed by the first 20 hex digits of the SHA-256 of
 * `<reference>\u001f<pin>` (UTF-8), `_stable_uid("term", reference, pin)`
 * (`semantic_index_service.py:995`, `:1092`).
 */
@pattern("^term:[0-9a-f]{20}$")
scalar SemanticIndexTerminalUid extends string;

/**
 * Sheet instance id: `sheet-instance:` followed by the first 20 hex digits of
 * the SHA-256 of `<sheetInstancePath>\u001f<page>` (UTF-8)
 * (`semantic_index_service.py:616-620`).
 */
@pattern("^sheet-instance:[0-9a-f]{20}$")
scalar SemanticIndexSheetInstanceUid extends string;

/**
 * Bus wire or bus entry id: `bus:` followed by the first 20 hex digits of
 * the SHA-256 of `<kind>\u001f<sheetInstancePath>\u001f<sourceUuid>` (UTF-8),
 * where kind is `bus` or `bus_entry` (`semantic_index_service.py:656-661`).
 */
@pattern("^bus:[0-9a-f]{20}$")
scalar SemanticIndexBusUid extends string;

/**
 * Bus alias id: `bus-alias:` followed by the first 20 hex digits of the
 * SHA-256 of `<sheetInstancePath>\u001f<name>` (UTF-8)
 * (`semantic_index_service.py:696`).
 */
@pattern("^bus-alias:[0-9a-f]{20}$")
scalar SemanticIndexBusAliasUid extends string;

/**
 * Human (name) sheet path as kicad_monkey spells it: `/` for the root sheet,
 * else each sheet name from the root down, each followed by `/`, for example
 * `/Power/` or `/Wireless/Antenna/`. Not a KIID path.
 */
@pattern("^/(?:.*/)?$")
scalar SemanticIndexSheetNamePath extends string;

/**
 * Sheet path in the netlist's UUID form: `/` for the root sheet, else the
 * sheet symbols' UUIDs from below the root down, each followed by `/`, for
 * example `/c33f383d-e37a-5ee0-b3d2-b1d64b3f8476/`. It omits the root sheet's
 * own UUID and ends in `/`, unlike Common.KiidPath.
 */
@pattern("^/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)*$")
scalar SemanticIndexNetlistSheetPath extends string;

/**
 * Footprint identity in the assembly block: the footprint's KiCadUuid, or the
 * empty string for a footprint the parser read no UUID for. Today's Python
 * parser reads only `(uuid …)`, so every footprint of a KiCad 7 board is
 * `""`. The bundle parses only the current format (sources older than the worker KiCad's format are upgraded by KiCad before parse, bundle-format.md §2.2), so every footprint has its
 * `(uuid …)` (field map, "Expected divergences").
 */
@pattern("^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$")
scalar SemanticIndexFootprintId extends string;

/** A pin or pad number as written (Common.PadNumber), never empty. */
@minLength(1)
scalar SemanticIndexPinNumber extends PadNumber;

/** Zero-based position of an element in the array an index map names. */
@minValue(0)
scalar SemanticIndexPosition extends safeint;

/**
 * KiCad net number (`(net <n> "<name>")`) from a board that has a net table,
 * KiCad 9 format and earlier; 0 is KiCad's "no net" and never appears.
 */
@minValue(1)
scalar SemanticIndexNetCode extends int32;

/**
 * A point or size in schematic millimetres, `[x, y]` (or `[width, height]`),
 * as the schematic file writes it and kicad_monkey parses it (a double), +y
 * down. Today's unit, kept because this is a parity document.
 */
@minItems(2)
@maxItems(2)
model SemanticIndexMmPair is float64[];

// -------------------------------------------------------------------- enums

/**
 * Electrical type of a schematic pin, as kicad_monkey's design JSON writes
 * it: KiCad's pin type token in upper case (`_pin_type_json`,
 * kicad_monkey 2026.9.7 `kicad_design_json.py:708-710`). A pin with no type
 * is `PASSIVE`; the pre-2021 token `unconnected` reads as `NO_CONNECT`.
 */
enum SemanticIndexPinType {
  /** KiCad `input`. */
  INPUT,

  /** KiCad `output`. */
  OUTPUT,

  /** KiCad `bidirectional`. */
  BIDIRECTIONAL,

  /** KiCad `tri_state`. */
  TRI_STATE,

  /** KiCad `passive`, and the value for a pin with no type. */
  PASSIVE,

  /** KiCad `free`. */
  FREE,

  /** KiCad `unspecified`. */
  UNSPECIFIED,

  /** KiCad `power_in`. */
  POWER_IN,

  /** KiCad `power_out`. */
  POWER_OUT,

  /** KiCad `open_collector`. */
  OPEN_COLLECTOR,

  /** KiCad `open_emitter`. */
  OPEN_EMITTER,

  /** KiCad `no_connect` (and the legacy `unconnected`). */
  NO_CONNECT,
}

/** Source file kind that named a design variant (contract packet v1.0 §2.1). */
enum SemanticIndexVariantSource {
  /** The `.kicad_pro` registry, `$.schematic.variants[*]`. */
  project,

  /** The board's `(variants …)` header. */
  pcb,

  /** A symbol- or sheet-instance variant record in a schematic. */
  schematic,

  /** A footprint variant record in the board. */
  footprint,
}

/** Source file kind a catalog diagnostic is about. */
enum SemanticIndexDiagnosticSource {
  /** The `.kicad_pro`. */
  project,

  /** A `.kicad_sch`. */
  schematic,

  /** The `.kicad_pcb`. */
  pcb,
}

/** How serious an assembly diagnostic is. */
enum SemanticIndexDiagnosticSeverity {
  /** Informational: nothing is wrong with the result. */
  info,

  /** The result is usable but a rule could not be applied as written. */
  warning,

  /** A source could not be read; the result covers the readable sources. */
  error,
}

/**
 * Stable code of an assembly diagnostic (contract packet v1.0 §3.2; emitted
 * by `variant_catalog_service.py:50-51` and `semantic_index_variants.py`).
 */
enum SemanticIndexDiagnosticCode {
  /** A board-side variant name folded case-insensitively into a catalog entry; severity warning; `source`, `detail` (found, folded_into). */
  catalogNameCaseMismatch: "catalog-name-case-mismatch",

  /** A source file could not be read; severity error; `source`, `path`. */
  sourceUnparseable: "source-unparseable",

  /** No symbol instance matches the occurrence's sheet path; base attributes used; severity warning; `reference`, `occurrenceId`. */
  occurrenceInstanceMissing: "occurrence-instance-missing",

  /** Units of one reference disagree; the representative unit wins; severity warning; `reference`, `detail` (per key, per occurrence), optional `variant`. */
  multiUnitConflict: "multi-unit-conflict",

  /** One reference on several sheet occurrences, or several index components; severity warning; `reference`, `detail` (occurrenceIds or componentUids). */
  referenceCollision: "reference-collision",

  /** Schematic and footprint dnp or excluded-from-BOM disagree; severity info; `reference`, optional `variant`. */
  sourceStateMismatch: "source-state-mismatch",

  /** Several footprints share a reference; severity warning; `reference`, `footprintUuids`. */
  duplicateReferenceFootprints: "duplicate-reference-footprints",

  /** More than one alternate footprint is populated in a variant; severity info; `variant`, `reference`, `footprintUuids`. */
  alternateFootprintsBothPopulated: "alternate-footprints-both-populated",

  /** A rule area sets DNP or an exclusion flag Prism does not resolve; severity warning; `path`, `detail` (the rule area's tokens). */
  ruleAreaFlagsUnsupported: "rule-area-flags-unsupported",

  /** The schematic's file version predates the positive `in_bom` record token; severity info; `path`, `detail` (version). */
  legacyInBomSemantics: "legacy-in-bom-semantics",

  /** KiCad 11 variant tokens were ignored; severity info; `path`, `detail` (tokens). */
  unsupportedVariantToken: "unsupported-variant-token",
}

// --------------------------------------------------------------- components

/**
 * Where a component's symbol is in the schematic hierarchy
 * (`semantic_index_service.py:895-901`). Unlike a net's schematic ref, both
 * path fields hold the human sheet path.
 */
model SemanticIndexComponentSchematicRef {
  /**
   * The component's human sheet path, kicad_monkey's `sheet_path_names`
   * (for example `/` or `/Power/`). Despite its name this is not a KIID path;
   * the KIID form is in `occurrenceId`.
   */
  sheetInstancePath: SemanticIndexSheetNamePath;

  /**
   * The same human sheet path again (`hierarchy.sheet`, which kicad_monkey
   * sets to `sheet_path_names` too); the empty string when kicad_monkey
   * reports no sheet path. Not a file name, unlike a net's `page`.
   */
  page: string;

  /**
   * UUID of the symbol the design netlist names for this component (the
   * netlist component's instance UUID; for a multi-unit part, the unit the
   * netlist picks).
   */
  symbolUuid: KiCadUuid;

  /**
   * Occurrence id of that unit, schematic-form KiidPath
   * `<sheetInstancePath>/<symbolUuid>` (contract packet v1.0 §2.2), set by the
   * assembly join (`semantic_index_variants.py:997-1009`). Absent when the
   * join found no placement of the symbol on that human sheet path.
   */
  occurrenceId?: KiidPath;
}

/** A footprint on the board that carries this component's reference. */
model SemanticIndexComponentPcbRef {
  /** The footprint's UUID, its `(uuid …)`. */
  footprintUuid: KiCadUuid;
}

/**
 * Reserved for WebGPU scene references. No producer writes one: every
 * `webgpuRefs` array is empty today (`semantic_index_service.py:903`, `:951`,
 * `:1056`) and in a1.
 */
model SemanticIndexWebGpuRef {}

/**
 * One component: one netlist reference (`semantic_index_service.py:879-910`),
 * with the board footprints that carry the reference.
 */
model SemanticIndexComponent {
  /** Stable component id, from the reference and `symbolUuid`. */
  componentUid: SemanticIndexComponentUid;

  /**
   * Reference designator as the design netlist resolves it (never empty,
   * never a `#` power symbol; may be unannotated, `R?`).
   */
  reference: Refdes;

  /** The symbol's `Value` as the netlist resolves it (text variables expanded); empty when it has none. */
  value: string;

  /** The symbol's `Footprint` field as written (a LibId or empty). */
  footprint: string;

  /**
   * Added in a1 (ADR §6). The symbol's library identifier as the netlist's
   * `libsource` names it: `<lib>:<part>` when both are known, else whichever
   * one is, else empty (kicad_monkey `_library_ref`; ref:
   * `backend/app/services/semantic_index_service.py:887`).
   */
  libraryRef: string;

  /**
   * The component's fields. Keys: the 17 canonical names (`Value`, `DNP`,
   * `In BOM`, `Description`, `Datasheet`, `Manufacturer`,
   * `Manufacturer Part Number`, `Vendor`, `Vendor Part Number`, `Footprint`,
   * `Mass (g)`, `RQjC (C/W)`, `RQjC_top (C/W)`, `Temp_max (C)`,
   * `Temp_min (C)`, `Power Dissipation (W)`, `Rate`), always present, plus
   * every other netlist parameter and placed-symbol property by its KiCad
   * name, including kicad_monkey's `_source_cad` and `kicad_*` parameters
   * (`_canonical_fields`, `semantic_index_service.py:467-513`). `DNP` and
   * `In BOM` are `Yes` or `No`: from the default assembly state when the
   * component has a true default flag (`semantic_index_variants.py:997-1003`),
   * else as `_canonical_fields` resolves them
   * (`semantic_index_service.py:441-464`, `:488-492`).
   * Values are strings, possibly empty. Serialized with keys in code point
   * order.
   */
  fields: Record<string>;

  /**
   * Where the component's symbol is: one entry, or none when the netlist
   * gives the component no symbol UUID. In netlist order (at most one).
   */
  schematicRefs: SemanticIndexComponentSchematicRef[];

  /**
   * Footprints whose `Reference` property equals this reference, in board
   * file order. Empty without a board or a matching footprint.
   */
  pcbRefs: SemanticIndexComponentPcbRef[];

  /** Always empty (reserved); array order is moot. */
  @maxItems(0)
  webgpuRefs: SemanticIndexWebGpuRef[];
}

// --------------------------------------------------------------------- nets

/**
 * A net's schematic items on one sheet instance (`_group_schematic_refs`,
 * `semantic_index_service.py:721-781`). The three location fields are
 * present together, or all absent on the one "unplaced" entry that collects
 * items with no known sheet instance.
 */
model SemanticIndexNetSchematicRef {
  /** The sheet instance, schematic-form KiidPath (starts at the root sheet's UUID). Absent on the unplaced entry. */
  sheetInstancePath?: KiidPath;

  /** The sheet instance's human sheet path. Absent on the unplaced entry. */
  sheetPath?: SemanticIndexSheetNamePath;

  /** The sheet's `.kicad_sch`, repository-relative. Absent on the unplaced entry. */
  page?: RepoPath;

  /** UUIDs of the net's wires on this sheet instance, in the order the net lists them (sorted by kicad_monkey), without repeats. */
  wireUuids: KiCadUuid[];

  /**
   * UUIDs of the net's local labels, then global and hierarchical labels
   * (`ports`), then power symbols (`power_ports`) on this sheet instance; each
   * group in the order the net lists it, without repeats.
   */
  labelUuids: KiCadUuid[];

  /** UUIDs of the net's junctions, then sheet entries, on this sheet instance; each group in the order the net lists it, without repeats. */
  junctionUuids: KiCadUuid[];

  /**
   * `schematicPinUuid`s of the net's terminals on this sheet instance (the
   * first entry when the pin's sheet instance is unknown), in terminal
   * order, without repeats.
   */
  pinUuids: KiCadUuid[];

  /**
   * Number of local labels (not global, hierarchical or power) counted on
   * this sheet instance; on the unplaced entry, the net's total local-label
   * count when any item is unplaced, else 0.
   */
  labelInstanceCount: Count;
}

/**
 * A net's board items, by kind (`semantic_index_service.py:950`,
 * `:1084-1086`, `:1113-1127`). Board items with no net or no UUID are not
 * listed.
 */
model SemanticIndexNetPcbRef {
  /** UUIDs of the net's track segments, in board file order. */
  trackUuids: KiCadUuid[];

  /** UUIDs of the net's arc tracks, in board file order. */
  arcUuids: KiCadUuid[];

  /** UUIDs of the net's vias, in board file order. */
  viaUuids: KiCadUuid[];

  /** UUIDs of the net's zones, in board file order. */
  zoneUuids: KiCadUuid[];

  /** UUIDs of the net's pads, in board file order (footprints in file order, each footprint's pads in file order). */
  padUuids: KiCadUuid[];
}

/**
 * One net (`semantic_index_service.py:929-961`, `:1043-1066`,
 * `semantic_index_nets.py`). The board names the net when the board and the
 * schematic netlist disagree; see the field map.
 */
model SemanticIndexNet {
  /** Stable net id, from `name`. */
  netUid: SemanticIndexNetUid;

  /**
   * KiCad full net name: the design netlist's name for a schematic net; the
   * board's name for a net only the board has, including one that absorbed
   * schematic nets in the split-net reconciliation.
   */
  name: NetName;

  /** Net class name from the netlist (`Default` when unassigned); empty for a board-only net with no absorbed schematic net. */
  netClass: string;

  /**
   * Other names of this net. On a schematic net: the netlist's aliases,
   * sorted in code point order. On a board net that absorbed schematic nets:
   * each absorbed name followed by its own aliases, in the order the board
   * pass met them, without repeats. Absent on a board-only net that absorbed
   * nothing.
   */
  aliases?: NetName[];

  /**
   * Netlist sheet paths of the net's terminals. On a schematic net: sorted
   * in code point order, without repeats. On a board net that absorbed
   * schematic nets: their sheet paths in absorption order, without repeats.
   * Absent on a board-only net that absorbed nothing.
   */
  sourceSheets?: SemanticIndexNetlistSheetPath[];

  /**
   * The net's schematic items grouped by sheet instance, in first-seen order
   * (walking wires, then labels, then junctions); the unplaced entry, if any,
   * comes last. A schematic net always has at least one entry (an empty
   * unplaced entry when it has no item); a board-only net has none, unless it
   * absorbed schematic nets, whose entries it then lists in absorption order.
   */
  schematicRefs: SemanticIndexNetSchematicRef[];

  /** Exactly one entry holding the net's board items, empty lists without a board; array order is moot. */
  @minItems(1)
  @maxItems(1)
  pcbRefs: SemanticIndexNetPcbRef[];

  /** Always empty (reserved); array order is moot. */
  @maxItems(0)
  webgpuRefs: SemanticIndexWebGpuRef[];

  /**
   * The board's net number, from the last board item on this net that
   * carries one. Absent when no board item on the net carries a number (a
   * schematic-only net, a KiCad 10 board, which names nets without numbers,
   * or no board). `null` on a net only the board has (created by the board
   * pass) whose items carry no number.
   */
  netCode?: SemanticIndexNetCode | null;
}

// ---------------------------------------------------------------- terminals

/**
 * One (reference, pin) on one net (`semantic_index_service.py:963-1023`,
 * `:1087-1111`). Terminals the schematic netlist lists carry `pinName`,
 * `pinType`, `schematicNetName` and `schematicPinUuid`; terminals only the
 * board has (a pad with no schematic pin) carry none of them.
 */
model SemanticIndexTerminal {
  /** Stable terminal id, from the reference and pin. */
  terminalUid: SemanticIndexTerminalUid;

  /** The component this pin belongs to: its `componentUid`, or the reference-only uid when no component has this reference. */
  componentUid: SemanticIndexComponentUid;

  /** Reference designator. */
  reference: Refdes;

  /** Pin (pad) number as written, never empty. */
  pin: SemanticIndexPinNumber;

  /**
   * Added in a1 (ADR §6). The schematic pin's name (KiCad `pinfunction`) as
   * the library symbol writes it, possibly empty or `~`; for stacked pins
   * `<name>_<number>`. Absent on a terminal the netlist did not list with its
   * pin record (board-only or graphical-pin-only terminals).
   */
  pinName?: string;

  /**
   * Added in a1 (ADR §6). The schematic pin's electrical type. Absent where
   * `pinName` is.
   */
  pinType?: SemanticIndexPinType;

  /** `netUid` of the net named by `netName`; `null` on a board-only terminal whose pad has no net. */
  netUid: SemanticIndexNetUid | null;

  /**
   * The terminal's net, pad-resolved: the board net of the terminal's pad when
   * the pad has one; otherwise the schematic netlist's net (or the board net
   * that absorbed it in the split-net reconciliation). `null` on a
   * board-only terminal whose pad has no net.
   */
  netName: NetName | null;

  /**
   * Added in a1 (ADR §6). The name of the schematic netlist net that lists
   * this terminal, before the board pass and the reconciliation rewrite
   * `netName`. Absent on a board-only terminal.
   */
  schematicNetName?: NetName;

  /**
   * UUID of the placed symbol's pin (`(pin "<n>" (uuid …))`), or of the
   * symbol when the pin has no drawable element. Absent on a board-only
   * terminal.
   */
  schematicPinUuid?: KiCadUuid;

  /** UUID of the board pad with this reference and number. Absent when no pad matches. */
  pcbPadUuid?: KiCadUuid;
}

// ------------------------------------------------------------------- sheets

/**
 * One placement of a schematic sheet in the hierarchy
 * (`semantic_index_service.py:591-629`, `:710-716`). A reused sheet file has
 * one entry per instance.
 */
model SemanticIndexSheetInstance {
  /** Stable sheet instance id, from `sheetInstancePath` and `page`. */
  sheetInstanceUid: SemanticIndexSheetInstanceUid;

  /** The instance's KIID path, schematic form (starts at the root sheet's UUID). */
  sheetInstancePath: KiidPath;

  /** The instance's human sheet path. */
  sheetPath: SemanticIndexSheetNamePath;

  /** The sheet's `.kicad_sch`, repository-relative. */
  page: RepoPath;

  /** The parent instance's `sheetInstancePath`; `null` for the root sheet. */
  parentSheetInstancePath: KiidPath | null;

  /** UUID of the sheet symbol that places this instance; `null` for the root sheet. */
  sheetSymbolUuid: KiCadUuid | null;

  /** The sheet's name (the root sheet's is the schematic file's stem). */
  sheetName: string;

  /** True for the root sheet only. */
  isTopLevel: boolean;

  /** The parent instance's `page`; `null` for the root sheet. */
  parentPage: RepoPath | null;
}

// -------------------------------------------------------------------- buses

/** A bus wire on one sheet instance (`semantic_index_service.py:647-690`). */
model SemanticIndexBusWire {
  /** Discriminator. */
  kind: "bus";

  /** Stable bus id, from the kind, sheet instance and `sourceUuid`. */
  busUid: SemanticIndexBusUid;

  /** The bus wire's UUID in the schematic. */
  sourceUuid: KiCadUuid;

  /** The sheet instance it is drawn on, schematic-form KiidPath. */
  sheetInstancePath: KiidPath;

  /** That instance's human sheet path. */
  sheetPath: SemanticIndexSheetNamePath;

  /** The sheet's `.kicad_sch`, repository-relative. */
  page: RepoPath;

  /** The wire's `(pts …)` in file order, schematic millimetres (KiCad writes two). */
  points: SemanticIndexMmPair[];

  /** Always `null` on a bus wire (a bus wire has no `at`). */
  at: null;

  /** Always `null` on a bus wire (a bus wire has no `size`). */
  size: null;
}

/** A bus entry on one sheet instance (`semantic_index_service.py:647-690`). */
model SemanticIndexBusEntry {
  /** Discriminator. */
  kind: "bus_entry";

  /** Stable bus id, from the kind, sheet instance and `sourceUuid`. */
  busUid: SemanticIndexBusUid;

  /** The bus entry's UUID in the schematic. */
  sourceUuid: KiCadUuid;

  /** The sheet instance it is drawn on, schematic-form KiidPath. */
  sheetInstancePath: KiidPath;

  /** That instance's human sheet path. */
  sheetPath: SemanticIndexSheetNamePath;

  /** The sheet's `.kicad_sch`, repository-relative. */
  page: RepoPath;

  /** Always empty on a bus entry (it has no `pts`); array order is moot. */
  @maxItems(0)
  points: SemanticIndexMmPair[];

  /** The entry's `(at x y)`, schematic millimetres, in the order `[x, y]`. */
  at: SemanticIndexMmPair;

  /** The entry's `(size w h)`, schematic millimetres, in the order `[width, height]`. */
  size: SemanticIndexMmPair;
}

/** A bus alias defined on one sheet instance (`semantic_index_service.py:692-708`). */
model SemanticIndexBusAlias {
  /** Discriminator. */
  kind: "bus_alias";

  /** Stable alias id, from the sheet instance and `name`. */
  busUid: SemanticIndexBusAliasUid;

  /** The alias name, for example `JTAG`. */
  name: string;

  /** The alias members as written, sorted in code point order (repeats kept, empty ones dropped). */
  members: string[];

  /** The sheet instance that defines it, schematic-form KiidPath. */
  sheetInstancePath: KiidPath;

  /** That instance's human sheet path. */
  sheetPath: SemanticIndexSheetNamePath;

  /** The sheet's `.kicad_sch`, repository-relative. */
  page: RepoPath;
}

/** A bus object: a wire, an entry or an alias. */
@oneOf
union SemanticIndexBus {
  busWire: SemanticIndexBusWire,
  busEntry: SemanticIndexBusEntry,
  busAlias: SemanticIndexBusAlias,
}

// ------------------------------------------------------------------ indexes

/**
 * The twelve lookup maps (`semantic_index_service.py:853-875`). Every value
 * is a zero-based position in `components`, `terminals`, `nets`,
 * `sheetInstances` or `buses`. Where two elements share a key, the later
 * element wins (the map is filled in array order), except `netByName`
 * aliases, which never displace a name.
 */
model SemanticIndexIndexes {
  /** Keys: component reference. Value: position in `components`. */
  componentByReference: Record<SemanticIndexPosition>;

  /** Keys: a component's `schematicRefs[0].symbolUuid`. Value: position in `components`. */
  componentBySchematicUuid: Record<SemanticIndexPosition>;

  /** Keys: a footprint UUID in some component's `pcbRefs`. Value: position in `components`. */
  componentByPcbFootprintUuid: Record<SemanticIndexPosition>;

  /** Keys: a terminal's `schematicPinUuid`. Value: position in `terminals`. */
  terminalBySchematicPinUuid: Record<SemanticIndexPosition>;

  /** Keys: a terminal's `pcbPadUuid`. Value: position in `terminals`. */
  terminalByPcbPadUuid: Record<SemanticIndexPosition>;

  /** Keys: `<reference>:<pin>` of every terminal. Value: position in `terminals`. */
  terminalByReferencePin: Record<SemanticIndexPosition>;

  /** Keys: every net `name`, and the `aliases` of a board net that absorbed schematic nets. Value: position in `nets`. */
  netByName: Record<SemanticIndexPosition>;

  /** Keys: a `netCode` in decimal. Value: position in `nets`. */
  netByNetCode: Record<SemanticIndexPosition>;

  /** Keys: every UUID in a net's `schematicRefs` (wires, labels, junctions, pins). Value: position in `nets`. */
  netBySchematicUuid: Record<SemanticIndexPosition>;

  /** Keys: every UUID in a net's `pcbRefs` (pads, tracks, arcs, vias, zones). Value: position in `nets`. */
  netByPcbUuid: Record<SemanticIndexPosition>;

  /** Keys: a sheet instance's `sheetInstancePath`. Value: position in `sheetInstances`. */
  sheetInstanceByPath: Record<SemanticIndexPosition>;

  /** Keys: a bus object's `busUid`. Value: position in `buses`. */
  busByUid: Record<SemanticIndexPosition>;
}

// ----------------------------------------------------------------- assembly

/** One design variant name and where it was found (contract packet v1.0 §2.1, §3.2). */
model SemanticIndexVariantCatalogEntry {
  /** The variant name, exact (never empty, never `< Default >`). */
  @minLength(1)
  name: string;

  /** The project registry's description, else the board header's; `null` when neither has one. */
  description: string | null;

  /** Every source that names this variant, in the order they were met (project, pcb, schematic, footprint scans), without repeats. */
  @minItems(1)
  sources: SemanticIndexVariantSource[];
}

/** One board footprint's identity, including footprints with no variant state. */
model SemanticIndexFootprintInventoryEntry {
  /** The footprint's identity: its UUID, or empty (see the scalar). */
  uuid: SemanticIndexFootprintId;

  /** The footprint's `Reference` property as the variant resolver reads it; empty when the board has none. */
  reference: string;
}

/**
 * Default state of one schematic occurrence: present only when at least one
 * flag is true, and only true flags are present (contract packet v1.0 §2.7).
 */
model SemanticIndexOccurrenceDefault {
  /** The occurrence's resolved reference. */
  reference: Refdes;

  /** DNP in the default design, after the sheet fold. Present only when true. */
  dnp?: true;

  /** Excluded from the BOM, after the sheet fold. Present only when true. */
  excludeFromBom?: true;

  /** Excluded from the board, after the sheet fold. Present only when true. */
  excludeFromBoard?: true;

  /** Excluded from simulation, after the sheet fold. Present only when true. */
  excludeFromSim?: true;

  /** Excluded from position files (never folded from sheets). Present only when true. */
  excludeFromPosFiles?: true;

  /** The index component with this reference; absent when no single component has it. */
  componentUid?: SemanticIndexComponentUid;
}

/** Default state of one component (multi-unit projection); present only when a flag is true, and only true flags are present. */
model SemanticIndexComponentDefault {
  /** DNP. Present only when true. */
  dnp?: true;

  /** Excluded from the BOM. Present only when true. */
  excludeFromBom?: true;

  /** Excluded from the board. Present only when true. */
  excludeFromBoard?: true;

  /** Excluded from simulation. Present only when true. */
  excludeFromSim?: true;

  /** Excluded from position files. Present only when true. */
  excludeFromPosFiles?: true;
}

/** Default state of one footprint from its `attr` flags; present only when a flag is true, and only true flags are present. */
model SemanticIndexFootprintDefault {
  /** The footprint's resolved reference; empty when the board has no `Reference` property for it. */
  reference: string;

  /** `attr dnp`. Present only when true. */
  dnp?: true;

  /** `attr exclude_from_bom`. Present only when true. */
  excludeFromBom?: true;

  /** `attr exclude_from_pos_files`. Present only when true. */
  excludeFromPosFiles?: true;

  /** The index component with this reference; `null` when no single component has it (a board-only part or an ambiguous reference). */
  componentUid: SemanticIndexComponentUid | null;
}

/**
 * A variant's difference from the default state of one occurrence or
 * component: only what differs is present; booleans are explicit
 * (contract packet v1.0 §2.7).
 */
model SemanticIndexAssemblyOverride {
  /** DNP in this variant, when it differs from the default. */
  dnp?: boolean;

  /** Excluded from the BOM in this variant, when it differs. */
  excludeFromBom?: boolean;

  /** Excluded from the board in this variant, when it differs. */
  excludeFromBoard?: boolean;

  /** Excluded from simulation in this variant, when it differs. */
  excludeFromSim?: boolean;

  /** Excluded from position files in this variant, when it differs. */
  excludeFromPosFiles?: boolean;

  /** Keys: raw KiCad field names whose effective text differs from the default (for example `Value`, `Footprint`, `MPN`); values are the variant's text, possibly empty. Absent when no field differs. */
  fields?: Record<string>;
}

/** A variant's difference from the default state of one footprint; only what differs is present. */
model SemanticIndexFootprintOverride {
  /** DNP in this variant, when it differs from the default. */
  dnp?: boolean;

  /** Excluded from the BOM in this variant, when it differs. */
  excludeFromBom?: boolean;

  /** Excluded from position files in this variant, when it differs. */
  excludeFromPosFiles?: boolean;

  /** Keys: footprint property names whose effective text differs from the default; values are the variant's text. Absent when no property differs. */
  fields?: Record<string>;
}

/** The effective default assembly, differential against the all-false neutral state. */
model SemanticIndexAssemblyDefault {
  /** Keys: occurrence id, schematic-form KiidPath `<sheetInstancePath>/<symbolUuid>`. Only occurrences with a true flag. */
  occurrences: Record<SemanticIndexOccurrenceDefault>;

  /** Keys: `componentUid`, or the reference when no single index component has it. Only components with a true flag. */
  components: Record<SemanticIndexComponentDefault>;

  /** Keys: footprint identity (SemanticIndexFootprintId; may be empty). Only footprints with a true flag. */
  footprints: Record<SemanticIndexFootprintDefault>;
}

/** One named variant, differential against the effective default. */
model SemanticIndexAssemblyVariant {
  /** The variant name, as in the catalog. */
  @minLength(1)
  name: string;

  /** Keys: occurrence id (schematic-form KiidPath). Only occurrences that differ from the default. */
  occurrences: Record<SemanticIndexAssemblyOverride>;

  /** Keys: `componentUid`, or the reference when no single index component has it. Only components that differ. */
  components: Record<SemanticIndexAssemblyOverride>;

  /** Keys: footprint identity (SemanticIndexFootprintId; may be empty). Only footprints that differ. */
  footprints: Record<SemanticIndexFootprintOverride>;
}

/** `detail` of `legacy-in-bom-semantics`. */
model SemanticIndexVersionDetail {
  /** The root schematic's `(version N)`, a KiCad file-format date such as 20260101. */
  version: int32;
}

/** `detail` of `unsupported-variant-token`. */
model SemanticIndexTokensDetail {
  /** The KiCad 11 tokens found, in first-seen order, without repeats. */
  @minItems(1)
  tokens: string[];
}

/** `detail` of `reference-collision` from the occurrence projection. */
model SemanticIndexOccurrenceIdsDetail {
  /** The colliding occurrences' ids (schematic-form KiidPath), sorted in code point order. */
  @minItems(2)
  occurrenceIds: KiidPath[];
}

/** `detail` of `reference-collision` from the join onto index components. */
model SemanticIndexComponentUidsDetail {
  /** The index components sharing the reference, in `components` order. */
  @minItems(2)
  componentUids: SemanticIndexComponentUid[];
}

/**
 * `detail` of an assembly diagnostic. Its shape depends on `code`; the shapes
 * are mutually exclusive, so exactly one matches. Two are maps because their
 * keys are not camelCase field names (conventions.md §5; field map, open
 * questions).
 */
@oneOf
union SemanticIndexDiagnosticDetail {
  /** `legacy-in-bom-semantics`. */
  version: SemanticIndexVersionDetail,

  /** `unsupported-variant-token`. */
  tokens: SemanticIndexTokensDetail,

  /** `reference-collision` (occurrence projection). */
  occurrenceIds: SemanticIndexOccurrenceIdsDetail,

  /** `reference-collision` (component join). */
  componentUids: SemanticIndexComponentUidsDetail,

  /**
   * `catalog-name-case-mismatch`: keys exactly `found` (the board-side name)
   * and `folded_into` (the catalog name it folded into).
   */
  caseMismatch: Record<string>,

  /**
   * `rule-area-flags-unsupported`: keys are the rule area's KiCad tokens
   * that were set, each with the constant value it implies: `dnp` true,
   * `in_bom` false, `on_board` false, `exclude_from_sim` true.
   */
  ruleArea: Record<boolean>,

  /**
   * `multi-unit-conflict`: keys are the flag names (`dnp`,
   * `excludeFromBom`, …) and raw field names that disagree; each value maps
   * occurrence ids to that unit's value, a boolean for a flag and a string
   * for a field.
   */
  multiUnitConflict: Record<Record<boolean | string>>,
}

/**
 * A finding of the variant catalog or resolver (contract packet v1.0 §3.2).
 * Which optional fields are present depends on `code` (see
 * SemanticIndexDiagnosticCode).
 */
model SemanticIndexAssemblyDiagnostic {
  /** Stable code. */
  code: SemanticIndexDiagnosticCode;

  /** Severity, fixed per code. */
  severity: SemanticIndexDiagnosticSeverity;

  /** The source file kind (catalog diagnostics only). */
  source?: SemanticIndexDiagnosticSource;

  /** The source file, repository-relative (file-level diagnostics). */
  path?: RepoPath;

  /** The variant the finding is about; absent for the default design. */
  variant?: string;

  /** The reference the finding is about; empty for footprints with no `Reference` property. */
  reference?: string;

  /** The occurrence the finding is about, schematic-form KiidPath. */
  occurrenceId?: KiidPath;

  /** One-sentence explanation; its wording may change. */
  @minLength(1)
  message: string;

  /** Code-specific detail; for the two map-shaped variants the keys are listed on SemanticIndexDiagnosticDetail. */
  detail?: SemanticIndexDiagnosticDetail;

  /** Footprints the finding is about, in board file order. */
  @minItems(1)
  footprintUuids?: SemanticIndexFootprintId[];

  /** The index component with `reference`, when exactly one has it (set by the join). */
  componentUid?: SemanticIndexComponentUid;
}

/**
 * Effective default and per-variant assembly state (contract packet v1.0
 * §3.2; `semantic_index_variants.py:752-903`, `:948-1071`).
 */
model SemanticIndexAssembly {
  /** The block's own schema id, unchanged from a0. */
  schema: "prism.assembly_state_a0";

  /**
   * Every variant name in the design, in catalog order: project registry
   * names, then board-header-only, schematic-only and footprint-only names,
   * each in first-seen order (packet §2.1). Empty when the design has none.
   */
  catalog: SemanticIndexVariantCatalogEntry[];

  /** Every board footprint, in board file order (empty without a board). */
  footprintInventory: SemanticIndexFootprintInventoryEntry[];

  /** The effective default state. */
  default: SemanticIndexAssemblyDefault;

  /** One entry per catalog name, in catalog order. */
  variants: SemanticIndexAssemblyVariant[];

  /**
   * Findings, in emission order: catalog diagnostics; then source-file
   * diagnostics (schematic files in hierarchy order, then the board); then
   * occurrence and component-projection diagnostics (default, then each
   * variant in catalog order); then `duplicate-reference-footprints`,
   * `alternate-footprints-both-populated` and `source-state-mismatch`
   * (variants, then default); then index-join `reference-collision`s sorted
   * by reference in code point order.
   */
  diagnostics: SemanticIndexAssemblyDiagnostic[];
}

// --------------------------------------------------------------------- root

/**
 * `projections/semantic-index.json`, written at stage `parse`. Read by the
 * identity endpoint (streamed as is), the inspector, search, BOM table,
 * variants UI and API, component import, Release Studio, Design Comparison
 * and Simulation Studio board facts.
 */
@jsonSchema
@id("urn:prism:schema:prism.semantic_index:a2")
@extension("title", "Semantic index a2")
model SemanticIndexA2 {
  /** Schema id. a0 was `prism.semantic_index_a0`; a1 carried `sourceRevisionKey`; a2 carries `designKey`. */
  schema: "prism.semantic_index.a2";

  /**
   * The design key (ADR amendment K2 §3.6): lowercase hex SHA-256 over
   * `"prism.design_key.a0" NUL config_digest NUL R`, where `R` is the bundle's
   * canonical read set (bundle-format.md §2.3). It is the same for every
   * revision whose tree gives the same configuration and leaves the read set
   * unchanged, and for every build of it, so readers use it as the identity of
   * the design content: the cross-probe guard, comment anchors and the ETag.
   * It is not a revision key, and no member carries one: the revision a user
   * asked for comes from the request. Replaces a1's `sourceRevisionKey`.
   */
  designKey: Sha256Hex;

  /** Every component, in design-netlist component order (`design.json` `components[]`), skipping entries with no reference. */
  components: SemanticIndexComponent[];

  /**
   * Every net: schematic nets in design-netlist net order (`design.json`
   * `nets[]`, skipping unnamed ones), then nets only the board names, in the
   * order the board pass meets them (footprint pads in file order, then
   * segments, arcs, vias, zones); nets absorbed by the split-net
   * reconciliation are removed and the rest keep their relative order.
   */
  nets: SemanticIndexNet[];

  /**
   * Every terminal: per schematic net in netlist order, the terminals
   * `design.json` lists for it (sorted by designator, then pin, in code point
   * order; a repeated (designator, pin) keeps its first position), then pins
   * only the net's graphical pin list has, in that list's order; then
   * board-only terminals in board pad order (footprints in file order, each
   * footprint's pads in file order).
   */
  terminals: SemanticIndexTerminal[];

  /** Every sheet instance, in hierarchy walk order: the root first, then depth-first pre-order, a sheet's child sheets in the order its file places them. */
  sheetInstances: SemanticIndexSheetInstance[];

  /**
   * Bus objects, per sheet instance in `sheetInstances` order: that
   * instance's bus wires, then bus entries, then bus aliases, each in file
   * order.
   */
  buses: SemanticIndexBus[];

  /** Lookup maps into the arrays above. */
  indexes: SemanticIndexIndexes;

  /** Effective default and per-variant assembly state. */
  assembly: SemanticIndexAssembly;
}
