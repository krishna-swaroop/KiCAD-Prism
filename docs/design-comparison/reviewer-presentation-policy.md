# Design Comparison reviewer presentation policy

This is the reviewer-facing source of truth for Prism's automatic presentation
selection. The executable policy lives in
`frontend/src/components/design-comparison/comparison-review-policy.ts` and its
table-driven tests.

A change that exists in only one revision is shown **composite**, whatever its
object kind: there is no second geometry to place beside it, and a pane showing
an empty board proves nothing that the composite scene does not already state
in place. Side-by-side is reserved for changes both revisions hold.

Automatic selection is not a mode the reviewer turns on; it is what happens
whenever they have not said otherwise. Selecting a schematic or PCB change
immediately applies the presentation in the **Auto** column below.

All three presentations stay visible in the canvas toolbar, and choosing one is
an override **for the change currently selected**. Moving to another change
discards it and hands the decision back to this policy — an override was made
about one piece of evidence and should not silently govern the next.

The URL still omits `presentation` when the policy is deciding and records an
explicit choice, including an explicit Composite choice, so a deep link can
say "look at this change side by side". That override applies to the item the
link names, on the same terms as one made in the app.

## What each presentation proves

| Presentation | Strongest review use | Important limitation |
| --- | --- | --- |
| Composite | Location, surrounding topology, and the scope of a simple addition or removal. | It does not retain every unchanged reference item and is not sufficient evidence for arbitrary modified geometry. |
| Side-by-side | Simultaneous old/new geometry, connectivity, layer, and fabrication-state review. | Each pane is narrower; dense text and documentation are less legible. |
| Old/New | One clean, full-width revision at a time, paired with structured old→new evidence. | The reviewer must toggle and cannot see both geometries simultaneously. |

The property panel is permanently present to the right of the canvas in every
presentation. It states each changed field once, as `old → new` — the departing
value marked, the new value plain, because the new value is now the truth — and
covers authored BOM fields, connectivity terminals, PCB route metrics, layers
used, document context, and an explicit warning when a change that names a
native object resolved to no canvas target.

Per-property verbs head each delta with the reason that explains it, in Altium's
reading: `Re-annotated: Designator`, `Replaced: Design Item ID`. A row in the
queue still says only what happened to the object as a whole — Added, Modified,
Removed.

The panel also assigns one deterministic review owner: **Electrical**,
**PCB fabrication**, **Assembly / BOM**, **Mechanical**,
**Rules / constraints**, or **Documentation**. This is not a severity score and
does not claim that a design decision is right or wrong. It identifies which
engineering proof the selected authored change requires. The classification is
derived from native object kind, authored fields, reason codes, and layers; it
never comes from generated prose.

Some authored project settings, constraints, exclusions, and aggregate
semantic records intentionally have no standalone KiCad canvas object. These
are presented as **Structured evidence only** and do not raise a missing-target
warning. A warning appears only when Prism expected a native visual target but
could not produce or resolve one, so reviewers can distinguish valid
non-geometric evidence from a visualization failure.

The card resolves this to exactly one of three statements:

| Card statement | Meaning |
| --- | --- |
| *N* visual targets | The change cross-probes to native geometry. |
| Structured evidence only | The change is a rule, constraint, exclusion, or aggregate semantic record with no standalone KiCad object. Valid, non-geometric evidence. |
| No canvas target resolved | The change names a native KiCad object but no target was produced. This is a visualization failure, not a design property, and the structured values are the only evidence available. |

A change counts as expecting a canvas target when it carries a native source id
on either revision and is not flagged as review-only. The viewer raises its own
separate notice when a target exists but the pane could not paint it.

## Canvas marks

The composite scene uses one small vocabulary, and each mark answers one
question:

| Mark | Answers |
| --- | --- |
| Desaturated, translucent geometry | Unchanged. Context, not content. |
| Green / red / amber fill | Added / removed / modified. |
| Solid blue halo or traced path | This is the item under review. |
| Marching dashed outline in the status colour | This exact object is the change. |
| Red dashed leaders | These removed pieces were one act. |

Selection and status are separate channels on purpose. A single mark carrying
both means the extent of a selected net cannot be read without re-reading each
segment's status, and a reviewer following a route loses it wherever it crosses
an object of a different status.

