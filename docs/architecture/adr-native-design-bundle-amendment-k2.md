# ADR amendment K2: warm bundles

- **Status:** Accepted (2026-10-17). The maintainer took the recommended option for Q1–Q3 (§2), which the rules of §3 assume. The text changes of §6 are applied in the same pull request. The contract changes (§3.7) land with WP-K2a.
- **Revises:** [amendment U](adr-native-design-bundle-amendment-u.md) §3.3 ("Stages after `parse`") and §4 (K2a, K2b and their acceptance). The rest of U §3.3 stands: background builds, reuse by read set, producers reading only what they need, and `board-objects`' project scope.
- **Parent:** [`adr-native-design-bundle.md`](adr-native-design-bundle.md) §5 (storage), §8 (first deploy). It also changes [`bundle-format.md`](../../native/contracts/prism/bundle-format.md) §2.2 and §3.4, [`cli-spec.md`](../../native/contracts/prism/cli-spec.md) §5.2 and §9.1, and [`revision-key.md`](../../native/contracts/prism/revision-key.md) §10.

## 1. Context

Amendment U decided that a new revision key reuses a stored parse-stage bundle when the bundle's recorded read set holds in the new tree. Writing out how that works found two things U gets wrong, and one it leaves out.

1. **A member carries the revision key.**
   - `projections/semantic-index.json` records `sourceRevisionKey`: the key the build was given (`prism-projections/src/semantic_index.rs:47-49`, field map D2).
   - The backend serves the member file as it is (`backend/app/services/semantic_index_bundle.py:68-71`). Its ETag is that key, and comment anchors store it (`comment_anchor_service.py:161`).
   - So a member is *not* a function of the read set alone. Two consequences:
     - an aliased revision would be served another revision's key;
     - U's acceptance test "a rekeyed archive equals a fresh stage-`parse` build of its key" cannot pass, because a fresh build embeds its own key.
2. **Compare takes identity from the archive.**
   - In bundle mode, `prism-kicad compare` reads `revision_key` from `bundle.json` (`prism-kicad-cli/src/cmd_compare.rs:151-170`). In source-tree mode it takes it from `--revision-key`.
   - Through an alias, the two modes would then disagree, which U §3.1 forbids.
3. **Later stages read the whole source set.**
   - The zone refill and the GLB export run KiCad in `$JOB/src`, which holds every file of the revision key (cli-spec.md §9.1 step 1, §9.2, §9.3), not the bundle's `sources/`.
   - That is why U needed `bundle rekey`: a later stage might read a file the parse read set does not cover.
   - But every file those steps read is already in the closure:
     - the board, the project file and the `.kicad_dru` (refill);
     - the board and the model files its footprints name (the GLB export);
     - stage parse reads each repository model target as a source member (bundle-format.md §2.2).
   - Running them on `sources/` makes every stage a function of the read set.

## 2. Questions

### Q1. One archive per read set, or one per revision key?

- **(a) Recommended: share the archive.**
  - Stages board and models run on the archive's own `sources/` (§3.5). Every stage is then a function of the read set, so all revision keys whose read set holds share one archive, all three stages included.
  - An alias maps `(project, revision key)` to a stored bundle key. `bundle rekey` is not needed.
  - Effects:
    - the refill and GLB export, the slow part of the fabrication path, are warm too;
    - twenty prebuilt commits that do not touch the design store one archive, not twenty.
- **(b) U as written: rekey before a later stage.**
  - Each revision key that needs stage board or models gets its own copy of the parse members, and runs its own refill and GLB export.
  - Disk grows with the commits compared, and the refill is never shared.

### Q2. What identity does a member carry?

- **(a) Recommended: a design key, from the read set.**
  - The semantic index's `sourceRevisionKey` becomes `designKey`:
    `SHA-256("prism.design_key.a0" NUL config_digest NUL canonical read set)` (§3.6).
  - It is the same for every revision that reads the same bytes, and for every build of them, whatever order they were built in.
  - Effects:
    - comments anchored on one commit stay current on every commit that leaves the design unchanged;
    - the ETag stays valid across those commits.
  - No member carries a revision key. The revision a user asked for comes from the request (§3.6).
