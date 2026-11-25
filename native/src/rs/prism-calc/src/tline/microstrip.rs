//! Surface and embedded microstrip (spec 01 §3.1–3.2).

use super::LineResult;
use crate::constants::ETA0;
use crate::error::{CalcError, check_range, non_negative, positive};
use std::f64::consts::{E, PI};

/// Surface microstrip geometry. All lengths in metres.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Microstrip {
    /// Trace width W.
    pub width: f64,
    /// Dielectric height H from the trace bottom to the reference plane.
    pub height: f64,
    /// Trace thickness T (base copper plus plating).
    pub thickness: f64,
    /// Substrate relative permittivity εr.
    pub eps_r: f64,
}

impl Microstrip {
    fn validate(&self) -> Result<(), CalcError> {
        positive("width", self.width)?;
        positive("height", self.height)?;
        non_negative("thickness", self.thickness)?;
        positive("eps_r", self.eps_r)?;
        Ok(())
    }
}

/// Embedded (buried) microstrip geometry. All lengths in metres.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct EmbeddedMicrostrip {
    /// Trace width W.
    pub width: f64,
    /// Trace height H above the reference plane.
    pub height: f64,
    /// Trace thickness T.
    pub thickness: f64,
    /// Total dielectric thickness H₁ above the plane (must be ≥ H + T).
    pub dielectric_height: f64,
    /// Substrate relative permittivity εr.
    pub eps_r: f64,
}

/// IPC-2141A surface microstrip, spec 01 E1.
///
/// εeff uses IPC-2141's 0.475·εr + 0.67 approximation (the basis of its 1.017·√(…) ns/ft delay).
///
/// # Errors
/// Non-positive geometry, or 5.98·H ≤ 0.8·W + T (the log argument must exceed 1).
pub fn ipc2141_microstrip(g: &Microstrip) -> Result<LineResult, CalcError> {
    g.validate()?;
    let arg = 5.98 * g.height / (0.8 * g.width + g.thickness);
    if arg <= 1.0 {
        return Err(CalcError::OutOfDomain {
            reason: "5.98·H must exceed 0.8·W + T",
        });
    }
    let mut warnings = Vec::new();
    check_range(&mut warnings, "W/H", g.width / g.height, 0.1, 3.0);
    check_range(&mut warnings, "eps_r", g.eps_r, 1.0, 15.0);
    let z0 = 87.0 / (g.eps_r + 1.41).sqrt() * arg.ln();
    Ok(LineResult::new(z0, 0.475 * g.eps_r + 0.67, warnings))
}

/// IPC-2141A embedded microstrip, spec 01 E6 (K = 60).
///
/// # Errors
/// Non-positive geometry, H₁ < H + T, or a log argument ≤ 1.
pub fn ipc2141_embedded_microstrip(g: &EmbeddedMicrostrip) -> Result<LineResult, CalcError> {
    positive("width", g.width)?;
    positive("height", g.height)?;
    non_negative("thickness", g.thickness)?;
    positive("dielectric_height", g.dielectric_height)?;
    positive("eps_r", g.eps_r)?;
    if g.dielectric_height < g.height + g.thickness {
        return Err(CalcError::OutOfDomain {
            reason: "dielectric height H1 must be at least H + T",
        });
    }
    let arg = 5.98 * g.height / (0.8 * g.width + g.thickness);
    if arg <= 1.0 {
        return Err(CalcError::OutOfDomain {
            reason: "5.98·H must exceed 0.8·W + T",
        });
    }
    let mut warnings = Vec::new();
    check_range(&mut warnings, "W/H", g.width / g.height, 0.1, 3.0);
    check_range(&mut warnings, "eps_r", g.eps_r, 1.0, 15.0);
    let eps_buried = g.eps_r * (1.0 - (-1.55 * g.dielectric_height / g.height).exp());
    let z0 = 60.0 / eps_buried.sqrt() * arg.ln();
    Ok(LineResult::new(z0, eps_buried, warnings))
}

/// Hammerstad–Jensen Z₀₁(u) of a zero-thickness strip in air (spec 01 E2).
fn z01(u: f64) -> f64 {
    let f = 6.0 + (2.0 * PI - 6.0) * (-(30.666 / u).powf(0.7528)).exp();
    ETA0 / (2.0 * PI) * (f / u + (1.0 + 4.0 / (u * u)).sqrt()).ln()
}

