# Design Comparison specification

Status: normative product specification.

This document defines what Prism's Design Comparison feature must do. It is the
contract against which the implementation, tests, and reviewer experience are
reviewed. Historical milestone documents in this directory explain how parts of
the feature were built; they do not override this specification.

The exact presentation-mode decision table is defined in
[`reviewer-presentation-policy.md`](reviewer-presentation-policy.md).

## Purpose

Design Comparison lets a hardware reviewer compare two immutable Git revisions
of one KiCad project and review the authored design decisions between them.
Prism must:

1. identify meaningful schematic, PCB, BOM, stackup, rule, and fabrication
   changes;
2. suppress or demote generated and layout-only noise;
3. combine related native changes into reviewer-sized authored decisions;
4. choose the presentation that best proves each selected decision;
5. show only the PCB layers needed to understand the selected evidence; and
6. keep the queue, canvas, property panel, URL, comments, and export in agreement
   about what is selected.

The feature reports what changed. It does not decide whether the design change
is electrically correct, manufacturable, or approved.

## Revisions and direction

- **Base** is the reference or old revision.
- **Compare** is the candidate or new revision.
- Added means present only in Compare.
- Removed means present only in Base.
- Modified means corresponding authored content exists in both and differs.

The comparison is directional. Reversing Base and Compare reverses additions,
removals, and every old-to-new property value.

Both sides must be loaded from the named commits. A branch moving after the
workspace opens must not silently change either snapshot.

## Entry workflow

The normal workflow is deliberately explicit:

1. Open project History.
2. Click **Base** on the reference commit or release.
3. Click **Compare** on the candidate commit or release.
4. Click **Open comparison**.

The same revision cannot occupy both roles. Opening the workspace starts on the
**Schematic** tab, because electrical intent is the default review entry point.
The workspace header must always identify both commits and indicate when either
is the current branch tip.

A reviewer should need one further click on a queue listing to see its complete
evidence. Expanding a listing is only required to narrow the review to a member,
designator, connection, or sheet.

## Comparison pipeline

The implementation must preserve these stages and their responsibilities:

1. **Snapshot acquisition** loads the project files for Base and Compare.
2. **Domain comparison** detects native object, semantic, BOM, stackup, rule,
   and fabrication-output differences.
3. **Reconciliation** matches recreated identities and removes generated churn.
4. **Review preparation** classifies primary versus secondary evidence.
5. **Grouping** turns related evidence into one authored review decision.
6. **Selection resolution** maps the chosen decision to every relevant native
   object in each revision.
7. **Presentation policy** selects Composite, Side-by-side, or Old/New.
8. **Evidence rendering** synchronizes canvas, properties, layers, comments,
   navigation, URL, and export.

No later stage may invent a design change merely to compensate for missing
identity or geometry. Missing native evidence must be reported as unresolved.

## Review domains

| Tab | Required evidence |
| --- | --- |
| Schematic | Symbols, fields, pins, connectivity, nets, hierarchy, buses, rules, and authored documentation. |
| PCB | Footprints, pads, routes, vias, zones, layers, board graphics, fabricated geometry, net assignment, and PCB rules. |
| BOM | Added, removed, and changed part rows, quantities, designators, DNP and not-in-BOM state, and authored component fields. |
| Stackup | Explicit Base and Compare layer-stack definitions and their material, thickness, copper, dielectric, and finish changes. |
| Fabrication | Geometric differences between generated Gerber and drill packages, paired by output layer and localized into reviewable regions. |

BOM and Stackup use dedicated comparison panels. They are not forced through a
canvas presentation mode. Fabrication supports the same three visual modes as
Schematic and PCB and defaults to Side-by-side.

Failure in one independently built domain must be visible in that tab and must
not erase successful results from the other domains.

## What counts as one queue listing

The left panel is a review queue, not a parser-event log. One top-level row must
represent the smallest complete authored decision a reviewer can accept or
question.

Examples include:

- one component or part decision, including its relevant symbol, footprint,
  pad, field, and BOM evidence;
- one logical net rename or connectivity decision;
- one physical PCB conductor change, including all of its segments, arcs, and
  vias;
- one zone or constraint change; or
- one documentation/layout decision when secondary evidence is enabled.

Generated zone fill, generated page numbering, field-autoplacement bookkeeping,
PCB numeric net-table IDs, generated unconnected-net names, UUID-only
recreation, and derivative PCB net-name rewrites must not become independent
primary review rows.

The queue is divided into Components, Nets, Rules & constraints, and Layout &
documentation. Layout/documentation evidence is secondary and hidden until the
reviewer enables it. Search and status/owner filters narrow the queue. Counts
state the population before search, status, and owner filters so their meaning
does not change as filters are applied.

When two readable labels collide, Prism must add stable disambiguating evidence
such as manufacturer part number, the most useful property delta, position, or
a deterministic item number. Two distinct decisions must never appear as
indistinguishable rows.

## Selection scopes

Every interactive surface must use one of these scopes:

| Selection | Meaning |
| --- | --- |
| Listing row | Every change and native target belonging to that authored decision. |
| Designator/member chip | Every change and native target for that instance inside the decision. |
| Expanded primitive/connection | The exact semantic change represented by that member. |
| Sheet choice | The same decision restricted to the chosen document path. |

Clicking a listing selects it. Hovering only previews its native highlight.
Pointer entry or exit must never change the committed selection, presentation,
visible layers, property panel, comments anchor, or URL.

If the selected row later becomes hidden by a filter, its selection remains
valid and its evidence remains available. Filters change queue visibility, not
the meaning of the current review.

## Presentation behavior

The toolbar contains exactly three choices: **Composite**, **Side by side**,
and **Old / New**. The button for the mode currently on screen is always
highlighted. There is no separate Auto mode or Auto button.

