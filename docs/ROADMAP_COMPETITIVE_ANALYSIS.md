# Competitive analysis and feature roadmap

Assessment of KiCAD Prism (`dev`, heading to V3.0.0 alpha) against the
commercial ECAD collaboration stacks that hardware teams migrate away from,
plus a proposed feature roadmap.

Scope note: simulation workflows (SPICE, SI/PI, thermal, EMC) are deliberately
excluded throughout. Rule checking (ERC/DRC/DFM) is *not* simulation and is
treated as in-scope.

Accuracy note: the Prism inventory below is read from this repository. The
Altium and Siemens descriptions are from product knowledge and may lag current
packaging and naming — verify specific SKU claims before using them in
customer-facing material.

---

## 1. What Prism ships today

Read from the `dev` branch, not from marketing copy.

### Project workspace
- Git-native import over SSH/HTTPS, including monorepos with multiple boards
  (`project_import_service.py`, `POST /api/projects/analyze` → `/import`).
- Queued sync, branch/commit pinning, folder tree organisation, project
  properties, thumbnails, global project search.
- Import hardening: host allow-lists, rejection of local paths, embedded
  credentials, and dangerous remote-helper transports.

### Review surface
- Schematic, PCB, WebGPU 3D, engineering BOM, stackup, assembly, iBOM viewers.
- Semantic index with cross-probing between schematic ↔ PCB ↔ BOM identities.
- History browser, release tags, commit-pinned links.
- **Design Comparison**: semantic diff over `components` and `nets` categories
  with added/removed/changed classification, geometry-backed change markers,
  side-by-side and synchronised presentation, camera sync, BOM delta panel,
  stackup panel, PCB layer panel, and commit-pinned discussions
  (`design_compare_service.py`, `frontend/src/components/design-comparison/`).
- Comments with class, severity, resolution, replies, area/object markers,
  stored mentions, and export to `.comments/comments.json`.

### Component governance (Library Manager)
- `open → in_progress → qa_review → done → released` lifecycle with archival.
- Immutable revisions, content-hashed assets, manifest hashing, audit log with
  a verification endpoint (`/components/{id}/audit/verify`).
- Two-person rule: release requires an approver distinct from the revision
  author.
- Configurable metadata field registry, grid preferences, bulk edit, CSV
  import/export, batch apply with field-level approval.
- Import Center: folder-root discovery, project harvest, remediation grid,
  bulk accept, proposal CSV round-trip.
- KLC validation with `off` / `warn` / `block` release gates and durable report
  artifacts.
- Where-used (`/components/{id}/usage`), revision compare, review and release
  history, previews.
- KiCad DBL bundle export and the Remote Symbol Provider (OAuth2) for desktop
  placement of released, place-ready parts.
- CSV stock sync (`/stock/sync-csv`).

### Platform
- FastAPI backend, two worker pools, PostgreSQL, React frontend.
- Durable job system with events, logs, artifacts, cancellation, artifact-key
  caching, and benchmark metrics.
- OIDC SSO, server-side sessions, session revocation, five roles, scoped
  service clients, rate limiting on auth paths, security headers.
- Job kinds: `design_compare`, `webgpu_3d`, `kicad_workflow`, `semantic_index`,
  `project_analyze`, `project_import`, `project_sync`, `project_thumbnail`,
  plus catalog jobs.

### Stated boundaries (from `docs/OVERVIEW.md`)
Single workspace; one role per user; project-scoped standard comments; mentions
stored but not delivered; no webhooks or PR status integration; fixed workflow
types (`design`, `manufacturing`, `render`, `webgpu_3d`) rather than arbitrary
workflows; no real-time co-editing; no in-product approved/changes-requested
state.

---

## 2. Parity assessment

Legend: **Ahead** — Prism is better than the commercial tools. **Parity** —
close enough that a migrating team will not feel a loss. **Partial** — the
capability exists but is materially thinner. **Missing** — not present.

### 2.1 Versus Altium (Designer + Altium 365 / Enterprise Server)

