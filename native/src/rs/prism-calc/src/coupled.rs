//! Spec 02: differential pairs and near-end crosstalk.
//!
//! The Zdiff forms here are empirical coupling fits for quick estimates. For tight coupling, or
//! outside 0.1 < W/H < 3 and 0.1 < S/H < 3, use a coupled-line model or a field solver.

use crate::Warning;
use crate::constants::C0;
use crate::error::{CalcError, check_range, non_negative, positive};
use std::f64::consts::PI;

/// Edge-coupled stripline coupling coefficient k in D7 as commonly cited (AN-905).
///
/// Some calculators use 0.374. The primary source is still to be checked (spec 02 Q2).
pub const STRIPLINE_COUPLING_K: f64 = 0.347;

/// Hammerstad/Schneider microstrip εeff, spec 02 D2.
///
/// εeff = (εr+1)/2 + (εr−1)/2·[(1 + 12H/W)^−½ + 0.04·(1 − W/H)²], the last term only for W/H < 1.
///
/// # Errors
/// Non-positive inputs.
pub fn microstrip_eps_eff_schneider(width: f64, height: f64, eps_r: f64) -> Result<f64, CalcError> {
    positive("width", width)?;
    positive("height", height)?;
    positive("eps_r", eps_r)?;
    let u = width / height;
    let narrow = if u < 1.0 {
        0.04 * (1.0 - u).powi(2)
    } else {
        0.0
    };
    Ok((eps_r + 1.0) / 2.0 + (eps_r - 1.0) / 2.0 * ((1.0 + 12.0 / u).powf(-0.5) + narrow))
}

/// Edge-coupled microstrip (surface or embedded), spec 02 D6: Zdiff = 2Z₀(1 − 0.48·e^(−0.96·S/H)).
///
/// # Errors
/// Non-positive inputs.
pub fn edge_coupled_microstrip_zdiff(
    z0: f64,
    spacing: f64,
    height: f64,
) -> Result<(f64, Vec<Warning>), CalcError> {
    positive("z0", z0)?;
    positive("spacing", spacing)?;
    positive("height", height)?;
    let mut warnings = Vec::new();
    check_range(&mut warnings, "S/H", spacing / height, 0.1, 3.0);
    Ok((
        2.0 * z0 * (1.0 - 0.48 * (-0.96 * spacing / height).exp()),
        warnings,
    ))
}

/// Single-line stripline Z₀ used with the coupled form, spec 02 D4 (plane spacing `b`).
///
/// # Errors
/// Non-positive inputs, or a log argument ≤ 1.
pub fn stripline_z0_for_coupling(
    width: f64,
    plane_spacing: f64,
    thickness: f64,
    eps_r: f64,
) -> Result<f64, CalcError> {
    positive("width", width)?;
    positive("plane_spacing", plane_spacing)?;
    non_negative("thickness", thickness)?;
    positive("eps_r", eps_r)?;
    let arg = 4.0 * plane_spacing / (0.67 * PI * (0.8 * width + thickness));
    if arg <= 1.0 {
        return Err(CalcError::OutOfDomain {
            reason: "4b must exceed 0.67π(0.8W + T)",
        });
    }
    Ok(60.0 / eps_r.sqrt() * arg.ln())
}

/// Edge-coupled stripline, spec 02 D7: Zdiff = 2Z₀(1 − k·e^(−2.9·S/b)). Pass [`STRIPLINE_COUPLING_K`].
///
/// # Errors
/// Non-positive inputs.
pub fn edge_coupled_stripline_zdiff(
    z0: f64,
    spacing: f64,
    plane_spacing: f64,
    k: f64,
) -> Result<f64, CalcError> {
    positive("z0", z0)?;
    positive("spacing", spacing)?;
    positive("plane_spacing", plane_spacing)?;
    positive("k", k)?;
    Ok(2.0 * z0 * (1.0 - k * (-2.9 * spacing / plane_spacing).exp()))
}

/// Odd- and even-mode impedances.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Modes {
    pub z_odd: f64,
    pub z_even: f64,
}

/// Approximate modes from Z₀ and Zdiff, spec 02 D9: Zodd = Zdiff/2, Zeven = Z₀²/Zodd.
///
/// # Errors
/// Non-positive inputs.
pub fn modes_from_zdiff(z0: f64, zdiff: f64) -> Result<Modes, CalcError> {
    positive("z0", z0)?;
    positive("zdiff", zdiff)?;
    let z_odd = zdiff / 2.0;
    Ok(Modes {
        z_odd,
        z_even: z0 * z0 / z_odd,
    })
}

/// Backward (near-end) coupling coefficients.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BackwardCoupling {
    /// Kb for a pair terminated in Z₀ (spec 02 D11).
    pub terminated: f64,
    /// Kb′ for an unterminated pair (spec 02 D10).
    pub unterminated: f64,
}

impl BackwardCoupling {
    /// The terminated coefficient in dB (20·log10).
    #[must_use]
    pub fn terminated_db(&self) -> f64 {
        20.0 * self.terminated.log10()
    }

    /// The unterminated coefficient in dB (20·log10).
    #[must_use]
    pub fn unterminated_db(&self) -> f64 {
        20.0 * self.unterminated.log10()
    }
}

/// Backward coupling coefficients from the modes, spec 02 D10–D11.
///
/// # Errors
/// Non-positive inputs.
pub fn backward_coupling(modes: Modes, z0: f64) -> Result<BackwardCoupling, CalcError> {
    positive("z0", z0)?;
    let Modes { z_odd, z_even } = modes;
    positive("z_odd", z_odd)?;
    positive("z_even", z_even)?;
    let diff = z_even - z_odd;
    Ok(BackwardCoupling {
        terminated: diff / (z_even + z_odd + 2.0 * z_even * z_odd / z0),
        unterminated: diff / (z_even + z_odd),
    })
}

/// Near-end crosstalk result.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct NearEndCrosstalk {
    /// Saturation length v·tr/2, m.
    pub saturation_length: f64,
    /// NEXT voltage, V.
    pub voltage: f64,
}

/// Near-end crosstalk, spec 02 D13–D14: Lsat = (c₀/√εeff)·tr/2, V_NEXT = V·K·min(1, ℓ/Lsat).
///
/// # Errors
/// Non-positive rise time or εeff, or a negative length.
pub fn near_end_crosstalk(
    coupling: f64,
    aggressor_voltage: f64,
    coupled_length: f64,
    rise_time: f64,
    eps_eff: f64,
) -> Result<NearEndCrosstalk, CalcError> {
    non_negative("coupled_length", coupled_length)?;
    positive("rise_time", rise_time)?;
    positive("eps_eff", eps_eff)?;
    let saturation_length = C0 / eps_eff.sqrt() * rise_time / 2.0;
    let fraction = (coupled_length / saturation_length).min(1.0);
    Ok(NearEndCrosstalk {
        saturation_length,
        voltage: aggressor_voltage * coupling * fraction,
    })
}