/// Hammerstad–Jensen static εeff(u) of a zero-thickness strip (spec 01 E2).
fn eps_eff_static(u: f64, eps_r: f64) -> f64 {
    let u4 = u.powi(4);
    let a = 1.0
        + ((u4 + (u / 52.0).powi(2)) / (u4 + 0.432)).ln() / 49.0
        + (1.0 + (u / 18.1).powi(3)).ln() / 18.7;
    let b = 0.564 * ((eps_r - 0.9) / (eps_r + 3.0)).powf(0.053);
    (eps_r + 1.0) / 2.0 + (eps_r - 1.0) / 2.0 * (1.0 + 10.0 / u).powf(-a * b)
}

/// Hammerstad–Jensen static microstrip with the thickness correction, spec 01 E2 + E3.
///
/// # Errors
/// Non-positive geometry.
pub fn hammerstad_jensen(g: &Microstrip) -> Result<LineResult, CalcError> {
    g.validate()?;
    let u = g.width / g.height;
    let t = g.thickness / g.height;
    let (u1, ur) = if t > 0.0 {
        let tanh2 = (6.517 * u).sqrt().tanh().powi(2);
        let du1 = t / PI * (1.0 + 4.0 * E * tanh2 / t).ln();
        let dur = 0.5 * (1.0 + 1.0 / (g.eps_r - 1.0).max(0.0).sqrt().cosh()) * du1;
        (u + du1, u + dur)
    } else {
        (u, u)
    };
    let mut warnings = Vec::new();
    check_range(&mut warnings, "W/H", u, 0.01, 100.0);
    check_range(&mut warnings, "eps_r", g.eps_r, 1.0, 128.0);
    let e = eps_eff_static(ur, g.eps_r);
    let z0 = z01(ur) / e.sqrt();
    let eps_eff = e * (z01(u1) / z01(ur)).powi(2);
    Ok(LineResult::new(z0, eps_eff, warnings))
}

/// Kirschning–Jansen εeff(f) dispersion, spec 01 E4.
///
/// `u` = W/H, `eps_eff_static` from [`hammerstad_jensen`], `frequency` in Hz, `height` in metres.
#[must_use]
pub fn kirschning_jansen_eps_eff(
    u: f64,
    eps_r: f64,
    eps_eff_static: f64,
    frequency: f64,
    height: f64,
) -> f64 {
    let fn_ghz_mm = frequency * 1e-9 * height * 1e3;
    let p1 = 0.27488 + (0.6315 + 0.525 / (1.0 + 0.0157 * fn_ghz_mm).powi(20)) * u
        - 0.065683 * (-8.7513 * u).exp();
    let p2 = 0.33622 * (1.0 - (-0.03442 * eps_r).exp());
    let p3 = 0.0363 * (-4.6 * u).exp() * (1.0 - (-(fn_ghz_mm / 38.7).powf(4.97)).exp());
    let p4 = 1.0 + 2.751 * (1.0 - (-(eps_r / 15.916).powi(8)).exp());
    let p = p1 * p2 * ((0.1844 + p3 * p4) * fn_ghz_mm).powf(1.5763);
    eps_r - (eps_r - eps_eff_static) / (1.0 + p)
}

/// Simple Z₀ dispersion Z₀(f) = Z₀(0)·√(εe0/εe(f))·(εe(f) − 1)/(εe0 − 1), spec 01 E5.
#[must_use]
pub fn z0_dispersion_simple(z0_static: f64, eps_eff_static: f64, eps_eff_f: f64) -> f64 {
    if (eps_eff_static - 1.0).abs() < 1e-12 {
        return z0_static;
    }
    z0_static * (eps_eff_static / eps_eff_f).sqrt() * (eps_eff_f - 1.0) / (eps_eff_static - 1.0)
}

/// Dispersive microstrip at `frequency` (Hz): spec 01 E2 + E3 + E4 + E5.
///
/// # Errors
/// Non-positive geometry or a negative frequency.
pub fn microstrip_dispersive(g: &Microstrip, frequency: f64) -> Result<LineResult, CalcError> {
    non_negative("frequency", frequency)?;
    let static_result = hammerstad_jensen(g)?;
    let u = g.width / g.height;
    let eps_f = kirschning_jansen_eps_eff(u, g.eps_r, static_result.eps_eff, frequency, g.height);
    let mut warnings = static_result.warnings;
    check_range(
        &mut warnings,
        "f·H (GHz·mm)",
        frequency * 1e-9 * g.height * 1e3,
        -1.0,
        25.0,
    );
    let z0 = z0_dispersion_simple(static_result.z0, static_result.eps_eff, eps_f);
    Ok(LineResult::new(z0, eps_f, warnings))
}
