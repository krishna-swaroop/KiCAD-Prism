# Design-bundle contract conventions

- **Status:** W0 draft for maintainer review. Once accepted, the rules here change only by an ADR amendment, like the contracts themselves.
- **Applies to:** every file under `tsp/prism/`, every example under `examples/` and every field map under `field-maps/`. After WP-F1 the same rules apply to `native/src/tsp/prism/`.
- **Parent:** [`../adr-native-design-bundle.md`](../../../docs/architecture/adr-native-design-bundle.md), §4.4, §5, §6, §7 and §9.

Citations: a bare path is in this repository (`dev` plus the ADR). `fork:` is kicad_monkey at `b6316117` (the Rust that WP-F1 imports). `sim:` is prism-sim-studio. `ref:` is the reference branch `feature/analytic-pack-spike`.

## 0. Checklist

`scripts/check-contract.mjs` enforces every item marked (L). §17 lists its rules.

1. One file per contract, `tsp/prism/<name>-<version>.tsp`, in namespace `Prism.Contracts.<Name><Version>`. The file imports `@typespec/json-schema` and `./common.tsp` itself. (L)
2. The root model is named `<Name><Version>`, carries `@jsonSchema`, `@id("urn:prism:schema:prism.<name>:<version>")` and `@extension("title", "<Human name> <version>")`. Its first property is `schema: "prism.<name>.<version>"`. (L)
3. Every model, field, enum, enum member, union, scalar and non-model union variant has a doc comment. (L)
4. Field names: bundle machinery uses snake_case, new projections use camelCase, and parity documents keep today's names. A file never mixes the two families. (L)
5. Lengths are integer nanometres (`Nanometres`, suffix `Nm`/`_nm`), angles are `Degrees` (suffix `Deg`/`_deg`). (L)
6. Every array's doc states its order, every map's doc states its keys, and every nullable field's doc states what null means. (L)
7. Never use `int64`, `uint64`, `integer`, `numeric`, `float32`, `decimal` or any date/time type. (L)
8. Closed string sets are `enum`s. Unions of models carry `@oneOf`, and each variant starts with `kind: "<literal>"`. There are no inline object types. (L)
9. There are no timestamps, host paths or `generatedAt` in a member.
10. Unknown values are omitted, never `null` or `""`. Arrays and maps are always present.
11. Each contract has one example, `examples/<RootModel>.example.json`, derived from a real output on a named committed fixture. It must validate.
12. Each contract file has one field map, `field-maps/<stem>.md` (the file name without its version), in the template of §15.
13. Run `check-contract.mjs` on your file, your example and real outputs before handing over. Add `--compare-typespec` (§1) once.

## 1. Toolchain

- TypeSpec **1.16.0** and `@typespec/json-schema` 1.16.0 are what `node_modules/` holds here (`package.json` pins them). The tools are ajv 8.20.0 (draft 2020-12, `ajv/dist/2020.js`, strict mode) and ajv-formats 3.0.1, on Node 24.22.0.
- **The fork pins TypeSpec 1.14.0** (fork: `package.json:16-17`). F1/F3 must reconcile the two pins when these files move into `native/`, so contracts use no TypeSpec feature newer than 1.14. In practice:
  - use only decorators from `TypeSpec` and `TypeSpec.JsonSchema` that 1.14.0 has;
  - keep to the constructs the rules below allow.

  To prove it, run `check-contract.mjs <file> --compare-typespec <fork>/node_modules`. It compiles the file with the fork's 1.14.0 as well and requires byte-identical schemas. The fork checkout `.worktrees/materializer/kicad_monkey/node_modules` holds 1.14.0. Both scripts also run unchanged under 1.14.0 (tested).
- `tspconfig.yaml` mirrors the fork's: the `@typespec/json-schema` emitter, `file-type: json`, `seal-object-schemas: true` and `warn-as-error: true`. The output goes to `generated/schema/`.
- The emitter writes one file per `@jsonSchema` model, named `<Model>.json`. Every other type a root reaches is copied into that file's `$defs` under its simple name. Two consequences follow:
  - **Only root models carry `@jsonSchema`.** Never put it on a namespace, which would emit every type as a root.
  - **Within the types one root reaches, names are unique.** The emitter silently merges two different types that share a name into one `$defs` entry. The lint rejects that (`defs-collision`).