| Capability | Altium | Prism | Verdict |
|---|---|---|---|
| Version control of design source | Git/SVN bolted into the client; the vault is the real system of record | Git *is* the system of record; server-managed checkouts, branch/commit pinning | **Ahead** |
| Web viewer for schematic/PCB/3D | Altium 365 Web Viewer | Full viewer set + WebGPU 3D | **Parity** |
| Design comparison | Basic project/document compare; historical revision compare in the workspace | Semantic component/net diff with geometry markers, BOM delta, stackup delta, synchronised views | **Ahead** |
| Comments and markup on the web | Comments, @mentions, task assignment, notifications | Comments with severity/class/markers; mentions stored but **not delivered** | **Partial** |
| Managed components with lifecycle | Item/revision model, lifecycle states, HRID, parameter templates | Immutable revisions, 5-stage lifecycle, metadata field registry, two-person release, KLC gates, audit verification | **Parity** (Prism arguably ahead on audit rigour) |
| Component supply-chain data | ActiveBOM + Octopart/Nexar: live price, stock, lifecycle, alternates, BOM risk | CSV stock sync only | **Missing** |
| Where-used / impact analysis | Yes, workspace-wide | `/components/{id}/usage` | **Partial** |
| Design release / item revision | Formal release of an item revision with packaged fab/assembly data and lifecycle transition | Assets from jobsets; no release record, no binding of package to approval | **Missing** |
| ECO / change management | Lifecycle transitions + workspace approvals | None | **Missing** |
| Assembly variants | Variant manager, variant-aware BOM/outputs | None | **Missing** |
| ERC / DRC as review evidence | In-client, plus rule sets in the workspace | None — no `kicad-cli sch erc` / `pcb drc` anywhere in the codebase | **Missing** |
| Manufacturing handoff | Manufacturing Portal, shareable package links to fabs/CMs | Assets portal, internal only | **Missing** |
| MCAD collaboration | CoDesign with SolidWorks/Inventor/Creo/Fusion | None | **Missing** |
| Requirements traceability | Requirements & Systems Portal | None | **Missing** |
| Multi-board / harness | Multi-board projects, harness design | Monorepo import; no inter-board connectivity model | **Partial** |
| Draftsman-style drawings | Draftsman documents | Whatever the jobset emits | **Partial** |
| PLM connectors | Arena, Duro, OpenBOM, others | Scoped read-only service clients (build-your-own) | **Partial** |
| SSO, roles, audit | Enterprise SSO, granular workspace permissions | OIDC, 5 non-composable roles | **Partial** |
| Self-hosting | Enterprise Server, expensive | Apache-2.0, self-hosted by default | **Ahead** |

### 2.2 Versus Siemens Xpedition Enterprise (+ Teamcenter, Valor)

| Capability | Xpedition stack | Prism | Verdict |
|---|---|---|---|
| Constraint management | **Constraint Manager** — hierarchical, schematic-driven constraints (net classes, diff pairs, topology, impedance, length matching) cross-probed into layout. The single biggest thing Xpedition users lose | None | **Missing** |
| Library management | Library Manager + central part database, partitions, approval flows | Library Manager with lifecycle, KLC, audit | **Parity** on governance, behind on scale tooling |
| DFM analysis | **Valor NPI** — DFF/DFA/DFT rule decks, fab capability decks, ODB++ | None | **Missing** |
| Design data management | Teamcenter: item/revision, ECR/ECO workflow, approvals, BOM release | Git + catalog lifecycle; no ECO | **Partial** |
| Design reuse blocks | Reuse blocks — schematic + placed/routed layout + constraints as one governed object | None (KiCad 9/10 has native design blocks; Prism does not govern them) | **Missing** |
| Concurrent team layout | Multiple designers on one board simultaneously | Explicitly out of scope | **Missing** (accept) |
| Web design review with markup | DesignRev / ODB++ viewer, largely desktop | Better, browser-native | **Ahead** |
| Variant manager | Yes | None | **Missing** |
| Multi-board systems | Multi-board connectivity, Capital for harness | Monorepo only | **Partial** |
| Test/DFT analysis | Test point coverage, ICT analysis | None | **Missing** |
| Cost of ownership | Very high; seat- and module-licensed | Apache-2.0 | **Ahead** |

### 2.3 The honest summary

Prism is **already ahead** on the things it chose to be about: Git as the source
of truth, browser-native semantic design review, and auditable component
governance. Its design comparison is better than what either commercial stack
gives a reviewer in a browser.

