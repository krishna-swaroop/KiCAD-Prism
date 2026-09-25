# Design Comparison presentation-mode policy

Status: normative and exhaustive.

This document defines which visual mode Prism chooses for every Schematic, PCB,
and Fabrication selection. It mirrors the ordered executable rules in
`frontend/src/components/design-comparison/comparison-review-policy.ts`.

The general product contract is in [`README.md`](README.md).

## Reviewer-visible contract

The toolbar shows exactly **Composite**, **Side by side**, and **Old / New**.
The active mode is highlighted. Prism recommends a mode whenever a listing is
selected, but automatic selection is not itself a fourth mode and has no button.

A reviewer may choose a different mode for the current listing. Selecting a new
listing discards that override and applies the recommendation for the new
evidence. With no override, the URL omits `presentation`; an explicit reviewer
choice records its mode in the URL.

## What the modes prove

| Mode | Best evidence | Limitation |
| --- | --- | --- |
| Composite | Placement, surrounding topology, and clear one-sided additions/removals in one registered canvas. | Overlap can obscure modified geometry or dense text. |
| Side-by-side | Simultaneous old/new geometry, connectivity, layer, and manufactured-state proof. | Each pane is narrower. |
| Old/New | A clean full-width revision for documentation or structured-value review. | The reviewer cannot see both revisions simultaneously. |

## How to read the rule tables

For a single change Prism derives these facts once:

- domain, status (`added`, `removed`, or `changed`), category, and
  classification;
- normalized object kinds from the semantic object, old/new geometry, and
  visual targets;
- reason codes;
- whether the change is spatial;
- whether it has authored fields;
- whether it is a `#PWR` or `#FLG` symbol; and
- whether any named PCB layer is a fabrication/review layer.

Rules are evaluated from top to bottom. **The first match wins.** The common
table runs before the domain table. Each domain table ends in exhaustive
fallbacks, so every emitted change receives a mode.

The stable rule ID is included so tests and this document can be diffed without
interpreting prose.

### Fact sets

| Fact | Exact members |
| --- | --- |
| Spatial reasons | `moved`, `rotated`, `mirrored`, `layer-changed`, `re-pathed` |
| Field-only reasons | `symbol-fields-changed`, `properties-changed`, `dnp-changed`, `renamed` |
| Schematic exact electrical objects | `pin`, `sheet_pin`, `no_connect`, `bus`, `bus_entry`, `sheet` |
| Schematic net objects | `wire`, `label`, `global_label`, `hierarchical_label`, `junction` |
| PCB fabricated objects | `footprint`, `pad`, `track`, `segment`, `arc`, `arc_segment`, `via`, `zone`, `footprint_zone` |
| Documentation objects | `image`, `table`, `text`, `footprint_text` |
| PCB fabrication/review layers | `Edge.Cuts`, `Margin`, and names ending in `.Cu`, `.Mask`, `.Paste`, `.SilkS`, `.Fab`, `.CrtYd`, or `.Adhes` |

## Common rule

This rule has priority over every Schematic and PCB rule.

| Order | Rule ID | Change type / exact predicate | Prism-selected mode |
| --- | --- | --- | --- |
| 1 | `structured-rule` | `details.reviewOnly` is true, or category is `rules`. This includes authored rules, constraints, exclusions, net-class definitions/assignments, and aggregate semantic records without standalone geometry. | **Old/New** |

## Schematic rules

These rules run in the order shown after the common rule.

