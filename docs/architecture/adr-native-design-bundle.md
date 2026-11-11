# ADR: Prism-native KiCad parser and the design bundle

- **Status:** Accepted (2026-10-16); amended 2026-10-17 (C2, [`adr-native-design-bundle-amendment-c2.md`](adr-native-design-bundle-amendment-c2.md); C2r, [`adr-native-design-bundle-amendment-c2r.md`](adr-native-design-bundle-amendment-c2r.md); C3, [`adr-native-design-bundle-amendment-c3.md`](adr-native-design-bundle-amendment-c3.md); U, [`adr-native-design-bundle-amendment-u.md`](adr-native-design-bundle-amendment-u.md); K2, [`adr-native-design-bundle-amendment-k2.md`](adr-native-design-bundle-amendment-k2.md); PI (proposed 2026-11-11), [`adr-native-design-bundle-amendment-pi.md`](adr-native-design-bundle-amendment-pi.md))
- **Deciders:** Prism maintainers
- **Supersedes:** the per-feature KiCad loading described in `docs/plans/kicad-monkey-*.md`
- **Reference branch:** `feature/analytic-pack-spike` (analytic 3D tab, Simulation Studio, `board.prism` a1). It is reference only: code may be copied from it, it is never merged.
- **Integration branch:** `feature/native-design-bundle`, cut from `dev`. Every work package lands there as a stacked pull request (§9).

## 1. Context

Prism interprets the same KiCad project revision many times, with different code, under different keys:

| Consumer | How it reads a revision today | Key |
|---|---|---|
| 3D tab (mesh) | Python `topology_compiler`: `KiCadDesign`, `KiCadPcb` twice, two raw `parse_sexp` passes for stackup, `prism-kicad-native` (Rust, upstream kicad_monkey `bc6796c1`), `kicad-cli pcb export glb` twice | content `source_fingerprint` + build fingerprint |
| 3D tab (analytic, reference branch) | the above plus `prism-bundle` (Rust, fork `b6316117`): design JSON + materializer | same |
| Semantic index | Python `KiCadDesign` + netlist + full `KiCadPcb` (42 s, 2.6 GB on a 57 MB board), three more raw-text scans of the schematics | git blob ids |
| Design Comparison | the index again (schematic only), Node `ecad-diff` (second parser), regex stackup, `kicad-cli` Gerbers; the browser parses a fourth time | commit sha |
| Release Studio | `KiCadPcb` up to three times, `parse_sexp` for closure, the index again, many `kicad-cli` steps | closure digest (commit sha inside) |
| System Builder interface | its own `KiCadDesign` + netlist + board | commit sha + extractor version |
| System Builder 3D scene | the 3D tab's bundle (scene manifest, `components.glb`, mid-plane from stackup layers, `bundleToBoard`) | 3D bundle fingerprint |
| Simulation Studio (reference branch) | `board.prism` from `prism-bundle`; board facts from the semantic index | content fingerprint |
| Catalog / project component import | own s-expression scanners, the index, `pcbnew` for footprint flips | per import |
| Project metadata, variants API | `KiCadProject`, a header regex, `variant_source_scan` per request | per import / per request |

Consequences measured on a live instance:
- A large board's revision is loaded up to six times.
- The Python board model alone peaks at about 3 GB.
- Three different revision keys mean nothing can reuse another feature's work.
- The Python kicad_monkey 2026.9.7 and the Rust core `bc6796c1`/`b6316117` are different engine revisions interpreting the same files.

## 2. Decision

1. **Prism owns a native KiCad parser.** The Rust part of `krishna-swaroop/kicad_monkey` (the fork Prism already pins, `b6316117`) is imported into this repository with its history. That covers all of its crates and the structure they are built, tested and released with. It is maintained here, with no further dependency on upstream releases.
2. **Fork, don't rewrite. Import verbatim first.** The import commit is a pure copy, so it can be diffed against the fork. Renaming, Prism CI wiring and new crates follow in separate commits. The connectivity, net-naming, hierarchy, variant and format semantics are kept as they are. The MIT notice (Copyright (c) 2026 Wavenumber LLC) is preserved.
3. **Nothing is trimmed.** Crates and modules the first milestone does not use stay. Each has a foreseeable Prism use (§4.2), and re-porting later from a diverged fork is the expensive direction. Build size is controlled with Cargo features instead.
4. **One design bundle per revision.** A single Rust CLI, `prism-kicad`, parses a revision once and writes `board.prism`. The bundle holds the sources, the materialization, `design.json` and every projection Prism needs.
5. **Every consumer reads bundle members.** No Prism feature opens a `.kicad_sch`, `.kicad_pcb` or `.kicad_pro` itself. The only exceptions are listed in §2.1.
6. **CLI and files, not in-process bindings.** Python reads JSON and pack members. The same CLI later backs an MCP server.
7. **One revision key.** Every per-revision artifact is keyed by the design revision key (§5).
8. **Prism owns the bundle crates.** prism-sim-studio depends on Prism's bundle reader, not the reverse. `prism-bundle` moves out of prism-sim-studio.
9. **Python kicad_monkey is removed** once every consumer has migrated.

### 2.1 What stays outside the parser

- **Real KiCad outputs**, which are deliverables or KiCad's own verdicts:
  - Gerbers and drill files;
  - DRC and ERC;
  - position files, BOM CSV, PDF/SVG plots and renders, thumbnails;
  - board stats;
  - STEP and GLB model exports;
  - the zone refill (`pcbnew` ZONE_FILLER) and the footprint flip (`pcbnew`).

  They run KiCad on sources taken from the bundle, keyed by the bundle key plus the KiCad version. Gerbers and drill files stay outside the bundle (decided, §10).
- **The browser viewers.** The Schematic and PCB tabs and the Design Comparison overlay keep parsing raw files in ecad-viewer, served from the bundle's `sources/`. The imported `wasm` crate makes a later move to one parser in the browser possible (separate ADR).
- **Library files** (`.kicad_sym`, `.kicad_mod` in the catalog). These are not project revisions. They stay with `kicad_library_reader` until a later ADR; the imported `symbol_library` module is the starting point.
- ~~**kicad-cruncher as a tool.**~~ Superseded by amendment C3 ([`adr-native-design-bundle-amendment-c3.md`](adr-native-design-bundle-amendment-c3.md)): Release Studio no longer calls Cruncher. Its assembly views, vendor BOM/PnP files and sheet text come from `prism-kicad` (`artwork`, `vendor`, `stroke-text`, `drawing-sheet`) and the bundle member `models/assembly-hlr.json`. The imported Rust Cruncher CLI is harvested for that work and then removed (R2).

## 3. Consequences

- One parse per revision, in a worker, never in the API process.
- Peak memory and time are bounded by Rust, not Python object graphs.
- Prism carries the fork's Rust: about 190k lines across 8 crates, including tests and generated contracts. Prism also owns KiCad format changes from KiCad 11 onwards.
- Every projection needs a schema, a Rust producer, a Python reader and a parity test against today's output.
- Migration is per consumer, behind a flag, so dev stays shippable throughout.
- The worker image and CI gain a Rust build of the workspace. It is cached (§11, G10).