The parity gaps that will actually stop a professional team from migrating,
ranked by how often they will be raised in an evaluation:

1. **No change control.** No approved/changes-requested state, no release
   record, no ECO. Every regulated or ISO-audited team asks this in the first
   meeting. This is gap #1 by a wide margin.
2. **No rule-check evidence.** ERC and DRC results are not captured, not
   diffed, not gated. Reviewers currently have no machine-checked evidence at
   all.
3. **No supply-chain intelligence.** ActiveBOM is the feature Altium users cite
   most when asked what they would miss. Startups feel this immediately because
   they are the ones getting burned by allocation and EOL.
4. **No notifications.** Mentions are stored and dropped. This makes the
   collaboration story feel unfinished regardless of how good the viewers are.
5. **No variants.** Any team shipping more than one SKU from one board is
   blocked.
6. **No constraint governance.** Specifically an Xpedition-migration blocker.
7. **Non-composable roles.** A person cannot be both `designer` and
   `component_designer`. This will be hit on day one of any real rollout, and
   it blocks several features proposed below.

Everything else is differentiation rather than parity.

---

## 3. Workflow A — Git forge identity, issues, and project management

The strategic argument is right: reuse GitHub/GitLab/Jira rather than
reimplement a worse tracker. The refinement worth making is that **pull-request
integration is higher value than issue integration**, because it puts Prism
inside the daily loop rather than making it a place engineers have to remember
to visit.

### A1. Identity and authentication

Today: generic OIDC (`OIDC_ISSUER_URL`, etc.) with a single deployment-level
Git credential — an SSH deploy key or `GITHUB_TOKEN`.

Proposed:

- **First-class forge providers** alongside generic OIDC: GitHub, GitLab
  (SaaS and self-hosted), Google, and later Bitbucket/Gitea/Forgejo. Login page
  shows provider buttons; `AuthConfig` gains a provider list.
- **Per-user forge tokens.** The important architectural shift: capture and
  store (encrypted at rest, refresh-aware, minimum scope) an OAuth token per
  linked account so Prism can act *as the user*. Consequences:
  - Import authorisation derives from the user's real repository access instead
    of a shared deploy key. A user can only import what they can already read.
    This is a genuine security improvement over the current model.
  - Issues and PR comments are attributed to the human, not to a bot account —
    which is what makes forge-side workflows feel native.
  - Keep the deploy key path for unattended server-side sync; per-user tokens
    are for interactive and attribution operations. Do not make background sync
    depend on a human's token expiring.
- **Explicit account linking, never email matching.** A Google login whose
  email matches a GitHub account is not proof of control. Require an OAuth
  link per forge, stored in an identity table (`user_id`, `provider`,
  `provider_user_id`, `handle`, `avatar`, `scopes`, `token_ref`). Support
  multiple linked accounts per user, and unlinking.
- **Self-hosted forges** need per-deployment app registration; support dynamic
  provider config in `.env` plus admin UI, and document the callback URL.

Risks to plan for: token storage is now a high-value target — use envelope
encryption with a KMS-or-file master key, never log tokens, support forced
re-auth and admin-side revocation, and surface granted scopes in the user's
settings page so a security reviewer can audit them.

### A2. Comments as issues

The mechanism: a Prism discussion can be **promoted** to a forge issue, or
auto-promoted by policy (for example, `severity >= major` on a project with an
issue-sync policy configured).

What makes this good rather than merely wired-up:

- The issue body carries a **rendered crop of the marker region** — the
  schematic area or PCB footprint the comment is anchored to — plus the
  refdes/net identity from the semantic index, plus a commit-pinned deep link
  back into the Prism viewer with the exact camera and selection restored.
  Someone reading the issue on GitHub understands it without opening Prism.
  Prism already has the geometry, the semantic identity, and the renderers to
  do this; it is mostly plumbing.
- Structured footer with machine-readable identity
  (`prism-comment-id`, `project`, `commit`, `object-uuid`) so the reconciler can
  recover links even if the local row is lost.
- Labels derived from Prism metadata: severity, class, board name, sheet.

Sync design:

