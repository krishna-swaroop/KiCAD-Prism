use crate::contract::{NmPoint, NmRing};
use std::f64::consts::{PI, TAU};

pub const NM_PER_MM: f64 = 1_000_000.0;

#[derive(Clone, Copy, Debug)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

impl Point {
    pub const fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }
}

pub fn mm_to_nm(value: f64) -> i64 {
    (value * NM_PER_MM).round() as i64
}

pub fn point_to_nm(point: Point) -> NmPoint {
    [mm_to_nm(point.x), mm_to_nm(point.y)]
}

pub fn ring_to_nm(points: impl IntoIterator<Item = Point>) -> NmRing {
    let mut output = Vec::new();
    for point in points {
        let point = point_to_nm(point);
        if output.last() != Some(&point) {
            output.push(point);
        }
    }
    if output.len() > 1 && output.first() == output.last() {
        output.pop();
    }
    output
}

pub fn rotate(point: Point, angle_deg: f64) -> Point {
    let angle = angle_deg.to_radians();
    Point::new(
        point.x * angle.cos() - point.y * angle.sin(),
        point.x * angle.sin() + point.y * angle.cos(),
    )
}

pub fn translate(point: Point, offset: Point) -> Point {
    Point::new(point.x + offset.x, point.y + offset.y)
}

pub fn transform_footprint(point: Point, origin: Point, angle_deg: f64) -> Point {
    translate(rotate(point, -angle_deg), origin)
}

fn circle_segments(radius: f64, tolerance: f64) -> usize {
    if radius <= 0.0 {
        return 0;
    }
    let bounded = tolerance.max(1e-6).min(radius);
    let step = 2.0 * (1.0 - bounded / radius).clamp(-1.0, 1.0).acos();
    if !step.is_finite() || step <= 0.0 {
        return 64;
    }
    (TAU / step).ceil().clamp(12.0, 4096.0) as usize
}

pub fn circle(center: Point, radius: f64, tolerance: f64) -> Vec<Point> {
    let count = circle_segments(radius, tolerance);
    (0..count)
        .map(|index| {
            let angle = TAU * index as f64 / count as f64;
            Point::new(
                center.x + radius * angle.cos(),
                center.y + radius * angle.sin(),
            )
        })
        .collect()
}

pub fn capsule(start: Point, end: Point, radius: f64, tolerance: f64) -> Vec<Point> {
    let dx = end.x - start.x;
    let dy = end.y - start.y;
    let length = dx.hypot(dy);
    if length <= f64::EPSILON {
        return circle(start, radius, tolerance);
    }
    let direction = dy.atan2(dx);
    let half_count = (circle_segments(radius, tolerance) / 2).max(6);
    let mut output = Vec::with_capacity((half_count + 1) * 2);
    for index in 0..=half_count {
        let angle = direction - PI / 2.0 + PI * index as f64 / half_count as f64;
        output.push(Point::new(
            end.x + radius * angle.cos(),
            end.y + radius * angle.sin(),
        ));
    }
    for index in 0..=half_count {
        let angle = direction + PI / 2.0 + PI * index as f64 / half_count as f64;
        output.push(Point::new(
            start.x + radius * angle.cos(),
            start.y + radius * angle.sin(),
        ));
    }
    output
}

pub fn rectangle(center: Point, width: f64, height: f64, angle_deg: f64) -> Vec<Point> {
    let half_x = width / 2.0;
    let half_y = height / 2.0;
    [
        Point::new(-half_x, -half_y),
        Point::new(half_x, -half_y),
        Point::new(half_x, half_y),
        Point::new(-half_x, half_y),
    ]
    .into_iter()
    .map(|point| translate(rotate(point, angle_deg), center))
    .collect()
}

pub fn chamfered_rectangle(
    center: Point,
    width: f64,
    height: f64,
    ratio: f64,
    corners: &[String],
    angle_deg: f64,
) -> Vec<Point> {
    let half_x = width / 2.0;
    let half_y = height / 2.0;
    let chamfer = (ratio * width.min(height)).max(0.0);
    let mut output = Vec::with_capacity(8);
    let has = |name: &str| corners.iter().any(|value| value == name);

    if has("top_left") {
        output.push(Point::new(-half_x + chamfer, -half_y));
        output.push(Point::new(-half_x, -half_y + chamfer));
    } else {
        output.push(Point::new(-half_x, -half_y));
    }
    if has("bottom_left") {
        output.push(Point::new(-half_x, half_y - chamfer));
        output.push(Point::new(-half_x + chamfer, half_y));
    } else {
        output.push(Point::new(-half_x, half_y));
    }
    if has("bottom_right") {
        output.push(Point::new(half_x - chamfer, half_y));
        output.push(Point::new(half_x, half_y - chamfer));
    } else {
        output.push(Point::new(half_x, half_y));
    }
    if has("top_right") {
        output.push(Point::new(half_x, -half_y + chamfer));
        output.push(Point::new(half_x - chamfer, -half_y));
    } else {
        output.push(Point::new(half_x, -half_y));
    }

    output
        .into_iter()
        .map(|point| translate(rotate(point, angle_deg), center))
        .collect()
}

pub fn oval(center: Point, width: f64, height: f64, angle_deg: f64, tolerance: f64) -> Vec<Point> {
    let (start, end, diameter) = if width >= height {
        let offset = (width - height) / 2.0;
        (Point::new(-offset, 0.0), Point::new(offset, 0.0), height)
    } else {
        let offset = (height - width) / 2.0;
        (Point::new(0.0, -offset), Point::new(0.0, offset), width)
    };
    capsule(start, end, diameter / 2.0, tolerance)
        .into_iter()
        .map(|point| translate(rotate(point, angle_deg), center))
        .collect()
}

