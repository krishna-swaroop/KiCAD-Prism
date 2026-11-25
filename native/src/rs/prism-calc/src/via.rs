//! Spec 05: via properties (Johnson & Graham lumped model) and the differential-via quick model.

use crate::constants::{ALPHA_CU, CU_THERMAL_CONDUCTIVITY, RHO_CU_20C};
use crate::error::{CalcError, positive};
use crate::units::INCH;
use std::f64::consts::PI;

/// Plated through-hole via. Lengths in metres.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Via {
    /// Finished hole diameter d.
    pub hole_diameter: f64,
    /// Barrel plating thickness.
    pub plating: f64,
    /// Internal pad diameter D₁.
    pub pad_diameter: f64,
    /// Reference-plane opening (antipad) diameter D₂ (> D₁).
    pub antipad_diameter: f64,
    /// Via length h.
    pub length: f64,
    /// Substrate relative permittivity εr.
    pub eps_r: f64,
}

/// Electrical and thermal estimates for a [`Via`].
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ViaProperties {
    /// Barrel cross-section, m² (spec 05 V1).
    pub barrel_area: f64,
    /// Capacitance, F (V2).
    pub capacitance: f64,
    /// Inductance, H (V3).
    pub inductance: f64,
    /// √(L/C), Ω (V4).
    pub impedance: f64,
    /// 1/(2π√(LC)), Hz (V4).
    pub resonant_frequency: f64,
}

impl ViaProperties {
    /// 10–90 % rise-time degradation of a line of impedance `line_z0` loaded by the via, s (V5).
    #[must_use]
    pub fn rise_time_degradation(&self, line_z0: f64) -> f64 {
        2.2 * self.capacitance * line_z0 / 2.0
    }
}

/// Johnson & Graham via model, spec 05 V1–V4.
///
/// # Errors
/// Non-positive dimensions, or an antipad not larger than the pad.
pub fn via_properties(v: &Via) -> Result<ViaProperties, CalcError> {
    positive("hole_diameter", v.hole_diameter)?;
    positive("plating", v.plating)?;
    positive("pad_diameter", v.pad_diameter)?;
    positive("antipad_diameter", v.antipad_diameter)?;
    positive("length", v.length)?;
    positive("eps_r", v.eps_r)?;
    if v.antipad_diameter <= v.pad_diameter {
        return Err(CalcError::OutOfDomain {
            reason: "antipad diameter must exceed the pad diameter",
        });
    }
    let barrel_area = PI * (v.hole_diameter + v.plating) * v.plating;
    let h_in = v.length / INCH;
    let capacitance =
        1.41e-12 * v.eps_r * h_in * v.pad_diameter / (v.antipad_diameter - v.pad_diameter);
    let inductance = 5.08e-9 * h_in * ((4.0 * v.length / v.hole_diameter).ln() + 1.0);
    Ok(ViaProperties {
        barrel_area,
        capacitance,
        inductance,
        impedance: (inductance / capacitance).sqrt(),
        resonant_frequency: 1.0 / (2.0 * PI * (inductance * capacitance).sqrt()),
    })
}

/// Copper barrel DC resistance at `temperature_c`, Ω (spec 05 V6).
///
/// # Errors
/// Non-positive length or area.
pub fn barrel_resistance(
    length: f64,
    barrel_area: f64,
    temperature_c: f64,
) -> Result<f64, CalcError> {
    positive("length", length)?;
    positive("barrel_area", barrel_area)?;
    Ok(RHO_CU_20C * (1.0 + ALPHA_CU * (temperature_c - 20.0)) * length / barrel_area)
}

/// Barrel thermal resistance h/(k·A), °C/W, with copper k = 401 W/(m·K) (spec 05 V7).
///
/// # Errors
/// Non-positive length or area.
pub fn barrel_thermal_resistance(length: f64, barrel_area: f64) -> Result<f64, CalcError> {
    positive("length", length)?;
    positive("barrel_area", barrel_area)?;
    Ok(length / (CU_THERMAL_CONDUCTIVITY * barrel_area))
}

/// Differential via pair geometry (all non-functional pads removed). Lengths in metres.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DiffViaPair {
    /// Drill diameter d.
    pub drill_diameter: f64,
    /// Centre-to-centre spacing s.
    pub spacing: f64,
    /// Antipad opening height.
    pub antipad_height: f64,
    /// Antipad opening width.
    pub antipad_width: f64,
    /// Substrate relative permittivity εr.
    pub eps_r: f64,
    /// Dielectric anisotropy in percent (in-plane vs through-thickness).
    pub anisotropy_pct: f64,
}

/// Quick-model results for a [`DiffViaPair`].
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DiffViaProperties {
    /// Averaged permittivity for anisotropy (V9).
    pub eps_avg: f64,
    /// Single-via impedance (V10), Ω.
    pub z_single: f64,
    /// Differential impedance 2·Z_single (V10), Ω.
    pub z_diff: f64,
    /// Effective permittivity (V11).
    pub eps_eff: f64,
}

impl DiffViaProperties {
    /// Maximum stub length (m) for a baud rate in bit/s: 0.84 in·Gbit/s / (√εeff·R) (V12, λ/14 at R).
    #[must_use]
    pub fn max_stub_length(&self, baud_rate: f64) -> f64 {
        0.84 * INCH / (self.eps_eff.sqrt() * baud_rate * 1e-9)
    }
}

/// Differential via quick model (Lamsim), spec 05 V9–V11.
///
/// # Errors
/// Non-positive dimensions, s ≤ d, or an antipad smaller than the drill.
pub fn diff_via_pair(p: &DiffViaPair) -> Result<DiffViaProperties, CalcError> {
    positive("drill_diameter", p.drill_diameter)?;
    positive("spacing", p.spacing)?;
    positive("antipad_height", p.antipad_height)?;
    positive("antipad_width", p.antipad_width)?;
    positive("eps_r", p.eps_r)?;
    if p.spacing <= p.drill_diameter || p.antipad_height + p.antipad_width <= 2.0 * p.drill_diameter
    {
        return Err(CalcError::OutOfDomain {
            reason: "spacing and antipad must exceed the drill diameter",
        });
    }
    let eps_avg = ((1.0 + p.anisotropy_pct / 100.0) * p.eps_r + p.eps_r) / 2.0;
    let g_coax = ((p.antipad_height + p.antipad_width) / (2.0 * p.drill_diameter)).ln();
    let g_pair = (p.spacing / p.drill_diameter).acosh();
    let z_single = 60.0 / eps_avg.sqrt() * (g_coax * g_pair).sqrt();
    Ok(DiffViaProperties {
        eps_avg,
        z_single,
        z_diff: 2.0 * z_single,
        eps_eff: eps_avg * g_pair / g_coax,
    })
}