| Order | Rule ID | Change type / exact predicate | Prism-selected mode | Rationale |
| --- | --- | --- | --- | --- |
| 1 | `schematic-documentation` | Object kind is `image`, `table`, `text`, or `footprint_text`, or category is `text`. Applies to additions, removals, and modifications. | **Old/New** | Clean content is more legible than overlap. |
| 2 | `schematic-electrical-exact` | Power symbol reference matches `#PWR`/`#FLG`; reason includes `connectivity-changed`, `instance-replaced`, `instance-count-changed`, `sheet-changed`, or `bus-membership-changed`; or object kind is `pin`, `sheet_pin`, `no_connect`, `bus`, `bus_entry`, or `sheet`. Applies even to one-sided changes. | **Side-by-side** | Exact terminals, hierarchy, and topology must remain visible in both revisions. |
| 3 | `schematic-component-add-remove` | Component-like (`components`, `symbols`, or kind `symbol`) and status is added or removed. | **Composite** | One-sided symbol placement is clearest in circuit context. |
| 4 | `schematic-component-fields` | Component-like; has at least one field; is not spatial; has no `lib-changed`; and every reason is one of the field-only reasons. | **Old/New** | Clean page plus structured field deltas is the primary proof. |
| 5 | `schematic-component-geometry` | Any remaining component-like change, including move, rotation, mirror, hierarchy-path move, library replacement, unit/geometry change, or a mixed field-and-geometry change. | **Side-by-side** | Both symbol states are required. |
| 6 | `schematic-net-rename` | The only reason is `net-renamed`. | **Side-by-side** | Both clean label states and unchanged electrical scope remain visible. |
| 7 | `schematic-graphic-geometry` | Category is `graphics` or kind is `graphic`, and the change is spatial. | **Side-by-side** | Both authored placements must be compared. |
| 8 | `schematic-graphic-content` | Any remaining schematic graphic, including non-spatial drawing/style/content changes. | **Old/New** | Documentation remains legible without overlap. |
| 9 | `schematic-net-geometry` | A wire, label, global label, hierarchical label, junction, or `nets` category change whose status is modified. | **Side-by-side** | Modified net geometry needs old and new proof. |
| 10 | `schematic-net-add-remove` | Any remaining schematic net object/category, necessarily an addition or removal after rule 9. | **Composite** | One-sided connectivity is clearest in surrounding topology. |
| 11 | `schematic-modified-fallback` | Any other modified schematic object. | **Side-by-side** | Preserve both revisions for an otherwise unclassified modification. |
| 12 | `schematic-add-remove-fallback` | Any other schematic addition or removal. | **Composite** | Full schematic context is the safest default for one-sided residual evidence. |

### Schematic examples and boundary cases

| Tracked change | Prism-selected mode |
| --- | --- |
| Symbol/component added or removed | **Composite**, except a power symbol or exact-electrical rule match is **Side-by-side**. |
| Symbol moved, rotated, mirrored, re-pathed, or library/unit changed | **Side-by-side**. |
| Value, footprint, reference, datasheet, custom field, DNP/BOM state, or another field-only edit | **Old/New**. If geometry/library also changes, **Side-by-side**. |
| Same-RefDes instance replacement or instance-count change | **Side-by-side**. |
| Power symbol or `PWR_FLAG` change | **Side-by-side**, including add/remove. |
| Pin, sheet pin, no-connect marker, bus, bus entry, hierarchical sheet, hierarchy, or bus-membership change | **Side-by-side**, including add/remove. |
| Wire, label, junction, or logical net added/removed | **Composite** unless an exact electrical reason promotes it. |
| Wire, label, junction, or logical net modified | **Side-by-side**. |
| Net renamed | **Side-by-side**. |
| Schematic drawing moved or geometrically changed | **Side-by-side**. |
| Schematic drawing content/style changed without spatial change | **Old/New**. |
| Image, table, or text content added, removed, or changed | **Old/New**. |

## PCB rules

These rules run in the order shown after the common rule. The ordering matters:
graphics are classified before the general one-sided rule.

| Order | Rule ID | Change type / exact predicate | Prism-selected mode | Rationale |
| --- | --- | --- | --- | --- |
| 1 | `pcb-net-class` | Object kind is `net_class` or `net_class_assignment`, when it was not already caught as a common structured rule. | **Old/New** | The definition is structured evidence, not manufactured geometry. |
| 2 | `pcb-group` | Object kind is `group` and classification is secondary. | **Composite** | Membership is organizational; board context is sufficient. |
| 3 | `pcb-fabrication-graphic` | PCB graphic whose layer is a fabrication/review layer, or whose change is spatial. PCB graphics include documentation kinds, `drawing`, `graphic`, `footprint_graphic`, and category `graphics`. Applies to additions/removals too. | **Side-by-side** | Fabrication, placement, outline, or moved graphic geometry requires both revisions. |
| 4 | `pcb-documentation-graphic` | Any remaining PCB graphic, normally non-spatial content on a user/documentation layer. Applies to additions/removals too. | **Old/New** | Clean text and line content is more legible than overlap. |
| 5 | `pcb-one-sided` | Added or removed non-graphic object and reasons do not include `net-changed`, `moved`, or `layer-changed`. | **Composite** | One pane would otherwise be empty; the overlay proves presence/absence in board context. |
| 6 | `pcb-fabrication-object` | Kind is a fabricated object; category is `components`, `zones`, or `nets`; a net is named; or reasons include `net-changed` or `content-changed`. | **Side-by-side** | Manufactured geometry or copper connectivity changed. |
| 7 | `pcb-modified-fallback` | Any other modified PCB object. | **Side-by-side** | Both manufactured states are the safest fallback. |
| 8 | `pcb-add-remove-fallback` | Any other PCB addition or removal. | **Composite** | Board-wide context is sufficient for residual one-sided evidence. |