## 4. Architecture

### 4.1 Repository layout

The fork's layout is kept under `native/`, so the import is a plain prefix and later comparisons with the fork stay readable:

```text
native/                                    the fork's root, imported with history (WP-F1)
  Cargo.toml, Cargo.lock, rust-toolchain.toml (1.98.0), clippy.toml,
  rust-hygiene.toml, rust-hygiene-baseline.json
  src/rs/
    kicad-monkey-core/                     parser, model, plot IR, design JSON, materializer
    kicad-monkey-contracts/                generated + hand-written contracts and validators
    kicad-monkey-materialization-pack/     board.kmpack
    kicad-monkey-svg/                      SVG serializer for the plot IR
    kicad-monkey-wasm/                     browser adapters (incl. materialization lowering)
    kicad-monkey-native/                   one-request-per-process transport
    kicad-monkey-codegen/                  JSON Schema -> Rust contracts
    prism-projections/                     NEW: Prism projections over the core model (§6)
    prism-bundle/                          MOVED from prism-sim-studio: manifest a2, build, read, verify
    prism-kicad-cli/                       NEW: binary `prism-kicad`
  packages/kicad_cruncher/src/rs/kicad-cruncher-cli/
  src/tsp/, tspconfig.yaml, package.json   TypeSpec contract sources and toolchain
  src/tsp/prism/                           NEW: TypeSpec for the bundle manifest and every projection
  contracts/generated/schema/              JSON Schema compiled from TypeSpec (committed)
  tests/parity/ and the Rust-referenced fixtures (licence-cleared, §4.2)
  scripts/ (the Rust, contract and release scripts)
  parity/                                  NEW: Prism parity runner, golden-diff rules, divergences.md
  contracts/prism/                         NEW: W0's examples, field maps, conventions and specs (beside the TypeSpec)
  scripts/contracts/                       NEW: W0's contract check and build scripts
  LICENSE (MIT, Wavenumber LLC)            kept as imported (the fork has no NOTICE); the new root NOTICE points to it
kicad-prism-viewer/native/                 prism-kicad-native and prism-clipper2 join the workspace in WP-R3
backend/app/services/design_bundle/        the only Python package that knows the bundle format
```

- **Crate names:** they keep their `kicad-monkey-*` names in the import commit. WP-F2 renames them to `prism-kicad-*` (core, contracts, pack, svg, wasm, native, codegen) in one mechanical commit.
- **Reader feature:** `prism-bundle` has a `reader` feature with no dependency on the parser. prism-sim-studio pins Prism at a commit and depends on `prism-bundle` (reader) and the pack crate.

### 4.2 Import scope

The import takes everything Rust in the fork at `b6316117`. That is upstream `bc6796c1` plus 30 commits adding the analytic materializer:

| Part | Size | First use | Foreseeable use |
|---|---|---|---|
| core | 85k src + 33k tests | parsing, design JSON, materializer; Prism projections | — |
| contracts (generated + validators) | 41k + 4k tests | materialization, source bundle, compiled schematic graph | new bundle and projection schemas through the same TypeSpec → JSON Schema → codegen pipeline |
| materialization pack | 2.2k | `board.kmpack` | — |
| svg | 10k | — | catalog previews, Release Studio artwork and thumbnails without `kicad-cli` |
| wasm | 5k | — | one parser in the browser (Schematic/PCB tabs, comparison overlay, analytic lowering client-side) |
| native | 2.3k | — | superseded by `prism-kicad`; kept so the workspace builds and tests as imported |
| codegen | 1.8k | regenerating contracts when a schema changes | — |
| kicad-cruncher-cli | — | harvested into `prism-artwork` and `prism-vendors` (amendment C3), then removed in R2 | assembly views, BOM/PnP owned in Rust |
| core modules unused at first: plot contracts, `pcb_authoring`, `symbol_library`, `sexpr_mutation`, `schematic_embedded` | ~11k | — | writing KiCad files (Release Studio staged boards, catalog placement rewrites, maybe the footprint flip), catalog libraries, KiCad 9/10 embedded files |

- **Build size:** the worker's `prism-kicad` binary enables only the features it needs. The other crates build and test in CI.
- **Not imported:**
  - the Python provider (`kicad_monkey` Python, `hatch_build.py`, `pyproject.toml`, `uv.lock`) and the Python test suite (`tests/L0..L99`). Prism keeps the PyPI 2026.9.7 package for the catalog's library-file imports, the WP-R2 allow-list.
  - `node_modules/` and `target/`.
- **Licence gates** (WP-F0, before the import lands):
  - `src/rs/kicad-monkey-core/src/fake_style.rs` states it is an exact port of FreeType's fake-bold/italic pass. Establish its provenance and either keep it with the right notice or replace it.
  - GPL-2.0 KiCad QA netlist fixtures and third-party library and real-world project files under the fork's tests are excluded from the import *and from its history* (§4.3).
  - The CC0 newstroke tables and fonts (`assets/fonts`, 22 MB) are imported with their notice.
- **Infrastructure the fork depends on that Prism cannot** (WP-F3):
  - The Rust hygiene ratchet runs through Wavenumber's `wn-dev-std`/Rack. Prism runs the same `rust-hygiene.toml` limits with its own checker, or `clippy` lints plus the existing module-size gate.
  - The large test corpus is a 266 MB archive on `artifacts.wavenumber.net`. Replaced by Prism's parity corpus (§7).
  - The `kicad-cli` oracle builds are Windows recorder builds from Wavenumber's cache. Replaced by the `kicad-cli` in Prism's worker image.
  - Releases publish Python wheels to PyPI. Re-targeted to `prism-kicad` binaries (linux arm64/amd64, macOS for development) and the wasm package as GitHub release artifacts, and into the worker image.
  - `wn-geometer` and the Geometer C SDK stay pinned external dependencies (§10).

### 4.3 Import mechanics (WP-F1)

1. Clone the fork at `b6316117` and run `git filter-repo` with an allow-list of the paths in §4.1. Strip the excluded fixtures from *all* history, so no GPL file ever enters Prism's history.
2. In the integration branch: `git subtree add --prefix=native <filtered-repo> <branch>`. This is one merge commit that brings the filtered history and is otherwise a pure copy.
3. Verify the import:
   - `cargo test --workspace` passes at `native/` as imported, on Rust 1.98.0;
   - `prism-bundle` from prism-sim-studio, pointed at `native/` by a path dependency, produces byte-identical `design.json` and `board.kmpack` to the `b6316117` git dependency on the fixtures and the corpus.
4. Later fixes from upstream can still be compared or cherry-picked, because the history is shared. Prism does not track upstream.

### 4.4 Data flow and staged readiness

