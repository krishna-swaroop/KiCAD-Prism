# Release Studio inputs

Release Studio no longer requires a committed Prism YAML to start a build.
Per-release inputs are entered in the UI and synthesized into the configuration
mapping the document engine and closure already consume.

## What the UI collects

### Source (discovered + selected)

At the chosen commit, Prism discovers KiCad files from the imported project
(`GET .../source?commit_sha=`):

- board (`.kicad_pcb`)
- schematic (`.kicad_sch`)
- variants (the shared catalog discovery, with the explicit `default` entry first)
- BOM presets from the schematic (`kicad-cli sch export bom --preset`)

The variant list is the same service behind the Visualizer's variant selector;
`default` is the native design, not a KiCad variant name.

The user confirms board, schematic, variant, and BOM preset. These paths
and the commit SHA are sent with the build request. The Source picks are
also stored on `ws_projects.release_studio_defaults` so a later release of the
same project can pre-fill them. A saved path is applied only when it still
exists at the selected commit (`GET .../source` after `PUT .../source/defaults`).
A saved named variant that the revision no longer has falls back to `default`
rather than another named variant. Identity, manufacturing, and the commit SHA
are not stored there.

### Identity

- **tag** — forge Release name and drawing REVISION
- **document_name** — cover DOCUMENT field (formerly document number)
- **date** — user-entered cover DATE
- **notes** — release notes

There is no separate revision name and no PCB field editing.

### Manufacturing

Per-release manufacturing fields (not committed to Git):

| Field | Purpose |
| --- | --- |
| `manufacturing_ipc_class` | Cover **Manufacturing & Assembly Spec** |
| `assembly_ipc_class` | Cover **Manufacturing & Assembly Spec** |
| `solder_mask_colour` | Cover **Board Characteristics** |
| `silkscreen_colour` | Cover **Board Characteristics** |
| `via_treatment` | Cover **Board Characteristics** |
| `vendors` | Manufacturer pack profile IDs |
| `impedance_csv` | Optional controlled-impedance table on fabrication |
| `stackup_pdf_b64` | Optional vendor stackup PDF appended to fabrication |

Via type, count, and span statistics are projected from the board and appear on
the Drill page. They are not manually declared counts.

## IPC and board-characteristic dropdowns

Options are returned with the source payload. The stored value is the printed
string (for example `IPC-6012 Class 2` or `Green`) or the free-text value when
**Other** is selected.

**Manufacturing IPC**

- IPC-6012 Class 1 / 2 / 3
- IPC-6013 Class 1 / 2 / 3
- Other (free text)

**Assembly IPC**

- IPC-A-610 Class 1 / 2 / 3
- J-STD-001 Class 1 / 2 / 3
- Other (free text)

**Solder mask colour**

- Green, Matte Green, Black, Matte Black, White, Red, Blue, Purple, Yellow
- Other (free text)

**Silkscreen colour**

- White, Black, Yellow
- Other (free text)

**Via treatment**

- Tented, Untented, Plugged, Filled, Filled and capped
- Other (free text)

## Impedance CSV template

Download: `GET .../impedance-template.csv`

Columns:

| Column | Meaning |
| --- | --- |
| Type | SE or DIFF |
| Name | Net or pair name |
| Layer pair | For example `F.Cu-In1.Cu` |
| Target Z (Ω) | Target impedance |
| Tolerance (Ω) | Allowed deviation |
| Width (mm) | Trace width |
| Spacing (mm) | Pair spacing (DIFF) |
| Notes | Free text |

When uploaded, Prism typesets impedance table pages onto the fabrication PDF
after the layer plots.

## Synthesized configuration

At build time, `synthesize_configuration` assembles a normalized mapping from
identity, manufacturing, and the selected KiCad paths. That mapping is
validated, snapshotted, and digest-bound to the build. It includes document
metadata, IPC fields, variant, vendors, and `bom_preset`.

## Cover and title block

| Field | Source |
| --- | --- |
| DOCUMENT | Document Name |
| REVISION | tag |
| DATE | user-entered date |
| COMMIT | short SHA |
| VARIANT | selected variant |

**Revision history** on the cover lists this release first, then prior
GitHub/GitLab Releases fetched via the forge API. Columns: Tag, Date, Commit,
Message. The forge title is the tag. If the API fails, only the current row is
shown.

Board characteristics include solder mask, silkscreen, and via treatment.
Manufacturing and assembly spec lines come from the IPC fields.

## Committed YAML leftover

Committed YAML under `.prism/release-studio/configurations/` is leftover from
an earlier authoring path. The running product does not expose `GET`/`PUT`
configuration endpoints. Per-release Identity and Manufacturing are entered in
the UI and snapshotted onto the build.

A project's `.kicad_jobset` is not a Release Studio input. Exports come from
the pinned catalogue, not `kicad-cli jobset run`. A jobset key in committed
YAML is optional leftover and is ignored by the pipeline.

The required schema remains `prism.release-studio.configuration/1`. File
references are POSIX, repository-root-relative paths that resolve to regular
files inside the selected commit.

## Semantics

- **Revision API boundary:** release and build APIs accept only a full
  immutable 40-character commit SHA. The UI may accept `HEAD` or a short SHA
  only as a convenience when it exactly matches a listed commit; it
  immediately resolves that input to the listed full SHA before calling either
  API. Arbitrary branches and other refs are rejected.
- **Variant:** the requested named variant is part of the technical build
  identity. It changes population-dependent artifacts such as BOM/CPL. The
  `default` entry maps to the executor's native-design sentinel: no
  `--variant` flag is passed and the sentinel is never persisted as a KiCad
  variant name.
- **Documents:** composed PDFs are released members, not editable UI output.
- **Vendors:** selected profile IDs are technical inputs. A selected profile is
  vendor-ready only when its complete profile artifacts are present. JLCPCB
  readiness requires Gerbers, drill, `bom.csv`, `cpl.csv`, `bom.xlsx`, and
  `cpl.xlsx`.

## Digests and snapshots

`technical_config_digest` is the SHA-256 of canonical JSON for the normalized
technical configuration. The complete input closure separately records
repository files, submodules, LFS materialization, verified toolchain resources,
environment bindings, and library resolution. Its digest and the pinned executor
identity are part of build identity.

Substitutions use only `{{namespace.key}}`-style tokens. Missing values,
malformed braces, and recursive replacement are errors rather than silent empty
text.