- **(b) Members carry no identity; the backend adds the requested revision key.**
  - The backend rewrites the JSON on each read, against the 0.1 s member-read budget (U §3.2).
  - Comments still split per commit.

### Q3. The jobset rule

- Every `.kicad_jobset` in the repository is a source member today (bundle-format.md §2.2), so a jobset added anywhere makes every project's bundle cold.
- **(a) Recommended: keep it as is.**
  - Jobsets change rarely.
  - Narrowing the rule to the project's directory changes what Release Studio can run, so it belongs to C3.
- **(b) Narrow it now**, to jobsets under the project file's directory.

## 3. Rules (with the recommended options)

### 3.1 `Sources`: three recorded queries

`prism_projections::Sources` loses `paths()`. A producer asks for exactly what it needs:

```rust
pub trait Sources: Sync {
    /// The bytes of `path`, shared, or `None` when it is not in the source set.
    fn read(&self, path: &str) -> Option<Arc<[u8]>>;
    /// Whether `path` is in the source set.
    fn exists(&self, path: &str) -> bool;
    /// The source-set paths under `dir` ("" = the repository root), at any
    /// depth, whose lowered name ends with one of `suffixes` (any name when
    /// empty), in code point order.
    fn list(&self, dir: &str, suffixes: &[&str]) -> Vec<String>;
}
```

- **Every call is recorded:**
  - a successful `read` becomes a source member, as today;
  - a `read` that returns `None`, and every `exists`, is a *probe*: the path, and whether it was present;
  - every `list` is a *listing*: its directory, its suffixes and the paths it returned.
- **Bytes are shared, not copied.** Today each `read` clones the file, and EDA-04903's 57 MB board is read by several producers. `Arc<[u8]>` makes a read a reference-count increment, which counts towards the 1.5 GB parse budget (perf item 6).
- **Suffixes** match like the revision key's name rules: the lowered name, ASCII only (revision-key.md §6).

### 3.2 Where each whole-set use goes

Every use of the source set as a whole, and its replacement:

| Use today | Replacement | User-visible? |
|---|---|---|
| `board-objects` takes every `.kicad_sch`, `.kicad_pcb`, `.kicad_pro` and `.kicad_dru` (`board_objects.rs:35`) | The project's documents: `config.project_file`, the `.kicad_dru` beside it (`read`), `config.board`, and the schematics the root schematic reaches (`SchematicModel::bundle`) | Yes, a fix: comparisons stop listing other projects' files and unreached sheets (U §3.3). This is already accepted divergence D11 in `board-objects.md` ("Bundle: the project's closure"). The producer never implemented it, and no fixture showed the gap, because every committed fixture has one project at the root |
| The semantic index's field scan takes every `.kicad_sch` under the project directory (`semantic_index/fields.rs:63`) | The reached schematics' text, already in `SchematicModel::bundle`. No read and no listing | Yes, a fix: fields are keyed by placed-symbol UUID, so an unreached copy of a sheet (an `old/` or backup copy) can overwrite the real sheet's fields today. Divergence file `semantic-index.md` |
| The project producer's `source_set.contains` (`project/producer.rs:210`, `:273`, `:356`) | `exists` | No |
| Stage parse: `read_jobsets` (`stages/parse.rs:329`) | `list("", [".kicad_jobset"])` | No |
| Stage parse: `read_target` of a directory reference (`stages/parse.rs:786`) | `list(path, [])` | No |
| Stage parse: `read_checked` and `default_config` call `tree.contains` | `exists` | No |
| `model-unavailable`: a model in the key that K could not materialize | Unchanged. A bundle with this warning is never reused (§3.3) | No |

After K2a, no producer and no stage calls anything but the three queries. A test asserts that `SourceTree` has no other public accessor reachable from `prism-projections`.