- **Ship one-way first (Prism → forge) with read-back of state.** Two-way
  comment mirroring is the single highest-maintenance surface in this entire
  document. V1: create the issue, then poll/webhook only for `state` and
  `assignee` so Prism can show "closed on GitHub" and offer to resolve the
  discussion. V2: mirror comment bodies both ways.
- Everything goes through the **existing job system**. A forge outage must
  never block someone leaving a comment on a board. Queue, retry with backoff,
  surface a "sync pending / sync failed" badge on the discussion.
- **Loop prevention** is mandatory: tag Prism-authored forge comments and
  ignore them on inbound webhooks; use the forge's node/global ID for
  idempotency; store `last_synced_etag`.
- A **reconciliation job** that periodically re-reads linked issues, because
  webhooks are lossy and self-hosted GitLab instances drop them.

### A3. Pull-request integration — the highest-value piece

When a PR/MR opens or updates against a repository Prism has imported:

1. Webhook fires → Prism enqueues a `design_compare` for `base...head`.
2. Prism posts a **check run / commit status**: `prism/design-review`.
3. The check summary is the review the human would otherwise have to assemble
   by hand:
   - components added / removed / changed, with the notable refdes list
   - nets added / removed / changed
   - BOM delta with line-item and cost implications
   - stackup or layer-count change (flagged loudly — it changes fab cost)
   - board outline / mounting-hole change (flagged for mechanical review)
   - new ERC/DRC violations relative to base (see §5.2)
   - unresolved major/critical Prism discussions on this branch
4. A single link into the prepared comparison, already warm.
5. Optional **required check** so branch protection can block a merge on
   unresolved critical discussions or new DRC violations.

This is the feature that changes Prism from a review site into infrastructure.
It is also the best demo you will ever have: open a PR, get an automatic
hardware-aware review summary that GitHub cannot produce on its own.

### A4. Dashboard / "My work"

Landing view aggregating, per user:

- Forge issues assigned to me across all linked projects
- PRs awaiting my review that touch imported hardware projects
- Prism discussions where I am mentioned, or that I authored and are unresolved
- Catalog items waiting on my QA (already queryable via the release queue)
- Failed or long-running jobs I started
- Board bring-up units awaiting my sign-off (see §4)
- Component EOL/stock alerts affecting projects I own (see §5.4)

Implementation note: fan-out to forge search APIs is rate-limited and slow.
Cache aggressively with a short TTL, refresh in the background, and render
local data (discussions, jobs, catalog, bring-up) immediately rather than
blocking on the network round-trip.

### A5. Jira, Linear, and the tracker abstraction

Do not special-case each tracker. Define a `TrackerProvider` interface:

```
create_issue(project_ref, title, body, labels, assignee) -> external_ref
update_issue(external_ref, ...) -> None
read_issue(external_ref) -> IssueState
search_assigned(user_ref) -> list[IssueState]
verify_webhook(headers, body) -> Event | None
issue_url(external_ref) -> str
```

Ship GitHub → GitLab → Jira in that order. Jira specifics that will bite:
Atlassian OAuth 2.0 (3LO) with rotating refresh tokens; project and issue-type
mapping must be configurable per Prism project; the Prism deep link should go
in a dedicated custom field, not buried in the description; webhooks are
admin-scoped and differ between Cloud and Data Center.

For kanban boards and timelines: **do not rebuild them.** Deep-link out, and at
most embed a read-only summary (counts by status, sprint burndown thumbnail).
The whole point of this workflow is to not maintain a worse tracker.

### A6. Releases

Link Prism release tags to forge releases, and attach the manufacturing package
(§5.9) as release assets so the fabrication data for a given revision is
retrievable from the forge even if Prism is offline.

---

## 4. Workflow B — Board bring-up, units, rework, and failures

This is the strongest idea in the brief, and it deserves to be built.

Neither Altium nor Xpedition covers this well. Altium has essentially nothing
between "design released" and "product in the field". Teamcenter and full QMS
suites cover it at a cost and complexity no startup will accept. What every
hardware team actually does today is a spreadsheet of serial numbers, a
Slack thread, and a photo of a board with bodge wires. **This is a genuine
frontier feature, not a parity feature**, and it is the natural extension of
Prism's existing claim: Git holds the design, Prism holds everything around it.

### B1. Data model

