# Bug: `PcbView::zones()` rejects valid zone polygons containing arc elements

## Summary

The Rust typed PCB reader rejects a valid KiCad zone when its `(polygon (pts ...))`
contains `(arc ...)` elements. `PcbView::parse_selected(...)` succeeds, but
iterating `PcbView::zones()` fails the entire zone collection with:

```text
Zone outline and filled-polygon readers currently require XY elements; arc or unknown elements are not omitted
```

This is reproducible on current `main` at
`bc6796c1b8ce55bfbcb8b1771f3ecbc70658d34d` (`kicad-monkey-core 2026.9.7`).

The repository already has a producer-neutral `PcbPolygonPoint` enum with
`Xy` and `Arc { start, mid, end }` variants, and board graphics already preserve
embedded arcs through it. Zone polygon readers still expose only
`Vec<PcbPoint>` and fail on the same valid arc form.

## Version

```text
kicad-monkey-core 2026.9.7
main bc6796c1b8ce55bfbcb8b1771f3ecbc70658d34d
Rust 1.95.0
```

## Steps To Reproduce

Save this as `zone-arc.kicad_pcb`:

```scheme
(kicad_pcb
  (version 20240108)
  (generator "pcbnew")
  (generator_version "8.0")
  (general
    (thickness 1.6)
  )
  (paper "A4")
  (layers
    (0 "F.Cu" signal)
    (31 "B.Cu" signal)
    (36 "B.SilkS" user "b.silkscreen")
    (37 "F.SilkS" user "f.silkscreen")
    (44 "Edge.Cuts" user)
  )
  (setup
    (pad_to_mask_clearance 0)
  )
  (net 0 "")
  (zone
    (net 0)
    (net_name "")
    (layer "F.SilkS")
    (uuid "09e80d82-2538-409d-bf60-54ff9ae4271e")
    (hatch edge 0.5)
    (connect_pads
      (clearance 0)
    )
    (min_thickness 0.25)
    (filled_areas_thickness no)
    (keepout
      (tracks allowed)
      (vias allowed)
      (pads allowed)
      (copperpour not_allowed)
      (footprints allowed)
    )
    (fill
      (thermal_gap 0.5)
      (thermal_bridge_width 0.5)
    )
    (polygon
      (pts
        (arc
          (start 10 5)
          (mid 15 10)
          (end 20 5)
        )
        (arc
          (start 20 5)
          (mid 15 0)
          (end 10 5)
        )
      )
    )
  )
)
```

Run this against `kicad-monkey-core`:

```rust
use kicad_monkey_core::{PcbFamily, PcbSelection, PcbView};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let source = std::fs::read_to_string("zone-arc.kicad_pcb")?;
    let selection = PcbSelection::none().with(PcbFamily::Zones);
    let view = PcbView::parse_selected(&source, Default::default(), selection)?;
    let zones = view.zones().collect::<Result<Vec<_>, _>>()?;
    println!("{}", zones.len());
    Ok(())
}
```

Observed result:

```text
Error: Error { phase: Tree, kind: UnexpectedToken, message: "Zone outline and filled-polygon readers currently require XY elements; arc or unknown elements are not omitted", position: Some(Position { offset: 831, line: 44, column: 9 }), token: None }
```

## Expected Behavior

`PcbView::zones()` should accept valid zone `pts` containing `arc` elements and
preserve their authored analytic form. It should not silently omit or eagerly
tessellate them.

A compatible shape would mirror `PcbGraphic`:

- preserve ordered `Xy` and `Arc { start, mid, end }` elements through
  `PcbPolygonPoint`;
- retain any existing XY-only compatibility projection if required;
- preserve source order and source ranges.

## Actual Behavior

The zone iterator returns an error for the first arc element, so one valid
arc-bearing zone prevents callers from reading any zones from the board. This
also affects consumers interested only in copper zones when an unrelated
silkscreen/keepout zone uses arcs.

The public kicad_monkey corpus case `cern_wren_eda_04903` contains such an
`F.SilkS` keepout zone and reproduces the same failure.

## Environment

- OS: macOS arm64
- Rust: 1.95.0
- kicad-monkey-core: 2026.9.7
- Git revision: `bc6796c1b8ce55bfbcb8b1771f3ecbc70658d34d`
- KiCad CLI oracle: not involved

## Files Or Fixtures

The synthetic fixture above is sufficient. The same behavior is present in the
public packaged test-corpus project `cern_wren_eda_04903`.

## Suggested Acceptance Criteria

- [ ] Zone outline `pts` accept both `xy` and `arc` elements.
- [ ] Filled-zone polygon `pts` accept every arc form KiCad can author there, or
      document and test the exact narrower grammar if filled polygons are always
      XY-only.
- [ ] Arc elements remain analytic in the typed result; they are not omitted or
      sampled at parse time.
- [ ] Existing XY-only consumers retain a deliberate compatibility projection.
- [ ] The synthetic fixture above has a Rust regression test.
- [ ] The `cern_wren_eda_04903` corpus case can iterate `PcbView::zones()`.

## Additional Context

The relevant implementation is `src/rs/kicad-monkey-core/src/pcb/zones.rs`,
where `polygon_points_from_children` currently rejects every child whose head
is not `xy`. The reusable arc-aware decoder already exists in
`src/rs/kicad-monkey-core/src/pcb/scalars.rs` as
`polygon_points_from_span`, and `PcbGraphic` already exposes the corresponding
analytic `PcbPolygonPoint` representation.

I searched the open issues for the exact error and for zone/arc parser reports
and did not find an existing issue covering this failure.