### 3.3 Reuse: when a read set holds

A stored bundle `B` serves revision key `K` of the same project when all of the following hold:

1. `B`'s `config` digest equals `K`'s, and `B`'s generator digest is the current one.
2. `B`'s stage parse has no `model-unavailable` warning. The warning depends on which objects the worker could fetch, not on the key, so such a bundle is never reused.
3. **Reads:** every source member of `B` has an entry in `K`'s record with the same `path`, `kind` and `object_id`. A file inside a submodule needs its gitlink entry at the same commit.
4. **Probes:** each probe's path is selected in `K` exactly when the probe says it was present.
5. **Listings:** each listing, evaluated on `K`'s selected entries, returns exactly the recorded paths.

Notes on the rule:

- **Cost.** The check needs only `K`'s key record, which K already has, and `B`'s `bundle.json`. No blob is read and nothing is parsed.
- **`prism-kicad bundle reuse --in <B.prism> --key-record <K.json>`** runs the check. It replaces U's `bundle rekey`. It prints `CliReuseResultA0`: whether the read set holds and, when it does not, the first failing condition. It exits 0 either way, because exit 1 means an internal error (cli-spec.md §4); the full rule is cli-spec.md §5.10. One implementation, in Rust, keeps the rule in one place.
- **Budget:** ≤ 0.2 s per candidate on EDA-04903.
- **Why it is sound.** Stage parse is deterministic in its inputs (parent §7). Its inputs are the read set's bytes, the configuration and the generator. Under §3.5, stages board and models are too.

### 3.4 Recording in `bundle.json` (manifest a3)

`bundle.json` gains `read_set`:

```json
"read_set": {
  "probes":   [{"path": "lib/fp-lib-table", "present": false}],
  "listings": [{"directory": "", "suffixes": [".kicad_jobset"], "paths": ["ci/release.kicad_jobset"]}],
  "gitlinks": [{"path": "lib/kicad-libraries", "commit": "3f2a…"}]
}
```

- Reads are not repeated there: they are the source members, whose `source` entries already carry path, kind and object id.
- `gitlinks` lists every submodule a read, probe or listing reached into, with its commit. The key record holds only the gitlink, not the files below it, so the commit is what pins them (added while writing the contracts).
- **New invariants for `bundle verify`:**
  - **I13:** `probes` is sorted by `path` without duplicates. `listings` is sorted by `directory`, then `suffixes`, without duplicates. Each listing's `suffixes` and `paths` are sorted.
  - **I14:** when `--key-record` is given, the read set holds in the build's own key record (§3.3, conditions 3–5).
- **Determinism.** Producers run in parallel, so the recording is a set, sorted at write time, never a log in call order.

### 3.5 Later stages run on the archive's sources

- For stages board and models, K materializes `$JOB/src` from the archive's `sources/`, not from the revision key.
  - The source members hold the upgraded bytes, which is what the refill and the export read today.
  - The rest of cli-spec.md §9.1 is unchanged.
- The GLB cache key becomes the bundle key (cli-spec.md §9.3 step 2). The archive pins the board and every model file the export can resolve.
- If an export from `sources/` lacks a model body that today's export from the whole tree finds, the project producer's model resolution has a gap. The fix goes there, because Release Studio already runs KiCad on `sources/` and has the same gap.

### 3.6 Identity

- **No member carries a revision key.** The semantic index's `sourceRevisionKey` becomes `designKey` (`prism.semantic_index.a2`):

  ```text
  designKey = lowercase-hex(SHA-256("prism.design_key.a0" NUL config_digest NUL R))
  ```

  - `R` is the canonical read set, defined in bundle-format.md §2.3: the source members, probes, listings and gitlinks, each as a tagged, tab-separated record ending in NUL.
  - The generator is not in it, so anchors survive Prism upgrades that read the same files.
