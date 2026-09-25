use crate::analytic_contract::{Document, MaterialPolarity, Operation};
use anyhow::{Result, bail};

pub const NM_PER_MM: i64 = 1_000_000;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord)]
pub struct TileId {
    pub x: i64,
    pub y: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LoweringRoute {
    Direct,
    GeometerBoolean,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClassifiedOperation {
    pub operation_index: usize,
    pub tiles: Vec<TileId>,
    pub route: LoweringRoute,
}

pub fn resolve_tile_size_mm(requested: Option<f64>, bounds_nm: Option<[i64; 4]>) -> Result<f64> {
    if let Some(value) = requested {
        if !value.is_finite() || value <= 0.0 {
            bail!("semantic tile size must be finite and positive");
        }
        return Ok(value);
    }
    let span_mm = bounds_nm
        .map(|bounds| {
            (bounds[2] - bounds[0]).max(bounds[3] - bounds[1]).max(0) as f64 / NM_PER_MM as f64
        })
        .unwrap_or(0.0);
    Ok([20.0, 40.0, 80.0, 160.0]
        .into_iter()
        .find(|size| span_mm <= *size)
        .unwrap_or(160.0))
}

pub fn classify(document: &Document, tile_size_mm: f64) -> Result<Vec<ClassifiedOperation>> {
    if !tile_size_mm.is_finite() || tile_size_mm <= 0.0 {
        bail!("semantic tile size must be finite and positive");
    }
    let tile_size_nm = (tile_size_mm * NM_PER_MM as f64).round() as i64;
    if tile_size_nm <= 0 {
        bail!("semantic tile size is below the nanometer coordinate resolution");
    }
    Ok(document
        .operations
        .iter()
        .enumerate()
        .map(|(operation_index, operation)| {
            classify_operation(operation_index, operation, tile_size_nm)
        })
        .collect())
}

fn classify_operation(
    operation_index: usize,
    operation: &Operation,
    tile_size_nm: i64,
) -> ClassifiedOperation {
    let [min_x, min_y, max_x, max_y] = operation.bounds_nm;
    let last_x = if max_x > min_x { max_x - 1 } else { max_x };
    let last_y = if max_y > min_y { max_y - 1 } else { max_y };
    let min_tile_x = min_x.div_euclid(tile_size_nm);
    let max_tile_x = last_x.div_euclid(tile_size_nm);
    let min_tile_y = min_y.div_euclid(tile_size_nm);
    let max_tile_y = last_y.div_euclid(tile_size_nm);
    let capacity = (max_tile_x - min_tile_x + 1)
        .saturating_mul(max_tile_y - min_tile_y + 1)
        .max(0) as usize;
    let mut tiles = Vec::with_capacity(capacity);
    for y in min_tile_y..=max_tile_y {
        for x in min_tile_x..=max_tile_x {
            tiles.push(TileId { x, y });
        }
    }
    let route = if tiles.len() == 1 && operation.polarity == MaterialPolarity::Add {
        LoweringRoute::Direct
    } else {
        LoweringRoute::GeometerBoolean
    };
    ClassifiedOperation {
        operation_index,
        tiles,
        route,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analytic_contract::{Affine2D, AnalyticPrimitive};

    fn operation(bounds_nm: [i64; 4], polarity: MaterialPolarity) -> Operation {
        Operation {
            source_order: 0,
            semantic_id: "track:one".to_owned(),
            kind: "track".to_owned(),
            source_uid: "one".to_owned(),
            net_index: None,
            layer_indexes: vec![0],
            transform: Affine2D::default(),
            bounds_nm,
            polarity,
            primitive: AnalyticPrimitive::Capsule {
                start_nm: [0, 0],
                end_nm: [1, 0],
                radius_nm: 1,
            },
            footprint_uid: None,
            component_ref: None,
            pad_number: None,
            island: false,
        }
    }

    #[test]
    fn exact_upper_boundary_does_not_allocate_an_empty_neighbor() {
        let classified = classify_operation(
            0,
            &operation(
                [0, 0, 20 * NM_PER_MM, 20 * NM_PER_MM],
                MaterialPolarity::Add,
            ),
            20 * NM_PER_MM,
        );
        assert_eq!(classified.tiles, vec![TileId { x: 0, y: 0 }]);
        assert_eq!(classified.route, LoweringRoute::Direct);
    }

    #[test]
    fn negative_and_multi_tile_bounds_use_euclidean_tiles() {
        let classified = classify_operation(
            7,
            &operation([-1, -1, 20 * NM_PER_MM + 1, 1], MaterialPolarity::Add),
            20 * NM_PER_MM,
        );
        assert_eq!(
            classified.tiles,
            vec![
                TileId { x: -1, y: -1 },
                TileId { x: 0, y: -1 },
                TileId { x: 1, y: -1 },
                TileId { x: -1, y: 0 },
                TileId { x: 0, y: 0 },
                TileId { x: 1, y: 0 },
            ]
        );
        assert_eq!(classified.route, LoweringRoute::GeometerBoolean);
    }

    #[test]
    fn subtractive_operations_always_use_geometer() {
        let classified = classify_operation(
            0,
            &operation([1, 1, 2, 2], MaterialPolarity::Subtract),
            20 * NM_PER_MM,
        );
        assert_eq!(classified.tiles.len(), 1);
        assert_eq!(classified.route, LoweringRoute::GeometerBoolean);
    }

    #[test]
    fn auto_tile_size_matches_the_existing_prism_policy() {
        assert_eq!(
            resolve_tile_size_mm(None, Some([0, 0, 19_000_000, 1])).unwrap(),
            20.0
        );
        assert_eq!(
            resolve_tile_size_mm(None, Some([0, 0, 21_000_000, 1])).unwrap(),
            40.0
        );
        assert_eq!(
            resolve_tile_size_mm(None, Some([0, 0, 200_000_000, 1])).unwrap(),
            160.0
        );
        assert_eq!(resolve_tile_size_mm(Some(12.5), None).unwrap(), 12.5);
        assert!(resolve_tile_size_mm(Some(0.0), None).is_err());
    }
}