**Build (manufacturing lot)** — the anchor object. Binds physical hardware to
an immutable design revision:

```
build:
  id, project_id, name            # "EVT", "DVT-2", "Rev B pilot"
  design_ref:
    commit_sha                    # immutable
    tag                           # optional, e.g. A.1.0.0
    manufacturing_artifact_digest # the exact package sent to the fab
  variant_id                      # optional, see §5.5
  fab, assembler, po_number, quote_ref
  quantity_ordered, quantity_received
  ordered_at, received_at
  notes, attachments              # quote, DFM feedback, AOI report
```

The `manufacturing_artifact_digest` is the important field. It answers "what
exactly did we send?" — a question that is currently unanswerable in Prism and
that causes real money to be lost.

**Unit (serial)**:

```
unit:
  serial                          # unique within workspace
  build_id
  status                          # received | in_bringup | passing | failing
                                  # | deployed | rma | scrapped
  owner, location                 # who has it, which bench/site
  variant_id                      # if it differs from the build default
  created_at, updated_at
```

Serial handling matters more than it sounds:
- Configurable serial scheme per project (prefix, date code, sequence width).
- Allocate a block of serials for a build up front.
- Generate printable label sheets (Code128 / DataMatrix) with a QR encoding
  `https://prism.example/u/<serial>`.
- `/u/<serial>` resolves to a **mobile-friendly unit page**. Bring-up happens
  at a bench with a scope and a phone, not at a desk with two monitors. If this
  view is not good on a phone, the feature will not get used.

**Bring-up procedure** — versioned in Git, results in PostgreSQL. This respects
the sources-of-truth split already stated in `OVERVIEW.md`:

- Procedure lives in the project repo (`docs/bringup/*.md` with front-matter,
  or `.prism-bringup.yaml`), so it is reviewed, versioned, and diffable through
  the existing document-diff service and the normal PR flow.
- Prism parses it into structured steps with typed expectations:

```yaml
steps:
  - id: PWR-01
    title: 3V3 rail voltage
    type: measurement
    unit: V
    min: 3.20
    max: 3.40
    refdes: U3          # links into the semantic index
    net: +3V3
  - id: PWR-02
    title: Inrush waveform
    type: attachment
    accepts: [image, csv]
  - id: FW-01
    title: Bootloader enumerates over USB
    type: pass_fail
```

- `refdes` / `net` fields cross-probe into the schematic and PCB viewers. A
  failing step can highlight the exact component on the board. This reuses
  machinery Prism already has.

**Test run**:

```
test_run:
  unit_serial, procedure_version (git blob sha), operator, started_at, ended_at
  environment                     # temperature, equipment IDs, cal-due dates
  results: [ {step_id, value, pass, notes, attachments[]} ]
  overall: pass | fail | partial
```

**Automated ingest is non-negotiable.** Engineers will not hand-type forty
measurements. Expose `POST /api/units/{serial}/test-runs` authenticated by the
**existing scoped service-client mechanism**, accepting JSON, JUnit XML, or
CSV. A pytest/LabVIEW/Python bench harness posts results directly. Provide a
tiny reference client. The manual web form is the fallback, not the primary
path.

**Failure / defect**:

```
failure:
  unit_serial, discovered_in (test_run_id | field | manual)
  symptom, severity
  affected_refdes[], affected_nets[]    # semantic-index linked
  category    # design | assembly | component | process | esd | firmware | unknown
  root_cause, disposition
  linked_issue (external_ref)           # §A2
  fixed_by_commit / fixed_in_build
```

Two links here are where the value compounds:

- **Failure → component.** A failure attributed to a refdes rolls up to the
  catalog component and its MPN. Over time: *"this MPN has 4 field failures
  across 3 projects."* No ECAD tool offers component reliability history
  grounded in your own build data. This alone justifies the module.
- **Failure → design change.** Link a failure to the issue and to the commit
  that fixed it. Closes the loop from bench observation to schematic change to
  next build.

**Rework** — two objects, deliberately separated:

```
rework_instruction:            # the recipe, reviewed and approved once
  id, project_id, title
  description                  # "Add 10k from TP4 to U3 pin 12"
  affected_refdes[], affected_nets[]
  annotated_images[]           # marked-up schematic/PCB crops
  approved_by, approved_at
  roll_into_design: bool       # must this become an ECO?
  resolved_by_commit           # set when the design change lands
  applies_to_builds[]

rework_application:            # per-unit record
  rework_instruction_id, unit_serial
  applied_by, applied_at, verified_by
  photo_evidence[], notes
```