pub fn rounded_rectangle(
    center: Point,
    width: f64,
    height: f64,
    radius: f64,
    angle_deg: f64,
    tolerance: f64,
) -> Vec<Point> {
    let radius = radius
        .max(0.0)
        .min(width.abs() / 2.0)
        .min(height.abs() / 2.0);
    if radius <= f64::EPSILON {
        return rectangle(center, width, height, angle_deg);
    }
    let half_x = width / 2.0 - radius;
    let half_y = height / 2.0 - radius;
    let quarter = (circle_segments(radius, tolerance) / 4).max(3);
    let corners = [
        (Point::new(half_x, half_y), 0.0),
        (Point::new(-half_x, half_y), PI / 2.0),
        (Point::new(-half_x, -half_y), PI),
        (Point::new(half_x, -half_y), 3.0 * PI / 2.0),
    ];
    let mut output = Vec::with_capacity((quarter + 1) * 4);
    for (corner, base) in corners {
        for index in 0..=quarter {
            let theta = base + index as f64 * PI / 2.0 / quarter as f64;
            let point = Point::new(
                corner.x + radius * theta.cos(),
                corner.y + radius * theta.sin(),
            );
            output.push(translate(rotate(point, angle_deg), center));
        }
    }
    output
}

pub fn trapezoid(
    center: Point,
    width: f64,
    height: f64,
    delta_x: f64,
    delta_y: f64,
    angle_deg: f64,
) -> Vec<Point> {
    let half_x = width / 2.0;
    let half_y = height / 2.0;
    let points = [
        Point::new(-half_x + delta_y / 2.0, -half_y + delta_x / 2.0),
        Point::new(half_x - delta_y / 2.0, -half_y - delta_x / 2.0),
        Point::new(half_x + delta_y / 2.0, half_y + delta_x / 2.0),
        Point::new(-half_x - delta_y / 2.0, half_y - delta_x / 2.0),
    ];
    points
        .into_iter()
        .map(|point| translate(rotate(point, angle_deg), center))
        .collect()
}

fn normalize_positive(angle: f64) -> f64 {
    angle.rem_euclid(TAU)
}

pub fn sample_arc(start: Point, mid: Point, end: Point, tolerance: f64) -> Option<Vec<Point>> {
    let determinant =
        2.0 * (start.x * (mid.y - end.y) + mid.x * (end.y - start.y) + end.x * (start.y - mid.y));
    if determinant.abs() <= 1e-12 {
        return None;
    }
    let start_sq = start.x * start.x + start.y * start.y;
    let mid_sq = mid.x * mid.x + mid.y * mid.y;
    let end_sq = end.x * end.x + end.y * end.y;
    let center = Point::new(
        (start_sq * (mid.y - end.y) + mid_sq * (end.y - start.y) + end_sq * (start.y - mid.y))
            / determinant,
        (start_sq * (end.x - mid.x) + mid_sq * (start.x - end.x) + end_sq * (mid.x - start.x))
            / determinant,
    );
    let radius = (start.x - center.x).hypot(start.y - center.y);
    if radius <= f64::EPSILON {
        return None;
    }
    let start_angle = (start.y - center.y).atan2(start.x - center.x);
    let mid_angle = (mid.y - center.y).atan2(mid.x - center.x);
    let end_angle = (end.y - center.y).atan2(end.x - center.x);
    let positive_sweep = normalize_positive(end_angle - start_angle);
    let positive_mid = normalize_positive(mid_angle - start_angle);
    let sweep = if positive_mid <= positive_sweep + 1e-12 {
        positive_sweep
    } else {
        positive_sweep - TAU
    };
    let full_segments = circle_segments(radius, tolerance).max(12);
    let segment_count = ((sweep.abs() / TAU) * full_segments as f64).ceil().max(2.0) as usize;
    Some(
        (0..=segment_count)
            .map(|index| {
                let theta = start_angle + sweep * index as f64 / segment_count as f64;
                Point::new(
                    center.x + radius * theta.cos(),
                    center.y + radius * theta.sin(),
                )
            })
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn circle_and_capsule_are_unclosed_rings() {
        let disk = circle(Point::new(0.0, 0.0), 1.0, 0.005);
        let trace = capsule(Point::new(0.0, 0.0), Point::new(2.0, 0.0), 0.2, 0.005);
        assert!(disk.len() >= 12);
        assert!(trace.len() >= 12);
        assert_ne!(point_to_nm(disk[0]), point_to_nm(*disk.last().unwrap()));
    }

    #[test]
    fn arc_sampling_passes_through_the_middle_side() {
        let points = sample_arc(
            Point::new(1.0, 0.0),
            Point::new(0.0, 1.0),
            Point::new(-1.0, 0.0),
            0.005,
        )
        .unwrap();
        assert!(points.iter().any(|point| point.y > 0.99));
    }

    #[test]
    fn chamfered_rectangle_splits_selected_corners() {
        let ring = chamfered_rectangle(
            Point::new(0.0, 0.0),
            4.0,
            2.0,
            0.25,
            &["top_left".to_owned(), "bottom_right".to_owned()],
            0.0,
        );
        assert_eq!(ring.len(), 6);
        assert!(!ring.iter().any(|point| point.x == -2.0 && point.y == -1.0));
        assert!(!ring.iter().any(|point| point.x == 2.0 && point.y == 1.0));
    }
}