The removal leaders tie a removal's own pieces together — a connector and the
pads and wires that went with it. Altium instead draws them out to whatever
survived on the other side of the connection; that needs the surviving
endpoints, which the document diff does not carry, so Prism does not attempt it
rather than guess.

## Schematic changes

| Tracked change | Composite | Side-by-side | Old/New | Auto |
| --- | --- | --- | --- | --- |
| Symbol/component added or removed | Best local placement and circuit context; status overlay identifies the one-sided object. | Available when the reviewer wants an explicit empty/occupied comparison. | Available, but slower for spatial context. | **Composite** |
| Symbol moved, rotated, mirrored, re-pathed, or otherwise geometrically changed | Useful overview, but not accepted as the only old-geometry evidence. | Keeps both placements and orientations visible. | Useful for a clean full-page inspection. | **Side-by-side** |
| Library symbol or unit changed | Overlay can become ambiguous when outlines differ. | Exposes the old and new symbol geometry simultaneously. | Useful as a secondary clean-symbol check. | **Side-by-side** |
| Value, footprint, reference, datasheet, custom field, DNP/BOM state, field visibility, field position, or text effects changed | Maintains circuit context, but overlapping text is poor evidence. | Available for simultaneous page context. | Clean page plus structured old→new fields is the clearest evidence. | **Old/New** when field-only; **Side-by-side** if geometry/library also changed |
| Same-RefDes instance replacement or instance-count change | Shows overall circuit scope but not every old/new instance clearly. | Highlights every affected old/new native instance and hierarchy path. | Available for sequential inspection. | **Side-by-side** |
| Power symbol or `PWR_FLAG` change | Useful full-net context. Power items remain canvas symbols but are grouped as primary electrical/Nets changes. | Preserves the exact old/new symbol and connection state. | Available for a clean page check. | **Side-by-side** |
| Pin or terminal change | Parent-symbol tint alone can be ambiguous. | Retains both revisions for exact pin-level review. | Available for a clean close inspection. | **Side-by-side** |
| Wire added or removed | Best surrounding connectivity context. | Available to prove the empty/occupied state explicitly. | Available, but provides less topology context. | **Composite** |
| Wire modified | Overlay is useful context but not sufficient old-geometry proof. | Shows both segment geometries. | Available for sequential inspection. | **Side-by-side** |
| Local, global, or hierarchical label added or removed | Best net/page context with one-sided status. | Available where label placement is crowded. | Available for clean text inspection. | **Composite** |
| Label text/placement modified or net renamed | Overlapping text is ambiguous. | Keeps old and new label text and electrical scope visible; the card shows `old → new`. | Useful as a secondary legibility check. | **Side-by-side** |
| Logical net added or removed | Highlights associated wires, labels, junctions, and terminals as a scoped electrical change. | Available for explicit one-sided proof. | Available for sequential inspection. | **Composite** |
| Connectivity, pin reassignment, split/merge, or label-count change | Useful for full-net impact, but can hide the precise changed terminal. | Shows removed and added terminals in their respective revisions; the card lists both sets. | Available as a secondary clean-page check. | **Side-by-side** |
| Junction added or removed | Best local topology context and status halo. | Available where the connected/disconnected state is difficult to read. | Available for a clean local check. | **Composite** |
| Junction modified | Overlay alone is insufficient for small geometry. | Keeps both junction/wire states visible. | Available for sequential inspection. | **Side-by-side** |
| No-connect marker | Not used as the automatic proof because a missing cross is easy to overlook. | Treats the marker as a primary electrical object and preserves both pin states. | Available for close sequential inspection. | **Side-by-side** |
| Bus wire, bus entry, or bus membership | Gives useful overall bus context but can be abstract. | Shows old/new topology; the card exposes membership values. | Available for clean-page inspection. | **Side-by-side** |
| Hierarchical sheet, sheet pin, sheet assignment, or hierarchy-path change | Useful hierarchy overview only. | Cross-probes the sheet object/instances in both revisions and shows old/new paths. | Available for sequential inspection. | **Side-by-side** |
| Schematic drawing moved or geometrically changed | Useful page context. | Shows old/new authored geometry. | Available for clean-page inspection. | **Side-by-side** |
| Schematic drawing content/style changed without a spatial change | Overlap reduces legibility. | Available when direct geometry comparison is needed. | Keeps text, stroke, and fill content clean and exposes structured values. | **Old/New** |
| Image or table content | Generic canvas tint provides little evidence. | Available when the object has usable geometry. | Clean revision plus image scale or structured table content is strongest. | **Old/New** |
| Anonymous/unaddressable parser content | Never receives a fabricated target. It remains folded into its addressable parent where possible. | Uses the parent object's view. | Uses the parent object's view. | **Parent policy**, with an explicit warning when unresolved |

