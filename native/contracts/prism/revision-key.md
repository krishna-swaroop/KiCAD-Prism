# Design revision key (`prism.revision_key.a1`)

- **Status:** W0 draft for maintainer review. Once accepted, a change to anything normative here is a new key version (`a2`) and an ADR amendment, because it changes every stored key.
- **Parent:** [ADR §5](../../../docs/architecture/adr-native-design-bundle.md) (revision key and storage), §4.4 (staged data flow), §11 G3–G6.
- **Contract:** [`tsp/prism/revision-key-a1.tsp`](../../src/tsp/prism/revision-key-a1.tsp): `RevisionKeyEffectiveConfigA1`, `RevisionKeyRecordA1`, `RevisionKeyVectorsA1`. Field map: [`field-maps/revision-key.md`](field-maps/revision-key.md).
- **Vectors:** [`revision-key-vectors.json`](revision-key-vectors.json) (30 selection vectors, 7 hashing vectors, 13 key relations).
- **Implemented by:** WP-K (Python reference in `backend/app/services/design_bundle/`, effective-config resolution, commit index) and WP-B (Rust reference in `prism-kicad revision-key`). Both must reproduce every vector before anything else uses the key.

Citations follow [conventions.md](conventions.md): a bare path is this repository (`dev`), `sim:` is prism-sim-studio. The words MUST, MUST NOT and MAY are normative.

## 1. What the key is

The design revision key identifies the inputs of one design bundle: which KiCad project, configured how, made of which file contents. It is

```text
revision_key = lowercase-hex( SHA-256( preimage ) )      64 characters, never truncated
```

where the preimage (§8) frames three things: the repository's object format, the canonical bytes of the effective project configuration (§4), and the source set (§5): every selected `(mode, type, object id, path)` from the repository's tree, sorted.

Properties every implementation must keep:

1. **Cheap.** A commit's key needs one `git ls-tree` and no checkout and no blob reads (§3). The effective config needs one small blob (`.prism.json`), read by Prism, not by the key computation.
2. **Content-addressed.** The same configuration and the same tree content give the same key, from a commit or from a working tree (§9).
3. **Complete.** Any change to a selected entry (its path, mode or object id) or to the effective config changes the key.
4. **Host-free.** No wall-clock time, host path, user, machine or tool version enters the key. The generator is not in it either: the bundle key adds it (ADR §5).

## 2. Today's keys (what this replaces)