When a listing is selected, Prism applies the mode selected by the normative
policy. A reviewer can click another mode to override that recommendation for
the current selection. Selecting another listing clears the override, applies
the new listing's recommendation, resets the view for that evidence, and
highlights the resulting mode.

| Mode | Required purpose |
| --- | --- |
| Composite | One registered canvas that emphasizes additions/removals and preserves surrounding design context. |
| Side-by-side | Base and Compare canvases visible simultaneously with synchronized navigation and revision-correct targets. |
| Old/New | One clean, full-width revision at a time for legibility, with an explicit old/new revision control. |

The recommendation is based on the complete selected scope, not merely the
first parser event in it. For a multi-change group, the strongest required mode
wins: Side-by-side, then Old/New, then Composite. The exhaustive rules and their
order are in [`reviewer-presentation-policy.md`](reviewer-presentation-policy.md).

## Canvas evidence

Selection must resolve every native target in the selected scope. A logical net
therefore highlights all of its relevant wires, labels, junctions, and
terminals; a PCB conductor highlights all relevant segments, arcs, and vias.
Highlighting only the first matching object is incorrect.

Each pane resolves identity and geometry against its own revision. Base must
not use Compare UUIDs or geometry, and Compare must not infer its evidence from
Base. A cross-sheet selection must finish preparing the destination sheet
before applying the selection instead of silently dropping it.

The canvas must distinguish:

- unchanged context;
- added, removed, and modified evidence; and
- the currently selected scope.

A semantic record intentionally lacking standalone geometry is **Structured
evidence only**. A record that claims a native object but cannot resolve it is
**No canvas target resolved**. Those states are not interchangeable.

## PCB layer focus

Selecting PCB evidence temporarily focuses each revision on the layers that
actually carry that selection:

- Base layers are derived from Base objects; Compare layers are derived from
  Compare objects.
- `Edge.Cuts` remains visible as mechanical context.
- Front-side mask, paste, silkscreen, fab, courtyard, or adhesive evidence also
  opens `F.Cu`; back-side evidence opens `B.Cu`.
- Through-hole wildcard layers resolve to the outer copper pair rather than all
  internal planes.
- Vias contribute their span only for a via-only selection. Tracks, arcs, pads,
  footprints, and other located evidence otherwise define the focus.
- A wholly added or removed object borrows the other revision's layer context
  in the empty pane so absence is shown on the relevant layer.
- Non-layered members do not cancel the focus contributed by layered members.

The focus is committed selection state. It must remain after the pointer leaves
the listing and persist until another listing is selected, the selection is
cleared, or the reviewer manually changes layer visibility. A manual layer
change releases automatic focus for the current selection only; selecting a new
listing applies that listing's focus again. Clearing the selection restores the
reviewer's previously visible layers.

Hover preview must never alter layers. Presentation switches and native
selection/preview cleanup must reapply the committed focus so asynchronous
viewer events cannot restore stale all-layer visibility.

## Right-side evidence panel

The right panel is the authoritative structured explanation of the current
selection. It must agree with the listing, canvas, and selection scope and show:

- status, review owner, and affected designators;
- DNP and not-in-BOM state per affected reference;
- old-to-new property values without duplicating the same delta;
- terminal additions and removals for connectivity changes;
- layers used by the selected PCB evidence;
- document, category, and secondary-scope context;
- comments anchored to the same selected scope; and
- a clear structured-only or unresolved-target state where applicable.

For part buckets containing multiple references, identical BOM/property rows
may be combined under their reference list. References with different values
must receive separate rows. The panel must never show a sibling instance's
properties after a designator chip narrows the selection.

## URL, navigation, comments, and export

The URL is the source of truth for shareable workspace state. It records the
revision pair, active tab, selection scope and document, secondary-evidence
setting, reviewer presentation override, and reviewer-owned PCB layer state.
When Prism is using its recommendation, `presentation` is absent. An explicit
Composite choice is still an override and therefore is recorded.

A deep link containing an explicit presentation must preserve it when first
opened on its named selection. Browser back/forward navigation must restore the
same review state rather than create a second private state model.

Comments are anchored to the exact row, instance, or primitive selection. The
CSV export contains the currently filtered review queue—not silently the entire
unfiltered comparison—so it matches the scope the reviewer chose to report.

## Reliability invariants

The feature is incorrect if any of these occur:

- queue and property panel describe different objects;
- a designator click selects only the first or a sibling instance;
- canvas highlight omits native members of the selected decision;
- Base and Compare use the same revision's geometry or metrics;
- a hover changes persistent layers or presentation;
- layer focus disappears on pointer leave;
- a new listing inherits the previous listing's presentation override;
- the highlighted presentation button differs from the visible canvas;
- a structured-only change is reported as a visualization failure;
- an unresolved native target is silently treated as valid structured evidence;
- a filter or export changes the identity of a review row; or
- generated bookkeeping is promoted as an authored design decision.

## Implementation and test anchors

The principal executable contracts are:

- `frontend/src/components/design-comparison/comparison-review-policy.ts`
- `frontend/src/components/design-comparison/comparison-review-groups.ts`
- `frontend/src/components/design-comparison/comparison-selection-bridge.ts`
- `frontend/src/components/design-comparison/comparison-layer-focus.ts`
- `frontend/src/components/design-comparison/comparison-property-model.ts`
- `frontend/src/components/design-comparison/comparison-url.ts`
- their colocated tests; and
- backend semantic and document-diff tests that produce the `ChangeItem`
  evidence consumed by the workspace.

A code review should compare those executable contracts to this document and
the presentation policy. When they disagree, the discrepancy is a product
decision to resolve; assertions in a PR description are not acceptance proof.
