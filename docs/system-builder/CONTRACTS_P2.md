# System Builder P2 — contracts

**Version P2-1.25 · 2026-10-01 · tickets SB2-00 to SB2-28.** §0 choices S1–S8 were signed off by the user on 2026-09-30, with S6 revised. The M1 choices T1–T7 (§0.1) were signed off by the user on 2026-09-30.

This document extends [CONTRACTS.md](CONTRACTS.md) (P1, v1.12) and never overrides it
silently. Where P2 changes a P1 rule, the P1 section is named and the change is listed in §19.
The plan and decisions (D-P2-1 … D-P2-24) are on the audit board
`audit-reports/system-builder-p2-2026-09-30/PLAN.md`.

Changing a rule here is a contract revision: bump the version, record it in §19, and re-run
the affected goldens.

Machine-checkable parts:

| Artifact | Path |
|---|---|
| Manifest models (the source of truth) | `backend/app/services/systems/manifest_schema.py` |
| Generated JSON Schema | `docs/system-builder/schemas/system_manifest.v1.schema.json` |
| Example manifests | `docs/system-builder/examples/manifest-child-cndh.json`, `manifest-parent-bus.json` |
| Contract tests | `backend/tests/test_system_manifest_schema.py` |

Regenerate the schema with:

```bash
cd backend && venv/bin/python -m app.services.systems.manifest_schema > ../docs/system-builder/schemas/system_manifest.v1.schema.json
```

---

## 0. Choices made in this contract that need sign-off

