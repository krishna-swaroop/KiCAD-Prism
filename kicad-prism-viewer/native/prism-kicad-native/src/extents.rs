//! Board and footprint extents for the semantic index, as KiCad states them:
//! the board's is `GetBoardEdgesBoundingBox`, each Edge.Cuts shape grown by
//! half its stroke (`EDA_SHAPE::getBoundingBox`); a footprint's is its
//! courtyard outline, else its fab outline.

use crate::geometry::{Point, mm_to_nm, sample_arc, transform_footprint};
use kicad_monkey_core::{PcbFootprint, PcbGraphic, PcbGraphicKind, PcbProfileOwner, PcbView};

/// Arcs are sampled this finely, so an extent misses an arc's true extreme by at most this.
const ARC_TOLERANCE_MM: f64 = 0.001;
/// Courtyard first, then the fab outline: the same order as the Python path.
const BODY_LAYER_SUFFIXES: [&str; 2] = [".CrtYd", ".Fab"];

#[derive(Default)]
struct Extent(Option<[f64; 4]>);

impl Extent {
    fn add(&mut self, point: Point, radius: f64) {
        let [x0, y0, x1, y1] = self
            .0
            .get_or_insert([f64::MAX, f64::MAX, f64::MIN, f64::MIN]);
        *x0 = x0.min(point.x - radius);
        *y0 = y0.min(point.y - radius);
        *x1 = x1.max(point.x + radius);
        *y1 = y1.max(point.y + radius);
    }

    fn to_nm(&self) -> Option<[i64; 4]> {
        self.0.map(|bounds| bounds.map(mm_to_nm))
    }
}

/// KiCad's board-edges bounding box, footprint-owned Edge.Cuts included; None without an outline.
pub fn outline_bounds_nm(view: &PcbView<'_>, footprints: &[PcbFootprint]) -> Option<[i64; 4]> {
    let mut extent = Extent::default();
    for profile in view.profile_primitives() {
        let Ok(profile) = profile else { continue };
        let owner = match profile.owner {
            PcbProfileOwner::Board => None,
            PcbProfileOwner::Footprint { footprint_index } => footprints.get(footprint_index),
        };
        let half_stroke = profile.graphic.stroke_width.unwrap_or(0.0).max(0.0) / 2.0;
        for (point, radius) in graphic_points(&profile.graphic) {
            extent.add(place(point, owner), radius + half_stroke);
        }
    }
    extent.to_nm()
}

/// Per footprint, by index: the courtyard extent, else the fab outline's, else None.
pub fn footprint_body_bounds_nm(
    view: &PcbView<'_>,
    footprints: &[PcbFootprint],
) -> Vec<Option<[i64; 4]>> {
    let mut extents: Vec<[Extent; 2]> = footprints.iter().map(|_| Default::default()).collect();
    for item in view.footprint_graphics() {
        let Ok(item) = item else { continue };
        let Some(layer) = item.graphic.layer.as_deref() else {
            continue;
        };
        let Some(rank) = BODY_LAYER_SUFFIXES
            .iter()
            .position(|suffix| layer.ends_with(suffix))
        else {
            continue;
        };
        let (Some(footprint), Some(slots)) = (
            footprints.get(item.footprint_index),
            extents.get_mut(item.footprint_index),
        ) else {
            continue;
        };
        for (point, radius) in graphic_points(&item.graphic) {
            slots[rank].add(place(point, Some(footprint)), radius);
        }
    }
    extents
        .iter()
        .map(|[courtyard, fab]| courtyard.to_nm().or_else(|| fab.to_nm()))
        .collect()
}

fn place(point: Point, footprint: Option<&PcbFootprint>) -> Point {
    match footprint {
        Some(footprint) => transform_footprint(
            point,
            Point::new(footprint.at_x.unwrap_or(0.0), footprint.at_y.unwrap_or(0.0)),
            footprint.angle.unwrap_or(0.0),
        ),
        None => point,
    }
}