- A root may embed another root, for example the manifest embedding the effective configuration. The embedded root is then referenced by its `$id`, not copied. Readers must register every schema of `generated/schema/` before they validate, as both scripts do.
- No `npm install`, no network. `node_modules` is a symlink and is never deleted.
- **Where these files go after WP-F1** (maintainer decision). Everything that changes with a contract lives beside it in `native/`:

  | Staging (`docs/architecture/design-bundle-contracts/`) | After F1 |
  |---|---|
  | `tsp/prism/` | `native/src/tsp/prism/` |
  | `generated/schema/` | `native/contracts/generated/schema/`, shared with the fork's schemas. Prism's build deletes only files whose `$id` starts with `urn:prism:schema:`. |
  | `examples/`, `field-maps/`, `conventions.md`, `README.md`, `decisions.md`, `cli-spec.md`, `revision-key.md`, `revision-key-vectors.json`, `bundle-format.md`, `ownership.*` | `native/contracts/prism/` |
  | `scripts/` | `native/scripts/contracts/` (F3 gives them a path configuration for the split layout) |

## 2. Files, namespaces and names

| Thing | Rule | Example |
|---|---|---|
| Contract file | `tsp/prism/<stem>-<version>.tsp`. The stem is kebab-case. | `stackup-a0.tsp`, `bundle-manifest-a2.tsp`, `system-interface-v1.tsp` |
| Namespace | `Prism.Contracts.<Pascal(stem)><VERSION>`, one per file | `Prism.Contracts.StackupA0` |
| Shared types | `common.tsp`, namespace `Prism.Contracts.Common` | `Prism.Contracts.Common.Nanometres` |
| Entry point | `main.tsp` imports `@typespec/json-schema`, `./common.tsp` and every contract file, in alphabetical order. It declares nothing. | — |
| Root model | `<Pascal(name)><VERSION>`, unique across all files | `StackupA0`, `BundleManifestA3`, `SemanticIndexA2`, `SystemInterfaceV1` |
| Other types | Any PascalCase name. A prefix with the contract name is recommended (`StackupLayer`, not `Layer`) because the generated Rust and Python types are named after it. | `BundleManifestMember` |
| Generated schema | `generated/schema/<RootModel>.json` | `generated/schema/StackupA0.json` |
| Example | `examples/<RootModel>.example.json` | `examples/StackupA0.example.json` |
| Field map | `field-maps/<stem>.md`, one per contract file, covering every root in it | `field-maps/stackup.md`, `field-maps/bundle-manifest.md`, `field-maps/semantic-index.md` |

- `Pascal()` splits on `.`, `_` and `-`, then capitalises each part: `semantic_index` → `SemanticIndex`, `bundle.manifest` → `BundleManifest`.
- A file may hold several roots, for example the CLI spec's documents. Each root's schema name in kebab-case must then equal the stem or start with `<stem>-`. For instance, `prism.kicad_cli.version.a0` lives in `kicad-cli-a0.tsp`.
- Root names must not collide with the fork's generated schemas, which share `contracts/generated/schema/` after F1 (fork: `contracts/generated/schema/*.json`, e.g. `SourceBundleManifest.json`, `NativeHandshakeA1.json`). The version suffix normally avoids that, but check.

## 3. Ids and versions

- **Schema id:** `prism.<name>.<version>`, for example `prism.stackup.a0` or `prism.bundle.manifest.a3`. `<name>` is lowercase words joined by `_`, with `.` for hierarchy. `<version>` is `a<N>` while pre-stable and `v<N>` once stable. Common's `SchemaId` scalar also admits the fork's ids (`kicad_monkey.design.a0`), because the manifest lists them.
- **JSON Schema `$id`:** `urn:prism:schema:prism.<name>:<version>`, for example `urn:prism:schema:prism.bundle.manifest:a2`. This mirrors the fork's `urn:wavenumber:schema:kicad_monkey.<name>:<version>` (fork: `src/tsp/kicad_monkey/source-bundle-a0.tsp:34`).
- **Freezing:** a contract is frozen when the maintainer accepts W0. From then on, any change bumps `<N>` and needs an ADR amendment. That includes a new optional field, a new enum member and a changed doc that changes meaning. The old version's file stays as long as stored bundles can hold it.
- **Exceptions to the a-numbering:**
  - `prism.system_interface.v1` keeps its existing id (`backend/app/services/systems/interface_extractor.py:37`). The contract is the payload of `EXTRACTOR_VERSION` 8 (`interface_extractor.py:38`).
  - The semantic index moves from today's `prism.semantic_index_a0` (`backend/app/services/semantic_index_service.py:30`, with an underscore) to `prism.semantic_index.a1`, as ADR §6 names it.
- **New documents start at `a0`** unless the ADR already names their version: the manifest is `a2` because sim's `a1` exists (sim: `contracts/contracts/bundle.tsp:128-129`), and the revision key is `prism.revision_key.a1` (ADR §5).

