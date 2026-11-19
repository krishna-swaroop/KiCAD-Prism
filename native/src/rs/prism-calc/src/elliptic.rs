//! Complete elliptic integral ratios via the arithmetic-geometric mean.

/// Arithmetic-geometric mean of `a` and `b` (both > 0).
#[must_use]
pub fn agm(mut a: f64, mut b: f64) -> f64 {
    for _ in 0..64 {
        let next_a = 0.5 * (a + b);
        let next_b = (a * b).sqrt();
        if (next_a - next_b).abs() <= 1e-15 * next_a {
            return next_a;
        }
        a = next_a;
        b = next_b;
    }
    0.5 * (a + b)
}

/// K(k)/K(k′) for modulus `0 < k < 1`, where k′ = √(1 − k²).
///
/// Uses K(k) = π / (2·AGM(1, k′)), so the ratio is AGM(1, k) / AGM(1, k′).
#[must_use]
pub fn elliptic_k_ratio(k: f64) -> f64 {
    let kp = (1.0 - k * k).sqrt();
    agm(1.0, k) / agm(1.0, kp)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ratio_is_one_at_the_symmetric_modulus() {
        let k = std::f64::consts::FRAC_1_SQRT_2;
        assert!((elliptic_k_ratio(k) - 1.0).abs() < 1e-14);
    }

    #[test]
    fn ratio_matches_reference_value() {
        // K(0.5) = 1.685750354812596, K(sqrt(0.75)) = 2.156515647499643
        assert!(
            (elliptic_k_ratio(0.5) - 1.685_750_354_812_596 / 2.156_515_647_499_643).abs() < 1e-13
        );
    }
}