| Consumer | Key today | Source set | Gaps the a1 key closes |
|---|---|---|---|
| Semantic index | `sha256(project_file_rel \0 (path \0 blob \0)*)[:32]` (`backend/app/services/semantic_index_service.py:90-102`) | `SEMANTIC_SOURCES` under the project directory: `.kicad_pro`, `.kicad_sch`, `.kicad_pcb`, `.kicad_sym`, `.kicad_mod`, `.prism.json` (`backend/app/services/project_revision.py:255-260`); commit: `ls-tree -r -z -- <dir>/`, blobs only (`semantic_index_service.py:118-155`); working tree: every file under the directory, ignored files included (`:105-115`) | Working-tree blob ids are SHA-1 of the raw bytes (`:77-87`): no clean filter, so an LFS file or a CRLF checkout never matches its commit; a SHA-256 repository would mismatch too. No worksheet, rules, jobset or models; nothing outside the project directory; gitlinks and modes ignored; stored Prism settings not in the key. On USB-PD-Trigger-Board `HEAD` it selects 4 entries, a1 selects 9. |
| 3D tab | `sha256(project_file_rel \0 (path \0 bytes \0)*)[:32]` (`backend/app/services/semantic_visualizer_service.py:166-212`); commit index `{commit}:{project_rel}:{BUILD_FINGERPRINT}` → fingerprint (`:469-542`) | `SOURCE_SUFFIXES` (`:67-81`), which includes every `.json`; under the project directory | Needs a checkout to compute (`:424-433`); files over 32 MB are keyed by size and mtime (`:197-199`), not content; no stored settings. |
| Design Comparison | `(project_id, sha256(anchor)[:16], commit, generator tag)` (`backend/app/services/design_compare_service.py:107-127`) | `COMPARE_INPUTS` scoped to the project directory, skipping top-level `assets`, `docs`, `packages3D`, outputs (`project_revision.py:264-284`) | A commit that changes nothing in the design still misses; misses a worksheet under `assets/` (USB-PD-Trigger-Board keeps its worksheet there). |
| Release Studio | closure digest over the full repository tree, gitlinks expanded, LFS hydrated and verified (`backend/app/release_studio/closure.py:329-411`, `:515-647`) | everything committed | — (kept for Release Studio's own evidence; a1 reuses its LFS and gitlink rules, §7) |
| System Builder | `(project_id, commit, EXTRACTOR_VERSION)` (`backend/app/services/systems/store_reviews.py:321-336`, `systems/jobs.py:23-24`) | — | Commit-keyed: no reuse across commits; stored settings not in the key. |

Effective configuration today (G6): settings stored in Prism (`ws_projects.path_settings`, `backend/app/services/project_settings_service.py:83-101`) win over the committed `.prism.json` (`projects.<anchor>` over the shared block, `backend/app/services/path_config_service.py:222-241`), which wins over detection and defaults (`path_config_service.py:532-589`). At a commit, `project_revision.path_config_at` reads only the committed `.prism.json` plus defaults and ignores stored settings (`project_revision.py:508-532`). The anchor is `ws_projects.project_file_rel` (`backend/app/services/workspace_migrations/m020_project_file_anchor.py:12-28`), relative to the project directory.

## 3. The listing

### 3.1 Commit mode

```sh
git -C <repository top level> ls-tree -r -z --full-tree <commit id>
```

- `<commit id>` is the full id `git rev-parse --verify --end-of-options <rev>^{commit}` printed (as `project_revision.resolve_commit` does, `project_revision.py:142-155`). The record's `source.commit` holds it.
- The object format is `git rev-parse --show-object-format` (`sha1` or `sha256`).
- Output: zero or more records, each exactly `<mode> SP <type> SP <object id> HT <path> NUL`. `<mode>` is six octal digits, `<type>` is `blob` or `commit` (`-r` without `-t` never prints trees), `<object id>` is 40 or 64 lowercase hex, `<path>` is raw bytes with no quoting (`-z`). Split records at NUL and each record at the **first** HT; the path may itself contain HT, LF or any byte except NUL.
- Git canonicalizes modes when it reads a tree, so legacy `100664` entries print as `100644`.
- Gitlinks print as `160000 commit <id>`; the submodule's own tree is not listed and is not read.

### 3.2 Working-tree mode

See §9. It produces the same record shape from the files on disk.

## 4. The effective configuration (`RevisionKeyEffectiveConfigA1`)

Everything outside the source files that changes which files are the project or how they are read. It is hashed into the key and recorded in the bundle manifest (ADR §5, §6).

| Field | Meaning |
|---|---|
| `schema` | `"prism.revision_key.effective_config.a1"` |
| `project_file` | Repository-relative path of the resolved `.kicad_pro`: the **anchor** (G5). Its directory is KiCad's `KIPRJMOD`. |
| `root_schematic` | Optional. Repository-relative path of the root schematic the build parses. |
| `board` | Optional. Repository-relative path of the board the build parses. |
| `excluded_dirs` | Repository-relative directories whose entries are never selected: Prism's design-output and manufacturing-output directories. May be empty. |
| `zone_fills` | Optional. `"saved"`: the board stage uses the zone fills saved in the board instead of refilling with pcbnew (`cli-spec.md` §5.2.3). Absent means refill, the default. It changes the board stage's output, so it is in the key: the choice is deterministic per key. |

Deliberately **not** in it: the other Prism path fields (`subsheets`, `jobset`, `documentation`, `thumbnail`, `readme`) and `project_name`, `description`, `workflows`, `portfolio` (`path_config_service.py:92-106`). They select nothing the build parses. Every `.kicad_jobset` and every sheet is in the source set anyway (§5), so the bundle has them; which jobset Release Studio runs is Release Studio's own configuration.

### 4.1 Validation

A config that breaks any rule is the error `config-invalid`:

1. It validates against `RevisionKeyEffectiveConfigA1` (sealed: no other field). Every path is a `RepoPath`; every string is well-formed Unicode. A JSON string holding a lone surrogate (`"\ud800"`) is invalid: Python's `json.loads` and JavaScript's `JSON.parse` both accept one, so readers MUST check (`str.encode("utf-8")` raises in Python; `String.prototype.isWellFormed()` in JavaScript).
2. The last segment of `project_file` ends in `.kicad_pro`, of `root_schematic` in `.kicad_sch`, of `board` in `.kicad_pcb`, compared ASCII case-insensitively (§6).
3. `excluded_dirs` is strictly increasing in UTF-8 byte order (so it has no duplicates), and no element lies under another (`b` starts with `a + "/"`).
4. No element of `excluded_dirs` equals or contains (`p` starts with `d + "/"`) `project_file`, `root_schematic` or `board`.
5. `zone_fills`, when present, is `"saved"`. The schema's enum also names `refill`, the meaning of the absent field, but a config never spells it: an explicit `"zone_fills":"refill"` is `config-invalid` (vector `error-config-zone-fills-refill`).

Readers MUST reject an out-of-order `excluded_dirs` rather than sort it, and an explicit `refill` rather than drop it, so every config has exactly one spelling.

### 4.2 Canonical config bytes

The bytes hashed (§8) and digested (§10) are the compact JSON text of the validated config, UTF-8, no BOM, no trailing newline:

```text
{"schema":"prism.revision_key.effective_config.a1","project_file":S[,"root_schematic":S][,"board":S],"excluded_dirs":[S(,S)*][,"zone_fills":"saved"]}
```

- Keys in exactly this order; an absent optional field is omitted; `excluded_dirs` is always present (`[]` when empty), its elements in their (validated) order.
- `zone_fills` comes last, so a config without it has the same canonical bytes as before the field existed, and every key computed without it is unchanged (every vector without it reproduces, checked by recomputation).
- No whitespace anywhere outside strings.
- `S` is a JSON string: `"`, then each code point of the value, then `"`. `"` is written `\"`, `\` is `\\`, U+0008 `\b`, U+000C `\f`, U+000A `\n`, U+000D `\r`, U+0009 `\t`, any other U+0000–U+001F `\u00XX` with **lowercase** hex. Every other code point, including U+007F, U+2028, U+2029 and all non-ASCII, is written raw as UTF-8. `/` is not escaped. (`RepoPath` excludes `\`, but the rule covers it.)
- These are exactly the bytes of Python `json.dumps(obj, ensure_ascii=False, separators=(",", ":"))` with keys inserted in this order, of JavaScript `JSON.stringify(obj)` with keys inserted in this order, and of `serde_json::to_vec` of a struct declared in this order with `skip_serializing_if = "Option::is_none"`. The `hash-escaping` vector pins the escapes.
- The bytes contain no NUL (JSON escapes U+0000), which the framing relies on.

### 4.3 Default config (no `--config`)

`prism-kicad revision-key` without `--config` uses KiCad's own association by stem (the rule sim's prism-bundle applies, sim: `src/prism-bundle/src/sources.rs:1-4`):

- `project_file` = the `--project` argument;
- with `dir` its parent (`""` at the root) and `stem` its last segment minus the trailing `.kicad_pro` (ASCII case-insensitive): `root_schematic` = `dir/stem.kicad_sch` and `board` = `dir/stem.kicad_pcb`, each present only when that exact path is a selected non-gitlink entry;
- `excluded_dirs` = `[]`;
- `zone_fills` absent (refill).

Prism always passes `--config`; the default exists for development and the future MCP server.

### 4.4 Resolution by Prism (WP-K; normative for K only)

K computes the config by one function of three inputs: the project row, the revision's listing (§3 or §9), and the bytes of `<project dir>/.prism.json` at that revision (absent when the listing has no such blob). It MUST be the same function for a commit and for a working tree. Otherwise identical content gets two keys. It MUST NOT read the filesystem: today's working-tree detection (`path_config_service.py:574-581`) walks directories, which a commit cannot reproduce.

1. **Settings.** Start from `config_for_anchor(<parsed .prism.json>, anchor)` (`path_config_service.py:222-241`). Override it key by key with the stored settings (`ws_projects.path_settings`; fields `project_settings_service.STORED_FIELDS`, `project_settings_service.py:42`). This applies at commits too, which `path_config_at` does not do today (G6). Blank strings are unset (`path_config_service.py:130-146`). Unset `schematic`, `pcb`, `designOutputs` and `manufacturingOutputs` take `DEFAULT_PATHS` (`path_config_service.py:22-32`).
2. **`project_file`.** Exactly `<project dir>/<project_file_rel>`, the stored anchor. There is no fallback: today's `find_kicad_project` (`backend/app/services/semantic_visualizer_service.py:115-157`) also tries the settings' `project`/`project_file` key, the stem of the configured board or schematic, the first `.kicad_pro` in the project directory and the first below it. Those attribute a project by directory, the bug of issue #681 (conventions.md §8).

   If the anchor is not a `.kicad_pro` blob in the listing, the project is **absent at this revision**: the outcome `project-absent` (§5.3, §11). K records it, with no key and no bundle. It is not a failure, and K does not raise it as one.

   First-import detection, which chooses `project_file_rel` when a project is created, may still use `find_kicad_project`. Keying never does.
3. **`root_schematic`, `board`.** `resolve_paths` (`path_config_service.py:592-668`) over the listing, attributing by anchor only. A board or schematic whose stem differs from the anchor's therefore needs an explicit path setting; that is accepted (maintainer decision). K's first-deploy backfill flags each project whose board or schematic no longer resolves, rather than picking a file:
   - a plain value must name a blob. It is explicit, so it may name a file in any directory;
   - a glob value is matched against the blob paths directly in the project directory and resolves only to the match whose stem equals the anchor's stem, compared case-insensitively as today. That is KiCad's own pairing. Today's directory fallbacks for a glob are not applied: the first board left after removing sibling projects' stems, a schematic named after another `.kicad_pro` or after the directory, and a lone schematic (`:315-359`, `:632-655`);
   - no match leaves the field absent.

   Two projects in one directory therefore each get their own files: with the default globs, `fixture/top.kicad_pro` gets `fixture/top.kicad_sch` and `fixture/top.kicad_pcb`, and `fixture/base.kicad_pro` gets the `base` pair, whatever else the directory holds.
4. **`excluded_dirs`.** Take `designOutputs` and `manufacturingOutputs` and join each to the project directory. Normalize them, and drop any value that:
   - is empty or absolute;
   - escapes the repository with `..`;
   - contains a glob character (`*`, `?`, `[`);
   - would contain the project file, root schematic or board.

   Then drop elements nested in another, and sort by UTF-8 bytes. A configured output directory is excluded whether or not it exists at this revision.
5. **`zone_fills`.** From the stored setting `zone_fills` (in `ws_projects.path_settings`) alone; it is a Prism setting, not a path, and the committed `.prism.json` does not set it. Today's `STORED_FIELDS` (`project_settings_service.py:42`) has no such key: K adds `"zone_fills"` to it, and K's settings API accepts only `"saved"` or unset. Stored `"saved"` gives `zone_fills: "saved"`; unset or blank leaves the field absent (refill). Changing the setting changes the key, so a project's bundles are rebuilt under the new choice.

## 5. The source set (selection)

### 5.1 Decision

**The source set is repository-wide, by kind.** It holds every tree entry anywhere in the repository whose name marks it as something KiCad or Prism may read for a project. On top of that come every symlink and every gitlink. Entries under the configured output directories, and KiCad autosave files, are left out. The anchor selects the project through the config, not by narrowing the listing.

This is how ADR §5's "every 3D model file under the repository that the board references" is met from `git ls-tree` alone. The key cannot read the board to find its references, so it takes the superset: every 3D-model file in the repository. Models outside the repository are covered separately:

- KiCad's stock library is pinned by the KiCad version in the generator id (G3).
- Any other host path is outside every key and is non-hermetic. Release Studio's closure already reports such paths as `host` or `unreadable` (`backend/app/release_studio/closure_models.py:120-235`).

Symlinks are all selected because a link (`3d -> ../lib/models`) can redirect a model reference without any model blob changing. Gitlinks are all selected because a submodule's commit pins its models, sheets and libraries exactly. LFS files contribute their pointer blob (§7).

The cost is churn in multi-project repositories:

- A change to any project's design files changes every project's key in that repository.
- In this repository, the `fixtures/release-studio/usb-pd` project selects 216 of 3,093 entries, because 33 fixture projects live in one tree.
- Q1 is decided (§12): repository-wide for a1. The `excluded_dirs` field lets Prism narrow the set later by policy without a new key version.

### 5.2 Name rules

Matching uses the entry's **name**, the bytes after the last `/` of its path. Before comparing, map ASCII `A`–`Z` to `a`–`z` (§6). The rules, in order:

| # | Rule on the lowered name | Category |
|---|---|---|
| A | starts with `_autosave-`, `_autosave_`, `~autosave-` or `~autosave_` | **not selected** (KiCad autosave; `backend/app/services/kicad_noise_service.py:56`) |
| N1 | equals `fp-lib-table` or `sym-lib-table` | `library-table` |
| N2 | equals `.prism.json` | `prism-settings` |
| S1 | ends with `.kicad_pro` | `kicad-project` |
| S2 | ends with `.kicad_sch` | `kicad-schematic` |
| S3 | ends with `.kicad_pcb` | `kicad-board` |
| S4 | ends with `.kicad_dru` | `kicad-design-rules` |
| S5 | ends with `.kicad_wks` | `kicad-worksheet` |
| S6 | ends with `.kicad_jobset` | `kicad-jobset` |
| S7 | ends with `.kicad_sym`, `.lib` or `.dcm` | `symbol-library` |
| S8 | ends with `.kicad_mod` | `footprint` |
| M | ends with one of `.step` `.stp` `.stpz` `.stepz` `.step.gz` `.stp.gz` `.wrl` `.wrz` `.vrml` `.x3d` `.igs` `.iges` `.idf` `.emn` `.wings` | `model-3d` |
| L | (no rule above matched) the entry is a symlink | `symlink` |

Sources of the lists:

- S1–S6 and N1–N2 are ADR §5's list, which is `COMPARE_INPUTS` (`project_revision.py:264-284`).
- S7–S8 add the project libraries (Q2):
  - `SEMANTIC_SOURCES` already keys on `.kicad_sym` and `.kicad_mod` (`project_revision.py:255-260`);
  - the 3D tab keys on `.lib` and `.dcm` (`semantic_visualizer_service.py:67-81`);
  - KiCad's DRC and ERC library-parity checks read the libraries the tables name.
- M is the union of `_MODEL_SUFFIXES` and `_LOADABLE_SUFFIXES` (`closure_models.py:46-60`).

`.kicad_prl`, `-bak` files, `fp-info-cache`, backups (`*-backups/*.zip`), images and documents match no rule. Unlike `is_generated` (`project_revision.py:181-203`), there is **no** directory-name exclusion (`archive/`, `backup/`, `docs/`, `assets/`): over-inclusion only costs churn, but a wrongly excluded file makes a stale key.

### 5.3 Algorithm

```text
select(listing, config, object_format):
    validate(config)                                   # §4.1, else config-invalid
    X := [utf8(d) for d in config.excluded_dirs]
    seen := {}; selected := []
    for each record (mode, type, oid, path) in listing:      # path: raw bytes
        if path in seen: fail invalid-listing                # a tree never repeats a path
        seen += path
        if oid is not lowercase hex of the object format's length: fail invalid-listing
        kind := KIND[(mode, type)]                           # §7 table
        if kind is undefined: fail unsupported-entry
        if exists d in X with path == d or path starts with d + "/": continue
        name := bytes after the last "/" of path (all of path if none)
        lname := ascii_lower(name)
        if kind == gitlink: category := "gitlink"
        else:
            if lname starts with an autosave prefix: continue        # rule A
            category := first matching rule N1, N2, S1..S8, M; else
                        "symlink" if kind == symlink; else
                        continue                                       # not selected
        if path is not valid UTF-8, or utf8_decode(path) is not a RepoPath:
            fail unrepresentable-path
        selected += {path: utf8_decode(path), kind, object_id: oid, category}
    sort selected by path bytes (unsigned lexicographic; a proper prefix first)
    require config.project_file is the path of a selected entry with kind != gitlink,
        else end project-absent                      # an outcome, not a failure (§11)
    for f in (root_schematic, board) present in config:
        require config.f is the path of a selected entry with kind != gitlink,
        else fail config-path-missing
    return selected
```

Notes:

- Every listing record is checked for its kind and id, selected or not: a malformed record anywhere fails the key.
- Selection depends only on mode, type and path, never on object ids. An implementation MAY therefore hash only the selected paths in working-tree mode (§9).
- A path that is not a RepoPath fails only if it is selected. Examples are a `:` or `\` in a name (legal in a git tree on Linux and macOS) and invalid UTF-8. Such a project cannot have a bundle at all, because `sources/` uses ArchivePath, which has the same character rule (`common.tsp`). Unselected paths are never decoded.
- `git ls-tree -r` prints records in this same byte order. That held for every listing in the vectors, including non-ASCII ones. Implementations MUST still sort.
- `project-absent` covers a project file that is not in the listing, a gitlink, or excluded by rule A: in each case the anchor is not a project file of this tree. It is the project-absent outcome (§11), not a failure.
- Nothing in selection attributes a file to the project by its directory. The source set is repository-wide; the project's own files are exactly `project_file`, `root_schematic` and `board` as the config names them.

## 6. Paths

- **Bytes, as git stores them.** A path is hashed and compared as the exact bytes of the tree entry. There is no Unicode normalization (NFC/NFD), no case folding, no trimming and no separator conversion. Git paths always use `/`; a `\` is an ordinary byte, and it makes the path unrepresentable (§5.3).
- **NFC and NFD are different paths.** A tree can hold both spellings of `Résumé.kicad_sch`, and they are two entries (vector `unicode-nfc-nfd-spaces`). A config that spells the project file in NFD while the tree holds NFC gets `project-absent` (vector `error-project-file-nfd-mismatch`). Implementations MUST NOT normalize paths read from git, from the config or from JSON. Watch out for macOS file APIs and any JSON layer that normalizes strings.
- **macOS working trees.** With `core.precomposeUnicode=true`, the macOS default, git precomposes names it reads from the filesystem and from its command line to NFC. It also stores them that way, so `git add` of a file named in NFD commits NFC. The working-tree algorithm (§9) uses git's own listing, so it follows git's behaviour whatever that setting is (cases `wt5-nfd-precompose-true/false` in §13). Prism's worker runs on Linux, where git never normalizes.
- **JSON form.** In records and vectors a path is the UTF-8 decoding of its bytes. Every selected path is valid UTF-8 (§5.3), so the decoding is lossless and reversible.
- **Case.** Only the name rules (§5.2) and the config suffix checks (§4.1) are case-insensitive, and only for ASCII. In Python that is `bytes.lower()`, never `str.casefold()`. In Rust it is `to_ascii_lowercase`. JavaScript must map bytes 0x41–0x5A, not use `toLowerCase()`.
- **Order.** UTF-8 byte order equals Unicode code point order. It is **not** UTF-16 code-unit order, which JavaScript's default `sort()` and `localeCompare` use. Vector `hash-sort-order` puts U+FF5E (`EF BD 9E`) before U+1F600 (`F0 9F 98 80`), the reverse of their UTF-16 order.

## 7. Entry kinds

| `kind` | git mode | git type | `object_id` | Hashed as |
|---|---|---|---|---|
| `regular` | `100644` | `blob` | blob id of the content (after clean filters, §9) | `100644 blob <id>` |
| `executable` | `100755` | `blob` | blob id | `100755 blob <id>` |
| `symlink` | `120000` | `blob` | blob id of the link target text (no trailing newline) | `120000 blob <id>` |
| `gitlink` | `160000` | `commit` | the commit the gitlink records | `160000 commit <id>` |

Any other `(mode, type)` is `unsupported-entry`. Because the mode is hashed, a change of the executable bit changes the key (vector `usb-pd-executable-mode`). So does a regular file becoming a symlink to the same text: the blob ids are equal, but the modes differ.

**Git LFS.** An LFS-tracked file is committed as a pointer blob. The pointer is `version https://git-lfs.github.com/spec/v1`, `oid sha256:<hex>`, `size <n>` (the format `closure.py:714-737` parses). Its entry is an ordinary `regular` (or `executable`) entry whose id is the **pointer's** blob id. Recognising a pointer would mean reading blobs, so the key never does. A new LFS object gives a new pointer and so a new key (vector `links-lfs-object-change`). Hydration is the bundle build's job (G4). It works as Release Studio's `_hydrate_lfs` does (`closure.py:740-765`), and fails when the content is not available.

**Gitlinks.** The commit id pins the submodule's tree. The key does not read or expand it. `project_revision.materialize` skips gitlinks today (`project_revision.py:409-410`). Release Studio expands them recursively from the submodule's worktree (`closure.py:548-584`), and the bundle build reuses that.

## 8. Hashing

The preimage is the concatenation, with no separators other than those shown (`NUL` = byte 0x00, `SP` = 0x20, `HT` = 0x09):

```text
"prism.revision_key.a1" NUL
"object-format" SP FORMAT NUL                 FORMAT = "sha1" | "sha256"
"config" SP CANONICAL_CONFIG NUL              §4.2
"entries" SP COUNT NUL                        COUNT = number of entries, ASCII decimal, no sign, no leading zeros
ENTRY_1 ... ENTRY_COUNT                       sorted by path bytes (§5.3)

ENTRY = MODE SP TYPE SP OBJECT_ID HT PATH NUL   one `git ls-tree -z` record, byte for byte (§3.1, §7)
```

- `revision_key` = lowercase hex SHA-256 of the preimage, 64 characters.
- `config_digest` = lowercase hex SHA-256 of `CANONICAL_CONFIG` alone.
- The framing is unambiguous. Every field ends in NUL. The literal fields have fixed alphabets. The config and the paths contain no NUL (§4.2; git forbids NUL in paths). `PATH` is the raw bytes, **not** JSON-escaped.
- `COUNT` ≥ 1, since the project file is always selected. A selection that would be empty has already ended with `project-absent`.
- An implementation that has the `ls-tree -z` records MAY hash the selected records verbatim, after sorting. That is the reason for the record format.

Worked example (vector `hash-minimal-config`, SHA-1, one entry). The preimage, with NUL shown as `\0`:

```text
prism.revision_key.a1\0object-format sha1\0config {"schema":"prism.revision_key.effective_config.a1","project_file":"only.kicad_pro","excluded_dirs":[]}\0entries 1\0100644 blob dddddddddddddddddddddddddddddddddddddddd\tonly.kicad_pro\0
```

```text
config_digest = b668333e4acd33d4094d69236bbf0e2d7fe5d9ad561b644c48dcffb2190e300b
revision_key  = 5419bf612f52765cf095ae49f967ca92b47ffce6fb227bc8b0ff811569745d01
```

## 9. Working tree

**Definition.** The working-tree key is the key of the tree that `git add -A` would stage into a copy of the index, then `git write-tree`. It is computed without writing an index or an object. Consequences:

- `git add -A && git commit` gives a commit whose key equals the working-tree key, for any content.
- A clean working tree has the key of `HEAD`.
- Tracked and untracked-not-ignored files count. Ignored files, including those ignored by `core.excludesFile`, do not (Q4). A deleted tracked file is absent.
- Clean filters apply, as `git add` applies them: Git LFS `clean`, `text`/`eol`/`core.autocrlf` normalisation, `ident` and `working-tree-encoding`. A CRLF checkout of an LF-committed file therefore keeps its key. Today's raw-byte `_blob_id` (`semantic_index_service.py:77-87`) does not (case `wt2-eol-crlf`).
- The key depends on the git configuration in effect, exactly as `git add` does. That includes `core.autocrlf`, the `filter.lfs.*` drivers, `core.excludesFile` and `core.precomposeUnicode`. The CLI runs git in a sanitized environment (CLI spec §5.5: empty environment, `GIT_CONFIG_NOSYSTEM=1`, an empty `HOME`). Only the repository's own configuration applies there, plus the LFS filter set on the command line (below).

**Algorithm** (reads only, run with `git --no-optional-locks`):

1. Refuse an index that has entries flagged skip-worktree or assume-unchanged (`git ls-files -z -v --cached`: tag `S`, or any lowercase tag), with error `worktree-unsupported-index`. `git add -A` treats those entries specially, and Prism's checkouts never have them.
2. Candidates are:
   - the index paths, from `git ls-files -z --stage`, using the stage-0 entry, or any stage of an unmerged path;
   - plus `git ls-files -z --others --exclude-standard`. A path from this list ending in `/` is an untracked embedded repository.
3. For each candidate, `lstat` the file:
   - **missing:** skip it (a deleted file).
   - **index mode `160000`, or an embedded repository:**
     - if it is a directory containing `.git`, its entry is `160000 commit <git -C <dir> rev-parse --verify HEAD>`;
     - otherwise, if the index has a gitlink for it (a submodule that is not initialized), use the index entry;
     - otherwise skip it.
   - **symlink:** its entry is `120000 blob <id>`. The id is the blob id of the `readlink` bytes: `git hash-object --stdin` fed those bytes, with no filters. Never `git hash-object <path>`, which follows the link and hashes the target's content.
   - **regular file:** the mode is `100755` if the owner-execute bit (`S_IXUSR`) is set, else `100644`. When `core.fileMode` is false and the path is tracked with a regular mode, keep the index's mode. The id is `git hash-object --path=<path> -- <path>`, which applies the clean filters for that path's attributes. `git hash-object --stdin-paths` does the same for many paths in one process; it is newline-delimited, so hash any path containing LF on its own.
   - **anything else** (a directory where a file was tracked, a FIFO): skip it.
4. The result is a listing in the §3.1 record shape. Selection (§5) and hashing (§8) are unchanged. Since selection depends only on mode and path, an implementation MAY hash only the paths it selects.

**LFS without the filter.** A selected regular or executable entry may have the attribute `filter` set to `lfs` (`git check-attr -z --stdin filter`) while no `filter.lfs.clean` is in effect, for example because git-lfs is not installed. `git hash-object` then hashes the hydrated content, so the key is still correct but differs from the commit's. The record then carries exactly one warning `lfs-filter-unavailable`, however many paths are affected (case `wt3a`). With the filter configured, the keys match (case `wt3b`).

In working-tree mode, an implementation MUST therefore run every `git hash-object` with `-c filter.lfs.clean="git-lfs clean -- %f"` when a `git-lfs` executable is on `PATH`. That is the setting `git lfs install` writes. It works whatever the system and global configuration hold, which the sanitized environment hides. When `git-lfs` is not on `PATH`, the implementation adds no setting and warns as above. The worker image MUST have `git-lfs` on `PATH`.

git-lfs is not installed on the machine that produced the vectors. The `wt3b` case therefore configured a clean filter, in the repository's own configuration, that writes LFS spec v1 pointers. That is what `git lfs clean` does for a file without extensions.

## 10. Commit index

ADR §5: `(project, commit sha, effective-config digest) → revision key`, cached. K owns the table and its migration. One row per computation:

| Column | Type | Notes |
|---|---|---|
| `project_id` | text | Prism project id |
| `commit` | `GitObjectId` | full id |
| `config_digest` | `Sha256Hex` | `config_digest` of the config used |
| `algorithm` | text | `prism.revision_key.a1` |
| `revision_key` | `Sha256Hex` | result |

- Primary key: `(project_id, commit, config_digest, algorithm)`. A row is immutable: a commit's tree never changes, and the digest captures the settings. Rows go only with retention (ADR §5).
- Lookup: resolve the commit, then resolve the effective config at that commit (§4.4, which needs the listing and the `.prism.json` blob), then digest it. On a hit, the key comes without selection or hashing. On a miss, compute and insert.
- Because the config needs the listing, the index saves little time per lookup. Its value is the durable record:
  - which keys the branch heads, pinned System Builder commits and Release Studio candidates use (retention);
  - which commits share a key (reuse across commits that do not touch the design).
- K MAY memoize the effective-config resolution itself, keyed by `(project_id, commit, sha256 of the stored settings and anchor)`. That cache is K's own, not part of this contract.
- A working-tree key is never indexed: it has no commit.

**Alias table** (ADR amendment K2 §3.3, §3.6). A revision key that a stored bundle serves without being built for it gets one row:

| Column | Type | Notes |
|---|---|---|
| `project_id` | text | Prism project id |
| `revision_key` | `Sha256Hex` | the key that has no archive of its own |
| `algorithm` | text | `prism.revision_key.a1` |
| `generator_digest` | `Sha256Hex` | the generator of the archive it points to |
| `bundle_key` | `Sha256Hex` | that archive's `bundle_key`; its store path follows from the archive's own `revision_key` |

- Primary key: `(project_id, revision_key, algorithm, generator_digest)`. A row is written only after `prism-kicad bundle reuse` held for the key's record against that archive (cli-spec.md §5.10), and it is immutable.
- Lookup: a consumer that has a revision key looks for its own archive first, then for an alias row. Either way, the revision it reports is the key it asked for, never the archive's.
- Retention keeps an archive while any alias row points to it. A generator bump starts new rows; old rows go with their archives.
- The revision key itself is unchanged: aliasing never changes a stored key or the algorithm.

## 11. `prism-kicad revision-key` and its record

```text
prism-kicad revision-key <repo> (--commit <rev> | --worktree) --project <rel> [--config <effective.json>]
```

The command-line surface, exit codes, stderr diagnostics and limits belong to the CLI spec. This contract fixes the semantics:

- `<repo>` is the repository's top-level directory. A bare repository supports `--commit` only. A path that is not a repository fails with `repo-not-found`.
- Exactly one of `--commit <rev>` and `--worktree` is required. Giving neither is a usage error: there is no default, because K always knows which one it means, and a silent `HEAD` would key a dirty working tree as its commit.
- `--project` is the repository-relative project file. It must be a `RepoPath` ending in `.kicad_pro`; otherwise the command fails with `config-invalid`. With `--config`, it MUST equal `config.project_file` byte for byte; otherwise the command fails with `config-mismatch`, the CLI spec's code for two inputs that are each valid but do not agree.
- The command reads no KiCad file and parses nothing. It runs `git` only, and selection is by name (§5). So the CLI's parser limits and content failures (`source-unparseable` and the like) cannot occur here; only its process limits apply (`timeout-ms`, `max-memory-bytes`, `max-config-bytes`).
- `--config` is a `RevisionKeyEffectiveConfigA1` document in any JSON formatting. It is parsed, validated (§4.1) and re-serialized canonically.
- On success, stdout is one `RevisionKeyRecordA1`: compact JSON, then LF (conventions.md §13). `entries` are in hashing order, `counts` per category, `warnings` sorted by code then message.

Errors (each fails the command, nothing on stdout). The exit codes are the CLI spec's (`cli-spec.md` §4):

- `project-absent` is not an error: exit 10, below;
- `config-mismatch` is precondition (7);
- `git-failed` is internal (1), which K retries;
- every other code is input (3).

| Code | When | Layer |
|---|---|---|
| `config-invalid` | §4.1; `--project` not a `.kicad_pro` `RepoPath` | pure |
| `config-mismatch` | `--project` ≠ `config.project_file` | CLI |
| `project-absent` | §5.3; an outcome, exit 10 (below) | pure |
| `config-path-missing` | §5.3 | pure |
| `unrepresentable-path` | §5.3 | pure |
| `unsupported-entry` | §5.3, §7 | pure |
| `invalid-listing` | duplicate path; object id of the wrong format | pure |
| `worktree-unsupported-index` | §9 step 1 | git |
| `repo-not-found` | `<repo>` is not a git repository (or `--worktree` on a bare one) | git |
| `commit-not-found` | `<rev>` does not resolve to a commit | git |
| `git-failed` | any other git failure (an unreadable index, a submodule without a resolvable `HEAD`) | git |

Warnings (in `warnings`, exit success): `lfs-filter-unavailable` (§9).

**Project absent at this revision.** When `select` ends with `project-absent`, the anchor is not a project file of the tree: the project does not exist at this revision. That is an explicit outcome, not a failure (conventions.md §8):

- the command exits 10 with `CliProjectAbsentA0` on stdout, code `project-absent` (`cli-spec.md` §4, §8). It carries `project_file` and, with `--commit`, the resolved commit id;
- there is no revision key and no bundle for that revision. K records the outcome and does not retry;
- consumers show the project as "not present at this revision". A comparison across such a revision shows one side as not present.

The pure layer and the CLI use the one code `project-absent`. Vectors `error-project-absent` and `error-project-file-nfd-mismatch` cover it.

Measured with the scratch references (Python, one `ls-tree`):

| Repository | Mode | Time | Selected |
|---|---|---|---|
| USB-PD-Trigger-Board | `HEAD` | 0.06 s | 9 |
| this repository (3,093 entries) | commit | 0.1 s | 216 |
| USB-PD-Trigger-Board copy | working tree | 0.2 s | 13 |

## 12. Decisions

Decided here, each with its reason in the section cited:

- The anchor and every path override enter only through the effective config (§4). The anchor is the stored `project_file_rel` alone; an anchor not in the tree is the project-absent outcome (§4.4, §11).
- Libraries, symlinks and gitlinks are in the source set (§5.2, §7).
- Paths are raw bytes with no normalization (§6).
- Modes and the object format are hashed (§7, §8).
- The working tree means "what `git add -A` stages" (§9).
- The key is never truncated (§1).

Decided by the maintainer (2026-10-16), formerly open questions Q1–Q4:

- **Q1, scope.** Repository-wide by kind for a1 (§5.1). Optimizations, such as a K policy that adds sibling projects' directories to `excluded_dirs`, can follow later without a new key version.
- **Q2, libraries.** `.kicad_sym`, `.kicad_mod`, `.lib` and `.dcm` are in the source set (§5.2), for Release Studio DRC/ERC library parity.
- **Q3, `sources/**`.** The bundle's `sources/` holds the closure the build read, not the whole source set. Each source member records its repository path, kind and object id, and so cross-references its entry of the key (bundle-format.md §2.2).
- **Q4, the working tree.** Ignored files do not count (§9, `git add -A`).

## 13. Test vectors

[`revision-key-vectors.json`](revision-key-vectors.json) validates against `RevisionKeyVectorsA1`:

```sh
node scripts/check-contract.mjs tsp/prism/revision-key-a1.tsp --json revision-key-vectors.json
```

- **Selection vectors** (layer 1): the full listing, the object format and the config give `expected`, either `selected` or `error`:
  - `selected` carries the entries, the counts, `config_canonical`, `config_digest` and `revision_key`;
  - `error` carries a code.

  Every listing is exactly what `git ls-tree -r -z --full-tree` printed (git 2.55.0) for a real repository the generator built with `git init` (`--object-format=sha256` for one). Gitlinks, NFD names and a `:` path were added through `git update-index --index-info`. An implementation runs `select` and then `revision_key`, and compares every field.
- **Hashing vectors** (layer 2): entries (deliberately unsorted in `hash-sort-order`) and a config give `config_canonical`, `config_digest`, `preimage_hex` and `revision_key`. Compare the preimage first: it localizes any mistake.
- **Relations** state the intent: `same-key` (README-only and output-only changes) and `different-key` (schematic, model, mode, config, zone-fills, anchor, sibling, gitlink and LFS changes). Check them on the computed keys.

What they cover:

| Case | Vectors |
|---|---|
| single project | `usb-pd-single-project` |
| hierarchy | `usb-pd-single-project`, `usb-pd-schematic-change` |
| README-only change | `usb-pd-readme-only-change`, `minimal-readme-only-change` |
| schematic change | `usb-pd-schematic-change` |
| config override | `usb-pd-config-board-override`, `usb-pd-config-no-exclusions` |
| saved zone fills (`zone_fills`) | `usb-pd-zone-fills-saved`, `hash-zone-fills-saved`, `error-config-zone-fills-refill` |
| output-only change | `usb-pd-output-only-change` |
| multi-project, two anchors | `monorepo-anchor-alpha`, `monorepo-anchor-beta`, `monorepo-same-dir-top`, `monorepo-same-dir-base`, `monorepo-sibling-change` |
| gitlink | `monorepo-gitlink-bump`, `links-lfs-symlink-gitlink`, `sha256-object-format`, `hash-all-kinds` |
| LFS pointer | `links-lfs-symlink-gitlink`, `links-lfs-object-change` |
| Unicode NFC/NFD, CJK, astral | `unicode-nfc-nfd-spaces`, `error-project-file-nfd-mismatch`, `hash-sort-order` |
| spaces | `unicode-nfc-nfd-spaces`, `hash-escaping` |
| executable mode | `usb-pd-executable-mode`, `links-lfs-symlink-gitlink`, `hash-all-kinds` |
| symlink | `links-lfs-symlink-gitlink`, `hash-all-kinds` |
| 3D model | `usb-pd-model-change`; upper-case `.STEP` in `usb-pd-single-project` |
| empty optional set | `minimal-empty-optional`, `hash-minimal-config` |
| SHA-256 object format | `sha256-object-format`, `hash-sha256-basic` |
| JSON escaping | `hash-escaping` |
| errors and outcomes | `error-*` (config-invalid ×4, project-absent ×2, config-path-missing ×2, unrepresentable-path) |

**Two projects in one directory.** `monorepo-same-dir-top` and `monorepo-same-dir-base` share one listing, in which `fixture/` holds `top.kicad_pro`, `base.kicad_pro`, their two boards and one `.prism.json`. Each config names its own anchor and board (`fixture/top.kicad_pcb`, `fixture/base.kicad_pcb`), and the relation `different-key` holds between them. They show that the selection and the key take the project's files from the config alone: the entries are identical, and only the anchor and board differ. They do not cover:

- a root schematic, since `fixture/` holds none;
- K's resolution (§4.4), because the config is an input of a vector.

WP-K MUST add a test for that resolution: two `.kicad_pro` files in one directory, each with its own `.kicad_sch` and `.kicad_pcb`, with the default globs. Each project must get its own pair.

**How they were produced and checked:**

- Two implementations wrote and checked them, both outside the repository:
  - a Python one over `bytes`, whose string escaper is checked against `json.dumps`;
  - a Node one over `Buffer`, written separately from this text, whose escaper is checked against `JSON.stringify`.

  They agree byte for byte on every value. The Node checker also re-ran `git ls-tree` in every generator repository and matched each listing record for record.
- On the same repositories and on a copy of USB-PD-Trigger-Board, three working-tree keys were equal in every case:
  - the Python key (`ls-files` plus `hash-object --stdin-paths`);
  - the Node key (`hash-object --path` per file);
  - the key of a temporary index after `git add -A` and `write-tree`.

  After `git add -A && git commit`, every case's commit key equaled its working-tree key too. The cases were:
  - `wt1` clean;
  - `wt2` CRLF on disk with `text=auto`;
  - `wt3` LFS, hydrated on disk, without and with the clean filter;
  - `wt4` modified, untracked, deleted, ignored, chmod, a new symlink and an embedded repository;
  - `wt5` an NFD file name with `precomposeUnicode` true and false;
  - `wt6` USB-PD-Trigger-Board as it stands: a modified `.kicad_pro`, untracked library tables and `RemoteLibrary/`.

  WP-K and WP-B MUST add these working-tree cases to their own tests, built the same way. They need git and, for `wt3`, a clean filter.
- The three `zone_fills` vectors (2026-10-16) reuse existing inputs: the `usb-pd` listing and config of `usb-pd-single-project`, and the entries and config of `hash-minimal-config`, each with `zone_fills` added. Their expected values were computed by a fresh Python implementation of §4.1, §4.2, §5.3 and §8 and checked by a separate Node recomputation of §4.2 and §8; the same Python run reproduced every earlier vector unchanged.

## 14. Consequences for other contracts

- **Manifest a2:**
  - embeds `RevisionKeyEffectiveConfigA1` (by `$id`), `revision_key`, `config_digest` and `object_format`;
  - never the record's `source`: a key built from a commit and one built from a working tree must give byte-identical bundles;
  - each `sources/` member records its repository path, kind and object id, so a reader can check it against the key.
- **Bundle key** (ADR §5): the CLI spec frames it (`cli-spec.md` §5.1.4). It takes the 64-hex revision key as this contract defines it.
- **`prism-kicad bundle build --config`** takes the same `RevisionKeyEffectiveConfigA1` file. `root_schematic` and `board` choose what it parses, exactly: an absent field means nothing of that kind is parsed. Only without `--config` does it apply §4.3, KiCad's stem pairing beside the project file.
- **Semantic index a1:**
  - its `sourceRevisionKey` envelope value (`semantic_index_service.py:1147`) becomes this 64-hex key;
  - today's value is a 32-hex key of a different algorithm, so parity ignores the field.
- **Storage:** `.kicad-prism/bundles/<project_id>/<revision_key>/<generator>.prism` uses all 64 characters.
- **Board stage:** `zone_fills: "saved"` makes the stage build from the source board's saved fills, with no refill and no `refilled/` member; the manifest records saved-fill provenance and the warning `saved-fills-used` (`cli-spec.md` §5.2.3, `bundle-format.md`).
- **Models stage** (§4.4 of the ADR): the GLB cache is keyed "by board + model blobs + KiCad version". Those are the `kicad-board` entry named by `config.board` and the `model-3d` entries of the record.