## 4. Document envelope

**New documents** (manifest a2, every new projection, the CLI's JSON outputs, the revision-key and effective-config documents):

1. The first property is `schema`, a string-literal const equal to the document's schema id: `schema: "prism.stackup.a0";`. It is the only envelope field. There is no separate `version` or `type` field, because the id carries both.
   - Precedent: Prism's own documents already carry the full id in a single `schema` field (`semantic_index_service.py:1146`, `interface_extractor.py:453`, `backend/app/release_studio/projections.py:222`). Readers switch on it (`backend/app/release_studio/semantic.py:26`, `backend/app/services/design_compare_service.py:250`).
   - The fork's triple `schema`/`type`/`version` (fork: `src/tsp/kicad_monkey/materialization-a0.tsp:634-636`) and a1's split `schema: "prism.bundle.manifest"` + `version: "a1"` are redundant forms of the same information.
2. **Projections carry no provenance.** That means no revision key, generator, commit, project id, or version of the KiCad that built the bundle. `bundle.json` records those once for every member. Facts parsed from the sources are not provenance, so the files' own format and generator versions may appear in `project`. A projection is then a pure function of the parsed sources and the generator, its bytes are reproducible, and a member whose inputs did not change keeps its sha256 across revisions.
3. No `generatedAt`, no `created_at`, no wall-clock time of any kind, no host path, no user name, no machine name (§8).

**Parity documents** (`prism.semantic_index.a1`, `prism.system_interface.v1`) keep today's envelope field for field, except for these documented changes:

- `generatedAt` (`semantic_index_service.py:1156`) is not a member field. A reader that must still serve it adds it outside the member.
- The semantic index's `schema` value becomes `prism.semantic_index.a1`.
- The envelope values that today come from outside the parsed sources are listed in the contract's field map, with the value the bundle writes and whether parity ignores them. These are `sourceRevisionKey`, `commit` and `generator` in the semantic index (`semantic_index_service.py:1147-1155`), and `projectId`, `commit` and `extractor` in the system interface (`interface_extractor.py:454-456`).

**Manifest a1 → a2** (for B's mapping document). a1's `schema: "prism.bundle.manifest"` + `version: "a1"` becomes `schema: "prism.bundle.manifest.a2"`, and a1's optional `created_at` (sim: `contracts/contracts/bundle.tsp:134`) has no successor.

## 5. Field naming

| Family | Case | Documents | Lineage |
|---|---|---|---|
| Bundle machinery | `snake_case` | manifest a2, CLI JSON outputs (`version`, `bundle verify` reports, stderr diagnostics), revision-key and effective-config documents | fork and sim contracts (fork: `materialization-a0.tsp:613-627`; sim: `contracts/contracts/bundle.tsp`) |
| Projections | `camelCase` | board-objects, occurrences, stackup, route-metrics, placements, project | Prism UI and Python documents (`semantic_index_service.py:1145-1162`, `interface_extractor.py:452-465`) |
| Parity | today's names exactly | semantic-index a1, system-interface v1 | — |

- A field name is ASCII and matches `^[a-z][a-z0-9]*(_[a-z0-9]+)+$` (snake) or `^[a-z][a-zA-Z0-9]*$` (camel). A file uses one family. Single-word names fit both.
- Acronyms are words: `kiidPath`, `libId`, `netName`, `uuid`; not `KIIDPath`.
- **Enum values:**
  - a value that mirrors a KiCad file token keeps KiCad's spelling exactly, for example pad type `np_thru_hole` or a stackup layer type as KiCad writes it;
  - a Prism-defined value is lowercase kebab-case, for example `source-board` or `passed-with-warnings` (a1 lineage: sim `contracts/contracts/bundle.tsp:9-26`, sim `src/prism-bundle/src/crosscheck.rs:79-88`);
  - diagnostic codes are kebab-case (`DiagnosticCode`).
- Map keys (`Record<T>`) are data, not field names, and keep their source spelling, for example a KiCad property name `Manufacturer_PN`.
- **Parity documents are exempt** from the naming, enum-spelling, side, frame and empty-string rules wherever today's output differs. For example, the system interface keeps snake_case enum values (`unannotated_connector`, `edge_cuts`), `top`/`bottom` sides, its y-up frame, rotations rounded to 1e-4 and `""` for unknown values. Each exemption is stated on its field (maintainer decision).

## 6. Units

New projections and bundle machinery:

| Quantity | JSON | TypeSpec type | Name suffix | Notes |
|---|---|---|---|---|
| Length, coordinate | integer nanometres | `Nanometres`, `NonNegativeNanometres` | `Nm` / `_nm` | KiCad's internal board unit. Exact, so Python goldens and Rust agree with no float formatting. |
| Angle | number, degrees | `Degrees` | `Deg` / `_deg` | as written in the file: not normalized to [0, 360), not rounded |
| Ratio (εr, tan δ) | number as written | `float64` | none (`epsilonR`, `lossTangent`) | unitless |
| Area, if one is ever needed | number, mm² | `float64` | `Mm2` / `_mm2` | never nm², which overflows 2^53 for a 95 mm square |
| Count | integer | `Count` | none | ≥ 0 |
| Size in bytes | integer | `ByteCount` | `Bytes` / `_bytes`, or `bytes` alone | ≥ 0 |
| Duration (CLI limits) | integer milliseconds | `safeint` | `Ms` / `_ms` | |

**Millimetres to nanometres.** `nm = round_half_away_from_zero(double(value_mm) × 1e6)`, computed on the IEEE double product. This is KiCad's board parser (`KiROUND(parseDouble() * IU_PER_MM)`) and the fork's converter (fork: `src/rs/kicad-monkey-core/src/board_materialization/geometry.rs:9-19`, `(value_mm * 1e6).round()`).

- Schematic coordinates use the same formula. KiCad's schematic editor itself works in 100 nm units, so a schematic value with sub-100 nm digits keeps them here.
- **Python goldens must not use `round()`,** which rounds half to even. Use `int(decimal.Decimal(value_mm * 1e6).quantize(decimal.Decimal(1), rounding=decimal.ROUND_HALF_UP))`. `Decimal(float)` is exact, and `ROUND_HALF_UP` rounds ties away from zero.

**Range.** One coordinate or dimension fits KiCad's 32-bit range (±2.147 m). A sum, such as a net's total track length, may not, so `Nanometres` is a safe integer: JSON loses precision beyond 2^53 in JavaScript readers. Do not use `int64`, which the emitter writes as a JSON *string*, as the fork's `source_bytes: uint64` shows (fork: `materialization-a0.tsp:597`).

**Floats.**
- A producer never writes NaN or ±Infinity.
- It writes negative zero as `0`, as `interface_extractor.py:168-170` already does for its rounded values.

**Parity documents keep today's units and rounding.** Examples:
- the system interface's `boardThicknessMm` is a float rounded by Python's `round(v, 4) + 0.0` (`interface_extractor.py:168-170`, `:458`);
- Release Studio's stackup is in `"units": "mm"` (`backend/app/release_studio/projections.py:225`).

A Rust producer of a parity document reproduces that rounding exactly. Python's `round(v, 4)` is correctly rounded from the exact binary value, with ties to even.

## 7. Coordinates, sides and layers

- **Frame:** KiCad's board frame exactly as in the file: +x right, **+y down**, never flipped, origin where KiCad puts it (the page origin, not the aux or grid origin). This is the fork's `MaterializationCoordinateSystem` (fork: `materialization-a0.tsp:602-606`).
  - Today's system interface geometry is y-up (`interface_extractor.py:217-224`). It is a parity document, so it keeps that frame; new projections do not.
- **Every position field says in its doc whether it is board-absolute or footprint-local.** A footprint-local position is what the file holds: relative to the footprint anchor, before the footprint's rotation. KiCad writes a back-side footprint's children already mirrored, so the flip is applied (verified on cynthion: SOT-363 pin 1 at y = +0.65 on B.Cu against −0.65 in the library).
  - KiCad's file stores pad positions footprint-local but pad angles including the footprint's rotation. Fields that copy such values say so.
- **Points** are the common `PointNm { xNm, yNm }` in camelCase documents. Bundle machinery has no points.
- **Side** is the common `Side` enum, `front` or `back`, never `top`/`bottom` or `F`/`B`.
- **Layers:**
  - `LayerName` is KiCad's canonical name from the board's `(layers …)` table (`F.Cu`, `In1.Cu`, `B.Mask`, `Edge.Cuts`, `User.1`).
  - A user-assigned name goes in a separate optional field, `userName` / `user_name`.
  - A wildcard set (`*.Cu`, `F&B.Cu`, `*.Mask`) is expanded to concrete canonical names wherever a field's type is `LayerName`. A contract that must keep KiCad's wildcard spelling declares its own documented type for it.

## 8. Identifiers and paths

| Concept | Common type | Form | Evidence |
|---|---|---|---|
| Object in a document | `ObjectRef` | `<RepoPath>#<KiCadUuid>`, split at the last `#` | the shape of today's Design Comparison identity `documentPath#uuid` (`backend/design-compare-parser/ecad-diff.mjs:94`), with a repository-relative path instead of today's project-relative one (see below) |
| KiCad UUID | `KiCadUuid` | lowercase 8-4-4-4-12 as written | all 26,652 `uuid`/`tstamp` values in the committed fixtures and USB-PD-Trigger-Board are canonical lowercase |
| Occurrence / instance path | `KiidPath` | `/<uuid>(/<uuid>)*`, no trailing `/` | see below |
| Net | `NetName` | KiCad full name (`/Power/VBUS`, `GND`, `Net-(R1-Pad2)`) | — |
| Reference designator | `Refdes` | string as resolved per instance | — |
| Pad / pin number | `PadNumber` | string as written; may be empty for an unnumbered pad | — |
| Library id | `LibId` | `<nickname>:<name>` as written | — |
| Path in a `.prism` archive | `ArchivePath` | relative, `/`-separated, no `.`/`..`/empty segment, no `\` or `:` | sim: `src/prism-bundle/src/zip.rs:103-117` (`check_member_name`) |
| Path in the repository | `RepoPath` | as `git ls-tree` prints it, same character rule | ADR §5 source set |

**KIID paths come in two forms.** Every `KiidPath` field states which form it holds.

- **Schematic form:** starts at the root sheet's UUID. A symbol's `(instances (project … (path "/<root>/<sheet>…")))` entry is the sheet path, and the occurrence is that path plus `/<symbol uuid>`.
  - Today's occurrence ids and System Builder `portKey`s use this form: `backend/app/services/semantic_index_variants.py:329`, `interface_extractor.py:122`.
  - Evidence: `USB-PD-Trigger-Board.kicad_sch:5` (root uuid `6c5f…`) and `:7005` (`(path "/6c5f…"`).
- **Board form:** omits the root sheet, as a footprint's `(path "/<sheet>…/<symbol uuid>")` does (`USB-PD-Trigger-Board.kicad_pcb:200`).
- Recommended field names: `kiidPath` / `sheetPath` for the schematic form, and `footprintPath` for the board form.

**Paths and project attribution** (maintainer decision; fixes issue #681):

- **`RepoPath` is the only path type in bundle documents.** Every file reference, `ObjectRef` included, is repository-relative, exactly as `git ls-tree` prints it. A file has one spelling whichever project refers to it, and a sheet outside the project directory needs no `..`. Today's project-relative `documentPath` (from the snapshot flattened to the project directory, `backend/app/services/design_compare_service.py:77-88`) is not kept. Design Comparison ids change once, and no compatibility is kept.
- **Files belong to a project only by explicit resolution, never by directory.** The project is its anchor, the repository-relative path of the resolved `.kicad_pro`. Its root schematic and board are the paths the effective configuration resolves (revision-key.md). The bundle records exactly which documents it parsed, and a consumer takes them from there. No producer or consumer picks "the `.kicad_pcb` in the directory". Two projects may share a directory.
- **A KiCad reference written relative to `${KIPRJMOD}`** (the anchor's directory) is resolved to a `RepoPath`. The field that copies the raw text keeps it alongside.
- **A project absent at a revision** (its anchor is not in the tree) is an explicit outcome, not a failure: it has no revision key and no bundle, so the CLI reports it (`project-absent`, exit 10, `CliProjectAbsentA0`) and a consumer shows "not present at this revision".

**One file format** (maintainer decision). Contracts describe only the current KiCad file format: the one the worker image's KiCad (`generator.kicad_version`) writes. A `.kicad_pcb` or `.kicad_sch` with an older `(version …)` is upgraded by KiCad before stage parse (bundle-format.md §2.2), so legacy tokens such as `(tstamp …)` and `(fp_text reference …)` never reach a producer, and no contract defines a fallback for them. A file newer than the worker's KiCad is `source-format-unsupported`.

**Other rules:**

- **Ids are copied, never generated.** A producer never emits a value outside its type's pattern, for example a legacy 8-hex `tstamp`, which KiCad 9/10 files do not contain. What it does instead is stated in the contract's field map, for example skipping the object and reporting a `Warning` in the manifest.
- **Refdes and pad numbers are always strings,** even `"1"`.
- **"No net" is an absent field,** never `""` (KiCad's net 0).
- **The path scalars use one regex.** It is free of lookaround, so ECMAScript (ajv), Python `re` and Rust `regex` read it the same way. It was checked exhaustively on 960,800 strings of up to 7 characters against prism-bundle's `check_member_name`, in all three engines. It is stricter than a1's pattern (sim: `contracts/contracts/bundle.tsp:29`) in one respect: a1 accepted a trailing `/`, which `check_member_name` rejects.

## 9. Ordering and determinism

**Every array's doc states its order.** The lint requires the word "order" or "sorted". Allowed orders, stated in these words:

- **"in file order"**: the order of the forms in the source file, for documents that mirror a file.
- **"sorted by `<field>`[, then `<field>`…]"**, with the comparison named for each string key:
  - **code point order**: compare strings by Unicode scalar values. That is Rust `str::cmp` and `BTreeMap<String, _>`, which compare UTF-8 bytes, and Python's `sorted()` on `str`. It is **not** JavaScript's default `sort()`, which compares UTF-16 code units; JS readers that re-sort use a code-point comparator.
  - **natural order**: today's `_natural` key (`backend/app/services/systems/interface_extractor.py:89-92`; the same in `backend/app/services/catalog/assembly_symbol.py:25`, `…/catalog/mates.py:120`, `…/systems/exports.py:90`, `…/systems/placement/frames.py:26`). Split `s` into `prefix`, which is `s` with its trailing ASCII digits removed, and `digits`, which are those trailing digits. The key is `(prefix, n, s)`, where `n` is the integer value of `digits`, or −1 when there are none. Compare `prefix` in code point order, then `n` numerically, then `s` in code point order. Rust compares `n` without overflow: first by the length of `digits` without leading zeros, then by that digit string. The result:
    - `R2 < R10 < RN1`;
    - `1 < 2 < 10 < A1`;
    - `"" < "1"`;
    - `R01 < R1`, because `n` ties and then `s` decides;
    - `U1 < U2 < U10 < U1A`, because `U1A` has prefix `U1A`.
  - **numeric order** for numbers.
- **"in stack order from front to back"**, or another domain order, defined in the doc.
- An array that is a set is still sorted, so its bytes are deterministic.
- Sorting is always total: the last key is unique (a uuid, an `ObjectRef`, or the whole value).

**Maps** are `Record<T>`, serialized with keys in code point order. The Rust type is `BTreeMap<String, T>`. The doc states what the keys are.

**Determinism** (ADR §7) applies to every member a Rust producer writes:

- the same inputs and the same generator give byte-identical members and a byte-identical archive;
- no wall-clock time, random ids, hash-map iteration order, absolute or host paths, user or machine names, or thread-count-dependent order;
- `generatedAt` is not a member field.

## 10. Optionality and null

**New documents:**

- **Unknown is absent.** A value the producer cannot determine is omitted (`field?: T`). It is never `null`, never `""`, never `0`.
- **Arrays and maps are always present**, empty when there are none. An absent array would be a second spelling of "none".
- **`null` is allowed only when a consumer must tell "known to have no value" from "unknown".** The field is then `field?: T | null`, and its doc says both: absent means unknown, `null` means known to have none. The lint requires every nullable field's doc to mention null. Each such field is listed in the field map.
- Booleans are required when the producer always knows them.

**Parity documents** reproduce today's null-versus-absent behaviour exactly, field by field. For example, Release Studio's stackup writes explicit `None`s (`backend/app/release_studio/projections.py:231-240`), and the system interface writes `boardThicknessMm: null` without a board (`interface_extractor.py:458`).

## 11. Sealing and open maps

- Every object schema is sealed (`seal-object-schemas: true` emits `unevaluatedProperties: {not: {}}`). A reader therefore rejects unknown fields, and an additive change is a version bump (§3).
- The only open structures are explicit `Record<T>` fields, each with a doc stating its keys and their order. Use one only when the keys are data, such as KiCad property names, net class names or text variables. Never use it as a bag of optional fields.

## 12. Types and constructs

| Use | For | Never |
|---|---|---|
| `string`, `boolean` | text, flags | `bytes` |
| `safeint`, `int32`, `uint32` (and narrower), Common's `Count`, `ByteCount`, `Nanometres` | integers | `int64`, `uint64`, `integer`, `numeric` (the emitter writes 64-bit as JSON strings or leaves them unbounded) |
| `float64`, Common's `Degrees` | measured values as written | `float32`, `float`, `decimal`, `decimal128` |
| `enum X { smd, npThruHole: "np_thru_hole" }` | closed string sets; the fork's codegen maps JSON Schema `enum` to Rust enums (fork: `src/tsp/kicad_monkey/sexpr-a0.tsp:7-11`) | a union of string literals (`"a" \| "b"`) |
| `@oneOf union X { a: A, b: B }`, each variant model's first property `kind: "<literal>"` | variant objects | an `anyOf` union of models; the fork's codegen has to promote those to `oneOf` by hand (fork: `src/rs/kicad-monkey-codegen/src/materialization_projection.rs:106-121`) |
| a named, documented `model` | every object | inline `{ … }` object types, intersections (`A & B`) |
| `T \| null` | only as §10 allows | `unknown`, `never`, `void` |
| `@pattern`, `@minLength`, `@minValue`, `@maxValue`, `@minItems` | real constraints | patterns with lookaround or backreferences |
| `utcDateTime` and all date/time types | — | always (§9) |

- Doc comments (`/** … */`) are the style. They become JSON Schema `description`s. `@doc("…")` is equivalent but not used.
- Enum member docs do not reach the JSON Schema (`enum` has no per-value description). The TypeSpec source and the field map are the documentation of record for them.

## 13. Serialization of Rust-written members

- Encoding:
  - UTF-8, no BOM;
  - `serde_json` compact (`to_writer`/`to_vec`, no added whitespace);
  - followed by exactly one LF (0x0A).
- Keys appear in the order the TypeSpec model declares them, which is serde's struct field order, with `schema` first. Map keys appear in code point order (`BTreeMap`). Optional absent fields are skipped (`skip_serializing_if = "Option::is_none"`), never written as `null` unless §10 allows it.
- This applies to `bundle.json` too. a1 wrote it pretty-printed (sim: `src/prism-bundle/src/build.rs:346`) and `design.json` compact (`:417`). a2 writes both compact.
- **Python readers must not depend on key order or whitespace.** They read with `json.loads` and validate against `generated/schema/` with every schema registered.
- JSON from Python today, such as goldens and the CLI stub in K's tests, is compared by value (§14), never by bytes.

## 14. Parity semantics (refines ADR §7; proposed as an ADR amendment)

- **Golden comparison is JSON value equality** after removing the contract's documented non-semantic fields:
  - objects compare as key sets with no order, and a key absent on one side differs from a key holding `null`;
  - arrays compare element by element, in order;
  - numbers compare as IEEE-754 doubles, so `1 == 1.0` and `1e-05 == 1e-5`;
  - strings compare by code points; booleans and `null` by identity.
- **Non-semantic fields** are listed in each field map's "Parity note" column and in `native/parity/divergences.md`. They include `generatedAt` where today's output has it, and envelope values that come from outside the sources (§4).
- **A divergence** is accepted only when `divergences.md` names the case, why the new output is right, and the affected consumer (ADR §7).
- **Determinism is byte identity**: two `prism-kicad` runs of the same build on the same inputs produce identical member bytes and archive bytes. Across CPU architectures (maintainer decision):
  - **every parse-stage JSON member** (`design.json`, `projections/*`, and `bundle.json` apart from its board-stage entries) is byte-identical on linux arm64, linux amd64 and macOS builds. Producers keep platform `libm` results (sin, cos, atan2 and the like) out of emitted values, or compute them deterministically. The determinism test runs on both linux architectures.
  - **Rotations and transcendental functions in parse-stage producers** follow KiCad where KiCad computes the value (integer-nm `RotatePoint`, exact at multiples of 90°, `EDA_ANGLE`'s exact sin/cos at multiples of 45°; see field-maps/placements.md R9). Any other `sin`, `cos`, `atan2` or similar goes through the pure-Rust `libm` crate, never the platform's, so results are the same bits everywhere. `sqrt` and the basic operations are correctly rounded IEEE-754 and need no rule.
  - **`materialization/board.kmpack`** keeps the fork's current behaviour: byte identity only for the same binary on the same architecture. Its float geometry is the fork's code and is not re-specified here.
- **Digests computed over today's JSON** must be reproduced byte-for-byte by the Rust producer of a parity document, for example the system interface's `digest` (`interface_extractor.py:41-61`). That `digest` is `sha256` over Python's `json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False)`, including Python's float `repr` (`1e-05`, not `1e-5`).

## 15. Field maps

One file per contract file: `field-maps/<stem>.md` (for `stackup-a0.tsp`, `field-maps/stackup.md`), with these sections in this order. A file with several roots repeats "Fields" per root.

````markdown
# Field map: <member path in the bundle> (`<schema id>`)

Root model `<RootModel>` in `tsp/prism/<file>.tsp`. Example `examples/<RootModel>.example.json`.
Written by: <WP and module>. Stage: parse | board | models.

## Fields

Pointers are RFC 6901 with two extensions: `*` is every element of an array,
`{key}` is every key of a map. One row per leaf and per array/map.

| Field (JSON pointer) | Type | Unit | Order / nullability | Today's source (path:line) | Consumers (path:line) | Parity note |
|---|---|---|---|---|---|---|
| `/schema` | const `"prism.stackup.a0"` | — | required | new | `backend/app/services/design_bundle/…` (K) | — |
| `/layers` | `StackupLayer[]` | — | required; in stack order from front to back | `backend/app/release_studio/projections.py:347` | `…` | same order as today |
| `/layers/*/thicknessNm` | `NonNegativeNanometres` | nm | optional; absent = not in the file | `projections.py:354` (mm float) | `…` | today mm; golden × 1e6, rounded half away from zero |

## How a golden is produced from today's code

The exact command or function call on dev (or the reference branch), the
fixture, and the transformation into this contract's shape. Anything that is
not a pure renaming or unit conversion belongs in "Expected divergences".

## Expected divergences

| Case | Today | Bundle | Why the bundle is right | Consumer affected |
|---|---|---|---|---|

## Example provenance

The fixture and command the example was derived from, and what was trimmed
to keep it small.
````

- "Today's source" cites the line that produces the value. "Consumers" cites the line that reads it, or names the WP for a consumer that does not exist yet (`C2`, `sim: …`).
- A field with no today's source and no named consumer does not belong in the contract.

## 16. Examples

- Exactly one per root, `examples/<RootModel>.example.json`, valid against `generated/schema/<RootModel>.json`. `build.mjs` checks the one-to-one mapping and validity.
- Derived from a real output on a named committed fixture where one exists:
  - `fixtures/release-studio/{usb-pd,synthetic,cynthion}`;
  - `backend/tests/fixtures/design_variants/*`;
  - `backend/tests/fixtures/system_builder/**`;
  - the user's USB-PD-Trigger-Board, which is read-only.
- Trimmed to stay small (aim under ~300 lines) while keeping one instance of every object kind and every optional field. The field map's "Example provenance" says what was trimmed.
- Canonical text: `JSON.stringify(doc, null, 2)` plus one trailing LF, keys in declared order. The scripts print a note when an example is not canonical.
- No comments: the schemas are sealed, so there is no `$comment` or `_note`. Provenance goes in the field map.

## 17. What the scripts check

`check-contract.mjs` runs on one file and `build.mjs` on all files. Both compile with emit into a temporary directory outside the repository and fail on any diagnostic, since warnings are errors. They then apply these rules:

| Rule | Checks |
|---|---|
| `file-name`, `imports`, `namespace`, `namespace-json-schema` | §2 |
| `root-envelope`, `root-version`, `root-name`, `root-id`, `root-title`, `root-file`, `root-kind`, `root-unique` | §2–§4 |
| `doc` | doc comments on every declaration (§0.3) |
| `naming`, `naming-family` | §5 |
| `units` | `Nanometres` ⇔ `Nm`/`_nm`, `Degrees` ⇔ `Deg`/`_deg` |
| `array-order`, `record-keys`, `nullable-doc` | §9, §10, §11 |
| `field-type`, `scalar`, `closed-set`, `discriminated-union`, `anonymous-model`, `no-operations` | §12 |
| `defs-collision` | two different types with one name inside one root (§1) |
| `main-imports`, `main-declares` (build only) | every file under `tsp/prism/` is reachable from `main.tsp` |
| ajv strict | every emitted schema compiles under ajv 2020-12 strict |

The scripts do not check:
- whether an array doc's order is the right one;
- whether a unit conversion is correct;
- whether a new document makes arrays required and avoids null (§10);
- whether a field is traceable.

Those are review items, backed by the field map.

## 18. Common types (`tsp/prism/common.tsp`)

| Type | JSON | Rule |
|---|---|---|
| `Sha256Hex` | string | `^[0-9a-f]{64}$` |
| `GitObjectId` | string | 40 or 64 lowercase hex |
| `SchemaId` | string | `<family>.<name>.<a\|v><N>` |
| `DiagnosticCode` | string | kebab-case |
| `ArchivePath`, `RepoPath` | string | §8 |
| `KiCadUuid`, `KiidPath`, `ObjectRef` | string | §8 |
| `LayerName`, `Refdes`, `NetName`, `LibId` | string | non-empty, §7–§8 |
| `PadNumber` | string | may be empty |
| `Nanometres`, `NonNegativeNanometres` | integer | §6 |
| `Degrees` | number | §6 |
| `Count`, `ByteCount` | integer | ≥ 0 |
| `Side` | `"front"` \| `"back"` | §7 |
| `PointNm` | `{xNm, yNm}` | camelCase documents only |
| `Warning` | `{code, message}` | a finding; the array holding it says warning or error |

To add to common, request it through the orchestrator (W0: `commonTypeRequests`). A type belongs here only when two or more contracts need it.