The payoff query: **effective configuration per unit** = base build + applied
reworks, rendered as a stack:

```
SN-0042   Rev B (a3f19c2)  + R-001  + R-003        [2 of 4 recommended]
                                     ⚠ missing R-002, R-004
```

You can now answer "which boards actually have the fix?" and "is this unit's
result comparable to that one's?" — questions that currently get answered by
memory and are frequently answered wrong. Neither Altium nor Xpedition has
anything here.

`roll_into_design` plus `resolved_by_commit` prevents the classic failure mode:
twelve boards fixed with bodge wires and nobody updates the schematic.

### B2. Analytics

- **First-pass yield** per build, trended across builds.
- **Failure Pareto** by step, by refdes, by category.
- **Failure heatmap on the PCB.** Overlay failure counts per refdes onto the
  existing PCB viewer using the semantic index geometry. Prism already has the
  geometry and the identity mapping — this is nearly free to build and is the
  single most compelling screenshot the product could produce.
- **Measurement distributions** per step against spec limits, with Cpk. Catches
  the rail that is passing at 3.21 V against a 3.20 V limit before it becomes a
  field return.
- Cross-build comparison: did Rev B actually fix the Rev A failure mode?

### B3. UI and roles

- New **Bring-up** section in `ProjectDetailPage` alongside Overview, History,
  Visualizers, Workflows, Assets, Documentation. Sub-views: Builds, Units,
  Procedures, Failures, Reworks, Analytics.
- A workspace-level **Fleet** view spanning projects, for the person who owns
  hardware logistics.
- **This forces the role model fix.** A test technician must be able to record
  results and apply reworks without being able to modify designs or import
  repositories. The current single-role model cannot express that. Adding
  `test_operator` as composable permissions is a prerequisite — which is fine,
  because non-composable roles is already a known boundary that needs fixing
  regardless.

### B4. Unit birth certificate

Per-unit PDF export: design revision and commit, build and fab, full test
record with measurements, all applied reworks with evidence, sign-offs, and
timestamps.

This is what you hand a customer, an auditor, or a certification body. For
teams in medical, aerospace, industrial, or automotive markets, this is an
AS9100 / ISO 13485-adjacent artifact that they would otherwise buy a QMS to
produce. It is an instant credibility feature and a strong commercial hook.

---

## 5. Proposed roadmap beyond the two named workflows

Ordered roughly by value-to-effort, with the parity blockers first.

### 5.1 Design review state, release records, and ECO — *parity blocker #1*

- First-class project review state: `draft → in_review → changes_requested →
  approved`, bound to a commit, with a configurable review checklist.
- **Release record**: an immutable object binding {commit, jobset outputs and
  their digests, ERC/DRC evidence, BOM snapshot, approver signatures, release
  notes}. This is what Altium's item-revision release and Teamcenter's ECO
  give you, and it is the thing Prism most conspicuously lacks.
- Attributable sign-off (re-authentication at signing time, immutable audit
  entry). Not full 21 CFR Part 11, but close enough to matter.
- ECO objects that link {reason, failures from §4, affected units, approvals,
  the commit that implements it, the build it first ships in}.

Nothing else on this list changes an evaluation outcome as much as this.

### 5.2 ERC / DRC gates — *parity blocker #2, cheapest high-value item here*

There is currently no DRC or ERC anywhere in the backend. Meanwhile the job
infrastructure, artifact storage, and comparison machinery already exist.

- Run `kicad-cli sch erc` and `kicad-cli pcb drc` (JSON output) as job kinds.
- Normalise violations into a stable schema with stable IDs so they can be
  **diffed against the base commit**: "this change introduces 3 new DRC
  violations, resolves 7."
- Render violations as markers in the existing PCB/schematic viewers, using the
  same overlay path as comments.
- **Waiver workflow**: a violation can be waived with a justification, an
  approver, and an expiry date. Waivers are reviewable objects that expire —
  which is better than what the commercial tools offer, where suppressions rot
  silently.