## PCB changes

| Tracked change | Composite | Side-by-side | Old/New | Auto |
| --- | --- | --- | --- | --- |
| Footprint added, removed, moved, rotated, flipped/layer-changed, library-changed, or content-changed | Strong board-wide placement context, and the only sensible view for a pure addition or removal. | Preserves the manufactured old/new footprint state and surrounding board. | Available for a clean full-width check. | **Composite** when one-sided; **Side-by-side** otherwise |
| Footprint properties, description, attributes, reference/value, exclude-from-BOM, position-file, or board-only state | Useful placement context; structured evidence remains visible. | Keeps footprint and fabrication layers visible in both revisions. | Useful as a secondary property inspection. | **Side-by-side** |
| Pad added, removed, or modified | Parent context remains visible, but a parent-only highlight is not used. | Independently selects the pad and shows number, type, shape, size, drill, layers, margins, clearance, thermal settings, zone connection, and net old→new values. | Available for a clean pad inspection. | **Side-by-side** |
| Straight track segment added, removed, rerouted, width/layer/net changed | Useful whole-route context, and the only sensible view when the object exists in one revision only. | Old/new route geometry, width, layer, and net remain simultaneously visible. | Available for sequential route inspection. | **Composite** when one-sided; **Side-by-side** when both revisions hold geometry |
| Arc track segment added, removed, or modified | Useful route context. | Preserves both curved geometries and route properties. | Available for sequential inspection. | **Side-by-side** |
| Via added, removed, moved, type/diameter/drill/span/net changed | Useful net context but weak fabrication proof alone. | Shows both via states and exposes type, diameter, drill, layer span, and net. | Available for a clean close inspection. | **Side-by-side** |
| Board zone or footprint/nested zone/keepout added, removed, reshaped, re-layered, re-netted, or rule-changed | Useful affected-copper context. | Independently selects the boundary and exposes name, layers, priority, hatch, pad connection, minimum thickness, keepout, and fill rules. | Available for clean boundary inspection. | **Side-by-side** |
| Generated zone-fill churn only | Deliberately ignored in normal comparison to avoid refill noise. | Not emitted. | Not emitted. | **No change row** |
| Board outline (`Edge.Cuts`) or `Margin` graphic | Useful full-board context but not sole mechanical proof. | Preserves both mechanical outlines and treats the change as primary. | Available for clean outline inspection. | **Side-by-side** |
| Copper, mask, paste, silkscreen, fab, courtyard, or adhesive-layer graphic | Useful board context. | Treats fabricated/assembly graphics as primary and preserves both revisions. | Available for legibility checks. | **Side-by-side** |
| User/documentation-layer board graphic | Overlay can obscure text and lines. | Automatically used if the item moved or changed spatially. | Clean content is strongest for non-spatial documentation changes. | **Old/New**, or **Side-by-side** for spatial changes |
| Footprint graphic or footprint text | Kept grouped by RefDes for context but independently itemized. | Fabrication-layer content is reviewed in both revisions. | Used for non-fabrication documentation content. | **Side-by-side** on fabrication layers; otherwise **Old/New** |
| Board group membership | Adequate organizational context; kept secondary unless a member has its own primary change. | Available, but normally unnecessary. | Available, but normally unnecessary. | **Composite** |
| Auto-generated group with no addressable ID | Counted/ignored without a fake canvas target. | Not emitted independently. | Not emitted independently. | **No dedicated view** |
| PCB object net association changed | Useful affected-net scope. | Preserves old/new pads, tracks, vias, or zones and exposes the net old→new value. | Available for sequential inspection. | **Side-by-side** |
| Net-class rule added, removed, or changed | Board context remains available, but the class definition itself has no geometry. | Available, but does not invent a fake object highlight. | Structured clearance, track width, via, microvia, and differential-pair rules are clearest beside one clean board revision. | **Old/New**, marked as structured evidence |
| Net-class assignment added, removed, or changed | Board context remains available; the assigned pattern/net is shown in the card. | Available for a simultaneous board check. | Structured `old class → new class` evidence is primary. | **Old/New**, with a no-direct-canvas warning |
| Per-net route metrics | Available as whole-route context. | The card compares centerline length, via count, used layers, and via-barrel length while both routes remain visible. | Available for sequential inspection. | **Side-by-side** with the selected routing change |
| Board stackup | Not routed through the canvas presentation switcher. | Not routed through the canvas presentation switcher. | Not routed through the canvas presentation switcher. | **Dedicated Stackup tab** with two explicit stacks |

