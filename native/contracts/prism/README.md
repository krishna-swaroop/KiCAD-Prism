# Design-bundle contracts (W0 staging)

This directory holds the Wave 0 contracts of the Prism-native design bundle ([ADR](../../../docs/architecture/adr-native-design-bundle.md), §6 and §9.3):

- the TypeSpec for bundle manifest a2 and every bundle projection, with one example and one field map each;
- the `prism-kicad` CLI spec;
- the revision-key spec with its test vectors;
- the ownership map.

Wave 1+ work packages code against these files, never against each other's work in progress.

It is a staging directory. It exists only until WP-F1 imports the fork into `native/` (see "After WP-F1").

**Read [`conventions.md`](conventions.md) before writing or changing a contract.**

## Layout

| Path | What | Written by |
|---|---|---|
| `tsp/prism/main.tsp` | entry point: imports every contract file | W0 foundation; contract imports added at consolidation |
| `tsp/prism/common.tsp` | shared primitives (`Prism.Contracts.Common`) | W0 foundation |
| `tsp/prism/<name>-<version>.tsp` | one contract per file | the owning W0 agent |
| `generated/schema/<RootModel>.json` | JSON Schema (draft 2020-12), one per root | `scripts/build.mjs` only, never by hand |
| `examples/<RootModel>.example.json` | one valid example per root | the owning W0 agent |
| `field-maps/<member>.md` | field-by-field traceability to today's code and consumers | the owning W0 agent |
| `scripts/` | `check-contract.mjs`, `build.mjs`, `lib/contracts.mjs` | W0 foundation |
| `package.json`, `tspconfig.yaml` | toolchain pins and emitter options (mirror the fork's) | W0 foundation |
| `node_modules` | symlink to an offline install (TypeSpec 1.16.0, ajv 8.20.0); never delete it, never `npm install` | — |

## Commands

Run every command from `native/` with Node 24.22.0. The default `node` on the development machine is broken.

```sh
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
cd native
```

**Check one contract while writing it.** This compiles the file and its imports into a temporary directory outside the repository, fails on any diagnostic, lints the conventions, and validates each document with ajv:

```sh
node scripts/contracts/check-contract.mjs src/tsp/prism/stackup-a0.tsp \
  --json contracts/prism/examples/StackupA0.example.json --model StackupA0 \
  --json /path/to/a/real/output.json --model StackupA0
```

- `--model` may be left out when the document's `schema` field names a root of the file.
- To prove the file also compiles to byte-identical schemas under the fork's TypeSpec 1.14.0 pin, add `--compare-typespec /Users/Swaroop/Personal-Projects/KiCAD-Platform/.worktrees/materializer/kicad_monkey/node_modules`.
- `--keep` keeps the temporary output and prints its path.
- Exit status: 0 for pass, 1 for fail, 2 for a usage or tool error.

**Build everything** (consolidation):

```sh
node scripts/contracts/build.mjs                  # clear generated/schema, compile main.tsp, lint all files,
                                        # write schemas, validate every example (1:1 with roots)
node scripts/contracts/build.mjs --check          # same, but writes nothing; fails if generated/schema is stale
node scripts/contracts/build.mjs --validate-only  # validate examples against generated/schema as committed
```

While the contracts are being written in parallel, `build.mjs` fails on any file that `main.tsp` does not import yet (`main-imports`). That is expected: authors use `check-contract.mjs`, and the consolidation agent adds the imports. Each form also accepts `--compare-typespec <node_modules>`. The same commands are available as `npm run build`, `npm run verify`, `npm run validate` and `npm run check`; `check` runs `tsp compile --no-emit` only.

## After WP-F1

| Here | Moves to |
|---|---|
| `tsp/prism/` | `native/src/tsp/prism/`, verbatim |
| `generated/schema/` | `native/contracts/generated/schema/`, beside the fork's `kicad_monkey` schemas. `build.mjs` only deletes files whose `$id` starts with `urn:prism:schema:`, so sharing the directory is safe. |
| `examples/`, `field-maps/`, `conventions.md`, `scripts/` | placed by F1/F3 (proposed: `native/contracts/prism/`) |
| `package.json`, `tspconfig.yaml` | merged into the fork's: one TypeSpec pin (the fork has 1.14.0), and a second compile entry for `src/tsp/prism/main.tsp` |

Known issue for F1 and L:

- **The fork's TypeSpec pin is 1.14.0.** Contracts use no newer feature, and `check-contract.mjs --compare-typespec` proves byte-identical output under it (conventions.md §1). The root `.gitignore` rule that hid `generated/` everywhere is now anchored to `/generated/`.

## Index

| Bundle member | Schema id | Root model | Contract | Example | Field map | Producer | Consumers |
|---|---|---|---|---|---|---|---|
| `bundle.json` | `prism.bundle.manifest.a3` | `BundleManifestA3` | [`bundle-manifest-a3.tsp`](../../src/tsp/prism/bundle-manifest-a3.tsp) | [example](examples/BundleManifestA3.example.json) | [bundle-manifest](field-maps/bundle-manifest.md) | B | all |
| `projections/semantic-index.json` | `prism.semantic_index.a2` | `SemanticIndexA2` | [`semantic-index-a2.tsp`](../../src/tsp/prism/semantic-index-a2.tsp) | [example](examples/SemanticIndexA2.example.json) | [semantic-index](field-maps/semantic-index.md) | P1 | C1, C3, C6 |
| `projections/board-objects.json` | `prism.board_objects.a0` | `BoardObjectsA0` | [`board-objects-a0.tsp`](../../src/tsp/prism/board-objects-a0.tsp) | [example](examples/BoardObjectsA0.example.json) | [board-objects](field-maps/board-objects.md) | P2 | C2 |
| `projections/occurrences.json` | `prism.occurrences.a0` | `OccurrencesA0` | [`occurrences-a0.tsp`](../../src/tsp/prism/occurrences-a0.tsp) | [example](examples/OccurrencesA0.example.json) | [occurrences](field-maps/occurrences.md) | P2 | C2, C3, C4a, C7 |
| `projections/stackup.json` | `prism.stackup.a0` | `StackupA0` | [`stackup-a0.tsp`](../../src/tsp/prism/stackup-a0.tsp) | [example](examples/StackupA0.example.json) | [stackup](field-maps/stackup.md) | P3 | C2, C3, C4b, C5, C6 |
| `projections/route-metrics.json` | `prism.route_metrics.a0` | `RouteMetricsA0` | [`route-metrics-a0.tsp`](../../src/tsp/prism/route-metrics-a0.tsp) | [example](examples/RouteMetricsA0.example.json) | [route-metrics](field-maps/route-metrics.md) | P2 | C2 |
| `projections/placements.json` | `prism.placements.a0` | `PlacementsA0` | [`placements-a0.tsp`](../../src/tsp/prism/placements-a0.tsp) | [example](examples/PlacementsA0.example.json) | [placements](field-maps/placements.md) | P3 | C3, C4a, C4b, C7 |
| `projections/project.json` | `prism.project.a0` | `ProjectA0` | [`project-a0.tsp`](../../src/tsp/prism/project-a0.tsp) | [example](examples/ProjectA0.example.json) | [project](field-maps/project.md) | P4 | C3, C5, C8, V1 |
| `projections/system-interface.json` | `prism.system_interface.v1` | `SystemInterfaceV1` | [`system-interface-v1.tsp`](../../src/tsp/prism/system-interface-v1.tsp) | [example](examples/SystemInterfaceV1.example.json) | [system-interface](field-maps/system-interface.md) | P5 | C4a |
| stdout and stderr of `prism-kicad` | `prism.cli.*.a0` (7 roots: version, build_result, verify_report, extract_result, error, project_absent, diagnostic) | `Cli*A0` | [`cli-a0.tsp`](../../src/tsp/prism/cli-a0.tsp) | `examples/Cli*A0.example.json` | [cli](field-maps/cli.md) | B | K, MCP |
| revision key, effective config, vectors | `prism.revision_key.{record,effective_config,vectors}.a1` | `RevisionKey*A1` | [`revision-key-a1.tsp`](../../src/tsp/prism/revision-key-a1.tsp) | `examples/RevisionKey*A1.example.json` | [revision-key](field-maps/revision-key.md) | B and K (two references) | K, B |

`design.json` keeps the fork's `kicad_monkey.design.a0` and has no schema yet (ADR G16). `materialization/board.kmpack` is the fork's `kicad_monkey.materialization.a0`.

Specs and records:

- [`conventions.md`](conventions.md): the rules every contract follows.
- [`cli-spec.md`](cli-spec.md): the `prism-kicad` command line, exit codes, limits, the generator id and bundle key, and the backend job.
- [`bundle-format.md`](bundle-format.md): the archive, stages, readiness, invariants and reader validation.
- [`revision-key.md`](revision-key.md) and [`revision-key-vectors.json`](revision-key-vectors.json): the design revision key.
- [`ownership.md`](ownership.md) and [`ownership.json`](ownership.json): who edits what, merge order and migration numbers.
- [`decisions.md`](decisions.md): every maintainer decision taken in the W0 review.

`node scripts/contracts/build.mjs` compiles `tsp/prism/main.tsp`, writes `contracts/generated/schema/` (19 Prism roots, beside the fork's) and validates all 19 examples. `node scripts/contracts/check-contract.mjs src/tsp/prism/revision-key-a1.tsp --json contracts/prism/revision-key-vectors.json --model RevisionKeyVectorsA1` validates the vectors.