- Surface as a required check on PRs (§A3).

This is rule checking, not simulation, and it is the single best
effort-to-credibility ratio on this list.

### 5.3 Notifications and inbox — *parity blocker, unblocks everything else*

Mentions are stored and dropped today. Deliver them: in-product inbox, email,
and outbound webhooks (Slack/Teams/Discord via incoming webhooks rather than
bespoke integrations). Per-user preferences and digest mode. Every feature in
this document is less useful without it.

### 5.4 BOM and supply-chain intelligence — *parity blocker #3*

The ActiveBOM equivalent. This is what startups feel first.

- Pluggable `SupplyProvider` interface — Nexar/Octopart, Mouser, DigiKey,
  Arrow, plus a **manual/CSV provider** so air-gapped self-hosted deployments
  still work. Prism is self-hosted; do not assume outbound internet.
- Per-catalog-part **AVL**: approved manufacturers and distributors, alternates
  and second sources with an approval state of their own.
- **BOM risk scoring**: single-source, NRND/EOL, lifecycle status, lead time,
  stock versus planned build quantity, minimum order quantity, price break
  analysis.
- "Can I build 50 of these today, and for how much?" — a single answer on the
  BOM page.
- **EOL and PCN watch** across the whole catalog with blast-radius analysis:
  which projects, which builds, which units are affected. Feeds §5.3.
- BOM snapshot frozen into the release record (§5.1) so the BOM that was
  released is recoverable years later.

### 5.5 Assembly variants

Variant definitions (fitted/not-fitted, alternate values, alternate MPNs) as
first-class, versioned objects. Variant-aware BOM, CPL, assembly drawing, and
design comparison. Variant-aware builds and units in §4. Any team shipping more
than one SKU from one PCB is blocked without this.

### 5.6 DFM and fabrication capability profiles

The Valor NPI gap, addressed proportionately:

- **Vendor capability profiles**: min trace/space, min drill, annular ring,
  aspect ratio, min silkscreen width, mask sliver, panel dimensions, layer
  count, controlled-impedance offerings, surface finishes. Ship profiles for
  the common low-cost fabs and let teams add their own.
- Check the design against the selected vendor and produce a stoplight report
  *before* the Gerbers are sent.
- Assembly-side checks: courtyard overlaps, fiducial presence and placement,
  tooling holes, part height clearances, paste aperture sanity, CPL/pick-place
  consistency against the BOM.
- Cost estimation driven by the profile (layer count, area, finish, quantity).
- Panelisation validation.

### 5.7 Constraint and design-intent registry — *the Xpedition migration answer*

Prism cannot be a constraint editor — that is KiCad's job. But it can own
constraint *governance*, which is what Constraint Manager users actually value:

- Declare design intent as a versioned, reviewable, in-repo document: net
  classes, differential pairs with target impedance and tolerance, length
  matching groups and tolerances, layer assignments, keepouts, high-voltage
  spacing.
- A checker verifies that the KiCad project's actual net classes and custom
  DRC rules match the declared intent, and reports drift.
- Diff constraints across commits as a first-class comparison domain, alongside
  components and nets. "Someone changed the USB differential pair impedance
  target from 90Ω to 100Ω" is exactly the kind of change that currently escapes
  review entirely.

### 5.8 Managed design blocks and reuse — *strong differentiator*

KiCad 9/10 has native design blocks. Nobody governs them yet.

Apply the existing catalog lifecycle machinery to a **design block**: a
hierarchical schematic sheet, its matching layout snippet, its constraints, its
validated BOM subset, and its bring-up procedure fragment — versioned,
QA-approved, released, and placeable. "We designed this buck converter once,
qualified it once, and it is now a released, traceable, reusable object" is a
message that lands hard with both startups and enterprises, and Prism already
has essentially all the machinery.

### 5.9 Manufacturing handoff portal

An externally shareable, scoped, expiring, optionally watermarked view of a
release package for a fab or CM, without giving them repository access:

- Immutable package tied to a release record (§5.1).
- Vendor Q&A thread that routes back into Prism discussions and forge issues.
- A record of exactly which package version each vendor received and when.
- Vendor-uploaded artifacts back into Prism: DFM feedback, AOI reports, X-ray
  images, first-article inspection — which then attach to the build in §4.