### Route focus and dynamic layer policy

A PCB routing review item is one semantic route across two revisions, not a
bag of parser events:

- The route keeps separate reference and comparison net names. Metrics are
  looked up using the name that exists in that revision, so a rename never
  appears as a missing old route and never borrows metrics from a different
  same-named net.
- Every modified track, arc, and via carries explicit native targets for both
  revisions. A pane resolves its own native objects; it does not infer old
  geometry from the comparison UUID or vice versa.
- Straight parser segments, curved segments, and vias are normalized to native
  routing kinds before grouping. The selected net therefore includes the full
  route instead of degrading to the one via that happened to classify as
  routing.
- Each pane derives its visible copper layers from the native track and arc
  objects it resolved in that revision. All other board layers are hidden for
  the focused review, except `Edge.Cuts`, which is retained in both panes as a
  mechanical frame of reference and carries no copper evidence of its own. A
  via span does not expose untouched intermediate copper layers; via endpoints
  are used only for a via-only change.
- A wholly added or removed route leaves one revision with no copper of its
  own. That pane borrows the routed revision's layer set so the absence is
  proven on the layer the route actually occupies, rather than on a blank board.
- The focus applies only when every selected object is copper. A mixed
  selection never narrows layers, because hiding board data is defensible only
  while the reviewer is isolating a route.
- The review focus temporarily owns layer visibility. The prior user layer
  state is captured once and restored when the routing selection is cleared,
  while the Layers panel continues to reflect the active pane state. Any manual
  layer toggle or preset hands visibility back to the reviewer for as long as
  that route stays selected, and the focus never writes the shareable `layers`
  URL state.

- A semantic review item selects **every** native object it resolved, in every
  pane. A net is all of its wires, labels, and junctions; a route is all of its
  segments, arcs, and vias. Highlighting only the first native object reads as
  if the rest of the net were unchanged.
- A selection that sends the reviewer to another sheet is applied once that
  sheet is prepared, not discarded. The first attempt runs against the outgoing
  document and resolves nothing; it is retried rather than consumed.
- Copper that changes net without moving shows the net `old → new` pair as
  primary evidence. Route metrics are identical in that case, so the net pair is
  the only thing that explains why the row exists.

This is the minimum evidence contract for an unambiguous fabrication review:
the card and canvas must agree on whether a route exists, which net it belongs
to, which copper layers carry it, and what native geometry exists on each side.

## Reviewer grouping and noise policy

The Differences panel is a review queue, not a parser event log. Prism keeps
the native objects as evidence, then rolls them into the smallest useful
review decision:

- Rule definitions, fabrication constraints, DRC/ERC exclusions, ERC pin
  compatibility, fabrication-output settings, net classes and assignments are
  grouped under **Rules & Constraints**. Settings with no canvas object use
  structured Old/New evidence and never receive a fabricated highlight.
- PCB footprint, pad, footprint-artwork, and footprint-zone changes roll up by
  RefDes, including when the change is electrical rather than mechanical. A pin
  reassignment across one BGA is one review item for that part, not one row per
  pad. Pads remain independently selectable; whole-footprint add/remove events
  suppress derivative child add/remove rows.
- Renaming one schematic net makes KiCad rewrite the net reference on every
  track, via, and pad carrying it. Where the semantic layer resolved the change
  as a rename — the net kept its terminals — those board objects are **derived
  evidence**: one secondary review item per rename, owned by the schematic's
  primary Net renamed item. A board object whose net name changed for any other
  reason stays primary, because the net genuinely gained or lost terminals and
  the copper now belongs to a different circuit. Terminal-set equality is what
  separates the two; the object's own geometry is identical either way.
- PCB tracks, arcs, and vias roll up as one routing review item per **conductor**,
  not per net name. Renaming a net leaves the copper in place and rewrites the
  net reference on every object, so those objects report the new name while
  anything genuinely deleted still reports the old one. Keying on the current
  name split one physical trace across an "Added <new>" row and a "Removed
  <old>" row, and selecting either highlighted only part of the trace. The
  base revision's name is canonical and the row states the rename alongside it.
  A net reassignment that is *not* a rename still separates, because moving
  copper onto a different circuit is a different decision.