- **`bundle.json` keeps `revision_key` and `bundle_key`.** They name the build that produced the archive, and its store path. An alias points other revision keys at that bundle key.
- **The requested revision comes from the request.**
  - `prism-kicad compare` takes each side's revision key from `--base-revision-key` and `--head-revision-key` in both modes. `bundle_key` still comes from the archive. The two modes then agree through an alias.
  - The backend's status routes report the commit and revision key that were asked for, not the archive's (K2b).
- **Existing comment anchors** hold 64-hex revision keys (C1). K2b maps each one to its design key once, through the alias table and the stored bundles. An anchor whose bundle is gone keeps its key and is shown as on an older design, as today.

### 3.7 Contract changes (WP-K2a)

- `bundle-format.md`:
  - §2.2: the read set and the archive-sourced later stages;
  - §3.4: I13 and I14.
- `prism.bundle.manifest.a3` (`bundle-manifest-a3.tsp`): `read_set`, and the field map.
- `prism.semantic_index.a2`: `designKey` replaces `sourceRevisionKey`, and the field map.
- `cli-spec.md`:
  - §5.2.2: the recording;
  - a new §5.10: `bundle reuse`;
  - §5.6: the compare revision-key arguments;
  - §9.1 and §9.3: `$JOB/src` from `sources/`, and the GLB cache key.
- `revision-key.md` §10: the alias table, `(project_id, revision_key) → bundle_key`, with `algorithm` and the generator digest.
- The generator id is bumped.

## 4. Work packages

### K2a (native)

- Owns:
  - the `Sources` queries and every move in §3.2, including the semantic-index divergence file (the board-objects scope is D11 already);
  - the recording and `read_set`;
  - `bundle reuse`;
  - `designKey`;
  - the compare arguments;
  - the contracts of §3.7.
- Starts after perf items 2, 3 and 5 land, because it touches the same producers.
- **Accept:**
  - the 21 bundle-gate source trees build. The only differences from the baseline are the generator, `read_set`, `designKey` and the two documented scope fixes. Every other member is byte-identical;
  - `bundle reuse` is exercised on synthetic trees built from the C2r pairs. It holds for a change to an unrelated project, and fails for each of:
    - a sheet change;
    - a library-table change;
    - a board change;
    - a new jobset;
    - a new `fp-lib-table` where a probe had found none;
    - a new `.kicad_sch` inside a referenced directory;
  - `compare` gives byte-identical results in bundle and source-tree mode on all 18 pairs, with the revision-key arguments;
  - budgets: stage `parse` no slower than before K2a; `bundle reuse` ≤ 0.2 s on EDA-04903.

### K2b (backend)

- Owns:
  - the background prebuild after sync (U §3.3);
  - the alias table, its lookup and retention: an archive is kept while an alias references it;
  - candidate selection: bundles of the same project, configuration digest and generator, starting with the bundle of the commit's first parent, then the branch's newest;
  - the later stages on `sources/` (§3.5);
  - the status routes' identity (§3.6);
  - the comment-anchor migration.
- **Accept:**
  - the prebuild runs paced on a sync of EDA-04903's repository;
  - the reuse rate is reported over the last 20 commits of each C2r pair's branch;
  - a commit that changes only an unrelated project is served from the previous archive, all stages included;
  - a GLB built from `sources/` equals the one built from the whole tree on every bundle-gate tree that has models;
  - a comment posted on one commit shows as current on a later commit that leaves the design unchanged.

## 5. What it costs

- **Generator bump:** every stored bundle is rebuilt once, through the paced backfill (parent §8).
- **Semantic index a2:** C1's readers (the frontend's cross-probe guard and the comment anchor service) switch from `sourceRevisionKey` to `designKey`.
- **Nothing else changes for a consumer.** Members keep their bytes apart from the fields listed in §4.

## 6. Text changes applied with this amendment

- Amendment U §3.3: "Stages after `parse`" is replaced by a pointer to §3.5. §4's K2a and K2b ownership and acceptance lists point to §4 here.
- Parent ADR: status line, and §10 item 9.
- `decisions.md`: a section for this amendment.
