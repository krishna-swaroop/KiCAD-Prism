# Design bundle

The only Python package that knows the design-bundle format. The design is
`docs/architecture/adr-native-design-bundle.md`; the frozen contracts are
`native/contracts/prism/bundle-format.md`, `native/contracts/prism/cli-spec.md`
and `native/contracts/prism/revision-key.md`, with JSON Schema in
`native/contracts/generated/schema/`. Never edit those here: a contract change
is an ADR amendment.

| Module | Role |
| --- | --- |
| `revision_key.py` | The design revision key `prism.revision_key.a1`: selection, canonical config, preimage, commit and working-tree listings, the key record. Prism's Python reference; `backend/tests/test_design_bundle_revision_key.py` holds it to every W0 vector. |
| `effective_config.py` | The effective configuration Prism resolves (revision-key.md §4.4): anchor exactly, stored settings over the committed Prism settings file, globs to the anchor's stem only, `zone_fills` from the stored setting. Keys a commit or a working tree. |
| `generator.py` | The generator id's canonical bytes, digest and the bundle key (cli-spec.md §5.1). |
| `schemas.py` | Validators for the committed JSON Schema, every schema registered by `$id`. |
| `archive.py` | The `.prism` reader: bundle-format.md §9, strict zip, bounded inflation, member digests and schemas. |
| `manifest.py` | Member readiness (§3.3) and the manifest invariants (§3.4). |
| `store.py` | `.kicad-prism/bundles/<project>/<revision key>/<generator digest>.prism`, its `.prism.verified` marker (step 7 ran once), the unpacked cache, deletion, and a models record beside the archive: the KiCad path variables the board's models use and what each pointed at when they were exported. |
| `rows.py` | The commit index, bundle, alias and outcome tables (workspace migrations 100-103 and 118). |
| `cli.py` | Runs `prism-kicad`: exit codes, stdout validation, timeouts, cancel, peak memory. |
| `materialize.py`, `kicad_steps.py`, `stage_models.py` | What the job does around the CLI: sources (LFS, gitlinks), the seeded upgrade and its persistent cache, the zone refill and its persistent cache, the component GLB and its persistent cache. `stage_models.py` passes to WP-V1 in Wave 2. |
| `jobs.py` | The `design_bundle` job kind and how it is queued. |
| `reuse.py` | Warm bundles (ADR amendment K2): which archive serves a revision key (its own, else an alias row), `prism-kicad bundle reuse` against a few candidates before a build, and the commits the prebuild keeps warm (branch windows and tags). |
| `design_keys.py` | A bundle's and a commit's design key (ADR amendment K2 §3.6), recorded by stage parse; comment anchors compare it to keep a freehand area current on an unchanged design. |
| `backfill.py`, `retention.py` | The worker's paced prebuild (alias or queue, one build at a time; an interactive request preempts a queued or running backfill build) and bundle retention, which keeps the prebuild set and every aliased archive. |
| `regenerate.py` | A designer's forced rebuild of one commit's or a whole project's design data, skipping reuse. |
| `repo_hydration.py` | Submodules and LFS objects for import and sync. |
| `reader.py` | How a consumer opens a revision's bundle and reads members. A request without a commit reads the checkout's HEAD; a dirty read set is reported through the read's response headers. `models_outdated` says the stored parts were exported with other KiCad libraries than are bound now (only the variables the board uses count); `refresh_models` queues the models stage alone over the stored archive. |
| `consumer.py` | `bundle_read`: a consumer opens its members, or raises the typed pending/failed answer (not a legacy fallback). `bundle_read_if_ready` is Design Comparison's source-tree mode. Every consumer goes through it. |
| `errors.py` | `DesignDataPending` (HTTP 202) and `DesignDataFailed` (HTTP 422) and the one handler pair `app.main` registers for every design-data route. |

## Rules

- **No KiCad parsing here or anywhere else in Python.** Keying reads Git
  listings and names only; the upgrade step reads a file's `(version …)` and
  sheet names to know what to hand to KiCad. The parse is `prism-kicad`'s.
- **Decide from the exit code and stdout, never stderr** (cli-spec.md §3).
  Validate every stdout document before using it.
- **Attribute files by anchor, never by directory** (issue #681). Do not add a
  fallback that picks "the board in the directory"; the backfill flags
  instead.
- **A stage only moves from `pending` to final** for a stored bundle. The job
  resumes from the archive; it never re-runs a stage.
- **Tests run against the stub**, `backend/tests/support/prism_kicad_stub.py`,
  installed by `backend/tests/support/design_bundle_fixtures.py`. Do not rely
  on its archive bytes or messages.