```text
import / sync / on-demand commit
        │  revision key (git ls-tree, no checkout)                    §5
        ▼
design_bundle job (prism-worker)                                      one per bundle key
  stage parse   1. materialize sources (git cat-file, LFS, gitlinks)
                2. prism-kicad bundle build --stage parse             ONE parse: design.json, projections/*
                   -> bundle readable; consumers that need only projections proceed
  stage board   3. zone refill            pcbnew ZONE_FILLER          KiCad
                4. prism-kicad bundle build --stage board             materialization/board.kmpack
  stage models  5. kicad-cli pcb export glb --no-board-body           viewer/models/components.glb
                   (cached by board + model blobs + KiCad version)
  store         6. .kicad-prism/bundles/<project_id>/<revision_key>/<generator_digest>.prism (§5), unpack on first use
        ▼
consumers read members through backend/app/services/design_bundle,
declaring which members they need; they wait only for those
```

- **Staging:** `bundle.json` records each stage's status. Stage `parse` takes seconds on a large board. The Python index took 60 s, and Design Comparison and System Builder need nothing more than this stage. Stage `board` (refill + materialize) and stage `models` add 1–2 minutes and are needed only by the 3D tab, System Builder 3D and Simulation Studio.
- **Archive updates:** the bundle archive is rewritten atomically at the end of each stage.
- **Concurrency:** builds run under a `design_bundle` resource slot (memory-bounded) with dedup on the bundle key.

## 5. Revision key and storage

- **Design revision key** (`prism.revision_key.a1`): sha256 over
  - the literal `prism.revision_key.a1\0`;
  - the *effective* project configuration: the resolved project-file path and the path overrides (§11, G6). A settings change stored in Prism's database changes the key, just as a commit does.
  - every `(path, git blob id)` in the source set, sorted.

  The source set is repository-wide, by kind (`native/contracts/prism/revision-key.md` §5): `.kicad_pro`, `.kicad_sch`, `.kicad_pcb`, `.kicad_dru`, `.kicad_wks`, `.kicad_jobset`, `fp-lib-table`, `sym-lib-table`, `.prism.json`, the project libraries (`.kicad_sym`, `.kicad_mod`, `.lib`, `.dcm`), every 3D model file in the repository, and every symlink and gitlink. Output directories and KiCad autosaves are excluded. A change to any project's files therefore changes the key of every project in the same repository; narrowing this is a later optimisation. The project is selected by its anchor, exactly the stored project file, never by directory; an anchor missing from the tree means the project is absent at that revision. A bundle's `sources/` holds only the closure the build read, each member cross-referenced to its key entry.

  A commit's key comes from `git ls-tree` alone. A working tree's comes from git's blob hashing of the files on disk. The same content gives the same key either way. Gitlinks (submodules) contribute their commit id. LFS files contribute their pointer's blob id, which changes with the content.
