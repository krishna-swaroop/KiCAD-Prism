# Field map: projections/semantic-index.json (`prism.semantic_index.a2`)

Root model `SemanticIndexA2` in `tsp/prism/semantic-index-a2.tsp`. Example `examples/SemanticIndexA2.example.json`. a2 is a1 with `designKey` in place of `sourceRevisionKey` (ADR amendment K2 §3.6); every other field is unchanged.
Written by: P1, `native/src/rs/prism-projections/src/semantic_index.rs`. Stage: parse.

This is a parity document (conventions.md §4, §5, §14). Every field keeps today's name, unit, value and null-versus-absent behaviour from `prism.semantic_index_a0`, except the changes listed under "Expected divergences". The ADR §6 additions (`libraryRef`, `pinName`, `pinType`, `schematicNetName`) are marked **a1**.

**Abbreviations in the tables.** All paths are in this repository (`dev`) unless prefixed `ref:` (reference branch `feature/analytic-pack-spike`) or `km:` (kicad_monkey 2026.9.7, the Python wheel today's code imports).

| Short | Path |
|---|---|
| `sis` | `backend/app/services/semantic_index_service.py` |
| `sin` | `backend/app/services/semantic_index_nets.py` |
| `siv` | `backend/app/services/semantic_index_variants.py` |
| `vcs` | `backend/app/services/variant_catalog_service.py` |
| `api` | `backend/app/api/projects.py` |
| `psvc` | `backend/app/services/project_service.py` |
| `rss` | `backend/app/release_studio/semantic.py` (feeds `release_studio/dossier.py:276-306`) |
| `dcs` | `backend/app/services/design_compare_semantics.py` |
| `dco` | `backend/app/services/design_compare_occurrences.py` |
| `pci` | `backend/app/services/project_component_import_service.py` |
| `bf` | `ref:backend/app/sim_studio/board_facts.py` (Simulation Studio, ported by C6) |
| `pst` | `frontend/src/types/prism-selection.ts` (the TypeScript type of the document) |
| `vis` | `frontend/src/components/visualizer.tsx` |
| `insp` | `frontend/src/components/selection-inspector.tsx` |
| `bom` | `frontend/src/components/engineering-bom-table.tsx` |
| `dsr` | `frontend/src/lib/design-search.ts` |
| `sel` | `frontend/src/lib/prism-selection.ts` |
| `nh` | `frontend/src/lib/net-highlights.ts` |
| `dvr` | `frontend/src/lib/design-variants.ts` |
| `vs` | `frontend/src/components/design-variants/variant-selection.ts` |
| `kdj` | `km:kicad_design_json.py` (the design JSON the index reads; the fork's `design.json` has the same shape) |

The System 3D tab reads the same document through the identity endpoint (`frontend/src/lib/systems-api.ts:805`, `frontend/src/features/system-builder/use-board-indexes.ts:68`) and then uses the same readers (`insp`, `dsr`).

## Fields

Pointers are RFC 6901 with two extensions: `*` is every element of an array, `{key}` is every key of a map. One row per leaf and per array/map. "Required" means the key is always present.

### Envelope

| Field (JSON pointer) | Type | Unit | Order / nullability | Today's source (path:line) | Consumers (path:line) | Parity note |
|---|---|---|---|---|---|---|
| `/schema` | const `"prism.semantic_index.a2"` | — | required | `sis:30`, `:1146` (`prism.semantic_index_a0`) | `pst:242` (literal type); `rss:26` (enters the domain digest); `psvc:432` (job artifact schema) | **divergence**: value changes (D1) |
| `/designKey` | `Sha256Hex` | — | required | a1 `/sourceRevisionKey`, a0 `sis:1147` (`_revision_key`, `sis:90-103`, 32 hex over the semantic sources) | the cross-probe guard, comment anchors and the identity endpoint's ETag (C1); readers that need the revision take it from the request | **non-semantic**: SHA-256 over `prism.design_key.a0`, the config digest and the canonical read set (bundle-format.md §2.3, ADR amendment K2 §3.6); the same for every revision and every build that reads the same bytes. a2 replaces a1's `sourceRevisionKey`, which held the bundle's revision key |
| *(a0 `/commit`)* | — | — | **not in a1** | `sis:1148` | no reader (grep of `frontend/src`, `backend/app`) | removed (D1) |
| *(a0 `/generator`)* | — | — | **not in a1** | `sis:1149-1155` | `psvc:441` (job details); `pst:244-248` declares it, nothing reads it | removed (D1) |
| *(a0 `/generatedAt`)* | — | — | **not in a1** | `sis:1156` | `pst:249` declares it, nothing reads it; `rss` excludes it | removed (D1); ADR §7 already excludes it |

### `components`

| Field (JSON pointer) | Type | Unit | Order / nullability | Today's source (path:line) | Consumers (path:line) | Parity note |
|---|---|---|---|---|---|---|
| `/components` | `SemanticIndexComponent[]` | — | required; design-netlist component order (`design.json` `components[]`), entries without a designator skipped | `sis:879-910` | `insp:101-106`; `bom:196`; `dsr:151`; `sel:90-96`; `vis:308`; `pci:346-347`; `dco:206-222` (via `design_compare_service.py:1050`); `rss:27`; `bf:52-66` | same order |
| `/components/*/componentUid` | `SemanticIndexComponentUid` | — | required | `sis:890` (`_stable_uid` `sis:358-361`) | `dvr:80-81` (assembly join); `pci:89`, `:141`, `:161`; `pst:93` | same algorithm |
| `/components/*/reference` | `Refdes` | — | required | `sis:880` (`designator`, km netlist) | `insp:106`; `bom:158`; `sel:90`; `pci:91`, `:119`; `dcs:92-96`; `bf:53-60` | — |
| `/components/*/value` | string | — | required; may be empty | `sis:892` | `insp:652`; `dsr:216`; `pci:80`, `:131`; `dco:220`; `bf:60` | — |
| `/components/*/footprint` | string | — | required; may be empty | `sis:893` | `insp:653`; `dsr:216`; `pci:81`, `:120`; `dco:222` | — |
| `/components/*/libraryRef` **a1** | string | — | required; may be empty | `ref:sis:887` (`kdj:504-507` `_library_ref`) | `bf:61` (C6 part facts) | new; golden from ref (see "How a golden is produced") |
| `/components/*/fields` | `Record<string>` | — | required; keys in code point order (see the model doc for the key set) | `sis:894` (`_canonical_fields` `sis:467-513`; placed-symbol overlay `sis:884-887` ← `sis:399-435`); `DNP`/`In BOM` rewritten by `siv:997-1003` | `insp:659-665` (iterates in object order); `bom:82`, `:237`; `dsr:152`; `pci:62`, `:116`; `dco:211-214`; `bf:62` (`Description`) | **divergence**: key order (D3) |
| `/components/*/fields/{key}` | string | — | — | as above | as above | — |
| `/components/*/schematicRefs` | `SemanticIndexComponentSchematicRef[]` | — | required; 0 or 1 entries (netlist order) | `sis:895-901` | `sel:227-233`; `dsr:118-123`, `:268`, `:284`; `pci:95`, `:162` | — |
| `/components/*/schematicRefs/*/sheetInstancePath` | `SemanticIndexSheetNamePath` | — | required | `sis:897` (`hierarchy.sheet_path` = km `sheet_path_names`, `kdj:529-537`) | `dsr:123`; `siv:928-937` (join) | human path despite the name |
| `/components/*/schematicRefs/*/page` | string | — | required; may be empty | `sis:898` (`hierarchy.sheet`, also `sheet_path_names`) | `dsr:122`; `sel:233` (`schematicPageHint`) | same value as `sheetInstancePath` |
| `/components/*/schematicRefs/*/symbolUuid` | `KiCadUuid` | — | required | `sis:899` (`svg_id` = km netlist `instance_uuid`) | `sel:230`; `dsr:118-121`; `pci:95`; `siv:924` | P1: same unit uuid as km for multi-unit parts (fork `design_json/components.rs:25` takes `instance_uuids.last()`; it matched km on every fixture checked) |
| `/components/*/schematicRefs/*/occurrenceId` | `KiidPath` (schematic form) | — | optional; absent when the join finds no placement | `siv:1005-1009` (`_occurrence_id_for_ref` `siv:916-945`) | `pst:66` (declared; no reader yet) | present on every fixture component |
| `/components/*/pcbRefs` | `SemanticIndexComponentPcbRef[]` | — | required; board file order | `sis:902`, `:1073-1074` | `sel:228-231`; `pci:101`, `:163`; `bf:55`, `:65` (component on the board) | D4 for KiCad ≤ 7 boards |
| `/components/*/pcbRefs/*/footprintUuid` | `KiCadUuid` | — | required | `sis:1071`, `:1074` | `sel:231`; `pci:101` | — |
| `/components/*/webgpuRefs` | `SemanticIndexWebGpuRef[]` | — | required; always empty | `sis:903` | `pst:100` (declared only) | — |

### `nets`

| Field (JSON pointer) | Type | Unit | Order / nullability | Today's source (path:line) | Consumers (path:line) | Parity note |
|---|---|---|---|---|---|---|
| `/nets` | `SemanticIndexNet[]` | — | required; schematic nets in design-netlist order, then board-only nets in board-pass order, minus nets absorbed by the reconciliation | `sis:929-961`, `:1043-1066`; `sin:140-150` | `insp:112-115`; `dsr:184`; `sel:123-135`, `:208-212`; `nh:51-56`; `dcs:494-495`; `rss:28`; `bf:57` | same order |
| `/nets/*/netUid` | `SemanticIndexNetUid` | — | required | `sis:936`, `:1050` | `insp:112`; `sel:208`; `nh:51`; `dcs:68`, `:255`, `:273` | — |
| `/nets/*/name` | `NetName` | — | required | `sis:930`, `:1051`; reconciliation keeps the board name `sin:86-91` | `dsr:191-192`; `sel:123`; `dcs:502`, `:527`; `bf:57` | — |
| `/nets/*/netClass` | string | — | required; may be empty | `sis:938`, `:1053`, `sin:134-135` | `insp:730`; `dsr:189`, `:232` | — |
| `/nets/*/aliases` | `NetName[]` | — | optional (absent on a board-only net that absorbed nothing); sorted (code point) on schematic nets, absorption order on a board net | `sis:939-943`; `sin:126-129` | `dsr:185`, `:243`; `dcs:548-549` | — |
| `/nets/*/sourceSheets` | `SemanticIndexNetlistSheetPath[]` | — | optional (as `aliases`); sorted (code point) or absorption order | `sis:944-948` (km `source_sheets`, `kdj:582`); `sin:130-133` | none today (Release Studio digests it via `rss:28`) | — |
| `/nets/*/schematicRefs` | `SemanticIndexNetSchematicRef[]` | — | required; first-seen sheet-instance order, unplaced entry last | `sis:934` (`_group_schematic_refs` `sis:721-781`); `sin:136` | `sel:281-307`; `dsr:137-138`; `dcs:118`, `:127-128`, `:264` | — |
| `/nets/*/schematicRefs/*/sheetInstancePath` | `KiidPath` (schematic form) | — | optional (absent on the unplaced entry) | `sis:610` (placement), `:757-770` | `sel:295`; `dsr:138` | — |
| `/nets/*/schematicRefs/*/sheetPath` | `SemanticIndexSheetNamePath` | — | optional (as above) | `sis:611` | none read directly (copied whole by `sel`) | — |
| `/nets/*/schematicRefs/*/page` | `RepoPath` | — | optional (as above) | `sis:612` (`_relative_schematic_page` `sis:557-564`) | `sel:281-293`; `dsr:137` | — |
| `/nets/*/schematicRefs/*/wireUuids` | `KiCadUuid[]` | — | required; net list order, no repeats | `sis:726`, `:771-772` (km `graphical.wires`, `kdj:602-627`) | `sel:302-309`; `dcs:128`, `:143` | — |
| `/nets/*/schematicRefs/*/labelUuids` | `KiCadUuid[]` | — | required; labels, then ports, then power ports | `sis:727-731` | `sel:302-309`; `dcs:128`, `:144` | — |
| `/nets/*/schematicRefs/*/junctionUuids` | `KiCadUuid[]` | — | required; junctions, then sheet entries | `sis:732-735` | `dcs:128`, `:145` | — |
| `/nets/*/schematicRefs/*/pinUuids` | `KiCadUuid[]` | — | required; terminal order, no repeats | `sis:1008-1021` | `sel:302-309`; `dcs:128`, `:146` | — |
| `/nets/*/schematicRefs/*/labelInstanceCount` | `Count` | — | required | `sis:773-774`, `:776-777` | `dcs:118` | — |
| `/nets/*/pcbRefs` | `SemanticIndexNetPcbRef[]` | — | required; exactly one entry | `sis:950`, `:1055` | `nh:63-64` | — |
| `/nets/*/pcbRefs/*/trackUuids` | `KiCadUuid[]` | — | required; board file order | `sis:1113-1127` | `nh:64` | D4 |
| `/nets/*/pcbRefs/*/arcUuids` | `KiCadUuid[]` | — | required; board file order | `sis:1113-1127` | none | D4 |
| `/nets/*/pcbRefs/*/viaUuids` | `KiCadUuid[]` | — | required; board file order | `sis:1113-1127` | `nh:64` | D4 |
| `/nets/*/pcbRefs/*/zoneUuids` | `KiCadUuid[]` | — | required; board file order | `sis:1113-1127` | none | D4 |
| `/nets/*/pcbRefs/*/padUuids` | `KiCadUuid[]` | — | required; board file order | `sis:1084-1086` | none (pads are resolved through terminals) | D4 |
| `/nets/*/webgpuRefs` | `SemanticIndexWebGpuRef[]` | — | required; always empty | `sis:951`, `:1056` | `pst:111` (declared only) | — |
| `/nets/*/netCode` | `SemanticIndexNetCode` \| null | — | optional: absent = no board item on the net carries a number; null = board-only net whose items carry none | `sis:552-554`, `:1052`, `:1063-1065` | `insp:731`; `vis:280`, `:879`; `nh:40`, `:89`; `sel:127`, `:177`; `dsr:134` | — |

### `terminals`

| Field (JSON pointer) | Type | Unit | Order / nullability | Today's source (path:line) | Consumers (path:line) | Parity note |
|---|---|---|---|---|---|---|
| `/terminals` | `SemanticIndexTerminal[]` | — | required; per schematic net, netlist terminal order (designator, then pin, code point) then graphical-only pins; then board-only terminals in pad order | `sis:963-1023`, `:1087-1111` | `insp:121-124`; `sel:106-113`, `:254-256`; `dcs:65-87`, `:274-277`; `rss:29`; `bf:41-51` | same order |
| `/terminals/*/terminalUid` | `SemanticIndexTerminalUid` | — | required | `sis:995`, `:1092` | `insp:121` | — |
| `/terminals/*/componentUid` | `SemanticIndexComponentUid` | — | required | `sis:996`, `:1093` | `pst:116` (selection payload) | reference-only uid when no component has the reference |
| `/terminals/*/reference` | `Refdes` | — | required | `sis:990`, `:1094` | `dcs:66`, `:79`; `bf:42` | — |
| `/terminals/*/pin` | `SemanticIndexPinNumber` | — | required | `sis:991`, `:1095` | `dcs:66`, `:80`; `bf:43` | — |
| `/terminals/*/pinName` **a1** | string | — | optional: present when the netlist listed the pin record; may be empty or `~` | `ref:sis:993` (km `pin_name`, `kdj:597`) | `bf:49` | new; **divergence** from ref for graphical-only terminals (D6) |
| `/terminals/*/pinType` **a1** | `SemanticIndexPinType` | — | optional (as `pinName`) | `ref:sis:994` (km `_pin_type_json`, `kdj:598`, `:708-710`) | `bf:49` (upper-cases again) | new; D6 |
| `/terminals/*/netUid` | `SemanticIndexNetUid` \| null | — | required; null = board-only terminal whose pad has no net | `sis:999`, `:1096`, `:1109`; `sin:161` | `dcs:68`, `:82`, `:275-277` | — |
| `/terminals/*/netName` | `NetName` \| null | — | required; null as `netUid` | `sis:1000`, `:1097`, `:1109`; `sin:162` | `bf:46` (pad net); `pst:120` | pad-resolved, unchanged from a0 |
| `/terminals/*/schematicNetName` **a1** | `NetName` | — | optional: present on every terminal the netlist pass created | new: the `name` of the netlist net at `sis:930` that lists the terminal, recorded before `sis:1109` and `sin:158-162` rewrite `netName` | C2 (schematic-side connectivity, today from an index built with `include_pcb=False`, `design_compare_service.py:416-427`) | new (D7) |
| `/terminals/*/schematicPinUuid` | `KiCadUuid` | — | optional: present on netlist-pass terminals | `sis:993`, `:1001` | `sel:256`; `dcs:202`, `:275-276` | — |
| `/terminals/*/pcbPadUuid` | `KiCadUuid` | — | optional: present when a pad with this reference and number exists | `sis:1098`, `:1106` | `sel:256`; `dcs:277`; `bf:44` (only pad terminals are board facts) | D4 |

### `sheetInstances`

| Field (JSON pointer) | Type | Unit | Order / nullability | Today's source (path:line) | Consumers (path:line) | Parity note |
|---|---|---|---|---|---|---|
| `/sheetInstances` | `SemanticIndexSheetInstance[]` | — | required; hierarchy walk order (pre-order) | `sis:591-629` (km `schematic_instances()`) | `dcs:454-455`; `rss:30` | — |
| `/sheetInstances/*/sheetInstanceUid` | `SemanticIndexSheetInstanceUid` | — | required | `sis:616-620` | `dcs:455` | — |
| `/sheetInstances/*/sheetInstancePath` | `KiidPath` (schematic form) | — | required | `sis:593-598` | `sis:868-870` (index) | — |
| `/sheetInstances/*/sheetPath` | `SemanticIndexSheetNamePath` | — | required | `sis:592` | none | — |
| `/sheetInstances/*/page` | `RepoPath` | — | required | `sis:599-602` | none directly (`parentPage` derives from it) | — |
| `/sheetInstances/*/parentSheetInstancePath` | `KiidPath` \| null | — | required; null on the root | `sis:603-607`, `:624` | `dcs:314` | — |
| `/sheetInstances/*/sheetSymbolUuid` | `KiCadUuid` \| null | — | required; null on the root | `sis:608`, `:625` | `dcs:305`, `:429-432` | — |
| `/sheetInstances/*/sheetName` | string | — | required | `sis:626` | none | — |
| `/sheetInstances/*/isTopLevel` | boolean | — | required | `sis:627` | none | — |
| `/sheetInstances/*/parentPage` | `RepoPath` \| null | — | required; null on the root | `sis:710-716` | `dcs:312` | — |

### `buses`

| Field (JSON pointer) | Type | Unit | Order / nullability | Today's source (path:line) | Consumers (path:line) | Parity note |
|---|---|---|---|---|---|---|
| `/buses` | `SemanticIndexBus[]` (@oneOf by `kind`) | — | required; per sheet instance: wires, entries, aliases, each in file order | `sis:647-708` | `dcs:452`; `rss:31` | — |
| `/buses/*/kind` | `"bus"` \| `"bus_entry"` \| `"bus_alias"` | — | required; first key | `sis:662`, `:697` | `dcs:318-319` | key order (D3) |
| `/buses/*/busUid` | `SemanticIndexBusUid` (`bus:`) or `SemanticIndexBusAliasUid` (`bus-alias:`) | — | required | `sis:656-661`, `:696` | `dcs:452`; `sis:871-874` | — |
| `/buses/*/sourceUuid` (wire, entry) | `KiCadUuid` | — | required on wire and entry; absent on alias | `sis:652`, `:663` | `dcs:305` | — |
| `/buses/*/name` (alias) | string | — | required on alias only | `sis:693`, `:698` | none | — |
| `/buses/*/members` (alias) | string[] | — | required on alias only; sorted (code point), repeats kept | `sis:699-703` | none | — |
| `/buses/*/sheetInstancePath` | `KiidPath` (schematic form) | — | required | `sis:664`, `:704` | `dcs:316` | — |
| `/buses/*/sheetPath` | `SemanticIndexSheetNamePath` | — | required | `sis:665`, `:705` | none | — |
| `/buses/*/page` | `RepoPath` | — | required | `sis:666`, `:706` | `dcs:312` | — |
| `/buses/*/points` (wire, entry) | `SemanticIndexMmPair[]` | schematic mm | required on wire and entry; file order; always empty on an entry | `sis:667-670` | none | float text (see serialization) |
| `/buses/*/points/*` | `[x, y]` float64 pair | schematic mm | `[x, y]` | `sis:668` | none | — |
| `/buses/*/at` (wire, entry) | `SemanticIndexMmPair` on an entry; `null` on a wire | schematic mm | required on wire and entry | `sis:671-679` | none | — |
| `/buses/*/size` (wire, entry) | `SemanticIndexMmPair` on an entry; `null` on a wire | schematic mm | required on wire and entry | `sis:680-688` | none | — |

### `indexes`

Every value is a `SemanticIndexPosition` (zero-based position in the named array). Every map serializes its keys in code point order.

| Field (JSON pointer) | Type | Unit | Order / nullability | Today's source (path:line) | Consumers (path:line) | Parity note |
|---|---|---|---|---|---|---|
| `/indexes` | `SemanticIndexIndexes` | — | required; all twelve maps always present | `sis:853-866` | — | D3 (key order) |
| `/indexes/componentByReference/{key}` | position in `components` | — | key: reference; later wins | `sis:908` | `insp:106`; `sel:90` | — |
| `/indexes/componentBySchematicUuid/{key}` | position in `components` | — | key: `symbolUuid` | `sis:909-910` | `sel:95` | — |
| `/indexes/componentByPcbFootprintUuid/{key}` | position in `components` | — | key: footprint UUID | `sis:1075-1077` | `sel:96` | D4 |
| `/indexes/terminalBySchematicPinUuid/{key}` | position in `terminals` | — | key: `schematicPinUuid` | `sis:1022` | `sel:112` | — |
| `/indexes/terminalByPcbPadUuid/{key}` | position in `terminals` | — | key: `pcbPadUuid` | `sis:1110-1111` | `sel:113` | D4 |
| `/indexes/terminalByReferencePin/{key}` | position in `terminals` | — | key: `<reference>:<pin>` | `sis:1007`, `:1104` | `insp:124`; `sel:106`, `:254` | — |
| `/indexes/netByName/{key}` | position in `nets` | — | key: net name or absorbed alias | `sis:957`, `:1062`; `sin:151-155` | `insp:115`; `sel:123`, `:211`; `nh:55` | — |
| `/indexes/netByNetCode/{key}` | position in `nets` | — | key: decimal net number | `sis:1065` | `sel:127` | — |
| `/indexes/netBySchematicUuid/{key}` | position in `nets` | — | key: wire/label/junction/pin UUID | `sis:958-961`, `:1023` | `sel:134` | — |
| `/indexes/netByPcbUuid/{key}` | position in `nets` | — | key: pad/track/arc/via/zone UUID | `sis:1086`, `:1127` | `sel:135` | D4 |
| `/indexes/sheetInstanceByPath/{key}` | position in `sheetInstances` | — | key: `sheetInstancePath` | `sis:867-870` | none | — |
| `/indexes/busByUid/{key}` | position in `buses` | — | key: `busUid` | `sis:871-874` | none | — |

### `assembly`

Built by `siv:1040-1071` (`assemble_semantic_index`): the catalog from `vcs:270-333`, the state from `siv:752-903`, then the join onto component uids `siv:948-1037`. Contract packet v1.0 §2–§3.3 (`audit-reports/design-variants-2026-09-17/CONTRACT_PACKET_v1.md`, outside the repository) fixes the semantics; the committed oracle fixtures `backend/tests/fixtures/design_variants/expected/*.json` pin the values.

| Field (JSON pointer) | Type | Unit | Order / nullability | Today's source (path:line) | Consumers (path:line) | Parity note |
|---|---|---|---|---|---|---|
| `/assembly` | `SemanticIndexAssembly` | — | required (a0 optional; the bundle always builds it) | `sis:1164-1170` | `dvr:48`, `:57`, `:70`, `:145`; `vs:60`; `vis:1266` | — |
| `/assembly/schema` | const `"prism.assembly_state_a0"` | — | required | `siv:42`, `:894` | `pst:226` | unchanged |
| `/assembly/catalog` | `SemanticIndexVariantCatalogEntry[]` | — | required; catalog order (packet §2.1) | `vcs:270-333`, `:152-160`; `siv:767-776` | `vs:60`; `vis:1266` | — |
| `/assembly/catalog/*/name` | string (≥ 1) | — | required | `vcs:74-79`, `:99-100`, `:108-110` | `dvr:58` | — |
| `/assembly/catalog/*/description` | string \| null | — | required; null = no registry or header description | `vcs:172-174` | `pst:152` (selector label) | — |
| `/assembly/catalog/*/sources` | `SemanticIndexVariantSource[]` | — | required; first-met order, no repeats | `vcs:166-169` | `pst:153` | — |
| `/assembly/footprintInventory` | `SemanticIndexFootprintInventoryEntry[]` | — | required; board file order | `siv:897-899` | `dvr:150` (physical visibility) | D4 (ids on `tstamp` boards) |
| `/assembly/footprintInventory/*/uuid` | `SemanticIndexFootprintId` | — | required; may be empty | `siv:482` (km `footprint.uuid`) | `dvr:150` | D4 |
| `/assembly/footprintInventory/*/reference` | string | — | required; may be empty | `siv:483` (km `resolve_footprint`) | `dvr:150` | — |
| `/assembly/default` | `SemanticIndexAssemblyDefault` | — | required | `siv:791-806` | `dvr:80` | — |
| `/assembly/default/occurrences/{key}` | `SemanticIndexOccurrenceDefault` | — | key: occurrence id; only entries with a true flag | `siv:792-796`, `:646-651`; `componentUid` `siv:987-991` | none in the frontend yet (packet §3.6) | D3 (key order) |
| `/assembly/default/occurrences/{key}/reference` | `Refdes` | — | required | `siv:647` | — | — |
| `/assembly/default/occurrences/{key}/dnp` … `/excludeFromPosFiles` | const `true` | — | optional: present only when true (five flags, `siv:44-50`) | `siv:648-650` | — | — |
| `/assembly/default/occurrences/{key}/componentUid` | `SemanticIndexComponentUid` | — | optional: absent when no single component has the reference | `siv:987-991` | — | — |
| `/assembly/default/components/{key}` | `SemanticIndexComponentDefault` | — | key: componentUid, or the reference when ambiguous or unknown | `siv:797-801`, `:654-656`, `:978-984` | `dvr:80` | — |
| `/assembly/default/components/{key}/dnp` … `/excludeFromPosFiles` | const `true` | — | optional: present only when true | `siv:655` | `dvr:80` | — |
| `/assembly/default/footprints/{key}` | `SemanticIndexFootprintDefault` | — | key: footprint id (may be `""`) | `siv:802-806`, `:659-664`, `:992-995` | — | D4 |
| `/assembly/default/footprints/{key}/reference` | string | — | required; may be empty | `siv:660` | — | — |
| `/assembly/default/footprints/{key}/dnp`, `/excludeFromBom`, `/excludeFromPosFiles` | const `true` | — | optional: present only when true (`siv:51`) | `siv:661-663` | — | — |
| `/assembly/default/footprints/{key}/componentUid` | `SemanticIndexComponentUid` \| null | — | required; null = no single component has the reference | `siv:992-995` | `pst:176` | — |
| `/assembly/variants` | `SemanticIndexAssemblyVariant[]` | — | required; catalog order, one per catalog entry | `siv:834-848` | `dvr:58` | — |
| `/assembly/variants/*/name` | string (≥ 1) | — | required | `siv:836` | `dvr:58` | — |
| `/assembly/variants/*/occurrences/{key}` | `SemanticIndexAssemblyOverride` | — | key: occurrence id; only entries that differ | `siv:667-683` | — | — |
| `/assembly/variants/*/components/{key}` | `SemanticIndexAssemblyOverride` | — | key: componentUid or reference | `siv:686-702`, `:983-984` | `dvr:81` | — |
| `/assembly/variants/*/footprints/{key}` | `SemanticIndexFootprintOverride` | — | key: footprint id | `siv:705-723` | none (PCB viewer reads the board) | D4 |
| `…/occurrences/{key}/dnp`, `/excludeFromBom`, `/excludeFromBoard`, `/excludeFromSim`, `/excludeFromPosFiles` (and the same under `components/{key}`) | boolean | — | optional: present only when it differs from the default | `siv:501-508` | `dvr:99-105` | — |
| `…/footprints/{key}/dnp`, `/excludeFromBom`, `/excludeFromPosFiles` | boolean | — | optional: as above | `siv:501-508`, `:714-716` | — | — |
| `…/{occurrences,components,footprints}/{key}/fields` | `Record<string>` | — | optional: absent when no field differs; keys = raw KiCad field names | `siv:511-516` | `dvr:105` | D3 |
| `…/fields/{key}` | string | — | may be empty (an override to `""`) | as above | `dvr:105` | — |
| `/assembly/diagnostics` | `SemanticIndexAssemblyDiagnostic[]` | — | required; emission order (model doc) | `siv:1067-1069`, `:779-785`, `:850-891`, `:1011-1037` | `pst:236` (declared; no reader yet); fixture tests `backend/tests/test_semantic_index_variants.py:234-248` | — |
| `/assembly/diagnostics/*/code` | `SemanticIndexDiagnosticCode` | — | required | `vcs:50-51`; `siv:333`, `:399`, `:444`, `:587`, `:603`, `:613`, `:637`, `:742`, `:859`, `:882`, `:1020` | tests | — |
| `/assembly/diagnostics/*/severity` | `SemanticIndexDiagnosticSeverity` | — | required | same lines | `pst:200` | — |
| `/assembly/diagnostics/*/source` | `SemanticIndexDiagnosticSource` | — | optional (catalog diagnostics) | `vcs:117`, `:132` | `pst:202` | — |
| `/assembly/diagnostics/*/path` | `RepoPath` | — | optional | `vcs:118`; `siv:589`, `:605`, `:615`, `:639` | `pst:207` | — |
| `/assembly/diagnostics/*/variant` | string | — | optional | `siv:409-410`, `:450-451`, `:747-748`, `:861` | `pst:203` | — |
| `/assembly/diagnostics/*/reference` | string | — | optional; may be empty | `siv:335`, `:401`, `:446`, `:744`, `:862`, `:884`, `:1022` | `pst:214` | — |
| `/assembly/diagnostics/*/occurrenceId` | `KiidPath` | — | optional | `siv:336` | `pst:205` | — |
| `/assembly/diagnostics/*/message` | string (≥ 1) | — | required | as `code` | — | compared as is: P1 reproduces today's text (conventions' Common.Warning treats wording as unstable; this parity field does not) |
| `/assembly/diagnostics/*/detail` | `SemanticIndexDiagnosticDetail` (@oneOf, 7 shapes) | — | optional | `vcs:134`; `siv:403-407`, `:448`, `:591`, `:607`, `:617`, `:641`, `:1024-1027` | tests | see open question on its shape |
| `/assembly/diagnostics/*/detail/version` | int32 | — | `legacy-in-bom-semantics` | `siv:591` | tests | — |
| `/assembly/diagnostics/*/detail/tokens` | string[] | — | `unsupported-variant-token`; first-seen order | `siv:535-545` | tests | — |
| `/assembly/diagnostics/*/detail/occurrenceIds` | `KiidPath[]` | — | `reference-collision`; sorted (code point) | `siv:403-407` | tests | — |
| `/assembly/diagnostics/*/detail/componentUids` | `SemanticIndexComponentUid[]` | — | `reference-collision` (join); `components` order | `siv:1024-1027` | tests | — |
| `/assembly/diagnostics/*/detail/{key}` (case mismatch) | string | — | keys `found`, `folded_into` | `vcs:134` | `backend/app/api/project_variants.py` serves the same catalog diagnostics | — |
| `/assembly/diagnostics/*/detail/{key}` (rule area) | boolean | — | keys `dnp`, `in_bom`, `on_board`, `exclude_from_sim` | `siv:65-70`, `:548-561` | tests | — |
| `/assembly/diagnostics/*/detail/{key}/{key}` (multi-unit) | boolean or string | — | outer key: flag or field name; inner key: occurrence id | `siv:420-440` | tests | — |
| `/assembly/diagnostics/*/footprintUuids` | `SemanticIndexFootprintId[]` | — | optional; board file order | `siv:864`, `:886` | `pst:215` (3D grouping) | D4 |
| `/assembly/diagnostics/*/componentUid` | `SemanticIndexComponentUid` | — | optional | `siv:1033-1037` | `pst:204` | — |

Not in the contract although `pst:206` declares it: `footprintUuid` on a diagnostic. No producer writes it (contract packet §3.2 lists it; nothing emits it).

## How a golden is produced from today's code

1. **Producer.** dev's `semantic_index_service.build_semantic_index(project_file, source_revision_key=…, commit=None)` with its defaults (`include_pcb`, `include_components`, `include_assembly` all true; no injected board), patched in memory with the four a1 additions:
   - component: after `"footprint"`, `"libraryRef": _string(raw.get("library_ref"))` (as `ref:sis:887`);
   - schematic terminal (`sis:994-1002`): after `"pin"`, `"pinName": _string(raw_terminal.get("pin_name"))` and `"pinType": _string(raw_terminal.get("pin_type"))` **only when `"pin_type" in raw_terminal`** (the graphical-pin-only terminals built at `sis:982-987` get neither); after `"netName": name`, `"schematicNetName": name`.
   - Do **not** take the reference branch's `semantic_index_service.py` as a whole. Its board path (`ref:backend/app/services/semantic_index_board.py`) falls back to `design.to_json(include_pcb=False)` when `prism-bundle` is not on `PRISM_SIM_BIN_DIR`; the adapter then detaches the board, and `assembly.footprintInventory`, `default.footprints` and every variant's `footprints` come out empty (29 of the 33 fixtures; the other 4 have no footprints). With the tool present it reads `(tstamp …)` ids, unlike dev. Its three added lines are the only part a golden needs.
2. **Envelope (a0 → a1).** `schema` = `prism.semantic_index.a1`; `sourceRevisionKey` = the bundle's revision key (non-semantic: the golden stores whatever key it was built with and the comparison ignores it); delete `commit`, `generator`, `generatedAt`. Body keys unchanged.
3. **Comparison** (conventions §14): JSON value equality after removing `/designKey` (a1: `/sourceRevisionKey`). Arrays in order, objects as key sets, so map key order and struct key order do not matter. Expected divergences D4–D6 are recorded per fixture in `native/parity/divergences.md`.
4. **Fixtures**: every committed project with a `.kicad_pro` (9 + 3 + 21 below) plus the corpus. `design_variants/malformed` raises in today's builder (`SexprTreeError`, unbalanced schematic) and has no golden; `design_variants/pcb_only` has no project file.

**Serialization today vs a1** (bytes differ, values do not):

| | a0 today | a1 (Rust, conventions §13) |
|---|---|---|
| writer | `json.dumps(payload, separators=(",", ":"))` (`sis:263`), no trailing newline | `serde_json` compact + one LF |
| non-ASCII | escaped `\uXXXX` (`ensure_ascii` default) | raw UTF-8 |
| struct key order | dict insertion order; varies (board-only nets put `netCode` before `netClass`; absorbed nets append `aliases`, `sourceSheets`; buses put `busUid` before `kind`; diagnostics vary by code) | declared order |
| map key order | insertion order | code point order |
| floats (bus coordinates only) | Python `repr` (shortest round-trip: `189.23`, `2.54`, `100.0`) | `ryu` shortest round-trip; same text for schematic coordinates, but exponent forms differ (`1e-05` vs `1e-5`) |
| integers | plain | plain |

**Porting notes for P1.**
- Everything except `fields`' placed-symbol overlay (`sis:399-435`, a raw-text scan) and the variant source scans (`vcs`, `siv:535-643`) is derivable from the fork's `design.json` plus the board model. On `design_variants/oracle`, `release-studio/usb-pd`, `release-studio/cynthion` and `system_builder/mini_obc/F8`, the fork's `design.json` (built with `prism-sim-studio/target/debug/prism-bundle build --no-refill`) has the same component order, net order, terminal pin names and types, `library_ref`, graphical pin ids, aliases, `source_sheets` and net classes as kicad_monkey 2026.9.7. Its `parameters` differ for 1 component on usb-pd and 15 on cynthion, and its wire lists for 3 nets on cynthion; P1 resolves those against the goldens.
- `_stable_uid` hashes `"\x1f".join(str(part or "") …)` (`sis:358-361`): a missing part hashes as the empty string, and a single-part uid (`_stable_uid("cmp", reference)`) has no separator.
- `fields` values are `_string()` (`sis:364-369`): booleans become `true`/`false`, `None` becomes `""`.

## Expected divergences

| Case | Today | Bundle | Why the bundle is right | Consumer affected |
|---|---|---|---|---|
| D1 envelope | `schema: prism.semantic_index_a0`; `commit`; `generator` {name, version, build, cacheTag, kicadMonkeyVersion}; `generatedAt` | `schema: prism.semantic_index.a1`; no `commit`, `generator` or `generatedAt` | a member is keyed by revision key and serves every commit with those sources, so it cannot name one commit; the generator is recorded once in `bundle.json`; wall-clock time breaks determinism (conventions §4, §9) | C1: `pst:242-249` (literal type, optional fields), `api:764` (ETag from `generator_cache_tag()` → bundle generator id, ADR G9); K: job details `psvc:432`, `:440-441` |
| D2 revision key | 32 hex over the semantic sources and the project-file name (`sis:90-103`) | 64 hex design revision key (ADR §5: effective config + whole source set incl. 3D models) | one key per revision across Prism (ADR §2.7) | C1: comment anchors store the key (`backend/app/api/comments.py:58`, `:117`); cross-probe compares keys only within one page load |
| D3 key order | insertion order for every map and struct | maps in code point order; structs in declared order | conventions §9, §13 | C1: the inspector lists `fields` in object order (`insp:665`): with code point order `Datasheet` precedes `Value` and `_source_cad`/`kicad_*` interleave; BOM columns are unaffected (`bom:234-241` sorts) |
| D4 KiCad ≤ 7 boards (`tstamp`, `fp_text reference`): `release-studio/cynthion`, `release-studio/synthetic` | kicad_monkey reads only `(uuid …)`: every board id is `""`, so no pad/track/arc/via/zone UUID is indexed, footprints are `""` in `footprintInventory`, map keys and `footprintUuids` | the fork reads `(tstamp …)` as the UUID (fork `src/rs/kicad-monkey-core/src/pcb/decode.rs:191`, `pcb/scalars.rs:526`): cynthion gains 1472 pad, 3484 segment, 138 arc, 651 via and 65 zone UUIDs in `nets[].pcbRefs` and `indexes.netByPcbUuid`, and 348 footprint ids; synthetic gains 3 footprint ids. References stay empty (the fork reads only `(property "Reference" …)`, `pcb/decode.rs:166`), so `components[].pcbRefs`, `pcbPadUuid` and the footprint-reference joins stay as today | the ids are in the file; `""` collapsed 348 footprints into one map key | PCB/3D cross-probe on old boards gains net selection; `dvr:150` footprint identity becomes real |
| D5 serialization | see the table above | | | none (readers parse JSON) |
| D6 graphical-pin-only terminals | ref writes `pinName: ""`, `pinType: ""` | both absent | the netlist gave no pin record; `""` is not a pin type | `bf:49` reads `""` either way; no committed fixture has such a terminal |
| D7 Design Comparison input | Design Comparison builds its own index with `include_pcb=False, include_components=False` (`design_compare_service.py:416-427`): terminal `netName` is the schematic name, no `pcbPadUuid`, no board-only nets or terminals, no `netCode`, `components` empty, terminal `componentUid` reference-only | the member is the full index | one parse per revision (ADR §2.4) | C2 derives the schematic view: terminals' `schematicNetName` (uid `_stable_uid("net", name)`), nets with a non-empty `schematicRefs`; a design whose split nets were reconciled (`sin:69-163`, e.g. `system_builder/mini_obc/F8`) still shows the board name for the absorbed net |
| D8 Release Studio digests | `semantic_digest` per domain = sha256 over `rss:33-52` (includes `schema` and every component/net/terminal object) | the a1 schema id and the added fields change every digest | — | C3: dossier fingerprints (`release_studio/dossier.py:276-306`) change unless C3 digests an a0-compatible view (open question) |
| D9 paths (maintainer decision, conventions §8; issue #681) | `page`, `parentPage`, `schematicRefs[].page` and diagnostic `path` relative to the project directory (`_relative_schematic_page`, `sis:557-564`) | repository-relative `RepoPath`; `sheetInstanceUid`, which hashes `page` (`sis:616-620`), follows | one spelling per file whichever project refers to it; files are attributed by the anchor and the effective configuration, never by directory | equal for a project at the repository root, as in the example; otherwise C1 (`sel:281-293`, `dsr:137`) and C2 (`dcs:312`) see the project directory prefixed and new sheet-instance uids |

## Example provenance

- **Fixture**: `backend/tests/fixtures/design_variants/oracle/variants_oracle.kicad_pro` (hand-written, redistributable, KiCad 10 grammar). The repository root is taken to be the fixture project's own directory, as if it were its own repository, so the repository-relative paths equal today's project-relative ones (D9). Built by the golden recipe above on dev at the W0 worktree, kicad_monkey 2026.9.7; the full output validates.
- **Kept**: components R2 (default DNP, a `dnp` user field), C1 (variant field overrides with quotes and non-ASCII), U1 (two units with a `multi-unit-conflict`; board-only terminal `U1:5` with a null net), Q1 (two alternate footprints; `duplicate-reference-footprints`), R9 (no footprint; terminal without `pcbPadUuid`); one terminal each of R2, C1, U1 (unit A pin 1), Q1, R9 plus `U1:5`, and the five nets those schematic terminals sit on; all five sheet instances (root, nested `/Wireless/Antenna/`, the reused `channel.kicad_sch` as `/CH_A/` and `/CH_B/`); four of the six catalog entries and their variants (`Lite`, `Pro` with a null description, `Édition-µ`, footprint-only `PcbOnly`); footprint inventory of the kept components plus J9 (the `PcbOnly` footprint).
- **Trimmed**: components R1, R3, R4, R6, R7, R8, R12, U2; their terminals and nets; the other board-only terminals; catalog entries `Unused` and `BoardOnly` (empty variant maps); every `assembly` map entry and diagnostic of a dropped component. `fields` of every kept component except C1 lists only the 17 canonical keys and user fields (kicad_monkey's `_source_cad`, `kicad_*`, `ki_*`, `Reference`, `Sheetfile`, `Sheetname` keys are dropped; C1 keeps all of them). Index maps keep only entries whose element is kept, renumbered.
- **Stand-in**: `sourceRevisionKey` is sha256 over `prism.revision_key.a1\0stand-in\0` + today's a0 key, because the revision-key spec's reference implementation does not exist yet (K, B).
- **Not in this fixture** (covered by the validated outputs below): buses (`release-studio/cynthion`: 306 wires, 252 entries, 6 aliases); `netCode` (`release-studio/usb-pd`, `cynthion`); `netCode: null`, `aliases`, board-only net and `schematicNetName` ≠ `netName` (`system_builder/mini_obc/F8`); pad, track, via and zone UUIDs (`release-studio/usb-pd`, USB-PD-Trigger-Board); detail shapes of `catalog-name-case-mismatch` (`case_fold`), `legacy-in-bom-semantics` (`legacy_in_bom`, `cynthion`), `unsupported-variant-token` (`kicad11_tokens`), `rule-area-flags-unsupported` (`rule_area`), `reference-collision` (`cynthion`), `source-state-mismatch` and `alternate-footprints-both-populated` (`release-studio/synthetic`, USB-PD-Trigger-Board); `source-unparseable` and `occurrence-instance-missing` occur in no fixture.
- **Size**: 838 lines, over the ~300 aim: the 17 canonical `fields` keys are always present, and every kept object shows a case the trimmed alternatives do not.

**Validation record.** Every output below validates against `SemanticIndexA1` with `scripts/check-contract.mjs` (2026-10-16): the prototype a1 producer (recipe above) and, separately, the reference branch's interim output with the envelope adapted. The prototype's body equals dev's a0 body field for field once the four additions are removed, and its additions equal the reference branch's on every fixture.

- `backend/tests/fixtures/design_variants/`: case_fold, kicad11_tokens, legacy_in_bom, no_variants, oracle, oracle_rev2, rule_area, sch_only (malformed: today's builder raises; pcb_only: no project file);
- `fixtures/release-studio/`: cynthion, synthetic, usb-pd;
- `backend/tests/fixtures/system_builder/`: sources/mini_obc/F0–F9, F11.1, F11.2 (12), sources/mini_payload/F0, sources/mini_power/F0, F10, p2/sources/ambiguous/F0, edge_a/F0, edge_b/F0, mezz_base/F0, mezz_top/F0, F1;
- `/Users/Swaroop/Personal-Projects/USB-PD-Trigger-Board` (read-only).