### PCB examples and boundary cases

| Tracked change | Prism-selected mode |
| --- | --- |
| Footprint, pad, track/segment, arc, via, zone, or footprint zone purely added/removed | **Composite** when it is an ordinary one-sided object. |
| The same one-sided object carrying `net-changed`, `moved`, or `layer-changed` | **Side-by-side**. |
| Footprint/pad/route/via/zone modified, rerouted, resized, re-layered, re-netted, or content-changed | **Side-by-side**. |
| PCB object net association changed | **Side-by-side**. |
| Board outline or `Margin` graphic, including add/remove | **Side-by-side**. |
| Copper, mask, paste, silkscreen, fab, courtyard, or adhesive graphic, including add/remove | **Side-by-side**. |
| User/documentation-layer graphic moved, rotated, mirrored, re-pathed, or re-layered | **Side-by-side**. |
| User/documentation-layer graphic content added, removed, or changed without spatial change | **Old/New**. |
| Footprint text/graphic on a fabrication/review layer | **Side-by-side**. |
| Footprint text/graphic on a user/documentation layer with non-spatial content only | **Old/New**. |
| Secondary board-group membership | **Composite**. |
| Net-class definition, assignment, authored rule, constraint, or review-only record | **Old/New**. |
| Other modified PCB object | **Side-by-side**. |
| Other added/removed PCB object | **Composite**. |

Generated zone-fill churn and generated/unaddressable group bookkeeping are not
emitted as dedicated review changes. They therefore do not invoke a presentation
rule. This is different from emitting a change and choosing Composite.

## Multi-change selection rules

The selected listing or designator can contain several `ChangeItem` records.
Prism evaluates the complete selected scope.

1. With no selected changes, the Schematic/PCB overview is **Composite**.
2. If one schematic reference has both added and removed evidence across more
   than one page/path, `group:schematic-cross-sheet-relocation` selects
   **Side-by-side**.
3. Otherwise each member is evaluated independently and group precedence is:
   **Side-by-side** over **Old/New** over **Composite**.

This prevents one easy-to-render member from weakening the evidence required by
another member in the same authored decision.

## Tab-level rule

The Fabrication tab selects **Side-by-side** (`tab:fabrication`) because plotted
manufacturing output is strongest when both packages remain visible. Reviewers
may still choose Composite or Old/New. BOM and Stackup use dedicated panels and
do not use this policy.

## Selection and reset lifecycle

1. Prism determines the selected row, instance, primitive, and document scope.
2. It gathers every `ChangeItem` in that scope.
3. It evaluates the tables above and displays the resulting mode.
4. The displayed mode's toolbar button is highlighted.
5. A reviewer mode click becomes an explicit override for that scope.
6. Selecting another listing clears the override, reevaluates the policy,
   resets the viewer to the new evidence, and highlights the resulting mode.
7. Hovering or leaving a listing changes none of these states.

An explicit presentation in an incoming deep link survives initial selection.
It is cleared only when the reviewer selects different evidence.

## PCB layer focus is separate from presentation

Mode selection decides canvas arrangement. Layer focus decides which PCB layers
are visible. Every mode uses the same committed selection and layer-focus rules:

- show the selected evidence layers independently for Base and Compare;
- retain `Edge.Cuts`;
- add the corresponding outer copper for front/back non-copper evidence;
- resolve through-hole wildcards to outer copper;
- borrow counterpart layers for an empty add/remove pane; and
- keep the focus after pointer leave until another listing is selected or the
  reviewer manually changes layers.

A presentation override must not disable layer focus, and a hover preview must
not replace it.

## Acceptance requirements

Any implementation change to the rule predicates, rule order, group precedence,
Fabrication default, or override-reset behavior must update this document and
the table-driven tests in the same commit. Tests must include boundary cases
where an earlier rule intentionally wins, especially:

- one-sided power/no-connect/bus/sheet changes;
- one-sided PCB fabrication graphics;
- one-sided ordinary PCB fabricated objects;
- field-only versus mixed component edits;
- structured rules before geometric rules; and
- multi-member groups with competing recommendations.