- **Generator id:** `prism-kicad version` JSON. It holds:
  - the crate version, manifest version and projection schema versions;
  - the KiCad version used for the KiCad-produced members, which also pins KiCad's stock 3D model library;
  - the pinned procedures for those members (`refill_procedure`, `models_procedure`, and `upgrade_procedure` for sources older than the KiCad's file format, which KiCad upgrades before parse) and the materialization pack format version.

  Its canonical bytes and the bundle-key framing are in `native/contracts/prism/cli-spec.md` §5.1.

  It is bumped explicitly, never derived from binary or source bytes.
- **Bundle key:** sha256(revision key, generator id).
- **Storage:**
  - `.kicad-prism/bundles/<project_id>/<revision_key>/<generator>.prism`;
  - an unpacked cache beside it, which can always be deleted;
  - the previous generators of a revision are removed when a new one is stored.
- **Commit index:** `(project, commit sha, effective-config digest) → revision key`, cached.
- **Retention:**
  - bundles of branch heads, pinned System Builder commits, released Release Studio candidates and kept Simulation Studio runs stay;
  - others go after `PRISM_DESIGN_BUNDLE_RETENTION_DAYS` unused (§11, G2).

## 6. Bundle members (`prism.bundle.manifest` a2)

Each member has a role, a schema id, sha256, size and the stage that wrote it in the manifest. Projections carry no provenance (no revision key, generator, commit or project id): `bundle.json` records it once, so a projection whose inputs did not change keeps its bytes across revisions. No member carries a wall-clock time. Schema ids are `prism.<name>.<version>`, with JSON Schema `$id` `urn:prism:schema:prism.<name>:<version>` (the semantic index moves from today's `prism.semantic_index_a0` to `prism.semantic_index.a1`; `prism.system_interface.v1` keeps its id). Every path in a bundle document is repository-relative, and files belong to a project only through its anchor and effective configuration, never by directory, so projects that share a directory are distinct (issue #681). A project absent at a revision is an explicit outcome, not a failure. Conventions: `native/contracts/prism/conventions.md`. Projections are written by `prism-projections` from the single parsed model. Their schemas are TypeSpec in `native/src/tsp/prism/`, compiled to JSON Schema in `native/contracts/generated/schema/` and to Rust through `codegen`. Python validates members against the same JSON Schema.

| Member | Stage | Schema | Contents | Consumers |
|---|---|---|---|---|
| `bundle.json` | all | `prism.bundle.manifest.a2` | members, stages, revision key, generator id, effective config, fill provenance, cross-check, warnings. Each stage records its status, error, skip reason and failed members: a content failure of a stage (`failed`) or of a member (`partial`) is recorded in the bundle, while limits and timeouts never are (cli-spec.md §5.2.7) | all |
| `sources/**` | parse | — | the source set as committed (LFS hydrated) | browser viewers, KiCad-output jobs |
| `design.json` | parse | `kicad_monkey.design.a0` | design model | Simulation Studio engines, projections |
| `projections/semantic-index.json` | parse | `prism.semantic_index.a1` | components, nets, terminals, sheets, buses, 12 indexes, assembly (variants). Adds: `pinName`, `pinType`, `libraryRef`, and per terminal both `netName` (pad-resolved) and `schematicNetName` | identity endpoint, inspector, search, BOM table, variants UI and API, component import, Release Studio, Simulation Studio board facts |
| `projections/board-objects.json` | parse | `prism.board_objects.a0` | per object (`documentPath#uuid`): kind, parent, at, rotation, mirror, layers, net, refdes, lib id, flags, kiid paths, instances, properties, review fields; `.kicad_pro`/`.kicad_dru` settings objects | Design Comparison deltas, focus and navigation |
| `projections/occurrences.json` | parse | `prism.occurrences.a0` | symbol instances with path, reference and properties; footprints by refdes; sheet-level dnp/in-BOM folded along the path; canonical BOM fields | Design Comparison BOM rows, Release Studio, System Builder, catalog usage |
| `projections/stackup.json` | parse | `prism.stackup.a0` | layers (name, type, material, thickness, εr, tan δ, colour, kind), settings (finish, constraints, edge connector/plating), board thickness, via types and spans; mask colours | Design Comparison stackup tab, Release Studio tables, 3D tab looks, System Builder mid-plane, Simulation Studio |
| `projections/route-metrics.json` | parse | `prism.route_metrics.a0` | per net: length, via count, layers used, via spans | Design Comparison |
| `projections/placements.json` | parse | `prism.placements.a1` | per footprint: reference, side, xy/rot, dnp, excluded-from-pos, testpoint, courtyard, pads, first model, library link; board outline; designators | Release Studio sheets, System Builder interface and 3D scene, catalog import |
| `projections/project.json` | parse | `prism.project.a0` | title block, KiCad version, text variables, net classes, sheet hierarchy, model/worksheet/library-table path references | project metadata, Release Studio input closure, 3D board metadata |
| `projections/system-interface.json` | parse | `prism.system_interface.v1` (existing) | connectors and modules with schematic-only pin nets, pin names/types, power nets, pcb nets, geometry | System Builder |
| `refilled/<stem>.kicad_pcb` | board | — | board after the zone refill | materializer, KiCad-output jobs |
| `materialization/board.kmpack` | board | `kicad_monkey.materialization.a1` (readers also accept a0; amendment PI) | analytic board, plus design facts that are not material in its header (zone, pad and board rules, rule areas, courtyards) | 3D tab, System Builder 3D, Simulation Studio |
| `viewer/models/components.glb` | models | — | component bodies from `kicad-cli` | 3D tab, System Builder 3D and collision meshes |
| `models/assembly-hlr.json` | models | `prism.assembly_hlr.a0` | per footprint, the hidden-line outline and detail edges of its first STEP model in board coordinates, or why there are none (amendment C3) | Release Studio assembly and testpoint artwork |

The Python topology compiler's viewer assets are not bundle members. The mesh
3D tab and its `semantic-visualizer/` store were removed with System Builder
v2's stage 0, and WP-R4 deletes the remaining directory at startup.

## 7. Parity and correctness

- **Goldens:** for each projection, today's output is captured by today's code (WP-G) on:
  - the corpus: the projects on the developer instance (EDA-04903 and 7 others), System Builder's fixture systems, and Release Studio's fixtures;
  - the committed demo fixtures;
  - public KiCad projects whose licences allow it. The kicad_cruncher test projects' licences are checked in F0 before use.
- **Comparison rules** (superseded for new and unmerged work by amendment U §3.1: parity means what the user sees; byte stability only where a machine reads the output):
  - JSON value equality after removing each contract's documented non-semantic fields: objects compare as key sets (absent differs from `null`), arrays in order, numbers as IEEE-754 doubles, strings by code point. A documented divergence (`native/parity/divergences.md`) may be accepted;
  - every divergence names the case, why the new output is right, and which consumer is affected.
- **KiCad oracle:** `kicad-cli sch export netlist` and `pcb export stats` on the same corpus check nets and counts against KiCad itself, not only against Prism's previous output.
- **CI:** committed fixtures run on every PR (`native-parity` job). The full corpus is a nightly or local job, because private projects are not committed.
- **Determinism:** the same inputs give a byte-identical bundle (fixed timestamps, sorted members, stable maps). A test builds twice and compares. KiCad-produced members are canonicalized by `prism-kicad` (the GLB's wall-clock `asset.extras.generated_at` is fixed, cli-spec.md §5.2.4); the refill and GLB procedures are pinned in the generator id. Parse-stage JSON members are also byte-identical across linux arm64, linux amd64 and macOS builds; `board.kmpack` is byte-identical only for the same binary on the same architecture.
- **Budgets** (superseded by amendment U §3.2, which sets a budget per user journey; EDA-04903, 57 MB board, in the worker image):
  - stage `parse`: ≤ 30 s, peak ≤ 1.5 GB;
  - the index projection alone: ≤ 5 s.
  - The API process never parses a KiCad file (WP-X).

## 8. Migration and flags

Each consumer switched through `PRISM_DESIGN_SOURCE_<CONSUMER>` = `legacy` (default) | `bundle`:
`SEMANTIC_INDEX`, `DESIGN_COMPARISON`, `RELEASE_STUDIO`, `SYSTEM_BUILDER`,
`VIEWER_3D`, `PROJECT_METADATA`, `CATALOG_IMPORT`. R1 deleted every one but
`RELEASE_STUDIO` (§9.7); `SYSTEM_BUILDER` and `VIEWER_3D` went with System
Builder v2's stage 0, and the other four consumers now always read bundles.

A consumer's flag flipped to `bundle` by default in the PR that proved its
parity. Its legacy path was deleted in Wave 4. Simulation Studio and the
analytic 3D tab are not on dev today, so they are ported directly onto
bundles, with no legacy mode.

**First deploy:**
- Bundles are built lazily on demand, plus a paced backfill of branch heads (one `design_bundle` slot). This replaces the cliff of every project rebuilding at once.
- After each sync, stage `parse` is also built in the background for the new commits of tracked branches, and a new revision key reuses a stored bundle whose read set it leaves unchanged (amendment U §3.3, WP-K2).
- The old stores are removed by WP-R4 once their consumers are on bundles:
  - `semantic-index/` and `semantic-visualizer/`;
  - `system_interface_artifacts` and `system_bundle_frames`;
  - the 3D commit index (`semantic-visualizer/<project>/commit-index.json`).

The Design Comparison revision cache is not removed: source-tree comparisons
and the fabrication plot cached by bundle key still read it on a live path
(WP-R4).

## 9. Work breakdown for parallel agents

### 9.1 Rules every agent follows

- **Branching:**
  - integration branch `feature/native-design-bundle` from `dev`;
  - each work package (WP) is one branch `wp/<id>-<slug>` in its own worktree, stacked on the integration branch (or on the WP it depends on), and one PR into the integration branch;
  - the integration branch's first commit adds it to the quality gate's `pull_request` and `push` triggers, so every stacked PR gets CI;
  - the integration branch merges into `dev` per wave, after the maintainer approves.
- **Ownership:** a WP edits only the paths it owns (tables below). Shared files have a single owner. Others request changes from that owner, never edit them directly. The shared files are:
  - `native/Cargo.toml` and `native/Cargo.lock` (F1, then F2);
  - `native/src/tsp/prism/` and the generated contracts (W0; changes only by an ADR amendment PR);
  - `backend/app/core/config.py` (K owns the new flags);
  - `docker-compose.yml` and `backend/Dockerfile` (L);
  - `.github/workflows/*` (L);
  - the root `.gitignore` (L), whose installer rule is anchored to `/generated/` so committed JSON Schema is not hidden;
  - `native/src/rs/prism-projections/src/lib.rs` (F2, which declares every module up front for P1–P5);
  - the complete list, with one owner per file per wave and how ownership passes on, is the ownership map (`native/contracts/prism/ownership.md` §1, §4). In short:
    - a WP edits only `AGENTS.md` files inside its own directories, and the integration agent applies the root and `services/` map lines once per wave;
    - after a WP merges, its shared files pass to the integration agent of the wave, who applies requested changes as separate commits;
    - an earlier WP creates a stub for a file a later WP fills;
    - build outputs (the served viewer bundle) are rebuilt by the integration agent, never merged;
    - every schema migration takes a number from the reserved blocks (workspace 100–129, catalog 100–109; ownership.md §5).
- **Contracts first:** Wave 1+ code against the Wave 0 contracts and CLI spec, never against each other's work in progress. A WP that needs a contract change stops and reports it.
- **Definition of done for every WP:**
  - its acceptance tests pass;
  - `cargo fmt --check`, `cargo clippy --workspace -D warnings` and `cargo test` pass for any Rust it touches;
  - the backend suite passes (`pytest -n auto -rs`, Postgres integration modules not skipped);
  - Node 24.22.0 is used for anything that runs node;
  - `check_module_size.py`, `check_catalog_architecture.py`, `check_agent_docs.py` and `git diff --check` pass;
  - `AGENTS.md` maps are updated for any new or moved module;
  - a short PR body says what was verified and how.
- **Unchanged rules:** no AI attribution in any upstream kicad_monkey PR; no commercial solver names in prism-sim-studio; no edits to `.env`; no merging to `dev` without the maintainer; no touching the live instance.

### 9.2 Waves

```text
Wave 0  contracts (serial)            W0
Wave 1  foundations                   F0 → F1 → W0 move → F2 → L, then F3 B G K (and F0's native/LICENSES.md)
Wave 2  projections (parallel)        S1 P1 P2 P3 P4 P5, then V1 (after K, B and P4)
Wave 3  consumers (parallel)          C1 C2 C3 C4a C5 C7 C8, then C6 (after C1) and C4b (after C5)
Wave 4  removal (serial)              R1 → R2 → R3 | R4 → X
```

### 9.3 Wave 0: contracts (one agent, serial; blocks everything)

| WP | Deliverable | Owns | Accept |
|---|---|---|---|
| W0 | ADR accepted (this document). Bundle manifest a2 and every §6 projection as TypeSpec, with one example each. CLI spec. Revision-key spec with test vectors. Ownership map. | `native/src/tsp/prism/` and `native/contracts/prism/` (staged in `docs/architecture/design-bundle-contracts/` until F1's import, then moved), `docs/architecture/adr-native-design-bundle.md` | Schemas validate their examples. The test vectors give the same key from a Python and a Rust reference implementation (written as the first commits of K and B). The maintainer reviews before Wave 1. |

Merge order and its reasons are in the ownership map (§3). Nothing may land under `native/` before F1's `git subtree add`, so G and F0's `native/LICENSES.md` follow F1.

The CLI spec (`prism-kicad`):
- `bundle build <project.kicad_pro> --stage parse -o <out.prism> [--source-root <dir>] [--revision-key <hex>] [--key-record <record.json>] [--config <effective.json>]`
- `bundle build --stage board --in <bundle> -o <out.prism> [--refilled-board <pcb> --refill-tool <ver>] [--revision-key <hex>] [--config <effective.json>]` (the refilled board is omitted when the configuration uses saved fills)
- `bundle build --stage models --in <bundle> -o <out.prism> --models-glb <glb> --models-tool <ver>`
- `bundle verify <bundle>`
- `bundle extract <bundle> <member>... -o <dir>`
- `bundle reuse --in <bundle> --key-record <record.json>`: whether a stored bundle serves another revision key of its project (amendment K2 §3.3, cli-spec.md §5.10)
- `revision-key <repo> (--commit <sha> | --worktree) --project <rel> [--config <effective.json>]`, exactly one of `--commit` and `--worktree`
- `compare (--base <base.prism> | --base-src <project.kicad_pro>) --base-revision-key <hex> (--head … as for the base) --head-revision-key <hex> -o <result.json>`: every Design Comparison tab except fabrication, from bundles or source trees (amendments C2r and K2, cli-spec.md §5.6)
- `artwork`, `vendor list` / `vendor run`, `stroke-text`, `drawing-sheet`: Release Studio's artwork, vendor files and sheet text (amendment C3, cli-spec.md §5.7–§5.9)
- Full grammar, streams, exit codes (including 9, recorded content failure, and 10, project absent), limits and the backend integration: `native/contracts/prism/cli-spec.md`.
- `version`

Exit codes, stderr diagnostics, resource limits (§11, G8) and timeouts are part of the spec.

### 9.4 Wave 1: foundations (parallel)

| WP | Deliverable | Owns | Depends | Accept |
|---|---|---|---|---|
| F0 | Licence and provenance:<br>• the allow-list of paths to import;<br>• the list of fixtures excluded from history;<br>• the `fake_style.rs` decision;<br>• the kicad_cruncher corpus licences;<br>• root `NOTICE` | `NOTICE`, `native/LICENSES.md` (provenance note) | W0 | maintainer sign-off on the provenance note |
| F1 | History import (§4.3): `filter-repo` with F0's allow-list, `subtree add --prefix=native`, verbatim | `native/**` (import commit only) | F0 | `cargo test --workspace` passes as imported; byte-identical `design.json`/`board.kmpack` versus `b6316117` |
| F2 | Rename `kicad-monkey-*` crates to `prism-kicad-*` in one mechanical commit; workspace features for a lean `prism-kicad`; then add `prism-projections` (empty) and wire `prism-kicad-cli` | `native/Cargo.toml`, `native/Cargo.lock`, crate manifests | F1 | workspace builds and tests; diff is rename-only apart from the new crates |
| F3 | Replace the Wavenumber infrastructure (§4.2):<br>• hygiene checker;<br>• corpus pointer;<br>• oracle `kicad-cli`;<br>• release workflow re-targeted to Prism artifacts;<br>• the fork's CI jobs (native, wasm32, hygiene) ported into Prism's workflows | `native/scripts/`, `native/rust-hygiene*`, workflow files via L | F1 | the fork's CI jobs green in Prism's CI; a dry-run release produces the binaries and the wasm package |
| B | Bundle and CLI:<br>• move `prism-bundle` from prism-sim-studio into `native/src/rs/prism-bundle`;<br>• manifest a2 with stages;<br>• `reader` feature;<br>• `prism-kicad-cli` with the W0 commands;<br>• the Rust revision-key reference | `native/src/rs/prism-bundle/`, `native/src/rs/prism-kicad-cli/` | W0, F2 | `prism-kicad bundle build` gives a2 bundles that `verify` accepts; the a1 → a2 mapping is documented; determinism test |
| K | Backend bundle service:<br>• `design_bundle` package (reader, store, retention, commit index);<br>• the Python revision-key reference, including the effective config;<br>• `design_bundle` job with staged readiness, queued on import and sync and on demand by commit;<br>• paced backfill;<br>• the flags (§8) | `backend/app/services/design_bundle/`, job registration, flags in `config.py`, a migration for the commit index if needed | W0 | key test vectors match B's; the job builds with a stub CLI in tests and the real CLI in the image; staged readiness, retention and backfill tests |
| G | Goldens: capture today's outputs for every §6 projection on fixtures and corpus. Today's code is dev for most projections, and the reference branch for the analytic pack and Simulation Studio board facts | `native/parity/` (runner, golden format, fixture goldens); corpus manifest outside the repo | W0 | goldens exist for every projection; the runner diffs a bundle against them |
| L | Build and CI:<br>• the Rust workspace in `backend/Dockerfile`, with cached dependency layers;<br>• `prism-kicad` on PATH in the worker image;<br>• the `native` and `native-parity` CI jobs;<br>• the integration branch in the quality-gate triggers | `backend/Dockerfile`, `docker-compose.yml`, `.github/workflows/*` | W0, F1 | image builds on linux/arm64 and amd64; incremental image build time reported; CI green on the integration branch |

### 9.5 Wave 2: projections (parallel; each adds one producer in `prism-projections`)

Every P-WP owns one module `native/src/rs/prism-projections/src/<name>.rs`, its tests and its goldens' divergence notes.

| WP | Projection(s) | Port from | Accept |
|---|---|---|---|
| S1 | Behaviour-free split of `backend/app/api/projects.py` and `backend/app/services/project_service.py` into scoped routers and job modules, so that C1, C5 and C8 never edit one file | the two files and their new modules (ownership.md, S1) | identical route table (a test asserts it) and the full suite green |
| P1 | `semantic-index`, including assembly/variants, `pinName`/`pinType`/`libraryRef` and `schematicNetName` | `semantic_index_service.py`, `semantic_index_variants.py`, `semantic_index_nets.py`, the instance-field scan; the reference branch for the added fields | identical to goldens on the corpus (8/8, `generatedAt` excluded); ≤ 5 s on EDA-04903 |
| P2 | `board-objects`, `occurrences`, `route-metrics` | `design-compare-parser/ecad-parse.mjs`, `design_compare_occurrences.py`, the route digest, `placement_stamp.py` (usage) | Design Comparison's `changes`/`nativeObjects`/`componentObjects`/`routeMetrics` reproduced from the members for every pair in the comparison test suite |
| P3 | `stackup`, `placements` (including outline, courtyard, models, mask colours) | `release_studio/projections.py`, `design_compare_artifacts._extract_stackup`, `pcb_extract.py` stackup, `board_looks.py` (reference branch), `systems/interface_extractor.py` geometry | a superset of the three stackup shapes; Release Studio and System Builder goldens match |
| P4 | `project` | `project_metadata_service.py`, `project_properties_service.py`, `release_studio/closure*.py` reference scanning, `board_metadata.py` net classes | project metadata and Release Studio closure goldens match |
| P5 | `system-interface` | `systems/interface_extractor.py` (`EXTRACTOR_VERSION` 8) | identical interface digests on the System Builder fixtures and corpus |
| V1 | `viewer/models/components.glb` in the job's `models` stage (cached by board + model blobs + KiCad version), plus the board-body and mask facts the analytic tab needs | `kicad_cli_export.py` component export; `board_looks.py` (reference branch) | GLB identical to today's for the same KiCad; analytic tab inputs complete without the Python compiler |

### 9.6 Wave 3: consumer migrations (parallel; each behind its flag)

| WP | Consumer | Owns | Needs | Accept |
|---|---|---|---|---|
| C1 | Semantic index consumers:<br>• the identity endpoint serves the member;<br>• component import and the variants API (`variant_catalog_service`) read `assembly`;<br>• Release Studio's index digest;<br>• the API never builds an index | `semantic_index_service.py` (becomes a reader), `api/projects.py` index routes, `api/project_variants.py`, `variant_catalog_service.py`, `project_component_import_service.py` | P1, K | inspector, search, BOM table, variants and cross-probe unchanged (frontend tests plus a browser check on EDA-04903); identity served from a file with ETag; frontend types updated for a1's added fields |
| C2 | Design Comparison (amendment C2r):<br>• every tab except fabrication computed by `prism-kicad compare`, from bundles or, when a commit has none yet, from its source tree;<br>• ecad-viewer's diff bundle (`KiCadProjectDiffBundle`) from `compare`, in today's format;<br>• a new review contract for the tabs;<br>• fabrication from `kicad-cli`, keyed by bundle key;<br>• Node `ecad-diff` and the Python assembly retired;<br>• overlay sources from `sources/` | `design_compare_*.py`, `document_diff_service.py` (bundle path), `fabrication_compare_service.py` (keying only), `backend/design-compare-parser/` (removal), `frontend/src/components/design-comparison/**`, `native/src/rs/prism-projections/src/compare/`, `native/src/rs/prism-kicad-cli/src/cmd_compare.rs`, the parse stage's scheduling, the `compare` parity member | P1, P2, P3, K | full comparison test suite; same review groups, counts and changed objects as today on a recorded set of real pairs, after the documented divergences; ecad-viewer's resolution counters equal or better on those pairs; bundle and source-tree modes byte-identical; on a cold two-commit EDA-04903 comparison in the worker image, every tab except fabrication before today's first result and every tab by today's complete result (C2r §5) |
| C3 | Release Studio (amendment C3):<br>• projections from P3 and P4, variants from P2;<br>• the index from P1, the scope fingerprint over an a0-compatible view;<br>• board kicad-cli steps on `refilled/`, schematic steps on `sources/`;<br>• assembly and testpoint artwork from `prism-kicad artwork` and `models/assembly-hlr.json`;<br>• vendor files from `prism-kicad vendor`;<br>• sheet text and frame from `prism-kicad stroke-text` and `drawing-sheet`;<br>• no Cruncher and no Python kicad_monkey; model rewrites stay KiCad-file writes from bundle sources | `release_studio/**`, `release_studio_build_service.py`, `release_studio_model_inputs.py`, the new crates `prism-artwork` and `prism-vendors`, `native/third_party/geometer-client/`, the `models`-stage HLR member | P1, P2, P3, P4, V1, K | the targets of amendment C3 §4: vendor CSVs byte-identical, XLSX cell-identical, stroke text, drawing sheet and HLR equal to today's, the scope fingerprint unchanged, the dossier digest changing once as divergence `rs-1` (and `rs-2` for stale saved fills); no `kicad_monkey`, `kicad_cruncher` or `geometer` import under Release Studio |
| C4a | System Builder interface: from P5, cached by revision key; drift and digests; the System Builder frontend readers of interface and placement fields | `backend/app/services/systems/` (interface, drift, digests), `api/systems*.py`, `frontend/src/types/system.ts`, `frontend/src/lib/systems-api.ts`, `placement/frames.ts`, `placement/mate.ts`, `findings-ui.tsx` | P3, P5, K | `test_system_e2e_replay` passes; identical interface digests on the System Builder fixtures |
| C4b | System Builder: **replaced by [System Builder v2](adr-system-builder-v2.md)** (through amendment V2's V2b), whose stage 0 deleted System Builder v1, every mesh path and the topology compiler | see that ADR §7 | V2a (C5), P3, V1, K | that ADR §7 |
| C5 | 3D tab on the analytic model (V2a, [amendment V2](adr-native-design-bundle-amendment-v2.md): the analytic path is the only 3D path; the mesh path is deleted in this package, §2.3):<br>• port the reference branch's analytic renderer, 2D layer view and mask colours onto bundle members;<br>• selection and cross-probe through `semantic-index`;<br>• retire the Python topology compiler and mesh path for the 3D tab | `frontend/src/components/webgpu-3d-tab.tsx` and the analytic renderer, `semantic_visualizer_service.py` (becomes a thin bundle reader), `kicad-prism-viewer/` 3D pieces (removal in R2) | V1, P3, K | visual check on EDA-04903, USB-PD-Trigger-Board and one System Builder board; no `topology_compiler` process |
| C6 | Simulation Studio (V2c; result overlays optimised as [amendment V2](adr-native-design-bundle-amendment-v2.md) §4 lists):<br>• port the reference branch's `backend/app/sim_studio/` and `frontend/src/components/sim-studio/` onto bundles;<br>• board facts from `semantic-index` (`pinName`, `pinType`, `libraryRef`);<br>• runs hard-link the bundle by key and gate on `cross_check`;<br>• run retention as on the reference branch;<br>• prism-sim-studio reads Prism's design bundles (a3) with its own small reader (decided 2026-10-19, instead of depending on Prism's crates);<br>• the engines ship as prism-sim-studio GitHub release assets; the image installs the release pinned in `backend/sim-engines.lock.json` (`scripts/fetch_sim_engines.py`, decided 2026-10-21) | `backend/app/sim_studio/`, `frontend/src/components/sim-studio/`, workspace migrations for setups/runs/layouts (new numbers after dev's), `backend/sim-engines.lock.json` | P1, B, K | DC IR drop end to end on EDA-04903 with the sim-worker; prism-sim-studio CI green against the pinned Prism commit |
| C7 | Catalog project component import and usage:<br>• project sides read `occurrences`, `placements` and `sources/` instead of scanning;<br>• the `pcbnew` footprint flip stays | `project_component_asset_extractor.py`, `project_catalog_usage_service.py`, `catalog/placement_stamp.py` project paths | P2, P3, K | `test_project_component_import_service.py` and the catalog Postgres integration pass |
| C8 | Project metadata (`PRISM_DESIGN_SOURCE_PROJECT_METADATA`): the project card, properties sheet and viewer-source routes read `projections/project.json` and `sources/`; the API process no longer parses `.kicad_pro` | `project_metadata_service.py`, `project_properties_service.py`, `kicad_text_variables.py`, the properties-sheet and viewer-source routes (after S1's split) | P4, K, S1 | project card and properties identical on the fixtures; no `KiCadProject` import left |

### 9.7 Wave 4: removal and enforcement

| WP | Deliverable | Accept |
|---|---|---|
| R1 | Flip all flags to `bundle`; delete the legacy paths and the flags | suite green with no `legacy` branch left |
| R2 | Remove:<br>• `kicad-prism-viewer/pipeline/topology_compiler` (3D parts; moved to V2a and V2b by amendment V2 §2.3, so R2 removes only what they leave);<br>• `backend/design-compare-parser/`;<br>• `kicad_monkey_design_adapter.py`;<br>• every revision parse through Python `kicad-monkey`. The catalog's library-file imports stay as allow-listed tool uses until a later ADR ports them onto Prism's parser (decisions.md, Ownership map item 2). Release Studio's former tool uses are gone with C3 (amendment C3), and R2 also removes `kicad-cruncher-cli` from the workspace | no revision parse imports `kicad-monkey`; the allow-listed modules are the only importers (X); image size and build time reported |
| R3 | `prism-kicad-native` and `prism-clipper2` move onto the imported core (or are absorbed into `prism-projections`) | no crate depends on `wavenumber-eng/kicad_monkey` |
| R4 | Remove the superseded stores and tables (§8) with a migration; one-off cleanup of the old directories | no reader of the old stores remains; space reclaimed reported |
| X | Architecture test: no module under `backend/app` imports a KiCad parser or opens `.kicad_*` files, outside `design_bundle/`, the KiCad-output jobs and the catalog library reader | `backend/tests/test_design_source_boundary.py` |

**Status notes.**
- **R1 done (WP-R1).** The semantic index, project metadata, catalog import and
  design comparison read the bundle unconditionally; their
  `PRISM_DESIGN_SOURCE_*` switches and legacy paths are deleted. Release Studio
  read the bundle behind the last switch until C3 F4c removed it too; every
  consumer now reads the bundle unconditionally. A request without a `commit` reads the checkout's HEAD
  and answers `X-Prism-Working-Tree: dirty` when the read set has uncommitted
  changes. A member that is still building is HTTP 202 `{"status": "pending",
  "members": [...], "retryAfterSeconds": 3}` with a `Retry-After` header; a
  failed build is HTTP 422 `{"status": "failed", "members": [...], "detail":
  ...}`. Both are one handler pair (`design_bundle/errors.py`), registered once
  in `app/main.py`.
- **R4 done (WP-R4).** `semantic-index/` and `semantic-visualizer/` (with the
  old 3D commit index inside it) are deleted by a one-off, idempotent startup
  cleanup under `KICAD_PROJECTS_ROOT/.kicad-prism/`; it logs the bytes
  reclaimed and records a marker so it runs once. `system_interface_artifacts`
  and `system_bundle_frames` were already dropped by workspace migration 123,
  so no new migration is needed. The Design Comparison revision cache stays:
  source-tree comparisons and the fabrication plot cached by bundle key still
  use it.
- **R3 done.** `prism-kicad-native` and `prism-clipper2` were deleted with the
  mesh path in System Builder v2 stage 0; no crate depends on
  `wavenumber-eng/kicad_monkey`.
- **R2 done (WP-R2).** No revision parse imports Python `kicad-monkey`; the
  only importers are the catalog's library-file readers
  (`app/services/catalog/mates.py`), allow-listed with a test
  (`backend/tests/test_kicad_monkey_allow_list.py`, folded into X's
  `test_design_source_boundary.py`) until the library ADR. The
  semantic index's Python build (`build_semantic_index`, its `KiCadDesign`
  parse, the design adapter and `semantic_index_variants.py`) is deleted; the
  bundle's `semantic-index` member is the only producer. The catalog
  provenance's extractor tag names the design-bundle generator contract, and
  the status route's `kicadMonkeyVersion` is the bundle generator's
  `engine_version`. System Builder's board step reads its closure's
  `ProjectReferences` from the member's `projections/project.json`
  (`bundle_design.project_references_for`); a pending bundle is retried and a
  failed one is permanent, and `closure.py` has no checkout-scan branch (the
  scanner and `closure_scan.py` are gone). `backend/design-compare-parser/`,
  its CI job, `scripts/build-ecad-parser.sh` and the object-delta scripts are
  deleted; `kicad-cruncher-cli` left the native workspace. The PyPI
  `kicad-monkey==2026.9.7` stays for the allow-listed catalog readers.
- **X done (WP-X).** `backend/tests/test_design_source_boundary.py` walks every
  module under `backend/app/` for KiCad parser imports (`kicad_monkey`,
  `kicad_cruncher`, `pcbnew`, `sexpdata`, `geometer`) and for string literals
  that open a KiCad s-expression form. Its allow-list is exactly the
  design-bundle builder and its KiCad steps, the KiCad-output jobs in
  `release_studio/`, and the catalog library reader with the library-text
  writers it uses. Each entry is one module naming the parsers it may import
  and whether it may carry design text, so Release Studio imports no parser
  and only `catalog.mates` imports `kicad_monkey`; a second assertion fails on
  an unused allowance and the failure
  report names the module, line and matched text. Release Studio's variant
  discovery and the variants API now read the bundle's semantic-index member
  only: `variant_source_scan.py`, `discover_snapshot_catalog`, its cache and
  the non-bundle branch of `discover_variant_catalog` are deleted, and
  `project_source_snapshot.py` keeps only the revision-identity seam comment
  anchors use. Wave 4 is complete.

### 9.8 Running it with Ultracode

- **Wave 0** runs first with one agent, and the maintainer reviews its contracts. F0 and F1 also need the maintainer, for the provenance sign-off and the history import.
- **Each later wave is one workflow:**
  - one agent per WP in its own worktree on `wp/<id>-<slug>`;
  - a verify agent per WP that runs the definition of done and the WP's acceptance checks;
  - an integration agent that stacks the wave's PRs onto `feature/native-design-bundle`, resolves order, and runs the full suite plus the parity runner.
- **Agent rules:** a WP agent
  - reports a contract gap and stops, rather than editing a frozen contract or another WP's paths;
  - does not touch the live instance;
  - leaves deployment to the maintainer.
- **Sizing:** Wave 1 has 8 work packages (F0 → F1 → F2 → L serial, then F3, B, G and K in parallel), Wave 2 has 7, Wave 3 has 9 and Wave 4 has 5 (serial), each with a verifier.

## 10. Decided defaults

1. Projections that only read parsed facts (including `system-interface`) are produced in Rust.
2. Gerbers and drill files stay outside the bundle, keyed by bundle key.
3. Catalog library parsing moves onto the imported core in a later ADR.
4. ~~kicad-cruncher's Rust is imported and owned. Release Studio keeps calling it as a tool.~~ Superseded by amendment C3: Cruncher is dropped; its logic is re-implemented in `prism-artwork` and `prism-vendors`.
5. No Python bindings. The MCP server will call `prism-kicad`.
6. `wn-geometer` and the Geometer C SDK remain pinned external dependencies. Replacing them is out of scope.
7. Design Comparison is computed in Rust (`prism-kicad compare`), from bundles or source trees; ecad-viewer's input format is unchanged (amendment C2r, [`adr-native-design-bundle-amendment-c2r.md`](adr-native-design-bundle-amendment-c2r.md), revising C2).
8. Parity is what the user sees; each user journey has a budget and performance work stops when it is met; bundles are warm by default; Rust passes typed values internally and writes JSON only at the file boundary; every consumer migrates (amendment U, [`adr-native-design-bundle-amendment-u.md`](adr-native-design-bundle-amendment-u.md)).
9. Revisions whose read set holds share one stored archive, all stages included; members carry a design key, never a revision key (amendment K2, [`adr-native-design-bundle-amendment-k2.md`](adr-native-design-bundle-amendment-k2.md)).

## 11. Risks and gaps found in review

| # | Gap | Resolution in this ADR |
|---|---|---|
| G1 | A full bundle per commit (refill, materialize, GLB) would make the first Design Comparison of two cold commits slower than today's schematic-only work | staged readiness (§4.4): comparison needs stage `parse` only. Measured on EDA-04903 this was not enough (C2r §1.2); resolved by `compare`'s source-tree mode and a faster parse stage, gated by C2r §5. Amendment U §3.3 adds background parse-stage builds and reuse by read set, so most comparisons find both bundles stored. |
| G2 | Bundles store sources and the refilled board, duplicating git objects. Per-commit bundles for comparisons grow storage. | deflated members, retention by use (§5), sizes reported by K; revisit storing `sources/` by blob reference if growth matters. Reuse by read set (amendment U §3.3) also stops commits that do not touch a project from adding bundles for it. |
| G3 | 3D models resolve through `KICAD*_3DMODEL_DIR` (KiCad's stock library in the image) as well as from the repository | the repository's model files are in the revision key; the stock library is pinned by the KiCad version in the generator id |
| G4 | LFS files and gitlinks (submodules) | source materialization reuses Release Studio's closure handling (LFS hydration, gitlinks). Prism's sync initializes submodules recursively and fetches LFS objects (K); the worker image has `git-lfs` (L; it has none today). A design source that cannot be materialized blocks the bundle and the job retries; an unavailable 3D model does not: it is recorded as `model-unavailable` and the GLB is built without it (example: Openswitch's models in an uninitialized `kicad-libraries` submodule) |
| G5 | Multi-project repositories share files and libraries | the key includes the project anchor; bundles are per project |
| G6 | Settings stored in Prism's database override the committed `.prism.json` and change which files are the project | the effective configuration is part of the revision key and recorded in the manifest |
| G7 | First deploy would rebuild every project at once | lazy builds plus a paced backfill (§8). The background prebuild after sync (amendment U §3.3) is paced through the same slot. |
| G8 | Bundles are built from untrusted repositories | parser limits (already in the core), a per-build timeout and memory cap in the CLI spec, zip path checks on read; a fuzzing target is follow-up work |
| G9 | The identity endpoint's schema changes (a0 → a1, additive) | frontend types updated in C1; ETag includes the generator id |
| G10 | A Rust workspace of this size lengthens image builds and CI | cached dependency layers in the Dockerfile; `native` CI jobs run only when `native/` changes |
| G11 | Two Rust cores (imported, and the upstream one in `prism-kicad-native`) coexist until R3 | accepted for the transition; R3 removes it |
| G12 | The user's open upstream materializer PRs and their review | upstream contributions are optional from now on; Prism does not wait for them |
| G13 | Shared `Cargo.lock` and generated contracts conflict between parallel WPs | single owners (§9.1); WPs ask the owner for dependency or contract changes |
| G14 | KiCad version support | KiCad 9 and 10 formats, as the core supports today; the worker image's KiCad (10.0.x) for KiCad outputs; KiCad 11 work is owned here |
| G15 | Contract evolution needs the TypeSpec/npm toolchain inside `native/` | imported with the rest (§4.1); runs under Node 24.22.0 |
| G16 | `design.json` has no schema | owed; C6 adds the TypeSpec and JSON Schema (decisions.md) |
| G17 | Today's Design Comparison change order comes from `localeCompare`, so it depends on the host's locale | `prism-kicad compare` orders changes in code point order, a documented divergence (amendment C2, D2) |
