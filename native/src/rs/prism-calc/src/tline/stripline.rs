//! Symmetric, asymmetric and dual stripline (spec 01 §3.3–3.5).

use super::LineResult;
use crate::constants::ETA0;
use crate::error::{CalcError, check_range, non_negative, positive};
use std::f64::consts::PI;

/// Symmetric stripline. All lengths in metres.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Stripline {
    /// Trace width W.
    pub width: f64,
    /// Dielectric height H from the trace to each plane (plane spacing b = 2H + T).
    pub height: f64,
    /// Trace thickness T.
    pub thickness: f64,
    /// Relative permittivity εr.
    pub eps_r: f64,
}

/// Asymmetric (offset) stripline. All lengths in metres.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AsymmetricStripline {
    /// Trace width W.
    pub width: f64,
    /// Trace thickness T.
    pub thickness: f64,
    /// Dielectric height A from the trace to one plane.
    pub height_a: f64,
    /// Dielectric height B from the trace to the other plane.
    pub height_b: f64,
    /// Relative permittivity εr.
    pub eps_r: f64,
}

/// Dual stripline (two signal layers between two planes). All lengths in metres.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DualStripline {
    /// Trace width W.
    pub width: f64,
    /// Trace thickness T.
    pub thickness: f64,
    /// Dielectric height H from the trace to its near plane.
    pub height: f64,
    /// Separation H₂ to the other signal layer.
    pub separation: f64,
    /// Relative permittivity εr.
    pub eps_r: f64,
}

fn validate_common(width: f64, thickness: f64, eps_r: f64) -> Result<(), CalcError> {
    positive("width", width)?;
    non_negative("thickness", thickness)?;
    positive("eps_r", eps_r)?;
    Ok(())
}

/// IPC-2141A symmetric stripline, spec 01 E7.
///
/// # Errors
/// Non-positive geometry, or a log argument ≤ 1.
pub fn ipc2141_stripline(g: &Stripline) -> Result<LineResult, CalcError> {
    validate_common(g.width, g.thickness, g.eps_r)?;
    positive("height", g.height)?;
    let b = 2.0 * g.height + g.thickness;
    let arg = 1.9 * b / (0.8 * g.width + g.thickness);
    if arg <= 1.0 {
        return Err(CalcError::OutOfDomain {
            reason: "1.9·b must exceed 0.8·W + T",
        });
    }
    let mut warnings = Vec::new();
    check_range(
        &mut warnings,
        "W/(b-T)",
        g.width / (b - g.thickness),
        0.0,
        0.35,
    );
    check_range(&mut warnings, "T/b", g.thickness / b, -1.0, 0.25);
    let z0 = 60.0 / g.eps_r.sqrt() * arg.ln();
    Ok(LineResult::new(z0, g.eps_r, warnings))
}

/// Wheeler (1978) thick-strip stripline impedance in air for plane spacing `b`, spec 01 E8.
fn wheeler_z0_air(width: f64, thickness: f64, b: f64) -> f64 {
    let dw = if thickness > 0.0 {
        let m = 6.0 / (3.0 + 2.0 * thickness / (b - thickness));
        let x = (thickness / (2.0 * b - thickness)).powi(2)
            + (0.0796 * thickness / (width + 1.1 * thickness)).powf(m);
        thickness / PI * (1.0 - 0.5 * x.ln())
    } else {
        0.0
    };
    let w_eff = width + dw;
    let q = 4.0 * b / (PI * w_eff);
    let r = 2.0 * q; // 8b/(πW′)
    ETA0 / (4.0 * PI) * (1.0 + q * (r + (r * r + 6.27).sqrt())).ln()
}

/// Wheeler thick-strip symmetric stripline, spec 01 E8.
///
/// # Errors
/// Non-positive geometry.
pub fn wheeler_stripline(g: &Stripline) -> Result<LineResult, CalcError> {
    validate_common(g.width, g.thickness, g.eps_r)?;
    positive("height", g.height)?;
    let b = 2.0 * g.height + g.thickness;
    let z0 = wheeler_z0_air(g.width, g.thickness, b) / g.eps_r.sqrt();
    Ok(LineResult::new(z0, g.eps_r, Vec::new()))
}

/// IPC-2141A asymmetric stripline, spec 01 E9, with Wheeler's E8 for each half.
///
/// Each half is a symmetric stripline of plane spacing 2A + T (and 2B + T). The heights are
/// reordered internally so that A is the nearer plane.
///
/// # Errors
/// Non-positive geometry.
pub fn ipc2141_asymmetric_stripline(g: &AsymmetricStripline) -> Result<LineResult, CalcError> {
    validate_common(g.width, g.thickness, g.eps_r)?;
    positive("height_a", g.height_a)?;
    positive("height_b", g.height_b)?;
    let (a, b) = if g.height_a <= g.height_b {
        (g.height_a, g.height_b)
    } else {
        (g.height_b, g.height_a)
    };
    let (w, t) = (g.width, g.thickness);
    let za = wheeler_z0_air(w, t, 2.0 * a + t);
    let zb = wheeler_z0_air(w, t, 2.0 * b + t);
    let z_air = 2.0 * za * zb / (za + zb);
    let span = a + b + t;
    let dz_air = 0.0325
        * PI
        * z_air
        * z_air
        * (0.5 - 0.5 * (2.0 * a + t) / span).powf(2.2)
        * ((t + w) / span).powf(2.9);
    let z0 = (z_air - dz_air) / g.eps_r.sqrt();
    Ok(LineResult::new(z0, g.eps_r, Vec::new()))
}

/// IPC-2141A dual stripline, spec 01 E11.
///
/// # Errors
/// Non-positive geometry, or a log argument ≤ 1.
pub fn ipc2141_dual_stripline(g: &DualStripline) -> Result<LineResult, CalcError> {
    validate_common(g.width, g.thickness, g.eps_r)?;
    positive("height", g.height)?;
    positive("separation", g.separation)?;
    let arg = 1.9 * (2.0 * g.height + g.thickness) / (0.8 * g.width + g.thickness);
    if arg <= 1.0 {
        return Err(CalcError::OutOfDomain {
            reason: "1.9·(2H + T) must exceed 0.8·W + T",
        });
    }
    let z0 = 80.0 / g.eps_r.sqrt()
        * arg.ln()
        * (1.0 - g.height / (4.0 * (g.height + g.separation + g.thickness)));
    Ok(LineResult::new(z0, g.eps_r, Vec::new()))
}