- Exact route replacements remain visible even when their net, layer, via count,
  and rounded total length are unchanged.
- Schematic symbols roll up by RefDes. Pins that only inherit a parent move,
  addition/removal, or RefDes rename are suppressed; genuine pin name, number,
  or electrical changes remain primary.
- Logical net rename/connectivity evidence owns the review decision. A native
  label row carrying the same rename is suppressed as duplicate evidence, not
  as a second design change.
- Same-page schematic positioning, field placement, bus geometry, and unnetted
  drawing/wiring churn are not primary design-review work. Native layout-only
  evidence is collapsed by page and kept optional; duplicate semantic bus
  geometry is removed entirely. When a primary connectivity or authored-field
  change also carries field-anchor movement, those placement-only rows are not
  repeated in the selected-change evidence table; the synchronized canvases
  remain the geometry proof.
- Generated zone fills, generated hierarchy page numbers, field-autoplacement
  bookkeeping, PCB numeric net-table IDs, generated unconnected-net names, and
  UUID-only object recreation are never promoted to design changes.
- Recreated hierarchical sheet pins are reconciled by their parent interface
  slot. A real name or electrical-direction edit is therefore one readable
  modification rather than an opaque UUID removal plus addition.

This follows the same reviewer-level boundary used by mature ECAD comparison:
logical components/nets/rules first, native geometry as cross-probe evidence,
and secondary documentation/layout data available without dominating the
release review.

## Fabrication-output comparison

The PCB comparison reads the board file. That answers what the designer
changed, but not what changes in the package the fab house receives: plot
options, soldermask subtraction, silkscreen clipping, DNP handling and aperture
generation all sit between the board and the Gerber, and none of them are
authored objects. Prism plots both revisions with `kicad-cli pcb export gerbers`
and compares the packages layer by layer, matching Altium 365's Gerber Compare.

- The comparison is **geometric, not textual**. Gerber files carry creation
  timestamps, generator strings and freely renumbered aperture D-codes, so a
  byte diff reports every regeneration as a full-board rewrite. Each layer is
  parsed into a stream of drawing operations whose aperture reference is the
  aperture's resolved *geometry*, never its D-code. Replotting an unchanged
  board yields zero differences.
- Differences are clustered into **numbered regions with a bounding box in
  board millimetres**, not counted as changed draw commands. Operations whose
  extents come within 0.5 mm merge, so a rerouted trace and the via it lands on
  are one marker rather than forty. Regions are numbered top-down then
  left-to-right.
- Merging is bounded twice over: by distance, and by a **ceiling on how large
  one region may grow**. Unbounded transitive merging chains changed copper
  across a dense board into a single marker the size of the plane, which says
  only that the layer differs and points at nothing. Past that size the change
  is reported as the several local differences it is.
- A poured area is compared **edge by edge, not as one polygon**. A pour is a
  single operation carrying hundreds of vertices, so comparing it whole makes
  any one moved vertex read as the entire plane being replaced, and the marker
  then covers the board and tells the reviewer nothing. Edge comparison puts the
  marker on the millimetre that moved: on this repository's test board, one
  vertex shifted by 0.12 mm went from a 15.85 × 5.20 mm marker to
  0.187 × 0.140 mm. Nearby changed edges still merge, so a local re-fill is one
  marker rather than twenty-five. Rendering still uses the intact polygon.
- Region coordinates are **KiCad board space**. Gerber's Y axis points up and
  KiCad's points down; a region reported in plot space would cross-probe to a
  mirrored position.
- Layers pair by **name**, not by Gerber file function. KiCad gives every user
  layer the function `Other,User`, so pairing on function collapses User.1
  through User.4 and the comment and drawing layers into one entry. A layer
  present in only one revision is reported as the change itself, with no
  geometry diff.
- Plot options are left at the board's own settings. Normalising them would
  defeat the purpose: a changed plot option *is* a fabrication change, and it is
  one this comparison exists to catch.
- An aperture macro whose parameters cannot be evaluated yields an approximate
  extent, and the layer says so. The marker may be tight; whether a difference
  exists never depends on it.