/// The graphic's outline as (point, radius) in its own frame, stroke width excluded.
fn graphic_points(graphic: &PcbGraphic) -> Vec<(Point, f64)> {
    let at = |value: kicad_monkey_core::PcbPoint| Point::new(value.x, value.y);
    match graphic.kind {
        PcbGraphicKind::Line => [graphic.start, graphic.end]
            .into_iter()
            .flatten()
            .map(|value| (at(value), 0.0))
            .collect(),
        PcbGraphicKind::Rect => match (graphic.start, graphic.end) {
            (Some(start), Some(end)) => vec![(at(start), 0.0), (at(end), 0.0)],
            _ => Vec::new(),
        },
        PcbGraphicKind::Arc => match (graphic.start, graphic.mid, graphic.end) {
            (Some(start), Some(mid), Some(end)) => {
                sample_arc(at(start), at(mid), at(end), ARC_TOLERANCE_MM)
                    .unwrap_or_else(|| vec![at(start), at(mid), at(end)])
                    .into_iter()
                    .map(|point| (point, 0.0))
                    .collect()
            }
            _ => Vec::new(),
        },
        PcbGraphicKind::Circle => match (graphic.center.or(graphic.start), graphic.end) {
            (Some(center), Some(end)) => {
                let (center, end) = (at(center), at(end));
                vec![(
                    center,
                    ((end.x - center.x).powi(2) + (end.y - center.y).powi(2)).sqrt(),
                )]
            }
            _ => Vec::new(),
        },
        PcbGraphicKind::Poly | PcbGraphicKind::Curve => graphic
            .points
            .iter()
            .map(|value| (at(*value), 0.0))
            .collect(),
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use kicad_monkey_core::{PcbFamily, PcbSelection};

    const BOARD: &str = r#"(kicad_pcb (version 20240108) (generator "pcbnew")
  (general (thickness 1.6))
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (44 "Edge.Cuts" user) (47 "F.CrtYd" user) (49 "F.Fab" user))
  (gr_line (start 10 20) (end 40 20) (stroke (width 0.8) (type default)) (layer "Edge.Cuts"))
  (gr_line (start 40 20) (end 40 35) (stroke (width 0.8) (type default)) (layer "Edge.Cuts"))
  (gr_line (start 40 35) (end 10 35) (stroke (width 0.8) (type default)) (layer "Edge.Cuts"))
  (gr_line (start 10 35) (end 10 20) (stroke (width 0.8) (type default)) (layer "Edge.Cuts"))
  (footprint "R_0402" (layer "F.Cu") (at 20 25 90)
    (property "Reference" "R1" (at 0 0) (layer "F.SilkS"))
    (fp_line (start -0.91 -0.46) (end 0.91 -0.46) (stroke (width 0.05) (type solid)) (layer "F.CrtYd"))
    (fp_line (start -0.91 0.46) (end 0.91 0.46) (stroke (width 0.05) (type solid)) (layer "F.CrtYd"))
    (fp_line (start -0.5 -0.25) (end 0.5 0.25) (stroke (width 0.1) (type solid)) (layer "F.Fab"))
  )
  (footprint "Fab_only" (layer "F.Cu") (at 30 30)
    (property "Reference" "U1" (at 0 0) (layer "F.SilkS"))
    (fp_circle (center 0 0) (end 1 0) (stroke (width 0.1) (type solid)) (layer "F.Fab"))
  )
  (footprint "Bare" (layer "F.Cu") (at 15 30)
    (property "Reference" "TP1" (at 0 0) (layer "F.SilkS"))
  )
)"#;

    fn parsed() -> (PcbView<'static>, Vec<PcbFootprint>) {
        let selection = PcbSelection::none()
            .with(PcbFamily::Footprints)
            .with(PcbFamily::FootprintGraphics)
            .with(PcbFamily::Profile);
        let view = PcbView::parse_selected(BOARD, Default::default(), selection).unwrap();
        let footprints = view.footprints().collect::<Result<Vec<_>, _>>().unwrap();
        (view, footprints)
    }

    fn close(actual: [i64; 4], expected_mm: [f64; 4]) {
        let expected = expected_mm.map(mm_to_nm);
        for (a, e) in actual.iter().zip(expected) {
            assert!((a - e).abs() <= 1, "{actual:?} vs {expected:?}");
        }
    }

    #[test]
    fn outline_grows_by_half_the_stroke_as_kicad_does() {
        let (view, footprints) = parsed();
        close(
            outline_bounds_nm(&view, &footprints).unwrap(),
            [9.6, 19.6, 40.4, 35.4],
        );
    }

    #[test]
    fn footprint_body_prefers_courtyard_then_fab_and_follows_rotation() {
        let (view, footprints) = parsed();
        let bodies = footprint_body_bounds_nm(&view, &footprints);
        // Rotated 90 degrees: the courtyard's 1.82 x 0.92 becomes 0.92 x 1.82.
        close(bodies[0].unwrap(), [19.54, 24.09, 20.46, 25.91]);
        close(bodies[1].unwrap(), [29.0, 29.0, 31.0, 31.0]);
        assert_eq!(bodies[2], None);
    }
}
