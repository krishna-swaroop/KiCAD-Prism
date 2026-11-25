//! Conductor-backed coplanar waveguide (spec 01 §3.6).

use super::LineResult;
use crate::elliptic::elliptic_k_ratio;
use crate::error::{CalcError, positive};
use std::f64::consts::PI;

/// Conductor-backed CPW geometry (zero-thickness conductors). All lengths in metres.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CoplanarWaveguide {
    /// Centre strip width a.
    pub strip_width: f64,
    /// Gap from the strip edge to each coplanar ground.
    pub gap: f64,
    /// Substrate height h to the backside ground.
    pub height: f64,
    /// Relative permittivity εr.
    pub eps_r: f64,
}

/// Conductor-backed CPW by conformal mapping (Ghione & Naldi), spec 01 E12.
///
/// # Errors
/// Non-positive geometry.
pub fn conductor_backed_cpw(g: &CoplanarWaveguide) -> Result<LineResult, CalcError> {
    positive("strip_width", g.strip_width)?;
    positive("gap", g.gap)?;
    positive("height", g.height)?;
    positive("eps_r", g.eps_r)?;
    let a = g.strip_width;
    let b = a + 2.0 * g.gap;
    let k = a / b;
    let k1 = (PI * a / (4.0 * g.height)).tanh() / (PI * b / (4.0 * g.height)).tanh();
    let r = elliptic_k_ratio(k); // K(k)/K(k')
    let r1 = elliptic_k_ratio(k1); // K(k1)/K(k1')
    let q = r1 / r;
    let eps_eff = (1.0 + g.eps_r * q) / (1.0 + q);
    let z0 = 60.0 * PI / eps_eff.sqrt() / (r + r1);
    Ok(LineResult::new(z0, eps_eff, Vec::new()))
}