- Plotting is the one part of Design Comparison that shells out to KiCad. It is
  cached per revision beside that revision's snapshot and reused by every
  comparison touching it. A missing or failing `kicad-cli` degrades this domain
  alone and is reported as a warning, never as a failed comparison.

Layers are discovered from the Gerber job file, which lists every plotted file
authoritatively, falling back to file extensions only when no job file was
written. An extension allowlist alone silently drops inner copper — KiCad writes
it with Protel extensions `.g1`, `.g2`, … — so a multilayer board would have
most of its copper go uncompared with nothing saying so.

The **NC drill program** is compared beside the plotted layers, from
`kicad-cli pcb export drill`. Holes and slots express as operations over
synthetic round apertures, so they diff, cluster and number through the same
path as plotted geometry rather than a parallel one.

- A tool's **plating function is part of its identity**. A plated hole that
  becomes non-plated does not move and does not resize; comparing geometry alone
  would call the board unchanged while the fab house builds something
  electrically different.
- Canned slots (`G85`) and routed slots (`M15`/`M16` with the tool down) are
  compared along their whole path, not by their endpoint.
- Plated and non-plated holes stay in one mixed program, which is the CLI's own
  default. Their plating is recorded per tool inside the file, so splitting the
  files would only fragment the review. A `--excellon-separate-th` export still
  pairs correctly, as `Drill (PTH)` and `Drill (NPTH)`.

The **Fabrication tab** presents this as Altium does: a layer list with per-layer
difference counts, numbered difference entries carrying each region's position,
and numbered markers over the artwork that cross-probe both ways with the list.
Unchanged layers are hidden until asked for, and the tab opens on the first
changed layer.

The artwork is **drawn from the same operations the comparison diffs**, not by a
separate rasteriser. A second renderer could disagree with the answer on exactly
the fab-only changes this tab exists to catch, and it would be a system
dependency besides. Consequences of that choice:

- Both revisions of every layer share **one board-wide viewBox**. Fitting each
  layer to its own extents would make the panes disagree the moment a layer is
  sparse, and the composite would stop registering. It is also what lets the
  difference markers overlay directly, since they are already in the same board
  millimetres.
- Clear polarity paints the background rather than cutting a mask. Gerber is a
  painter's-algorithm format, so drawing in order over an opaque background
  reproduces it exactly.
- Arcs are flattened to chords at 7.5°. A chord that fine is indistinguishable at
  any review zoom, while a mis-signed sweep flag through a mirrored axis is not.
- Old is red and new is green throughout — the same reading the change list uses,
  and the pair that makes a screen-blended composite show shared copper as
  yellow, removed as red and added as green.
- Each layer's artwork is its own immutable artifact, so a reviewer fetches the
  layer they opened rather than every plotted layer on the board.

The tab uses the **same three presentations as every other view**. Auto selects
Side-by-side, because fabrication output is manufactured evidence and the PCB
policy above already reviews all manufactured objects side by side.

Navigation is the same in all three: wheel to zoom about the cursor, drag to
pan, and explicit zoom and fit controls.

- The camera is stored in **board millimetres** — a centre point and a zoom
  relative to fit — not in pixels. Panes measure themselves, so side-by-side
  panes of different sizes still show the same place and a window resize does
  not move the view.
- The board is **laid out** at the zoomed size rather than CSS-transformed to
  it, so each layer's SVG is rasterised at the size it is shown. Transforming
  instead rasterises once at fit and magnifies that bitmap, which goes
  unreadable and then blank a few multiples in.
- The view fits to the **board profile**, while the rectangle drawn is the union
  of every layer's ink. Fabrication and courtyard layers annotate well outside
  the profile — a quarter again on this repository's test board — so fitting to
  the drawn extent leaves the board adrift in the middle of the pane. Zooming out
  still reaches the annotation.
- A frame never zooms tighter than a tenth of the board, and framing never
  exceeds 10×. A moved vertex is a fraction of a millimetre; filling the pane
  with it shows a featureless field with no pad or trace to locate it against.
- Difference markers are drawn **unfilled**. A transparent fill is still a hit
  target, so a filled marker swallows any drag beginning inside it and the pane
  cannot be panned. Only the outline and the number select.
- Marker chrome is specified in screen pixels and converted to board units, so
  it holds its size at every zoom instead of growing with the board.
- Selecting a difference — from the list or from its marker — frames it, and
  Previous/Next walks the layer's differences in order and wraps. Selection
  carries the difference itself, not its number, so opening one that belongs to
  another layer frames the right place.
