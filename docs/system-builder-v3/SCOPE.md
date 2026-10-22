# System Builder V3 — scope

- **Status:** Draft for the maintainer's review (2026-10-23). Nothing here is decided until §9's questions are answered. No implementation starts before then.
- **Branch:** `feature/system-builder-v3`, off `feature/native-design-bundle` at c4d725ee. Pull requests into it run no CI (the dev quality gate does not list it); see D13.
- **Supersedes as input, not as decisions:** `System-Builder-V3-PRD-2026-10-21.md` (mechanical PRD draft) and the V2 UX audit `Prism-System-Builder-V2-UX-Audit-2026-10-21/REPORT.md`. Both are read and folded in below. Where this document differs from them, it says so.

## 0. Why a scope document first

V2 drifted. It shipped about twenty PRs (#788–#809) in three days, each locally reasonable, and the result was a capable engine behind a UI that could not finish a four-wire fan (audit §Verdict). V3 is held to these rules:

1. **Every work package names the scope items (S-ids) it delivers.** Work with no S-id is either added here first, with the maintainer's agreement, or not done.
2. **Every scope item names its journey (J-id) and the tedium it removes.** A feature with no journey is not in scope.
3. **Every interaction has a script equivalent before it ships** (§5). The UI is one client of the operations, never the only one.
4. **Reuse before rebuild.** §2 lists what V2 got right. V3 changes those only where this document says why.
5. **Acceptance is a journey run end to end by someone who has never seen the code**, on real boards (§8), not a passing suite.

## 1. What V3 is

A system is everything that ships in one box: boards (rigid, rigid-flex, flex), bought-out devices, mechanical parts (enclosure, brackets, heatsinks, fasteners, standoffs), and the harnesses and flex jumpers between them. V3 lets one engineer, or an agent working for them, **describe that box once**, with every connection, placement and part known, and get back:

- every signal traced end to end across boards, mates, harnesses, flex and chassis;
- an assembly that is placed by real relationships, such as mates, fastenings and folds, rather than by dragging;
- the checks that a reviewer would otherwise do by hand: compatibility, fit, collision, bend radius and completeness;
- the documents that a buyer, harness shop, mechanical engineer and assembler each need, all from one snapshot.

**Beyond Altium, not parity.** Altium splits this across five documents and four synchronisation steps: the multi-board schematic (`.MbsDoc`), the assembly (`.MbaDoc`), the harness project (`.PrjHar` with its wiring and layout documents), the system BOM, and Draftsman. Each step is an ECO the user runs by hand. V3 has **one model with live views**. Nothing is imported, and nothing goes stale between views. §3 lists where Altium stops and where V3 should go further.

## 2. What V2 got right — carry forward

The internal V2 milestone is 6463eea7, which added #809 and the polish branch on top. Its verdict comes from the code, the contracts and the audit's "worth preserving" list.

### 2.1 Keep as is (engine)

| V2 piece | Where | Why keep |
|---|---|---|
| One versioned document, operations, recorded-inverse undo, version precondition | `backend/app/system_builder/{document,ops,inverse,store}.py`, contracts §2–§4 | Sound and tested; the only write path; the basis for scripting |
| Boards referenced by pinned commit or followed branch, read from design bundles; system-issued `advance-occurrence` | contracts §2.1, §8 | No copied board data; drift is a finding, not a sync |
| System bundle in Rust (`prism-kicad system build`): system nets, geometry-derived B2B mapping, findings with fixed severities, sub-port suggestions | `native/src/rs/prism-system` | Fast, deterministic, cached by key |
| Placement: mate spanning tree, positioning mate, mate-agreement findings, world connector frames | `prism-system/src/placement` | V3 extends the set of relationships; it does not replace the solve |
| Harness object model: ends, links, wires, splices, branch points, segments, coverings, cables, loose ends, markers, waypoints; wire list derivation; route maths (RMF frames, bend radius, gauge-based tube sizing) | contracts §2.5, §16; `prism-system/src/{harness,wiring,routing}` | Complete and correct; the UI around it is what failed |
| Harness parts as catalog parts with `harness` fields and **mates with** | contracts §16.1 | Lets V3 propose mating housings automatically |
| Published systems as one catalog kind (bought-out or in-house), frozen bundles, Git link | contracts §11–§13 | Reuse model is right |
| Outputs engine: harness drawing, wiring table, BOM, YAML, ICD (PDF/HTML/CSV), STEP AP242 writer | `harness_outputs/`, `icd/`, `prism-system/src/step` | Release Studio look; real files verified in Geometer |
| Analytic multi-board 3D with occurrences, assembly explode, per-board stackup separation, move gizmo with snapping | viewer `analyticView`, `features/system-builder/three-d` | Meets the five-board budget except stackup p95 |
| Script API pattern (`window.prismSystemBuilder`): selection by meaning, every write is one ops request | contracts §14.6 | The seed of §5 |

### 2.2 Keep the engine, redesign the interaction

| V2 surface | Audit evidence | V3 direction |
|---|---|---|
| Schematic: boards as large hierarchical sheets with connector pins on edges | #08, #37, user's own dissatisfaction | Interface-first canvas: compact board cards, interfaces named by function, pin summaries on demand (§4.2) |
| B2B tab, manual map as a 121-line text box | #07, #15 | Mate result card on creation; per-pin table with validation; text paste kept as an expert path |
| Harness configurator in a split pane | #17–#19, #23 | Full-width harness workspace with fit/zoom, one conductor label everywhere, inline wire table |
| Review as a waiver list | #11, #13, #14 | Repair workflow: each finding opens its exact object and offers the fix |
| Outputs as a format list | #31–#35 | Readiness first, then packages by audience |
| Move / place-connector overlays | #29 | One inspector region, typed values with units and frame |

### 2.3 Replace

| V2 piece | Why | V3 replacement |
|---|---|---|
| Module authoring (board-less system → body STEP → place connector parts on faces → export → publish → place) | Dead end for a 4-wire fan (#01–#05) | **Device**: interface-first, created inline from the parent, geometry optional and added later without changing identity (S-DEV) |
| Catalog readiness = symbol + footprint for everything | Wrong gate for a fan, screw or housing (#03) | Readiness per intended use: PCB part, mechanical part, harness part, device (S-CAT) |
| Connector pin count includes mounting pads | Misleads housing choice (#09) | Electrical positions and mechanical/shield contacts kept separate (S-IF) |
| Floating dark panels per tool | Feels unlike Prism (#38) | Prism's panel system; navigator, canvas, inspector (§4.1) |

### 2.4 Known V2 defects V3 inherits (fix inside the relevant S-item, not as separate work)

- No UI to delete a system.
- No right-angle or edge-mount header model: mate pins come out unmapped, placement offsets are wrong, and the low-profile stack (LPS) falls back to a clearance estimate. Found in the EEE_EGSE_SAS import.
- Stackup separation p95 is 24–25 ms on five boards (budget 16.7 ms), and the browser misses the asset cache. Both are left from the performance thread.
- Missing 3D models are reported only as counts at STEP export (#30).

## 3. Gap analysis

"Altium" means Altium Designer 26 with Multi-board and Harness Design, as currently documented. That includes features behind Advanced Settings. Sources are listed in Appendix A.

| Area | Altium | KiLeidoscope / Kikakuka | Prism V2 | V3 target (beyond) |
|---|---|---|---|---|
| Board interfaces | Only connectors tagged `System=Connector` are imported, through an ECO | — | Connectors detected automatically; sub-ports and suggestions | Detected, **named by function**, with pin roles (direction, voltage, current), and mounting/shield contacts kept separate |
| External devices | Custom Part/Connection behind Advanced Settings; **excluded from the assembly and the system BOM** | — | Board-less system path; unusable in practice | One device identity carries pins, geometry and BOM from first sketch to release |
| B2B mating | Logical Direct Connection; physical mate picked from 9 glyphs per face; the two are not linked | Kikakuka: coupler footprints in the PCB drive alignment | Mapping derived from geometry; the mate places the board | Keep V2, plus **proposed mates** found from mating parts and geometry, and coupler-style datums read from the PCB |
| Rigid-flex / flex | Bend lines in the PCB; folded state shown in MBA; MCAD push of RF2 | KiLeidoscope: bends, twists, cones, wraps, domes, stiffeners, fold steps, IPC-2223 radius checks, fold collision. Kikakuka: bend lines, stiffeners, bending + assembly in FreeCAD | None | Flex read from the board; **fold states per system configuration**; a flex jumper is an interconnect between boards whose fold is checked against its two mates |
| Harness | Separate project; logical→wiring diagram by ECO (pin-name dependent); physical wires placed by hand; 2D layout drawing; bundle views new in 26.x | — | Integrated configurator, 3D routing, findings, outputs | Keep the integration; add **auto-proposed housings, contacts, gauges, colours and lengths**, route assists, and a formboard derived from the 3D route |
| Mechanical | STEP parts; generic plane/axis mates; collision (touch/intersect) only; measure distance | KiLeidoscope: multi-board collision preview | Bodies with STEP; no fastening, measure, section or collision | Typed relationships (fasten, mount, contact); hardware stacks from catalog; **clearance against policy, not only collision**; measure and section |
| Change flow | ECOs per document pair; "Update All Parts" before the BOM refreshes | Kikakuka: auto-reload of linked files | Followed boards advance; findings flag changes | **One change review per system**: everything a revision touches, accepted in one place |
| Navigation | Assembly tree with search; cross-probe across documents | — | Missing (#25) | Persistent semantic navigator plus **end-to-end trace** of any pin, net or conductor |
| Outputs | MbDwf drawings, system ActiveBOM, STEP/Parasolid/PDF3D, harness Draftsman | Kikakuka: assembly manifest → STEP/STL from CLI | ICD, harness package, STEP | Readiness-led packages per audience; outputs bound to one snapshot; build instructions later (S-DOC) |
| Automation | Scripting via DelphiScript/API; no agent surface | Kikakuka: CLI for fab plans and assembly export | Browser script API | **Every interaction is an op or a describe call**, available from the UI, a CLI and agents (§5) |
| Variants / states | Assembly variants limited | Kikakuka: build variants (BUILDEXPR) | None | Configurations (D7) |

Licences: KiLeidoscope is GPL-3.0, so it is used as behaviour reference only, like KiCad. Kikakuka is MIT; its bending pipeline (`FreekiCAD/ARCHITECTURE.md`) may be ported with its notice kept.

## 4. Experience model

### 4.1 Layout

**Navigator | canvas | inspector**, in Prism's own panel style.

**Navigator.** Always present and searchable. It holds Boards, Devices, Mechanical, Interfaces, Connections (mates, harnesses, flex, fastenings), Configurations and Findings. Selecting anything there or on a canvas cross-highlights it everywhere. Hide, isolate and focus work from the tree. Occluded objects stay reachable.

**Canvas lenses.** There are five, each with tabs, as in V2:
- **Connectivity**;
- **Assembly** (3D);
- **Harness**, one per harness or flex jumper;
- **Review**;
- **Documents**.

A second pane is opened explicitly ("Open beside → …"), with a minimum width and a fit-on-open rule. It is never opened automatically.

**Inspector.** Context actions come first and removal last. The inspector shows readiness for the selection.

**Header.** A **readiness strip**, for example "4 boards · 2 devices · 3 harnesses · 1 fan not connected · 6 warnings · 3 models missing". Each item links to the place that fixes it.

### 4.2 Interaction principles (the anti-tedium rules)

1. **Propose, then accept.** Wherever Prism can infer something, it proposes it, and one keystroke or click accepts or rejects it. Proposals cover:
   - mates from mating parts and geometry;
   - interface names from nets;
   - housings from **mates with**;
   - contacts from the cavity family;
   - gauges from pin current;
   - wire colours from a policy;
   - lengths from the route;
   - fastener stacks from hole patterns and the catalog.

   Proposals are never applied silently.
2. **Intent first, detail later.** Any object can start as a draft with unknowns: a device with pins and no model, a harness with ends and no housings, an enclosure with only an envelope. Unknowns are findings, never blockers to keep working.
3. **Every gesture shows its result at once,** with undo next to it. For example, creating a mate opens its result card immediately.
4. **One name per object everywhere.** A conductor is W3 on the canvas, in tables, in drawings and in scripts. Storage IDs live under Details.
5. **Select by meaning.** Selections work by refdes, function name, net, net pattern, pin role or finding, in the UI and in scripts alike. Rectangles are a convenience, not the model.
6. **No modes without a visible exit.** Every tool (route, fasten, fold, measure) shows Done/Cancel and its key.
7. **Separate the states.** "Connected", "compatible", "placed", "verified" and "manufacturable" are shown separately and never merged into one green check (audit Pass 2).
8. **View state is not design state.** Explode, fold preview, section and measure are visibly view-only, unless the user authors a configuration (D7) or a dimension.

### 4.3 Journeys

Each journey lists its gestures, the op or call that each one becomes, and the tedium it removes. The S-ids are defined in §6.

**J1 — Start a system from a repository (mono-repo or several).**
1. New system → pick projects. Multi-select is allowed, including a whole monorepo folder. This becomes `add-occurrence ×N`.
2. Prism runs **Propose connections**:
   - B2B pairs, from mating part pairs plus a facing-geometry check;
   - cable candidates, from cable-type connectors whose net names match across boards;
   - power entry, from pin roles.
3. One review sheet lists the proposals ("2 mates, 3 harness links, 1 power input"), each with an Accept toggle. The accepted ones are applied as one request.

*Removes:* placing boards one at a time and hunting for connector pairs by refdes. *Script:* `prism system init --projects … --propose > plan.json`, then `prism system apply plan.json`. *(S-INIT, S-PROP)*

**J2 — Add anything.**
1. Press `A`, or use "+ Add", in either lens. One palette searches projects, the catalog (devices, mechanical, harness parts) and published systems.
2. When nothing matches, the palette offers "Define device…", "Import STEP as part…" or "New draft part", and returns to the system afterwards.

The added object lands beside the current bounding box, keeping V2's default. *Removes:* audit #01, #02 and #04. *Script:* `add(kind, query | spec)`. *(S-ADD, S-DEV, S-CAT)*

**J3 — Define a device (fan, sensor, radio) interface-first.**
1. "Define device…" asks for a name and a pin table: paste from a datasheet, type, or let an agent fill it from a PDF.
2. Each pin has a role (power in/out, ground, signal in/out/bidir, open-collector, shield) and optional voltage and current.
3. The connector is a catalog part, or "unknown" for now.
4. Geometry is added later (STEP, or a parametric box with the connector at a face) without changing the device's identity.

*Script:* `defineDevice({name, pins:[…], connector?})`. *(S-DEV)*

**J4 — Mate two boards.**
- In either lens, drag a connector onto a connector, or pick from the inspector's **Compatible mates** list, which is ranked by mating part, pin count and geometry.
- The result card opens at once and shows:
  - mapped and unmapped pins;
  - orientation;
  - stack height and its basis: the catalog mated height, else the clearance estimate, labelled as such;
  - the net pairs that need review.

  The user can correct, flip or set the offset there, with Undo beside them.

*Script:* `connect({a, b, kind:"mate"})` then `describeMate`. *(S-B2B; keeps V2's mapping)*

**J5 — Connect through a harness.**
1. Draw from an interface to an interface. A harness block is created or joined, as in V2.
2. The **harness workspace** opens full width, with proposals already filled in:
   - mating housings from **mates with**;
   - contacts for each used cavity;
   - wire gauge from pin current, with a policy default;
   - colour from policy (power red, ground black, and so on, configurable);
   - pin pairing by function name, then net, then order.

   Mounting pads are never offered as cavities.
3. One "Accept all proposals" applies them, or the user accepts them row by row.

*Removes:* choosing housings, contacts, gauges and colours by hand. *Script:* `connect({kind:"harness"})`, `proposeHarness(h)`, `apply`. *(S-HAR)*

**J6 — Route a harness or flex in 3D.**
- Route mode, entered directly from the harness ("Route" opens 3D *in* route mode), shows the ends' frames.
- **Route assists** turn a gesture into waypoints:
  - snap to a board edge;
  - follow a surface;
  - go through a clip or grommet;
  - keep a minimum clearance from selected parts.
- Lengths, bend checks and clearance update live and feed the BOM.
- A formboard (the 2D nail-board drawing) is derived from the route, not drawn by hand.

*Script:* `route(h, {via:[…], follow:"edge"|"surface", clearanceMm})`. *(S-ROUTE)*

**J7 — Place a flex or rigid-flex board.**
- Prism reads the board's flex zones, bends and stiffeners (D4) and shows the board folded, with a fold slider and per-bend handles.
- A flex **jumper** between two boards is placed by its two end mates. Prism solves its fold for the fold chain's free angles where the chain is simple (D5) and reports residuals otherwise.
- IPC-2223 radius checks and flex checks (traces across bends, vias in bends, stiffener in a bend, self-collision when folded) are findings.

*Script:* `setFold(occ, {bend, angleDeg})`, `describeFlex(occ)`. *(S-FLEX)*

**J8 — Mount boards and parts mechanically.**
1. Select a board and choose "Mount on…" a target: another board, an enclosure or a bracket.
2. Prism matches the hole pattern to the target's bosses or holes and shows the correspondence and residual.
3. It proposes a hardware stack from the catalog (screw, washer, standoff of the right length, thread and engagement) and the gap the stack produces.
4. One accept places the board by the fastening, and the hardware appears at every position and in the BOM.

Heatsinks attach to a component face with a TIM of a stated thickness. Any connector-height disagreement shows as a finding. *Removes:* positioning screws and standoffs one at a time. *Script:* `mount({occurrence, on, pattern?:"auto", stack?:"propose"})`. *(S-MECH)*

**J9 — Investigate anything.**
- Select a pin, net, conductor or finding and press `T` to trace it. The trace runs end to end: device pin → wire → housing cavity → header pin → board net → B2B pin → SoM net. It shows each source revision and highlights the path in every open lens.
- A finding opens with:
  - its affected objects, focused;
  - what was checked, with its inputs and units;
  - why it matters;
  - the fix actions. Waive is last.

*Script:* `trace(selector)`, `describeFinding(id)`, `fix(findingId, action)`. *(S-TRACE, S-REVIEW)*

**J10 — A board changes.**
- A followed board's new commit produces one **change review**: interfaces added or removed, pins renamed, holes moved, height changed, and every connection, harness wire, fastening and output it affects.
- The user accepts it, or pins the old revision, in one place.

*Script:* `describeChanges(occ)`, `acceptChanges(occ)`. *(S-CHANGE)*

**J11 — Ship it.**
- Documents lead with readiness: what is complete, assumed or missing.
- Packages are grouped by audience:
  - **Interface** (ICD);
  - **Harness shop** (drawing, formboard, wiring table, BOM);
  - **Mechanical** (STEP, mounting drawing);
  - **Buyer** (system BOM);
  - **Source** (document and revisions).
- Each package binds to one snapshot.

*Script:* `prism system outputs --snapshot … --package harness-shop`. *(S-DOC, S-BOM)*

## 5. Scripting surface

The UI, the CLI and agents use **one vocabulary**. There are three kinds of calls:

| Kind | What | Examples |
|---|---|---|
| **Describe** (read) | Structured, by meaning, from the document plus the system bundle | `describe(selector)`, `trace`, `describePlacement`, `describeMate`, `describeFlex`, `readiness()` |
| **Propose** (read) | Returns an ops request plus its predicted effect. Nothing is written | `proposeConnections`, `proposeHarness`, `proposeMount`, `proposeFixes` |
| **Apply** (write) | One atomic ops request with a version precondition (V2 §3) | `apply(ops)`, sugar such as `connect`, `mount`, `setFold` |

New in V3:
- **Dry run.** `apply(ops, {dryRun:true})` returns the new document version, the bundle delta and the findings delta without saving. This is the core of agent use: plan, inspect, then commit.
- **CLI.** `prism system …` talks to the HTTP API with the user's token. It covers `init`, `describe`, `propose`, `apply`, `undo`, `snapshot` and `outputs`. Plans are JSON files that can be reviewed in a PR.
- **Agent recipe.** A skill or doc teaches agents the describe → propose → dry-run → apply loop on one example system. (An MCP server stays out of scope until the maintainer decides otherwise, as with native bundle A0.)
- **Selectors.** These are shared by every surface: `board:Carrier`, `if:Carrier/Fan`, `pin:Carrier/J2201/3`, `net:/FAN_PWM`, `role:power-in`, `finding:mate-unresolved`.

## 6. Scope items

**V3.0** is the release that has to beat the bar. **V3.1** follows directly. **Later** is out of scope until it is promoted here.

| S-id | Item | Journeys | Tier |
|---|---|---|---|
| S-SHELL | Navigator, lenses, explicit split, readiness strip, Prism panel style, delete system | all | V3.0 |
| S-IF | Interfaces named by function, pin roles, electrical vs mounting/shield contacts, right-angle and edge-mount headers | J2–J5 | V3.0 |
| S-ADD | One Add palette across projects, catalog and published systems, with create-and-return recovery | J2 | V3.0 |
| S-DEV | Interface-first devices; geometry later without changing identity; replaces module authoring | J3 | V3.0 |
| S-CAT | Catalog readiness per intended use (PCB, mechanical, harness, device) | J2, J3, J8 | V3.0 |
| S-INIT / S-PROP | New system from many projects; proposed mates, links and power entry | J1 | V3.0 |
| S-B2B | Mate result card, ranked compatible mates, per-pin manual map table, connector height basis | J4 | V3.0 |
| S-HAR | Full-width harness workspace; proposals for housing, contacts, gauge, colour and pairing; one conductor label | J5 | V3.0 |
| S-TRACE / S-REVIEW | End-to-end trace; findings as repairs with fix actions | J9 | V3.0 |
| S-SCRIPT | Describe/propose/apply with dry run, the CLI and the agent recipe | all | V3.0 |
| S-FLEX | Flex and rigid-flex: read bends and stiffeners, fold view, fold states, flex checks, flex jumpers between boards | J7 | V3.0 or V3.1 (D3) |
| S-MECH | Fastenings with stacks, patterns, catalog hardware; enclosure and heatsink attach; measure, section, collision and clearance | J8 | V3.0 or V3.1 (D3) |
| S-ROUTE | Route assists, live lengths, derived formboard | J6 | V3.1 |
| S-CHANGE | One change review per board revision | J10 | V3.1 |
| S-BOM / S-DOC | System BOM with procurement boundaries; packages by audience | J11 | V3.1 |
| S-CONFIG | Configurations (fold states, lid open/closed, optional devices) | J7, J8 | D7 |
| — | Assembly sequence and work instructions, video, hero renders, MCAD round trip, variants of child boards, power budget across boards | — | Later |

## 7. Non-goals

- **Editing child boards.** No pin-swap writeback and no hole moves; KiCad stays the source of boards.
- **Mechanical CAD.** No sketching, machining or general constraint solving. Relationships are typed and solved by the spanning tree, plus the simple fold chains of D5.
- **Physical simulation.** No springback, strain, thermal or EMC simulation; Simulation Studio owns analysis.
- **Live MCAD synchronisation.** STEP out, and STEP in as catalog parts, only.

## 8. Acceptance journeys

These run on real boards, with no code, API console or hidden catalog preparation:

1. **Openswitch carrier + SoM + external 5 V PWM fan.** This is the audit's own test, which V2 failed. It runs J1–J5 and J9, and produces a ready-or-explicitly-incomplete package.
2. **EEE_EGSE_SAS monorepo.** This covers several boards, right-angle headers and harnesses. It runs J1 (propose), J4, J5 and J10 on a second revision.
3. **A rigid-flex board, or a flex jumper between two rigid boards.** This runs J7 and the folded fit in an enclosure, if S-FLEX is in V3.0.
4. **Carrier on four standoffs in a two-part enclosure, with a heatsink.** This runs J8 and the clearance findings, if S-MECH is in V3.0.
5. **An agent builds journey 1 from a prompt using only §5**, and a human reviews the dry-run plans before they are applied.

## 9. Open decisions (to settle one at a time)

| D | Question | Recommendation |
|---|---|---|
| D1 | Document format: extend `prism.system.v2` in place (unfrozen, forward migrations) or start `prism.system.v3` with no migration (alpha, no valued systems)? | Clean `v3` with no migration, as V2 did at its start |
| D2 | Keep the V2 UI code as the base and reshape it, or rebuild the shell and lenses, reusing only engine and components? | Rebuild the shell and lenses; keep the engine, viewer and harness/route maths |
| D3 | V3.0 cut: flex, mechanical, both, or neither (V3.0 = UX rebuild + devices + proposals + scripting)? | V3.0 = UX + devices + proposals + scripting + flex; mechanical in V3.1 |
| D4 | Flex source convention: KiLeidoscope's (`Flex`/`Bend`/`Stiffener` layers with text marks), Kikakuka's (`F/B.Stiffener` with `Key=Value` text, bend-line objects), both, or Prism's own? | Read KiLeidoscope's marks first (richer: twists, cones, steps), and accept Kikakuka's stiffener text |
| D5 | Flex jumpers: solve fold angles from the two end mates (simple chains) or user-set angles with residual findings only? | Solve single-chain jumpers; residuals otherwise |
| D6 | Mechanical depth for its tier: the PRD's full fastening model (thread facts, engagement, bonds) or a lighter first cut (pattern + stack length + collision/clearance)? | Lighter first cut; thread/engagement/bond later |
| D7 | Configurations (named assembly states) in V3.0? | Yes for fold states only; general configurations later |
| D8 | Pin roles and electrical checks (voltage, direction, open-collector): where are roles authored for boards, given KiCad pin types are coarse? | Derived from KiCad pin type + net-name rules; overridable on the interface; stored in the system document |
| D9 | Harness and wire policy (colours, default gauge, margins): per workspace or per system? | Per workspace with a per-system override |
| D10 | Route assists: geometric assists only, or a real auto-router through clips? | Assists only (V2 decided against auto-routing) |
| D11 | CLI home: `prism-kicad system` (native, offline) or a new HTTP client `prism system`? | HTTP client for write; `prism-kicad system build` stays for offline bundles |
| D12 | Connectivity lens: keep the KiCad-like schematic look or move to an interface-card diagram? | Interface cards; KiCad look only inside a board's detail |
| D13 | CI on this branch: none, or a fast smoke (lint + unit, no live KiCad) on PRs into it? | A fast smoke on PRs into the branch only |
| D14 | System BOM and documents (S-BOM/S-DOC) in V3.1 or V3.0? | V3.1 |

## Appendix A. Sources

- Altium multi-board, current docs:
  - [overview](https://www.altium.com/documentation/altium-designer/multi-board-design)
  - [logical system](https://www.altium.com/documentation/altium-designer/multi-board-design/logical-system)
  - [connections](https://www.altium.com/documentation/altium-designer/multi-board-design/logical-system/schematic-connections)
  - [physical assembly](https://www.altium.com/documentation/altium-designer/multi-board-design/physical-assembly)
  - [mates](https://www.altium.com/documentation/altium-designer/multi-board-design/physical-assembly/mates)
  - [manufacturing drawing](https://www.altium.com/documentation/altium-designer/multi-board-design/manufacturing-drawing)
  - [CoDesigner assembly](https://www.altium.com/documentation/altium-codesigner/synchronizing-multi-board-assembly)
- Altium harness:
  - [harness design](https://www.altium.com/documentation/altium-designer/harness-design)
  - [wiring diagram](https://www.altium.com/documentation/altium-designer/harness-design/wiring-diagram)
  - [what's new (26.x bundle/path views)](https://www.altium.com/altium-designer/whats-new)
- Altium rigid-flex:
  - [bending lines](https://www.altium.com/documentation/altium-designer/pcb/rigid-flex-design/standard/defining-bending-lines)
  - [RF2 in CoDesigner](https://my.altium.com/altium-365/whats-new/mcad-codesigner-update-enhanced-rigid-flex-and-multi-board-assembly-support)
- [KiLeidoscope](https://github.com/nvrooijen/KiLeidoscope) (GPL-3.0) — `docs/flex.md`: marks, fold steps, flex checks, IPC-2223 radius table.
- [Kikakuka](https://github.com/buganini/Kikakuka) (MIT) — coupler alignment, stiffeners, `FreekiCAD/ARCHITECTURE.md` bending pipeline, `.kkkk_asm` manifest and CLI export.
- Earlier Prism inputs:
  - V2 ADR and contracts (`docs/architecture/adr-system-builder-v2.md`, `docs/system-builder/CONTRACTS.md`);
  - the V2 UX audit and its two Altium research notes (`KiCAD-Platform/Prism-System-Builder-V2-UX-Audit-2026-10-21/`);
  - the V3 mechanical PRD draft (`KiCAD-Platform/System-Builder-V3-PRD-2026-10-21.md`), whose fastening, site-identity and BOM rules feed S-MECH and S-BOM when their tier arrives.