These defaults were not settled explicitly in the grilling. Each is marked **[S#]** where
it appears.

| # | Choice | Why |
|---|---|---|
| S1 | A harness is **not** a link type. `system_links.type` is `unspecified` \| `b2b`. Pressing **H** or converting a link creates a harness object (§6.3), whose wires replace the link's rows. | One place for pin pairs per connection; avoids a link that is secretly a harness. |
| S2 | One system publishes to **exactly one** catalog `assembly` component, bound on first publish. Publishing the same snapshot twice returns the existing revision. | Stable IPN per subsystem; idempotent retries. |
| S3 | Depth counts **system levels including the root**: root → child → grandchild → great-grandchild is depth 4, the maximum. | A clear reading of "depth 4". |
| S4 | The power-meets-signal finding needs a per-pin **power-net flag**. Extractor **v5** (in M0, SB2-08) adds only that flag. The connector geometry planned as "v5" becomes **v6** (SB2-11). | Connector pins are usually `passive`, so pin types can't tell power from signal. |
| S5 | The name-mismatch finding (V09) compares **tokens**, not whole names (§8.3). `/SPI_SCK` meets `/SCK_IN` → shares `SCK` → no warning. `TM_MON` meets `GND_3` → warning. | Whole-name comparison would warn on nearly every link. |
| S6 | **Revised by the user:** canvas layout is **in** the manifest (`layout`), frozen by snapshots and (M7) committed to Git, like a Vivado block design. It is excluded from the connectivity digest and included in the full digest. Live layout edits still take no If-Match and write no audit event (P1 invariant 6, revised in §9.5). | A saved arrangement is shared work other users should see and get back from a snapshot; it is still never an engineering change. |
| S7 | A child system hidden from the reader shows its **catalog interface** (export names and pin numbers) but no internals, and its export pin nets are redacted if the board behind the export is hidden. | Consistent with catalog readability (D-P2-24) and P1 per-board redaction. |
| S8 | **Viewers** gain catalog read (D-P2-24). The SB2-02 test lists every catalog read route that opens up; inventory and provider tokens stay writer-only. | User decision 2026-09-30; guarded by a test. |

### 0.1 M1 packet (SB2-10) choices, signed off 2026-09-30

| # | Choice | Why |
|---|---|---|
| T1 | **Board frame** origin is KiCad's page origin, y flipped up, z out of the front, **z = 0 at the board mid-plane** (§14.2). | Extractor numbers come straight from the file; top and bottom connectors are symmetric (±t/2); the 3D bundle's own centring is absorbed by a per-asset offset in M2. |
| T2 | **Inference has three confidences** (§15.1). A footprint without `_Vertical`/`_Horizontal` still infers from geometry (body over the pads → vertical) at `medium`. Right-angle axes are named in the **footprint's** frame, so they survive any footprint rotation. | The JTYU mezzanines (Samtec FTSH, SEAF8, ADM6) have no orientation keyword; name-only inference would ask for details on every real B2B. |
| T3 | **Auto-placement uses only confirmed or override frames**; inferred ones are one click from confirmed. A confirmation records the port's geometry digest and goes **stale** (info `SYS-V17`) when the footprint moves (§15.2). | PLAN risk table: confirmation is mandatory before placement; a moved connector must not keep a silently wrong frame. |
| T4 | **Conversions** (§16.1): link → harness always works (rows become wires); harness → link only for 2 ends, no splices, identity pin maps. | Round-trips without losing information; anything richer stays a harness. |
| T5 | **Stack height lives on the B2B link**, not on each port (§16.2); the frozen manifest shape moves `stackHeightMm` from `mating[]` to `links[]` (no data had it yet). | It is a datasheet property of the mated pair; two per-port values could disagree. |
| T6 | **A port is mated once** (§16.2, §17.2): by one `b2b` link, or one harness end, never both (409 `port_already_mated`). `unspecified` links stay as free as in P1. | A physical connector mates one thing; documentation links keep P1 behaviour. |
| T7 | **Board connector part** is found by the component's MPN field matched to a catalog `part` (§18). Mates-with findings are `SYS-V18` (warning, unknown pair) and `SYS-V19` (error, pin count without a map); unknown parts are "not evaluated". | Uses data the boards already carry; never guesses a part from a footprint name. |

---

## 1. Scope

P2-1.0 freezes what **M0** needs, and the shapes later milestones must fit:

- catalog kinds and publishing (§3);
- exports and the export interface (§4);
- the hierarchy of systems (§5);
- links to exports, link types and harness objects (§6);
- child drift (§7);
- system nets and findings (§8);
- the manifest and digests (§9);
- ICD changes (§10);
- API, errors and audit (§11–§13).

Placement conventions (frames, units, quaternions), mating, link types, harness behaviour and "mates with" are frozen by SB2-10 in §14–§18. Harness geometry numbers wait for SB2-40 and the Git model for SB2-52; until then the manifest carries their fields with the shapes in §9, but not their math.

## 2. Identity

### 2.1 New portable IDs

The format is P1 §2.1's: a prefix plus 32 lowercase hex characters.

| Object | Prefix |
|---|---|
| Export | `sxp_` |
| Harness | `shn_` |
| Harness end | `she_` |
| Harness wire | `shw_` |
| Harness node (breakout or waypoint) | `shd_` |

Catalog IDs keep the catalog's own formats; the manifest treats them as opaque strings.

### 2.2 Occurrence path

A **board occurrence** is one physical board somewhere in a hierarchy. Its identity is the path of instance IDs from the root system's instances downwards:

```text
occurrence_path = "/" + "/".join(instance_ids)      e.g. /sin_…A/sin_…C
display_path    = " ▸ ".join(labels)                 e.g. CNDH-A ▸ CMBD
```

- The first ID is an instance of the root system; each later ID is an instance inside the child named by the previous one.
- Only IDs are identity. Labels are display, and renaming never changes a path.
- A repeated child (CNDH-A, CNDH-B) gives distinct paths for the same inner instance.
- Everything below the root keys on occurrence paths: system nets, 3D picking and poses, search and ICD grouping.

## 3. Catalog kinds and publishing

### 3.1 Kinds

`components.kind` is `part` (default; every existing component) \| `module` \| `assembly`.

| Kind | Identity | Revision payload | DBL export / KLC |
|---|---|---|---|
| `part` | MPN or provisional IPN (unchanged) | unchanged | unchanged |
| `module` | MPN (bought) or IPN | `interface` (units = connectors) + STEP model (M6) | excluded |
| `assembly` | IPN | `interface` (units = exports) + `source_ref` | excluded |

- **IPN identity (P2-1.2):** an IPN is stored as the catalog's existing `provisional_ipn` identity, with `identity_source = "prism"` and the IPN as the internal part number. This reuses identity uniqueness without touching the catalog's 34 identity checks.
  - For `module` and `assembly`, approval and release accept that identity, in both the Python gate and the database trigger (integrity guards v5).
  - The UI shows such items by kind and never labels them "provisional".
- **Required metadata:** `value` = IPN, `category` = `Assemblies` or `Modules`, and `manufacturer` and `datasheet_url` are required as for parts. Publish passes the organisation name and the system's Prism URL.
- The `kind` of a component never changes after creation (`components.kind`, catalog migration 3, `CHECK` constrained).
- **Hash stability:** the revision payload is stored in `interface_json` and `source_ref_json` (JSON text). Both are left out of the revision manifest hash while empty, so every revision hashed before migration 3 keeps its hash.

### 3.2 Assembly revision payload

- `source_ref`: `{"kind": "system_snapshot", "systemId", "snapshotId", "fullDigest", "connectivityDigest", "openReviewCount", "hierarchyValid", "children": [{"componentId", "revisionId"}]}`. M7 adds `{"kind": "git_commit", …}`.
  - The last three are copied at publish so release gates read **only catalog data**. In CI, and possibly in deployments, the catalog lives in another database than `system_snapshots`. Snapshots are immutable, so the copy never goes stale.
- `interface`: the snapshot's **export interface** (§4.3), computed once at publish and immutable.

A revision **never copies** the manifest. Readers load the snapshot through `source_ref`.

### 3.3 Publish

`POST /api/systems/{id}/snapshots/{sid}/publish`, with body `{ipn?, name?, description?}` on the first publish (creating the component) and `{}` after.

- **Who:** designer on the system (P1 §8.2) **and** `CATALOG_WRITE_ROLES`.
- **Effect:** creates a new `component_revisions` row in stage `open`, with `change_kind = "publish"`.
  - On the first publish it creates the `assembly` component and binds `system_projects.catalog_component_id` **[S2]**.
  - The normal catalog workflow then applies (`open → in_progress → qa_review → done → released`).
- **Idempotent:** a unique constraint on (component, snapshotId). Re-publishing a snapshot returns the existing revision with 200; a new publish returns 201.
- **Two stores, retry-safe:** the catalog and workspace schemas share one database, but are written by different services. The order, under the system lock (no version bump):
  1. the catalog revision;
  2. the binding (`system_projects.catalog_component_id`, workspace migration 32);
  3. the audit event `snapshot_published`.

  If the system is unbound, publish first looks for an active assembly whose revisions name this `systemId` and adopts it. So a first publish that crashed after step 1 is never duplicated.
- **Refusals:**
  - 403 when the caller lacks `CATALOG_WRITE_ROLES`, or when the snapshot names a board the caller cannot see (a published interface must be complete);
  - 422 for a P1 snapshot without a manifest, a snapshot with no exports, an unresolved export, or a first publish without an IPN;
  - 409 when the IPN is already taken;
  - 409 `interface_not_ready` while a board is extracting.
- **Response:** 201 with `{componentId, revisionId, version, releaseStatus}` for a new revision, 200 with the existing one on a re-publish.
- **Assembly metadata:** `value` = IPN, `name` (default: the system name), `manufacturer` (default `In-house`), `description` (default: the system description), and `datasheet_url = /systems/{id}` (the in-app link).
- **Snapshot metadata** gains `publication: {componentId, revisionId, version, releaseStatus} | null`, read from the catalog on a best-effort basis (a catalog failure never breaks the listing). The system summary gains `catalogComponentId`.
- **`source_ref` also carries `snapshotName`.** Until SB2-05, `hierarchyValid` is true and `children` is empty.
- **Release gates** for `assembly` (`catalog/system_items.assert_release_gates`), each fail-closed, replacing the part gates (default representation, KLC):
  - the source snapshot is present (`source_ref.kind = "system_snapshot"`);
  - `source_ref.openReviewCount` is 0;
  - `source_ref.hierarchyValid` is true;
  - every `source_ref.children` revision is `released` (checked in the catalog);
  - the interface is non-empty.

  A `module` needs only a non-empty interface until M6 adds its model gates.

### 3.4 "Mates with" (M1; shape frozen here)

`catalog_mates_with(part_a, part_b)` is stored once with `part_a < part_b`, read in both directions, and only between `part` components. The M1 behaviour (suggest, warning, error) is in PLAN D-P2-13.

## 4. Exports

### 4.1 Definition

An export is `{id, name, description, target}`:
- **`target`:** either a board port of the same system (`{instanceId, portKey}`), or a **re-export** of a child's export (`{instanceId, exportId}`), so a mid-level system can pass a grandchild's connector up.
- **Names:** unique per system, case-insensitive, 1–100 characters.
- **Stable ID:** an export ID never changes. Retargeting an export keeps its ID and is an audited change.

### 4.2 Rules

1. **An export's port must be free.** A board port that is an end of any link in the same system cannot be an export target (409 `export_port_linked`), and linking an exported port is refused the same way. The exception, a harness splice, arrives in M1: a port mated by a harness end whose harness sets `allowExport` (M1 contract revision).
2. **An export's port must be exposed** (P1 §4.2), otherwise 409 `port_not_exposed`.
3. **A re-export needs an assembly instance.** Its target must be an assembly instance's export at that instance's pinned revision.
4. **Deleting an export is allowed.** Parents learn of it as `export_missing` in child drift (§7).
5. At most **200 exports** per system (422 `export_limit`).
6. **Removing a board that carries exports** gives 409 unless `?cascade=links`, which also deletes its exports (each audited `export_deleted`).
7. **A port export stores the port baseline** (like a link end) and resolves by `memberKeys` intersection at the board's baseline.
   - When a baseline advances (auto-advance, rebase or an applied review), each export on that board moves to the component it now resolves to, audited `connector_relabelled` or `connector_rebound` with `exportId`.
   - An export that no longer resolves, or whose port is no longer exposed, is **SYS-V16 `export_unresolved`** (error), and its interface entry has `resolved: false` and no pins. Exported connectors are never linked inside the system, so drift never reviews them; this finding is what surfaces a broken export.
8. **An exported port cannot be hidden** (UI) and cannot be an end of a link (409 `export_port_linked`, from both directions).

**Storage (workspace migration 31).** `system_exports`: `id`, `system_id`, `name` (unique per system, case-insensitive), `description`, `target_instance_id`, and exactly one of `target_port` (JSONB port baseline) or `target_export_id`.

**Document.** The system document gains `exports: [{id, name, description, instanceId, portKey, port, childExportId, resolved, redacted, updatedAt}]`. On a restricted board, `portKey`, `port` and `resolved` are null and `redacted` is true; the name stays visible.

### 4.3 Export interface (`prism.system_export_interface.v1`)

```json
{
  "schema": "prism.system_export_interface.v1",
  "exports": [{
    "id": "sxp_…", "name": "PWR_IN", "description": "…",
    "occurrence": "/sin_…",            // path inside the child, to the board carrying it
    "reference": "J20", "libId": "…", "footprint": "…", "pinCount": 4,
    "pins": [{"pad": "1", "nets": ["/PWR/VBUS_28V"], "powerNet": true,
              "pinNames": ["VBUS"], "pinTypes": ["passive"]}]
  }]
}
```

- It is computed from the snapshot's instance baselines and their interface artifacts, using P1 §3 pin rules (pad strings, sorted net sets).
- A re-export is resolved to the physical connector (SB2-05).
- `powerNet` comes from extractor v5 **[S4]**. It is null until SB2-08.
- Each entry carries `resolved`. An unresolved entry has `pinCount: 0` and `pins: []`, and publishing refuses it.
- `GET …/export-interface` returns 409 `interface_not_ready` (and queues extraction) while a board behind an export has no interface at the current extractor version. `?snapshot=` computes it from the snapshot's manifest, so a live interface equals its snapshot's until something changes.
- Redaction: an entry on a restricted board keeps its name and pad numbers, but `reference`, `libId`, `footprint`, and every pin's nets, names and types are null, with `redacted: true`.

## 5. Hierarchy

### 5.1 Instances

`system_instances.kind` is `board` (every P1 instance) \| `assembly` \| `module`.

- **Assembly or module instances** carry `catalog_component_id`, `catalog_revision_id` and `follow` (`pinned` \| `latest_released`). Board columns are null.
- **Adding one:** `POST …/instances` with `{kind: "assembly", componentId, revisionId?, label, follow}`.
  - When `revisionId` is omitted, it resolves once to the current released revision. 409 `no_released_revision` if there is none.
  - Pinning an unreleased revision is allowed and produces warning `SYS-V14` (§8.4).
- **Removing one** follows P1 §5.1 (`?cascade=links`).

### 5.2 Resolution

`resolve(root)` builds the occurrence tree:
- an assembly instance → its revision → `source_ref` snapshot → that snapshot's manifest → its instances, recursively;
- snapshots are immutable, so resolution is memoized per snapshot ID.

`flatten(tree)` lists board occurrences with occurrence paths and **world-independent** data (pose composition is a placement concern, SB2-10).

### 5.3 Limits and cycles

| Limit | Value | Error |
|---|---|---|
| Depth (system levels incl. root) **[S3]** | 4 | 422 `hierarchy_too_deep` |
| Board occurrences when flattened | 200 | 422 `hierarchy_too_large` |
| Cycle (a system reaching itself through any child snapshot) | none | 422 `hierarchy_cycle` |

- **When checked:** when an assembly instance is added, rebased or auto-advanced, and at publish (`assembly_hierarchy_valid`).
- **Advancing:** a parent following `latest_released` does not advance to a revision that would break a limit. It records warning `SYS-V15` instead.
- **Cycle detection:** by system ID along the resolution path, not component ID. A snapshot of an older version of the same system is still a cycle.

### 5.4 Visibility and redaction (extends P1 §8.2)

Redaction recurses. For each board occurrence, P1 §8.2 applies with the reader's access to that board's project today.

- **A hidden child system:** the reader can't see the child system's folder. The occurrence renders as its label plus the catalog interface, with pin nets redacted wherever the board behind the export is hidden **[S7]**. None of its internal boards, links or harnesses are returned.
- **Parent access never grants child access.**
- **Deleted projects:** P1 v1.12 applies at every depth.

## 6. Links, exports as ends, and harnesses

### 6.1 Link ends

A link end is either a **port end** `{instanceId, portKey, port: PortBaseline}` (board or module instance) or an **export end** `{instanceId, exportId, export: ExportBaseline}` (assembly instance).

- `ExportBaseline` is `{exportId, name, reference, libId, footprint, pinCount}`, captured from the export interface of the instance's current revision.
- Row nets on an export end are that interface's pin nets, following the P1 row rules.
- The P1 generators work on export ends, using the interface pins.

### 6.2 Link type

`system_links.type` is `unspecified` (every P1 link) \| `b2b` **[S1]**.
- **B** on the diagram sets the next drawn link to `b2b`.
- `PATCH …/links/{lid}` changes `type`.
- M1 adds the `b2b` mating requirements (PLAN D-P2-10).

### 6.3 Harness objects (shape frozen; behaviour in M1)

A harness has `ends` (1–32), `wires` and `nodes` (see §9.1 for fields).

- **End mates:** an end mates to a port end or export end, or to nothing.
- **Pins:** an end's pins map to the mated connector's pins through `pinMap` (null = identity).
- **Wires:** each wire joins `{end, pin}` to `{end, pin}` and carries `netFrom`/`netTo` baselines, like rows.
- **Pressing H**, drawing A → B, creates a 2-end harness with identity wires.
- **Converting** a P1 link with a `harness` label creates a harness and deletes the link. Its rows become wires with IDs preserved in `label`.
- **Drift:** P1 drift and review rules apply to harness end mates, like link ends (M1).

## 7. Child drift

### 7.1 Trigger

- Releasing a catalog revision of an `assembly` or `module` component enqueues `system_child_check` for every instance with `follow = latest_released` of that component.
- `POST …/instances/{iid}/rebase` with `{revisionId}` evaluates an explicit revision, like P1 rebase.

### 7.2 Evaluation

Evaluation compares, **for the exports this parent's links and harness ends use**, the pinned revision's interface baselines (stored on ends and rows) against the candidate revision's interface.

| Item kind | When | Allowed decisions |
|---|---|---|
| `export_missing` | the export ID is absent | `bind_candidate` (ranked: same name, same pin count, net overlap), `remove_rows` |
| `export_connector_changed` | `libId`, `footprint` or `pinCount` differ | `accept` (refused with 409 if used pads are missing), `remove_rows` |
| `pin_missing` | a used pad is absent | `remap`, `remove_rows` |
| `net_changed` | a used pad's net set differs | `accept`, `remap`, `remove_rows` |

- An export **retargeted** to a different connector with identical libId, footprint, pin count and used-pin nets is a **silent** change (audited `export_retargeted`), like P1 rebind.
- **Auto-advance** happens exactly when there are no items (P1 invariant 2 at the export boundary), and moves `catalog_revision_id` (audited `child_auto_advanced`).
- **Otherwise** a review of kind **`child_update`** opens. It has P1 review semantics: decisions, `keep-pinned`, superseding, and the v1.12 `basis` staleness rule.
- **Never considered:** internal child changes.

### 7.3 Warnings

`SYS-V14` and `SYS-V15` (§8.4) cover revisions pinned deliberately while unreleased or carrying open reviews, and advances blocked by limits.

## 8. System nets

### 8.1 Nodes and edges

- **Node:** `(occurrence_path, net)` for a named board net; `(occurrence_path, "pin:" + portKey + "#" + pad)` for a pin with no net (unconnected), so tracing still reaches it.
- **Edges:**
  - each row joins the nets of its two pins (every net in each sorted set);
  - each harness wire joins the nets of the board pins its two end pins map to;
  - an export end resolves to the child's physical pin before joining.
- **Group:** a connected component (union-find), computed over the flattened hierarchy.

### 8.2 Group output (`GET …/nets`, `GET …/nets/{groupId}`)

```json
{"groupId": "<min member key>", "name": "<clicked or first member leaf>", "aliases": ["SPI_SCK", "SCK_IN"],
 "pinCount": 6, "members": [{"occurrence": "/sin_…", "displayPath": "CNDH-A ▸ OBC-1", "net": "/Payload IF/SPI_SCK"}],
 "hops": [{"kind": "row"|"wire", "linkId"|"harnessId", "from": {"occurrence", "reference", "pad"},
           "to": {…}, "wireId"?: "shw_…"}]}
```

- `groupId` is stable for an unchanged membership, and it is valid only for the system version in the response's ETag.
- Search (`?search=&occurrence=`) matches aliases case-insensitively, using fuzzy ranking.
- Groups with `pinCount > 200` carry `"large": true`. The UI confirms before highlighting.
- Restricted occurrences appear as `{"occurrence": null, "redacted": true}` members, and their hops are dropped.

**As built (SB2-20, P2-1.21): harness wires.**
- Each wire joins the node of the pad its from-end pin lands on (after that end's `pinMap`) with the node of the pad its to-end pin lands on, using the wire's captured `netFrom`/`netTo` like a row's nets. Wires sharing an end pin therefore share a node: a splice joins every wire on it.
- An end on a subsystem export is followed down to the child's board, as for a link end; an end whose export does not resolve drops that wire. Subsystem levels contribute the harnesses in their snapshot manifest.
- A pin of an **unmated** end is an internal node: it carries joins between the wires on it but is never a member, and a group made only of internal nodes is not listed.
- A wire hop is `{"kind": "wire", "harnessId", "harnessName", "wireId", "signal", "from": {occurrence, displayPath, portKey, reference, pad, nets, end: "End N", endPin}, "to": {…}}`. On an unmated end `occurrence`, `displayPath`, `portKey`, `reference` and `pad` are null; `pinCount` counts board pads only.
- Golden: `tests/fixtures/system_builder/p2/goldens/harness_splice_nets.json` (the fixture WH-001 cable as a 3-end harness: PWR J3 pin 3 spliced to PAY J11 pin 1 and J12 pin 1), written by hand from the fixture's rows.

### 8.3 Tokens **[S5]**

A net's **tokens** are the last path segment, uppercased, with KiCad markup (`~{…}`, `{slash}`) removed, split on anything not `[A-Z0-9]`. Pure-number tokens are dropped, and so is the token `NET` from auto-names like `Net-(J1-Pad3)`.

### 8.4 Findings (P1 §7.2 numbering continues)

| Rule | Name | Severity | Definition |
|---|---|---|---|
| SYS-V09 | `net_name_mismatch` | warning, **opt-in** | Runs only when the system lists it in `optionalRules` (P2-1.10; off by default). At a join (row or wire), no token on one side is **related** to a token on the other (P2-1.8). Related: equal; one a prefix or suffix of the other (2+ characters, digits kept, so `GPIO4`/`IO4` match and `GPIO4`/`IO5` do not); an in-order abbreviation with the same first letter (`RST`/`RESET`); an acronym of the other side's tokens (`PG`/`PWR_GOOD`); or a crossed pair (`TX`/`RX`, `TXD`/`RXD`, `SDO`/`SDI`, `DOUT`/`DIN`, `CTS`/`RTS`). It is reported once per join, with both names. Unnamed auto-nets and unconnected pins never trigger it. |
| SYS-V10 | `power_meets_signal` | error | At a join, exactly one side's pin has `powerNet: true` and the other side's net is a named, non-power net. |
| SYS-V11 | `mate_mismatch` | warning | Reserved for M4 (PLAN §5.3). |
| SYS-V12 | `harness_collision` | warning | Reserved for M5. |
| SYS-V13 | `length_mismatch` | warning | Reserved for M5. |
| SYS-V14 | `child_revision_unreleased` | warning | An assembly or module instance pins a revision that is not `released`, or whose snapshot had open reviews. |
| SYS-V15 | `child_advance_blocked` | warning | A released revision exists but advancing would break §5.3 limits. |
| SYS-V16 | `export_unresolved` | error | An export's connector no longer resolves at its board's baseline, or is no longer exposed (§4.2 rule 7). Not evaluated while the board's interface is missing. |
| SYS-V17 | `mating_stale` | info | A confirmed or override mating frame whose port geometry changed since confirmation (§15.2). |
| SYS-V18 | `mate_pair_unknown` | warning | Both parts of a harness end or `b2b` pair are known and not related by mates-with (§18). |
| SYS-V19 | `mate_pin_mismatch` | error | A harness end's part has a different pin count from its mated connector and a wired pin has no map (§17.2). |

**Optional rules (P2-1.10, user decision 2026-09-30).** `system_projects.optional_rules` (migration 35) lists the opt-in rules a system runs; today the only one is `SYS-V09`, because real boards rename nets across connectors far more often than they miswire them (108 warnings on the JTYU C&DH set). It is set with `PATCH /systems/{id}` `{"optionalRules": ["SYS-V09"]}` (the list replaces the stored one; `null` clears it; any other rule is 422), bumps the system version, is audited as `system_updated`, and is shown in the system summary and the manifest header. The Overview tab has a **Checks** section with the switch. `SYS-V10` always runs.

**`powerNet` (extractor v5 [S4]).** A pin's net is a power net when any schematic symbol on that net is a power symbol: KiCad `power` flag set on its lib symbol, or a reference starting with `#PWR`/`#FLG`. The extractor records `powerNet: bool` per pin. `EXTRACTOR_VERSION` goes to 5, and every board re-extracts once.

## 9. Manifest `prism.system_manifest.v1`

### 9.1 Shape

The models in `manifest_schema.py` are normative. Top-level keys:

| Key | Content |
|---|---|
| `schema` | `"prism.system_manifest.v1"` |
| `system` | `{id, name, description, optionalRules}`: `optionalRules` defaults to `[]`, is part of the full digest only, and is left out of the full digest when empty so manifests from before P2-1.10 keep their digests |
| `meta` | `{createdAt, createdBy, sourceVersion, snapshot?: {id, name, note}}` |
| `instances` | board `{id, label, kind: "board", projectId, baselineCommit, trackedRef, pinned, portOverrides}` or catalog `{id, label, kind: "assembly"\|"module", catalog: {componentId, revisionId, revisionVersion, identity}, follow}` |
| `exports` | §4.1. A port target is `{instanceId, portKey, port: PortBaseline}` (P2-1.3); a re-export target is `{instanceId, exportId}` |
| `links` | `{id, name, type, harnessLabel, a, b, rows, stackHeightMm}` with P1 rows (`netA`/`netB` baselines); `stackHeightMm` is b2b-only placement data (§16.2) |
| `harnesses` | `{id, name, label, ends[{id, ordinal, mates, part, pinCount, pinMap, bootMm}], wires[{id, from, to, signal, gaugeAwg, colour, label, netFrom, netTo}], nodes[{id, kind, positionMm, pinned, order, ends}], cutLengthMm, serviceAllowancePct}` |
| `mating` | `{instanceId, portKey, mode: confirmed\|override, frame: {axis, quarterTurns}, geometryDigest}` (§15.2) |
| `placement` | `{poses[{instanceId, translationMm, rotation (xyzw unit), source}], drivingMates[{instanceId, linkId}]}` |
| `layout` | `{positions: {<nodeKey>: {x, y}}}`, the saved diagram arrangement. Node keys are instance IDs and harness IDs at this level (at most 1000). An expanded child renders with the layout frozen in its own snapshot. |

Rules:
- Unknown fields are rejected.
- Array order is meaningful only where stated (`ordinal`, `order`). Writers emit instances, links, rows and wires sorted by ID; readers must not depend on order.

### 9.2 Referential rules (checked by `reference_problems`)

- Instance IDs are unique, and labels are unique case-insensitively.
- Export names are unique case-insensitively.
- Port ends and targets name board or module instances; export ends and targets name assembly instances.
- Row IDs are unique across the manifest, and pin pairs are unique per link.
- Wire and node ends exist in their harness.
- Mating names a board or module instance.
- There is at most one pose per instance, and every pose names an existing instance.
- Driving mates name an existing link and instance.

Checks that need other documents (a child's export exists at the pinned revision, a portKey exists at the baseline) belong to validation (§8.4, P1 §7.2), not to the manifest.

### 9.3 Digests

The canonical form is JSON with sorted keys, `(",", ":")` separators and `ensure_ascii=False`, hashed with SHA-256 and written `sha256:<hex>`.

- **`full`**: the manifest without `meta`. Fields added after M0 (`system.optionalRules`, `links[].stackHeightMm`) are omitted while empty or null, so manifests written before them keep their digests.
- **`connectivity`**: `full` without `system.optionalRules`, each link's `stackHeightMm`, `layout`, `mating`, `placement`, and each harness's `nodes`, `cutLengthMm`, `serviceAllowancePct` and every end's `bootMm`.

Drift, publish identity and catalog `connectivityDigest` use **connectivity**. Snapshot identity uses **full**.

### 9.4 Snapshots (changes P1 §9.1; implemented in SB2-01)

A snapshot row (migration 30) stores:

- `document`: the P1 rendered document, unchanged (it includes `validation` and `reviewRowIds`). The ICD, diffs and redacted reads keep using it as the evidence of what the system showed.
- `manifest`: v1, unredacted, built in the same transaction as the document. `meta.snapshot` is `{id, name, note}` and `meta.sourceVersion` is the frozen version.
- `manifest_schema`: `"prism.system_manifest.v1"`.
- `digest`: the manifest's **full** digest. P1 snapshots keep their document digest.
- `connectivity_digest`: the manifest's connectivity digest.

Reading rules:

- Snapshot metadata gains `connectivityDigest` and `manifestSchema`. Both are null on P1 snapshots.
- `GET …/snapshots/{sid}/manifest` returns the manifest **whole or not at all**. It gives 403 when the reader cannot see every board it names (a manifest is an exchange artifact; a partial one would be misleading), and 404 for a P1 snapshot without a manifest.
- P1 snapshots stay readable everywhere else, but cannot be published.
- Writers emit instances, links and rows sorted by ID, so an unchanged system snapshots to identical digests.

**Import.** `manifest.import_manifest` recreates a system from a manifest, **keeping every ID** (system, instances, links, rows), and audits `system_imported`. A clash with an existing ID fails the transaction. Sections without tables yet (harness nodes, driving mates) are refused with 422 until their tickets land; mating records (SB2-12) and poses (SB2-28) import as stored. There is no HTTP route yet; M7 adds one.

### 9.5 Canvas layout (revises P1 invariant 6)

- **Live:** `GET/PUT …/layout` is unchanged. It is shared by every user of the system, takes no If-Match (last write wins), writes no audit event and never bumps the system version.
- **Frozen:** a snapshot's manifest carries the layout as it was when the snapshot was taken. A system restored or published from a snapshot shows that arrangement.
- **Digests:** layout is excluded from the connectivity digest and included in the full digest.
- **A layout change alone never** opens a review, bumps drift, or makes a parent see a new child revision.

## 10. ICD changes (extends P1 §9.4–§9.5)

- **Parent ICD (default):**
  - A **Subsystems** table: label, kind, identity, revision, stage, snapshot name and digest, open reviews.
  - Link and harness ends on exports print as `CNDH-A ▸ PWR_IN → CMBD J20 pin 3 · /PWR/VBUS_28V`.
  - The printed banner also warns about SYS-V14.
- **`?depth=all`:** every link and harness at every level, grouped by occurrence path, in both CSV and HTML. CSV gains an `occurrence` column.
  - The occurrence column is the display path (`CNDH-A`, `CNDH-A ▸ PAY-SUB`) and comes first; the root system's own links have an empty occurrence.
  - Redaction follows §5.4: hidden boards keep their rows with connector and net blanked; a hidden child system's level is omitted entirely.
  - Without `depth`, or with `depth=own`, the CSV columns are exactly P1's.
- **Diagram (SB2-09):** a subsystem node has a double border, the revision (`vN`) and stage, and an **inside** toggle listing its boards and nested subsystems from `GET …/hierarchy`. The History tab offers an **All levels** ICD link whenever the system has a subsystem.
- **Renderer** version 3.

## 11. API additions

All routes are under `/api/systems/{id}` and follow P1 conventions (If-Match, 412/428, redaction).

| Method and path | Purpose |
|---|---|
| `GET …/exports`, `POST …/exports`, `PATCH …/exports/{xid}`, `DELETE …/exports/{xid}` | Export CRUD (§4) |
| `GET …/export-interface?snapshot=` | The interface (§4.3), live or for a snapshot |
| `POST …/snapshots/{sid}/publish` | §3.3 |
| `GET …/snapshots/{sid}/manifest` | The frozen manifest, whole or 403 (§9.4) |
| `POST …/instances` (extended) | `kind: "assembly"\|"module"` (§5.1) |
| `POST …/instances/{iid}/rebase` (extended) | `{revisionId}` for assembly and module instances |
| `GET …/hierarchy` | Occurrence tree: `{occurrences: [{path, displayPath, kind, instanceId, systemId?, revision?, restricted}]}` |
| `GET …/nets?search=&occurrence=&limit=`, `GET …/nets/{groupId}` | §8.2 |
| `GET …/icd.{csv,html}?depth=all` | §10 |
| `GET …/scene` | §20: every occurrence placed, with the board bundles that draw it |
| `GET …/poses`, `PUT …/poses/{iid}`, `DELETE …/poses/{iid}`, `DELETE …/poses` | §14.7 |
| Catalog: `GET /api/catalog/components?kind=part\|module\|assembly` | Filter by kind. Component payloads carry `kind`, `interface` and `source_ref` |

**Viewer browsing (D-P2-24, [S8]).** The dependency `require_catalog_browser` (roles `CATALOG_BROWSE_ROLES` = reader roles + `viewer`) guards exactly these 26 routes:
- components list, detail, revisions (list, compare, one), audit (and verify), usage, mates-with (P2-1.17), models, model previews and GLBs (P2-1.18), reviews, releases and validation;
- categories, workflow summary, release queue, asset search, previews and asset content;
- metadata fields, grid, grid preferences (GET and PUT, per user) and `export.csv`.

Everything else stays on reader or writer roles, including inventory export, health, imports, jobs, validation runs and metadata batches. `test_catalog_system_items.ViewerBrowseRoutesTest` pins the list. The frontend `view_catalog` authority includes `viewer`.

## 12. Error codes (additions)

| Status | Code | When |
|---|---|---|
| 409 | `export_port_linked` | Exporting a linked port, or linking an exported port |
| 409 | `no_released_revision` | Following latest-released with none released |
| 409 | `already_published` | Never returned: re-publish is idempotent (200). Listed so clients don't expect it |
| 409 | `review_stale` | P1 v1.12, also for `child_update` |
| 422 | `hierarchy_too_deep`, `hierarchy_too_large`, `hierarchy_cycle` | §5.3 |
| 422 | `export_limit` | More than 200 exports |
| 403 | — | Publish without catalog write role; a manifest naming a board the reader cannot see |
| 409 | `port_already_mated` | A port in a second `b2b` link or harness end (§16.2, §17.2) |
| 409 | `harness_not_linkable` | Converting a harness with more than two ends, splices or a pin map to a link (§16.1) |
| 409 | `mating_not_inferable` | Confirming a `low` inference (§15.3) |

## 13. Audit event kinds (additions)

`system_imported`, `export_created`, `export_updated`, `export_retargeted`, `export_deleted`, `snapshot_published`, `child_auto_advanced`, `child_rebased`, `link_type_changed`, `harness_created`, `harness_updated`, `harness_deleted`, `pose_updated`, `poses_reset`, `mating_updated`. `harness_created` carries `fromLink` or `fromLabel` when it replaced links (§16.1, §17.2).

## 14. Frames and placement conventions (SB2-10)

These conventions are shared by the extractor (v6), the placement library pair (Python
`systems/placement/`, TypeScript `frontend/src/features/system-builder/placement/`) and the
renderer. Goldens in `backend/tests/fixtures/system_builder/placement_cases.json` run in both
languages with a tolerance of 1e-6 mm and 1e-9 on quaternion components.

### 14.1 Units and algebra

- Lengths in **mm**, angles stored in **degrees** (API and manifest) and converted to radians only inside the library.
- **Right-handed** axes; **column vectors**; a transform is `T·R` (rotate, then translate).
- Rotations are **unit quaternions `[x, y, z, w]`**, normalised, with `w ≥ 0` in stored form (the sign is canonicalised so equal rotations serialise equally).
- Composition reads right to left: `A·B` applies `B` first.

### 14.2 Board frame **[T1]**

- **Origin:** KiCad's page origin (the `(0, 0)` of the `.kicad_pcb` file), not the grid or drill origin.
- **x** = KiCad x. **y** = −KiCad y (KiCad's y points down; the board frame's points up). **z** points out of the **front** (F.Cu) side.
- **z = 0 is the board mid-plane.** The front surface is `z = +t/2`, the back `z = −t/2`, where `t` is the board thickness from the board setup (`general (thickness …)`), recorded by extractor v6.
- A KiCad rotation angle (counter-clockwise on screen, degrees) is a positive rotation about +z in the board frame, unchanged in value.
- The 3D bundle of a board is mapped into this frame by its asset's `bundleToBoard` matrix (§20.2); nothing in the placement library depends on how `kicad-cli` centres its GLB.

### 14.3 Parent frame and poses

- A system's frame is the frame its poses are expressed in. A pose `P = T(translationMm)·R(rotation)` maps an instance's own frame (board frame, or the child system's frame for an assembly) into the parent's.
- A board occurrence's world matrix is the product of poses along its occurrence path, root first.
- Default poses (`source: "default"`): the instances of one system, in **label order** (case-insensitive, then instance ID), along +x on the XY plane. Each is placed so its bounding box starts 20 mm after the previous one's ends (the first at x = 0), bottoms aligned at y = 0, with no rotation. A board's box is its `boardOutlineMm` (§14.6) with z = ±t/2; an assembly's is the union of its members' boxes after their own default poses. An instance without a box takes an empty slot (the next one starts 20 mm on). Stored only when the user moves an instance (§14.7). *(P2-1.23: the plan said creation order, which snapshot manifests don't record.)*
- **Placing members** (`place`): a stored pose wins; every other member takes its slot in the default row, which is laid out over **all** members, so moving one never shifts another. M4 inserts the tree solve (`auto`) between the two.

### 14.4 Connector frame `F_c`

Computed from extractor v6 geometry (§14.6) in the board frame:

- **Origin:** the centroid of the connector's **pads** (all pads, including mechanical ones), at `z = +t/2` when the footprint is on the front, `−t/2` on the back.
- **x axis:** the principal axis of the pad centres (largest eigenvector of their 2D covariance), signed so that **pad "1"** (or, without one, the first pad in natural order) lies at negative x. When the two eigenvalues are within 5 % of each other (a square array) or there is one pad, x is the footprint's own +x rotated by the footprint angle.
- **z axis (mating direction):**
  - vertical: the board normal, +z for a front footprint, −z for a back one;
  - right-angle: in the board plane, along the footprint's own ±x/±y axis named by the inference or override (§15.1), rotated by the footprint angle into the board frame. The body centre is the courtyard centre; M4 may refine it with model bounds.
- **y = z × x**; if z ∥ x (a right-angle connector whose pads run along the mating direction), x is replaced by the in-plane axis perpendicular to z, signed toward pad 1 as above.
- A confirmed override (§15) replaces the inferred axis choice and applies `quarterTurns` × 90° about z.

### 14.5 Mate transform

For a B2B pair (board A connector `a`, board B connector `b`):

```text
B_world = A_world · F_a · T(0, 0, h) · Rx(180°) · Rz(k · 90°) · F_b⁻¹
```

- `k ∈ {0,1,2,3}`: default is the one that puts pad 1 on pad 1 (minimum summed pad-to-pad distance, ties to the lower k); the user's `quarterTurns` on either side add to it.
- `h`: the link's `stackHeightMm` when given (§16.2). Otherwise the minimum separation at which the two connectors' bodies (courtyard × assumed 5 mm height until M4 brings model bounds) don't intersect, **plus 5 mm**, so an unknown stack is visibly apart rather than interpenetrating.
- The M4 tree solve, driving mates and `SYS-V11` follow PLAN §5.3; this section fixes only the algebra they use.

### 14.6 Extractor v6 geometry

`EXTRACTOR_VERSION` becomes **6**; every board re-extracts once. The interface gains `boardThicknessMm` (number, or null without a PCB) and each component gains `geometry` (null when the board has no PCB or the footprint is not placed on it):

```json
{"side": "top", "positionMm": [50.0, -10.0], "rotationDeg": 90.0,
 "footprintName": "PinHeader_1x04_P2.54mm_Vertical",
 "pads": [{"pad": "1", "positionMm": [50.0, -10.0], "sizeMm": [1.7, 1.7], "shape": "rect", "tht": true}],
 "courtyard": {"minMm": [-1.33, -8.95], "maxMm": [1.33, 1.33]},
 "model": {"path": "${KICAD10_3DMODEL_DIR}/Connector_PinHeader_2.54mm.3dshapes/PinHeader_1x04_P2.54mm_Vertical.step",
           "offsetMm": [0, 0, 0], "rotationDeg": [0, 0, 0], "scale": [1, 1, 1]}}
```

- `positionMm` and pad `positionMm` are in the **board frame** (§14.2). `rotationDeg` is KiCad's angle.
- `courtyard` is the axis-aligned bounds of the F/B.CrtYd graphics in the **footprint's own frame** (y up, before rotation); null when the footprint has none.
- `model` is the first enabled 3D model reference, unresolved (variables kept); null when none. M1 never loads it.
- Numbers are rounded to 1e-4 mm. Pads are listed in natural pad order; duplicate pad numbers keep every pad.
- `geometry` joins the interface digest, so a moved connector produces a new artifact but **never** a drift item by itself (drift compares pins and nets only, P1 §5).
- **v8 (SB2-22)** adds `boardOutlineMm`: `{"minMm": [x, y], "maxMm": [x, y], "source": "edge_cuts" | "items"}` in the board frame, or null without a PCB. It bounds the **board-level** Edge.Cuts graphics by their line centres (arcs by their true extent; curves by their control points). A board with none falls back to the extent of all its items (`source: "items"`, strokes included), as KiCad does. It joins the digest and never drifts, like `geometry`.

### 14.7 Stored poses (SB2-28)

- **Table** `system_poses` (migration 40): one row per instance of this system, `translation_mm` (3), `rotation` (4, canonical), `source`, `updated_by`, `updated_at`. Deleting the instance deletes its pose.
- **API** (P1 conventions: If-Match, 412/428):

  | Method and path | Role | Body / result |
  |---|---|---|
  | `GET …/poses` | reader | `{systemId, version, poses: [{instanceId, translationMm, rotation, source, updatedBy, updatedAt}]}`, stored poses only |
  | `PUT …/poses/{iid}` | designer | `{translationMm: [x, y, z], rotation: [x, y, z, w]}` → the stored pose, `source: "manual"`. The rotation is normalised and canonicalised; a zero or non-finite quaternion, or a translation beyond ±1 000 000 mm, is 422 |
  | `DELETE …/poses/{iid}` | designer | back to the default: `{instanceId, source: "default"}` |
  | `DELETE …/poses` | designer | every `manual` pose back to its default: `{reset: [instanceId…]}` |

- **Engineering data, not connectivity.** A pose change bumps the system version and is audited (`pose_updated` with before and after; `poses_reset` with the instances), like a mating frame. It never changes the connectivity digest, so it never opens a review, moves drift or makes a parent see a new child revision.
- **Snapshots** freeze `placement.poses`, and a system imported from a manifest gets them back. A child system's poses are its snapshot's: inside a parent it moves only as a rigid group, by the parent's pose for the assembly instance.

## 15. Mating frames (SB2-12)

### 15.1 Inference **[T2]**

Inference is a pure function of a component's v6 geometry (both languages, shared goldens in `placement_cases.json`). It returns `{axis, confidence, reasons}`, with `axis` null at `low`. Terms, all in the **footprint's own frame** (§14.6): the *pad box* is the bounding box of the pad centres grown by 1 mm; the *body centre* is the courtyard centre; the body is *off one side* when it lies outside the pad box, at least 0.5 mm from the pad centroid, within 20° of a footprint axis. Keywords are matched case-insensitively on the footprint name as whole `_`-separated words: vertical `_Vertical`; right-angle `_Horizontal`, `_RightAngle`, `_Right_Angle`, `_Angled`, `_RA`.

| Evidence | Result | Confidence |
|---|---|---|
| Vertical keyword, body centre in the pad box | `top` / `bottom` by side | `high` |
| Vertical keyword, no courtyard | `top` / `bottom` by side | `medium` |
| Right-angle keyword, body off one side | that side as `+x`/`-x`/`+y`/`-y` **in the footprint frame** | `high` |
| No keyword, body centre in the pad box (mezzanines such as Hirose DF40, or Samtec FTSH/ADM6 on JTYU) | `top` / `bottom` by side | `medium` |
| No keyword, body off one side | that side | `medium` |
| A keyword the geometry contradicts; no courtyard without a vertical keyword; fewer than two distinct pad positions; a body neither over the pads nor clearly off one side | none | `low` → **"Mating details needed"** |

The right-angle axis is kept in the footprint frame, so rotating the footprint (including by 45°) never invalidates it, and a back-side footprint's axis is read in its stored, mirrored coordinates.

`reasons` lists the evidence used (`name_vertical`, `body_over_pads`, …) for the UI.

### 15.2 Storage and use **[T3]**

- Table `system_port_mating (instance_id, port_key, mode, axis, quarter_turns, geometry_digest, updated_by, updated_at)`, primary key `(instance_id, port_key)`. Only **confirmed** and **override** records are stored; an inferred frame is always recomputed.
- `mode = confirmed`: the user accepted the inference as is. `override`: the user picked `axis`/`quarterTurns`.
- `geometry_digest` is the sha256 of the port's v6 `geometry` at confirmation. When the board's baseline moves and the digest differs, the record is kept but reported as **stale** (info finding `SYS-V17 mating_stale`), and auto-placement treats the port as unconfirmed until re-confirmed.
- **Auto-placement (M4) uses only confirmed or override frames.** A `high`/`medium` inference is shown pre-filled with a one-click Confirm; `low` shows "Mating details needed" and offers only the picker.
- Board and module ports only. An export end uses the mating record frozen in the child's snapshot manifest; a parent cannot override a child's connector frame.
- Manifest: `mating[]` holds the stored records (`mode` ∈ `confirmed` \| `override`, plus `geometryDigest`). Mating stays out of the connectivity digest.

### 15.3 API

| Method and path | Purpose |
|---|---|
| `GET …/instances/{iid}/mating` | `{instanceId, boardThicknessMm, ports}`: every **exposed** port as `{portKey, reference, footprint, hasGeometry, inferred: {axis, confidence, reasons}, stored: {mode, axis, quarterTurns, stale} \| null}` |
| `PUT …/instances/{iid}/mating/{portKey}` | `{mode: "confirmed"}` (takes the inference as is; an axis or turns with it is 422) or `{mode: "override", axis, quarterTurns}`; If-Match; audits `mating_updated` with before/after; bumps the system version; returns the port row |
| `DELETE …/instances/{iid}/mating/{portKey}` | Back to inferred; If-Match; audits `mating_updated` |

Errors: 409 `mating_not_inferable` when confirming a `low` inference (use override), 422 for an axis/turns outside the enum or a port that is not a component at the baseline, 422 on a subsystem instance (its frames are frozen in its snapshot), 409 `interface_not_ready` while the v6 artifact is missing. Manifests carry the stored records (`mating[]`) and import them as stored.

## 16. Link types (SB2-13)

### 16.1 Types and conversion **[T4]**

`system_links.type` ∈ `unspecified` \| `b2b` (§6.2, [S1]). P1 links are `unspecified` (migration default).

| From → to | Rule |
|---|---|
| `unspecified` ↔ `b2b` | `PATCH …/links/{lid}` `{type}`; rows are kept; audits `link_type_changed`. |
| link → harness | `POST …/links/{lid}/to-harness`: a 2-end harness whose ends mate the link's two ends, one wire per row (row ID kept in the wire's `label`, pins and net baselines copied), then the link is deleted. One audit `harness_created` with `fromLink`. |
| harness → link | `POST …/harnesses/{hid}/to-link`: only for **2 ends, no splices, identity pin maps**; otherwise 409 `harness_not_linkable`. Wires become rows of an `unspecified` link. |

### 16.2 B2B rules

- A `b2b` link's two ports must both be **board or module ports, or exports** whose target is one; each such port may be in **only one** `b2b` link and in **no harness end**. Otherwise 409 `port_already_mated` on create, type change or harness end assignment.
- `stackHeightMm` (optional, > 0) lives on the **link**, not the port, because it is a property of the mated pair (datasheet). It is placement-only (manifest `links[].stackHeightMm`, full digest only). **[T5]**
- Link details for a `b2b` link shows both ends' mating frames (inferred badge, confirm, override picker) and the stack height.
- On the diagram, **B** arms the next drawn link as `b2b` (a visible mode chip; Esc disarms). **H** arms harness creation (§17.2). Shortcuts fire only while the diagram has focus and no text field is active.

## 17. Harnesses (SB2-14, SB2-15, SB2-18, SB2-19)

### 17.1 Tables

`system_harnesses (id, system_id, name, label, cut_length_mm, service_allowance_pct)`, `system_harness_ends (id, harness_id, ordinal, mates_instance_id, mates_port, catalog_component_id, catalog_revision_id, part_pins, pin_count, pin_map, boot_mm)`, `system_harness_wires (id, harness_id, from_end, from_pin, to_end, to_pin, signal, gauge_awg, colour, label, net_from, net_to)`, `system_harness_nodes` (M5). Field meanings are the manifest's (§9.1). `mates_port` holds a port baseline like a link end (P1 §4), or an export baseline.

### 17.2 Behaviour **[T6]**

- **Ends.** 1–32 per harness. An end mates one port or export, or nothing. A port is mated by **at most one harness end** and then by no `b2b` link (409 `port_already_mated`). An `unspecified` link may still use a harness-mated port (P1 documentation links); V02 treats the harness end like any other use.
- **Mating block.** Every end has one. It starts **Generic**: `part = null`, `pinCount` copied from the mated connector, pins named by pad. Assigning a catalog `part` (§18) sets `pinCount` from the part's pins; a count that differs from the mated connector's keeps the assignment and requires a `pinMap` (error `SYS-V19` until every wired end pin maps).
- **Pin map.** `pinMap` maps **end pin → mated connector pad**; null is identity. Mapped pads must exist on the mated connector; each pad is mapped at most once.
- **Wires.** `from {end, pin}` → `to {end, pin}`, different ends. Several wires on one end pin form a **splice** (allowed; never a fan-out finding). A duplicate wire (same unordered pair) is `SYS-V01`.
- **Net baselines.** `netFrom`/`netTo` are the nets of the **board pins** the end pins map to, at the mated instance's baseline, captured like row nets (P1 §4.3). An unmated end has empty nets.
- **Generators.** P1's generators run **per end pair** (`POST …/harnesses/{hid}/generate {fromEnd, toEnd, generator, options}`), over the end pins mapped to the mated pins, and propose wires with the same skip rules as rows.
- **Creating.** H + drawing A→B creates a 2-end harness with Generic blocks on both ends and **identity wires** for the pads the two connectors share (the `identity` generator). Dragging from the harness node to a port adds an end with no wires.
- **P1 label migration.** `POST …/harnesses/from-label {label}` turns every link carrying that `harness` label into **one** harness: the ends are the distinct `(instance, port)` pairs of those links (ordered by first appearance), each row becomes a wire between the corresponding ends (row ID in `label`), and the links are deleted. One click per label on the Connectivity tab. Audits `harness_created` with `fromLabel`.
- **Drift.** P1 drift applies at each end's mate exactly as at a link end: item kinds `pin_missing`, `net_changed`, `connector_missing`, with `wireId`s in place of row IDs. Accept rewrites wire baselines; Remap edits the end's `pinMap`.
- **Validation.** `SYS-V01` (duplicate wires), `V03` (end mates an unexposed port), `V04` (a mapped pad is absent), `V06`/`V07` on mapped pins, `V09` (opt-in) and `V10` per wire, `V16` for export ends. V02 never counts wires of one harness against each other.

### 17.3 API

| Method and path | Purpose |
|---|---|
| `GET/POST …/harnesses`, `GET/PATCH/DELETE …/harnesses/{hid}` | CRUD; PATCH edits name, label, cut length and allowance |
| `POST …/harnesses/{hid}/ends`, `PATCH/DELETE …/harnesses/{hid}/ends/{eid}` | Add, re-mate, assign part, pin map, remove (removing an end deletes its wires) |
| `PUT …/harnesses/{hid}/wires` | Replace the wire list (like rows: server recaptures net baselines, validates pins) |
| `POST …/harnesses/{hid}/generate` | Per end pair (§17.2) |
| `POST …/harnesses/from-label`, `POST …/links/{lid}/to-harness`, `POST …/harnesses/{hid}/to-link` | Conversions (§16.1) |

All take If-Match and bump the system version. Audits `harness_created`, `harness_updated`, `harness_deleted`.

**As built (SB2-14).**
- `POST …/harnesses` takes `{name, label?, ends: [{instanceId, portKey} | {pinCount}], identity?}`; `identity` needs two mated ends and runs the `identity` generator. An unmated end's pins are `1…pinCount`.
- `POST …/harnesses/{hid}/generate` returns `{wires, skipped}` for `{fromEnd, toEnd, generator, options}`; skipped pairs carry `existing` or `unconnected`.
- Documents gain `harnesses[]`: `{id, name, label, cutLengthMm, serviceAllowancePct, linkable, ends: [{id, ordinal, mates: {instanceId, portKey, port, resolved, redacted} | null, part, pinCount, pinMap, bootMm, pins}], wires: [{id, from, to, signal, gaugeAwg, colour, label, netFrom, netTo, redactedEnds}]}`. An end on a hidden board keeps its place with `mates.port` null, no pins, and that side's wire nets null. Editing a harness with such an end is 404.
- Drift reads each mated end as a link-shaped view (`store.drift_links`): the item's `linkId` is the end ID, `rowIds` are wire IDs and `pins` are connector pads. Accept rewrites the wire's net on that side; Remap writes the end's `pinMap`; Remove rows deletes wires; a port update re-mates the end.
- Re-mating an end or editing its pin map recaptures every wire's nets. Converting links keeps their accepted row baselines as wire baselines.
- Harness findings carry `detail.harnessId` with `endId` or `wireId` (and `rowId` = the wire ID); duplicate wires report `duplicateOf`.
- Manifests export and import harnesses; `nodes` stay empty and an import carrying nodes is refused until M5.

**As built (SB2-18): mating housings as parts.**
- `PATCH …/ends/{eid}` takes `part: {componentId} | null`. A part must be an active catalog `part` (404 otherwise) with pins: its symbol's pins, or its footprint's pads when it has no symbol (422 when it has neither). The part's current revision is recorded (`catalogRevisionId`).
- Migration 39 adds `system_harness_ends.part_pins` and `part_summary` (JSONB): the part's pin names and `{name, mpn, manufacturer}` at assignment, so documents, manifests and the ICD show the part without asking the catalog. The pins become the end's `pins` and set `pinCount`. Pin-map entries for pins the part lacks are dropped. Wires on pins the part lacks refuse the change (409 naming them), so no wire is ever dropped silently.
- `part: null` makes the block Generic again: `part_pins` cleared, `pinCount` back to the mated connector's.
- Documents gain `ends[].matePads` (the mated connector's pads, natural order; empty while unmated), the targets the pin map offers. `ends[].part` is `{componentId, revisionId, name, mpn, manufacturer}`. The manifest's `HarnessEnd` gains `partPins` and `PartRef` gains `name`, `mpn`, `manufacturer` (each omitted from the digest when null).
- A wired end pin whose pad the connector lacks keeps empty nets (it is not an error in itself); `SYS-V19` reports it while pin counts differ.
- The harness editor's block cell shows the part's MPN, **Choose part** (the connector's mates-with partners first, then any part by search), **Change part** and **Make generic**. The pin map lists the connector's pads.

### 17.4 ICD and CSV (SB2-19)

- ICD gains a **Harnesses** section per harness: ends (mated connector, block part or "Generic", pin map), the wire table (from end/pin/net → to end/pin/net, signal, gauge, colour, label) and splices. A `b2b` table lists each pair with mating frames and stack height.
- CSV export adds a harness column set: `harness`, `from_end`, `from_pin`, `to_end`, `to_pin`, `gauge_awg`, `colour`, `wire_label` (empty for link rows). Import accepts the same columns and round-trips an exported harness.

**As built (SB2-19, P2-1.20).**
- **Column names.** The end pins are `from_end_pin`/`to_end_pin`, not `from_pin`/`to_pin`: P1 import already reads `from_pin`/`to_pin` as board pads, and other tools' CSVs use those names. The seven columns `from_end, from_end_pin, to_end, to_end_pin, gauge_awg, colour, wire_label` follow the P1 columns; they are empty on link rows. `harness` keeps its P1 meaning (the drawing label).
- **Wire rows.** One per wire, after the link rows, harnesses by name, wires by from end, pin, to end, pin. `row_id` = wire ID, `link_id` = harness ID, `link_name` = harness name, `harness` = harness label. `a_*`/`b_*` name the board, connector and **pad** each end mates (after the pin map), with the wire's captured nets; they are empty for an unmated end and board-only for a restricted one. Ends are named `End N` by position. `status` is `error` for an error finding on the wire or either end, `review` for an open review item, else `ok`. RENDERER_VERSION 3.
- **Import.** A row with `from_end` or `to_end` is a wire. Its harness is the one owning `row_id`, else the one named `link_name` (an unknown name creates a harness with that name and the row's `harness` as label). For an existing harness each end must exist at that position and mate the connector the row names, and the row's pad must be where the end pin lands; otherwise the row is a conflict (`end_not_found`, `end_mate_mismatch`, `pin_map_mismatch`). A new harness gets Generic ends at the rows' positions, mating the rows' connectors (an end with no connector is unmated, pins `1…N`), with a pin map wherever an end pin lands on another pad; a connector already mated by a harness end or a `b2b` link is `port_already_mated`. Also: `end_label_invalid`, `gauge_invalid` (0–40), `same_end`, `wire_in_other_harness`, `harness_ambiguous`. Signals are checked against the pads' nets as for rows; mismatches go to the import review, whose items may now carry a wire (`observed.kind = "wire"`). Parts are not in the CSV: an imported end is Generic. The commit report adds `harnessesCreated`.
- **ICD.** Stats count harnesses. Link headings say "board-to-board" and the stack height. **Board-to-board mating** lists each `b2b` link with both ends' stored frames (axis, quarter turns, confirmed or set by hand; "not confirmed" when none) and the stack height. **Harnesses** lists per harness its ends (mate, block with the part's MPN, pin map, boot), its wires and its splices. Link documents gain `a.mating`/`b.mating` (`{mode, axis, quarterTurns}` or null) for this.

## 18. Mating parts in the catalog: mates with (SB2-16) and models (SB2-17)

### 18.1 "Mates with" **[T7]**

- Catalog migration 4: `catalog_mates_with (part_a, part_b, created_by, created_at)`, stored once with `part_a < part_b`, read in both directions, only between active `part` components (§3.4).
- API: `GET /api/catalog/components/{cid}/mates-with` (catalog browse roles, viewers included), `POST …/mates-with {componentId}` and `DELETE …/mates-with/{otherId}` (catalog writers). Each returns the part's current list. A change writes `component.mates_with_added` or `…_removed` into **both** parts' audit chains; re-adding an existing pair writes nothing. 404 for an unknown part, 422 for a non-part or a part paired with itself.
- **Identifying a board connector's part:** extractor **v7** records `mpn` per component: the first non-empty field named `MPN`, `Manufacturer_Part_Number`, `Manufacturer Part Number`, `MFR_PN`, `Mfr. No.` or `Mfr No` (case-insensitive). It is matched case-insensitively to the MPN of an active `part`'s current revision. An MPN that two parts share matches neither. No match means the part is unknown.
- **Suggestion:** `GET /api/systems/{id}/harnesses/{hid}/ends/{eid}/suggestions` returns `{connectorMpn, connectorPart, suggestions}` for a mated end. The harness editor shows the partners under a Generic block and first in its part picker. It **never assigns** one: a part is assigned only by the user's pick (`PATCH …/ends/{eid} {part}`, §17.3).
- **Findings** (per `b2b` link, and per harness end with a part):
  - `SYS-V18 mate_pair_unknown` (warning): both parts are known and the pair is not in mates-with. Detail: `{partA, partB}` for a link; `{harnessId, endId, part, connectorPart}` for an end.
  - `SYS-V19 mate_pin_mismatch` (error): the part's pin count differs from the connector's and wired part pins have no pin-map entry (§17.2). Detail: `{harnessId, endId, partPins, connectorPins, unmapped}`. Equal counts are not checked: same-named pins land on same-named pads.
  - An unknown part on either side, or no catalog, is not evaluated and never counts as a pass.

| Rule | Name | Severity |
|---|---|---|
| SYS-V17 | `mating_stale` | info |
| SYS-V18 | `mate_pair_unknown` | warning |
| SYS-V19 | `mate_pin_mismatch` | error |

### 18.2 Models and alignment (SB2-17)

- **Conversion.** A part's `3dmodel` assets that are STEP files convert to GLB with Geometer (`step_to_glb`). Bounds come from `model_bounds`, in the STEP's own frame, in mm. The catalog job `catalog_model_glb` runs it. `POST …/components/{cid}/models/convert` queues the job (writers); converting in the domain is idempotent.
- **Cache.** Catalog migration 5 adds `catalog_model_glb`, keyed by `sha256(STEP sha256 + converter)`. The converter is Geometer's version (`geometer-2026.9.7`). That version *is* the tessellation setting: this Geometer's GLB export ignores deflection options (checked: identical output across options on planar and cylindrical models). An unchanged STEP is never converted twice, and a new Geometer produces new files. The GLB is served at `GET /api/catalog/models/{key}.glb`, immutable and cacheable.
- **Alignment.** Catalog migration 5 also adds `catalog_model_alignment (component_id, asset_id, alignment_json)` with `{offsetMm[3], rotationDeg[3], scale}`, applied as `T(offset) · Rz · Ry · Rx · S` (rotate about x, then y, then z). It maps the model into the part's **mating frame**: mating face on z = 0, mating toward +z, pin 1 toward −x (the housing twin of `F_c`, §14.4). It is set with `PUT …/components/{cid}/models/{assetId}/alignment` (writers; audited `component.model_aligned`). It belongs to the part, so every harness end or module using the part reuses it, and it is never baked into the GLB.
- **Preview.** `GET …/components/{cid}/models/{assetId}/preview.svg?view=front|side|top&offset=&rotation=&scale=&partner=` renders an orthographic, coloured SVG with Geometer (`model_tessellation` + `mesh_illustration`, about 0.2 s per model). It uses the given alignment (unsaved) or the saved one. `partner` adds the first STEP model of a mating part under its own saved alignment, turned half a turn about x, so the two mating faces meet at z = 0. The M2 viewer replaces this with a live 3D view.
- `GET …/components/{cid}/models` lists `{assetId, name, stepSha256, glb: {key, converter, bounds, materials, sizeBytes} | null, alignment}`. The model reads and the preview are open to browse roles (the viewer list grows to 26).
- **Evidence.** `fixtures/system_builder/p2/evidence/models/record.json` holds five KiCad stock models, including a 4-colour RJ45 and an 8.9 MB, 400-pin Samtec FMC. For each, Geometer's bounds are compared with `kicad-cli`'s GLB of the model placed by its stock footprint.

## 19. Revision log

| Version | Date | Change |
|---|---|---|
| P2-1.25 | 2026-10-01 | SB2-28: stored poses. Migration 40 `system_poses`; `GET/PUT/DELETE …/poses/{iid}` and `DELETE …/poses` (§14.7), version-checked and audited (`pose_updated`, `poses_reset`); manifests write `placement.poses` and import them (driving mates are still refused); the scene draws stored poses, and a child system's from its snapshot. Placement library: `pose_from`, `place` and the TypeScript twin `placement/poses.ts`, with pose goldens in `placement_cases.json`. |
| P2-1.24 | 2026-10-01 | SB2-23…27: §20.3 System 3D tab and `<prism-system-scene>`. §20.2: the `webgpu_3d` job key names the generator build; the scene reads only the outline and thickness of each interface artifact; `last_build` reads decoded job ids (`job_id`). |
| P2-1.23 | 2026-10-01 | SB2-22: §20 system scene (`GET …/scene`, `prism.system_scene.a0`): occurrences with default poses and world matrices, board assets per (project, commit) with `bundleToBoard`, bundle builds queued for designers, restricted boards and child systems as boxes. Extractor **v8** `boardOutlineMm` (§14.6; every board re-extracts once). §14.3 default row: label order instead of creation order, assembly boxes, empty slots. Placement library gains `poses` (Python; the TypeScript twin comes with SB2-28). |
| P2-1.22 | 2026-10-01 | SB2-21: geometry fixtures (plan §8, M1 set): `mezz_base`, `mezz_top` F0/F1, `edge_a`, `edge_b`, `ambiguous`, built through KiCad's IPC API (not SWIG) and clean on ERC, DRC with schematic parity and library checks, netlist, STEP and GLB with 10.0.6. Goldens: DF12(3.0) mated height 3.0 mm from Hirose EDC-390687-51-77, top pose (0, 0, 4.6) mm over the base, V11 shift 1.5 mm, frames per connector. Vendor models are not redistributed. No contract rule changes. |
| P2-1.21 | 2026-10-01 | SB2-20: §8.2 as built for harness wires: edges through pin maps, splices, export ends, subsystem manifests' harnesses, unmated ends as internal nodes; wire hop shape; 3-end splice golden. |
| P2-1.20 | 2026-10-01 | SB2-19: §17.4 as built. CSV wire rows and seven harness columns (`from_end_pin`/`to_end_pin` renamed from the plan's `from_pin`/`to_pin`, which collide with P1 pad columns); import of wire rows into existing or new harnesses with conflicts named; ICD Board-to-board mating and Harnesses sections; link documents gain end `mating`; renderer 3. |
| P2-1.19 | 2026-09-30 | SB2-18: mating housings as parts. Migration 39 `part_pins` and `part_summary`; `PATCH …/ends/{eid} {part}` assigns or clears (404/422/409 refusals); end documents gain `matePads` and the part's name and MPN; manifest `HarnessEnd.partPins` and `PartRef` name/mpn/manufacturer; SYS-V19 lands; harness editor part picker, Make generic and a pin map over the connector's pads. |
| P2-1.18 | 2026-09-30 | SB2-17: §18.2 catalog models. Catalog migration 5 (GLB cache by STEP sha256 + converter; per-part alignment); job `catalog_model_glb`; models, convert, alignment, preview and GLB routes; part page 3D models panel with a numeric alignment editor and a Geometer SVG preview, alone or mated. §18 renamed and split into 18.1/18.2. |
| P2-1.17 | 2026-09-30 | SB2-16: catalog migration 4 `catalog_mates_with`, routes (GET for browse roles: the viewer list grows to 23), audit events on both parts; extractor v7 `mpn`; harness-end suggestions; SYS-V18 on b2b links and parted harness ends; catalog part page gains Mates with; the harness editor shows suggestions. |
| P2-1.16 | 2026-09-30 | SB2-15 harness UI: the diagram lays out each harness as a board whose ports are its ends (mated ends are its links), drawn with a dashed border and a mating cap per end; **H** arms harness creation (identity wires between two ports); dragging from **Add an end**, or from an unmated end, to a port adds or mates an end; nodes without a saved position move clear of saved ones. Connections lists harnesses and opens the harness editor (ends, pin maps, wires with splices, generators per end pair, details, conversion, delete). Links offer Convert to a harness and Make harness from label. |
| P2-1.15 | 2026-09-30 | SB2-14: migration 38 (harnesses, ends, wires); harness store, service and API (§17.3); link↔harness and label conversions (§16.1); a port mated once across b2b links and harness ends (T6); drift and reviews through harness ends; wire validation (V01, V03, V04, V09 opt-in, V10); document, redaction and manifest harnesses. "As built" notes in §17.3. |
| P2-1.14 | 2026-09-30 | SB2-13: migration 37 (`system_links.type` default `unspecified`, `stack_height_mm` b2b-only); `POST …/links` and `PATCH …/links/{lid}` take `type` and `stackHeightMm`; leaving `b2b` drops the stack height; `port_already_mated` between `b2b` links (harness ends join the check in SB2-14); audits `link_type_changed`; documents and manifests carry both fields. UI: Link details type and stack height, a Mating section for `b2b` links (confirm, set by hand, reset), diagram **B** mode and heavier B2B wires. Link↔harness conversions land with harnesses (SB2-14). |
| P2-1.13 | 2026-09-30 | SB2-12: placement library `frames` pair (Python `systems/placement/frames.py`, TypeScript `placement/frames.ts`) with shared goldens `placement_cases.json` (14 cases from KiCad stock footprints); migration 36 `system_port_mating`; mating API (§15.3, response shape fixed); `SYS-V17 mating_stale`; manifest mating import and export. |
| P2-1.12 | 2026-09-30 | SB2-11: extractor v6 implemented as §14.6 (`EXTRACTOR_VERSION` 6, every board re-extracts once). Goldens compare pad centres and footprint poses with `kicad-cli` 10.0.6 IPC-D-356 and position-file exports (`fixtures/system_builder/p2/evidence/geometry`). |
| P2-1.11 | 2026-09-30 | SB2-10 M1 packet: §0.1 choices T1–T7 (signed off by the user 2026-09-30); §14 frames and conventions, extractor v6 geometry; §15 mating inference, storage and API; §16 link type conversions and B2B rules; §17 harness tables, behaviour, API, ICD/CSV; §18 mates with; findings V17–V19; errors and audit additions. Manifest: `mating[]` stores only confirmed/override with `geometryDigest`; `stackHeightMm` moves to `links[]` (b2b only, full digest only, omitted when unset). The revision log becomes §19. |
| P2-1.10 | 2026-09-30 | SYS-V09 becomes opt-in per system (user decision after M0: 108 warnings on JTYU). Migration 35 `optional_rules`; `PATCH /systems/{id}` `optionalRules`; manifest `system.optionalRules` (full digest only, omitted when empty); Overview **Checks** section. SYS-V10 stays an error. |
| P2-1.9 | 2026-09-30 | SB2-09: parent ICD Subsystems table and unreleased banner; `?depth=all` on live and snapshot ICDs (CSV `occurrence` column, HTML "Inside subsystems"), with recursive redaction; diagram subsystem node and its contents list; History "All levels" link. Backfills rows P2-1.5 to P2-1.8, whose document edits were missing from their tickets. |
| P2-1.8 | 2026-09-30 | SB2-08: system nets (§8.1–§8.2) following export ends and re-exports; extractor v5 `powerNet`; V09 refined from "share no token" to "no related token" (§8.4) after the literal rule flagged 11 intentional renames in the fixtures; V10; `GET …/nets`, `…/nets/{groupId}`. The F8 golden gains one V09 (`PAYLOAD_INT#`/`IRQ_OUT#`). |
| P2-1.7 | 2026-09-30 | SB2-07: child drift (§7). Migration 34 `child_update` reviews; `system_child_check` on catalog release; rebase by `{revisionId}`; SYS-V14, SYS-V15. |
| P2-1.6 | 2026-09-30 | SB2-06: export ends (§6.1); re-exports; SYS-V16 also covers a missing child export; ICD export ends print through to the child connector. |
| P2-1.5 | 2026-09-30 | SB2-05: assembly/module instances (migration 33); `hierarchy.resolve` limits and cycles; `GET …/hierarchy` with recursive redaction; publish records children and `hierarchyValid`. |
| P2-1.4 | 2026-09-30 | SB2-04: publishing. Migration 32 binding; write order and orphan adoption; refusals; 201/200; assembly metadata defaults; snapshot `publication`; summary `catalogComponentId`; `source_ref.snapshotName`. |
| P2-1.3 | 2026-09-30 | SB2-03: exports. Migration 31; rules 6–8; SYS-V16; refresh on baseline advance; document `exports`; export interface `resolved`, 409 `interface_not_ready`, snapshot variant, redaction; manifest export port targets carry their baseline. |
| P2-1.2 | 2026-09-30 | SB2-02: catalog kinds (migration 3); IPN via `provisional_ipn` + source `prism` instead of a new identity kind; `source_ref` carries the gate facts; assembly gates; integrity guards v5; hash stability; `?kind=`; viewer browse routes. |
| P2-1.1 | 2026-09-30 | SB2-01: snapshots store the manifest and both digests (`digest` = full); `GET …/manifest` is whole-or-403; `import_manifest` keeps IDs; migration 30. §0 signed off. |
| P2-1.0 | 2026-09-30 | First draft for sign-off (SB2-00). Adds catalog kinds and publishing, exports, hierarchy, child drift, system nets V09–V15, manifest v1 with digests, API, errors and audit kinds. P1 changes: snapshots store a manifest (§9.4); instances gain `kind` (§5.1); extractor v5 adds `powerNet` (§8.4). S6 revised by the user: canvas layout is part of the manifest and snapshots (§9.5, revises P1 invariant 6). |

## 20. System scene (SB2-22)

### 20.1 `GET …/scene` → `prism.system_scene.a0`

Open to every reader of the system, redacted as `GET …/hierarchy` (§5.4). Lengths in mm; matrices are 4×4, column-major (WebGPU's layout), `T·R`.

```json
{"schema": "prism.system_scene.a0", "systemId": "sys_…", "systemVersion": 12, "units": "mm",
 "assets": [{"assetId": "sba_…", "projectId": "prj_…", "commit": "<sha>", "status": "ready",
             "bundleUrl": "/api/projects/prj_…/webgpu-3d/assets/<source>/<build>/bundle.json",
             "sourceRevisionKey": "<source>", "generatorBuild": "<build>", "jobId": null,
             "bundleToBoard": [1000, 0, 0, 0, 0, 1000, 0, 0, 0, 0, 1000, 0, 0, 0, -0.8, 1]}],
 "occurrences": [{"path": "/sin_b", "parentPath": null, "displayPath": "OBC-1",
                  "labels": ["OBC-1"], "instanceId": "sin_b", "kind": "board", "depth": 1,
                  "restricted": false, "assetId": "sba_…",
                  "pose": {"translationMm": [-6.5, 59.11, 0], "rotation": [0, 0, 0, 1], "source": "default"},
                  "worldMatrix": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -6.5, 59.11, 0, 1],
                  "boundsMm": {"minMm": [6.5, -59.11, -0.8], "maxMm": [96.65, -6.5, 0.8]}}]}
```

- **Occurrences** are the hierarchy's, parents before members: boards and assemblies (M6 adds modules). `pose` is in the parent's frame (§14.3) with its `source`: a stored pose (§14.7) or `default`; `worldMatrix` is the product of poses from the root. An assembly is a rigid group: its members' poses are inside its frame. `boundsMm` is the occurrence's box in its **own** frame, or null when unknown (no PCB, no v8 interface yet, or an unresolved assembly).
- **Assets** are board bundles, one per (project, commit), however many occurrences use it: `assetId = "sba_" + sha256(project \0 commit)[:16]`. Two copies of an assembly draw from the same assets.
- **Restricted** (§5.4): a hidden board keeps its path, labels, pose and box, with `assetId: null`; no project, commit or bundle of it appears anywhere in the response. A hidden child system is one occurrence with its box (the union of its contents); its members are left out. The box is the only thing either leaks.
- Reading the scene queues the v8 interface extraction of any board without one, so its box arrives on a later read.

### 20.2 Bundles

A board asset reuses the single-board pipeline and its readiness cache (`semantic_visualizer_service.get_status_fast`) at the board's baseline commit. Nothing about bundles changes.

| `status` | Meaning |
|---|---|
| `ready` | The bundle is complete; `bundleUrl` loads it. |
| `building` | A partial bundle is available (`bundleUrl` set), or a build was just queued (`jobId` set). |
| `missing` | No bundle, and the reader may not queue one (below). |
| `failed` | The project or its status could not be read. |

- **Builds.** A missing bundle is queued as the `webgpu_3d` job for that commit when the reader is a designer or admin, the same roles that can generate a board's 3D view on its own tab. The job's artifact key deduplicates concurrent requests. *(P2-1.24: the key names the 3D generator build, `BUILD_FINGERPRINT`, so a completed job from an older viewer or pipeline build no longer stands in for a bundle the current build reads; before, such a board reported `building` indefinitely.)*
- **`bundleToBoard`** maps the bundle's runtime frame (metres; x right, y up, z out of the front; z = 0 at the bottom face of the substrate) into the board frame (§14.2): scale by 1000, then lower by the mid-plane height `h`. `h` is half the substrate between the inner faces of the outer copper layers in the bundle's layer table (the pipeline's `_set_canonical_board_y_range`), or 0 with fewer than two copper layers. It is null until the bundle's layer table exists.
- A renderer draws a board occurrence with `worldMatrix · bundleToBoard`.
- *(P2-1.24)* Reading the scene reads only each board's outline and thickness from its interface artifact, never the whole artifact.

### 20.3 The System 3D tab (SB2-27)

- `<prism-system-scene>`, in the same viewer bundle as `<prism-semantic-viewer>`, takes the descriptor with `setScene(descriptor)` and is given it again on every re-read. Assets already loaded are kept; an asset that becomes `ready` loads.
- Every board asset is drawn by its own renderer over one shared WebGPU device, canvas and pass. Occurrence numbers in the pick target are scene-wide (each asset's first occurrence is its base), so a pick names one occurrence path.
- **Stand-ins.** An occurrence without geometry draws as its `boundsMm` box, coloured by why: `restricted` (grey), `loading`, `building`, `missing`, `failed`. An occurrence with `boundsMm: null` is not drawn; the tab says so.
- **Events.** `prism-system-scene:selectionchange` with `{ selection: { kind: "board" | "component" | "feature", occurrence, displayPath, instanceId, restricted, standIn, reference? } | null }`, plus `:ready`, `:status` and `:error`.
- **The tab** re-reads the scene every 5 s while a bundle builds or a box is unknown. Without WebGPU it shows the 2D diagram with a notice, and never reads the scene.