This replaces a genuinely awful email-and-Dropbox process, and it closes the
loop into the bring-up module.

### 5.10 Requirements traceability

Lightweight, in-repo requirements (YAML/Markdown, versioned, diffable) linked
to design elements (nets, blocks, components) and to bring-up test steps (§4).
Generates a traceability matrix: requirement → design implementation →
verification evidence → the specific units it was verified on.

This is what Altium charges enterprise money for, it is mandatory in regulated
markets, and in Prism it is mostly a linking layer over things §4 and §5.8
already create.

### 5.11 Multi-board system view

Prism already imports monorepos with multiple boards — nobody else is well
positioned for this.

Declare inter-board connectivity (this connector on board A mates with that
connector on board B, via this cable), then check pin-to-pin consistency across
boards, flag mismatches, and generate a system-level interconnect diagram.
Catches the most expensive class of bug in multi-board products: the one you do
not find until both boards are back from fab.

### 5.12 Mechanical / MCAD review loop

Not full CoDesign. Instead: detect and highlight changes to board outline,
mounting hole positions, connector placement, and keepouts; export STEP and
diff it; and provide an explicit mechanical sign-off gate on a release. Route
mechanical change requests through the same discussion and issue machinery.

### 5.13 Field and fleet tracking

The natural extension of §4 past deployment: units in the field, RMA intake
(scan the serial, see its entire history), failure-rate-by-revision analytics,
and firmware-version-to-hardware-revision compatibility tracking. Turns Prism
into a hardware lifecycle system rather than a design review tool.

### 5.14 Platform: outbound webhooks and events

Publish Prism events (job completed, comparison ready, component released,
test run recorded, unit failed, DRC regressed) so teams can build their own
automation. A self-hosted tool that cannot be automated will be worked around.

### 5.15 AI-assisted review — *frontier, position carefully*

Grounded on the semantic index and diff data that already exist:

- Natural-language change summaries on a PR: "moves the feedback divider,
  changes R12 from 10k to 12k, adds a 100nF near U3, no net topology change."
- Natural-language search across designs, catalog, and bring-up history: "which
  boards used this regulator and had a thermal failure?"
- Review checklist suggestions based on what changed.
- Bring-up failure triage: "3 units failed PWR-01, all from build DVT-2, all
  with C14 from the same reel."

Position this as an assistant layered on top of deterministic analysis, never
as authority. The deterministic diff and rule checks are the product; the
summarisation is convenience. Say so explicitly in the UI — hardware engineers
are, correctly, sceptical.

---

## 6. Suggested release sequencing

**R1 — Close the credibility gaps.** Composable permissions; notifications and
inbox; ERC/DRC job kinds with baseline diffing and waivers; design review state
and release records with sign-off.
*Rationale: these are the questions asked in the first evaluation meeting, and
several later features depend on them.*

**R2 — The two named workflows.** Forge identity and per-user tokens; PR check
runs with automatic design comparison; comments → issues (one-way + state
read-back); user dashboard. Bring-up module v1: builds, units, serials,
procedures, test runs with API ingest, failures, reworks, effective
configuration.
*Rationale: R1's release records and permissions are prerequisites for doing
these properly.*

**R3 — Professional depth.** Supply-chain intelligence and AVL; assembly
variants; DFM and fab capability profiles; manufacturing handoff portal;
bring-up analytics and birth certificates; Jira provider.

**R4 — Frontier.** Managed design blocks; constraint registry; requirements
traceability; multi-board system view; fleet and field tracking; MCAD loop;
outbound events; AI-assisted review.

Two cross-cutting notes:

- **Composable permissions is on the critical path for more than it appears.**
  Bring-up needs a technician role, the manufacturing portal needs external
  vendor scoping, and the release workflow needs approver roles. Doing it once,
  early, in R1 is much cheaper than three partial workarounds.
- **Keep the sources-of-truth discipline.** The pattern that already works —
  definitions in Git (reviewable, versioned, diffable), instance records in
  PostgreSQL — should be applied to bring-up procedures, constraints,
  requirements, and variants alike. It is what keeps Prism honest about being a
  layer around Git rather than a competing vault, and it is a real
  differentiator against every tool listed in §2.