- Layer expansion is independent of layer selection, so a layer can be collapsed
  without opening a different one.

| Presentation | What it proves for fabrication output |
| --- | --- |
| Composite | Where the two packages differ at a glance: shared copper blends to yellow, copper only in the old revision stays red, only in the new stays green. |
| Side-by-side | Both plots at once, each with the numbered markers, for reading what the change did to its surroundings. |
| Old/New | One full-width plot at a time, for judging a single revision's artwork on its own. |

ODB++ and IPC-2581 remain deliberately unused. Their advantage is per-feature net
and component references, which would let a region say *which* net or part it
touches — but Prism already holds that from the semantic index, so annotating
regions from the existing PCB delta is the cheaper and better route.

## Queue counts, owner filter, and export

Altium's Differences panel counts every difference folder, Altium 365's compare
panes filter by change category and export the compared BOM as CSV, and
Xpedition's compare viewer lets the reviewer restrict what the comparison shows.
Prism's queue matches that and adds the axis the semantic layer makes possible:

- The queue is one scrolling list under four headings — Components, Nets,
  Rules & constraints, and a collapsed Layout & documentation. It is not
  paginated: a reviewer scans and searches a release queue, and a page boundary
  breaks both.
- Every filter chip and section heading carries its item count. Status and
  owner counts are taken before the status, owner, and search filters are
  applied, so a chip always answers "how many review items of this kind exist",
  not "how many survive what I already filtered". A section heading counts what
  is listed under it, and the queue title reads `shown/total` while any filter
  narrows it.
- A row opens to its **members** — the designators a part-level row covers, or
  the pins a net's connectivity change touches — never to the changed values.
  Those are stated once in the property panel for whichever member is selected,
  and repeating them under the row both said the same thing twice and crowded
  out the members themselves.
- Components are grouped by the transition they made, keyed on Value and
  manufacturer part number, the way a BOM groups them. Thirty capacitors of
  which four moved from 100nF to 470nF at one part number are one review item,
  because one decision produced all four; had two gone to 220nF instead, that
  is a second decision and a second row. Each instance stays individually
  selectable as a designator chip on the row.
- Review owner is a filter, not just a label on the property panel. The
  chips narrow rather than exclude: no chip selected means no owner filter, so
  isolating one discipline is a single click. The filter resets when the domain
  changes, because *PCB fabrication* has no meaning in the schematic queue. The
  chips live behind the queue's filter control rather than occupying a
  permanent band above the list.
- The queue exports to CSV: status, category, review owner, item, detail,
  documents, object count, primary/secondary scope, and open comment count. It
  exports the **filtered** queue and the rolled-up review items, not the raw
  parser events — the reviewer's filters are the review scope, and the export is
  the record of what was signed off. The filename names both revisions.

## Deliberate boundaries and remaining release checks

- Composite is no longer treated as universal proof. All manufactured PCB
  objects and existing-object schematic geometry automatically use
  Side-by-side.
- Generated zone fills remain ignored. Prism does not yet run an on-demand
  refill/clearance-difference pass; fabrication release should still include
  KiCad DRC and generated manufacturing-output review.
- Net-class definitions/assignments, project fabrication constraints,
  DRC/ERC policy, exclusions, fabrication-output settings, and custom
  `.kicad_dru` rules are first-class. A rule definition has no native canvas
  UUID, so Prism marks it as structured evidence instead of creating a false
  highlight or presenting a visualization warning.
- Footprint 3D-model parameter edits and arbitrary project settings outside the
  explicit review schema are not yet first-class Design Comparison rows.
- Two comparison affordances present in Altium/Xpedition need viewer-bundle work
  rather than review-policy work, and are deliberately not attempted: a
  Top/Bottom board flip (Altium) and free rotate/mirror (Xpedition), and
  on-canvas distance measurement between two points (Altium 365).
- Xpedition can restrict the *graphics* to objects unique to one version. Prism
  keeps queue filters and canvas contents separate on purpose: the composite
  presentation already colours one-sided objects, and hiding half a revision's
  geometry from the canvas while the card claims to prove a change would break
  the evidence contract above. Route focus is the one sanctioned exception, and
  it hides layers, never a revision.
- BOM and stackup keep their purpose-built panels; forcing them into one of the
  three canvas presentations would reduce context rather than improve it.
