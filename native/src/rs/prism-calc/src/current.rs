//! Spec 03: conductor current vs temperature rise, DC resistance and skin depth.
//!
//! The IPC-2152 baseline fit and its modifiers are not implemented yet: their coefficients will be
//! taken from the primary publications (IPC-2152 charts; Brooks & Adam) before they land (spec 03 Q1/Q5).

use crate::Warning;
use crate::constants::{ALPHA_CU, MU0, RHO_CU_20C};
use crate::error::{CalcError, check_range, positive};
use crate::units::MIL;
use std::f64::consts::PI;

/// Trapezoidal etch model of the conductor cross-section (spec 03 C1).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Etch {
    /// Rectangular: A = W·T.
    None,
    /// 1:1 etch (top width W − 2T): A = (W − T)·T.
    OneToOne,
    /// 2:1 etch (top width W − T): A = (W − T/2)·T.
    TwoToOne,
}

/// Conductor cross-section. Lengths in metres.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CrossSection {
    /// Bottom width W.
    pub width: f64,
    /// Copper thickness T.
    pub thickness: f64,
    pub etch: Etch,
    /// Number of identical parallel conductors (1 for a single trace).
    pub count: u32,
}

impl CrossSection {
    /// Total copper area in m² (spec 03 C1).
    ///
    /// # Errors
    /// Non-positive dimensions or count, or an etch model that leaves no copper.
    pub fn area(&self) -> Result<f64, CalcError> {
        positive("width", self.width)?;
        positive("thickness", self.thickness)?;
        positive("count", f64::from(self.count))?;
        let (w, t) = (self.width, self.thickness);
        let single = match self.etch {
            Etch::None => w * t,
            Etch::OneToOne => (w - t) * t,
            Etch::TwoToOne => (w - t / 2.0) * t,
        };
        positive("etched area", single)?;
        Ok(single * f64::from(self.count))
    }
}

/// Layer position for the IPC-2221 curve.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Layer {
    External,
    Internal,
}

impl Layer {
    /// IPC-2221 curve-fit constant k (0.048 external, 0.024 internal).
    #[must_use]
    pub fn ipc2221_k(self) -> f64 {
        match self {
            Self::External => 0.048,
            Self::Internal => 0.024,
        }
    }
}

const IPC2221_DT_EXP: f64 = 0.44;
const IPC2221_AREA_EXP: f64 = 0.725;

fn ipc2221_warnings(area_mil2: f64, temperature_rise: f64) -> Vec<Warning> {
    let mut warnings = Vec::new();
    check_range(&mut warnings, "area (mil²)", area_mil2, 0.0, 700.0);
    check_range(
        &mut warnings,
        "temperature rise (°C)",
        temperature_rise,
        9.999,
        100.001,
    );
    warnings
}

/// IPC-2221 current for a temperature rise, spec 03 C2: I = k·ΔT^0.44·A^0.725 (A in mil²).
///
/// # Errors
/// Non-positive area or temperature rise.
pub fn ipc2221_current(
    area: f64,
    temperature_rise: f64,
    layer: Layer,
) -> Result<(f64, Vec<Warning>), CalcError> {
    positive("area", area)?;
    positive("temperature_rise", temperature_rise)?;
    let a = area / (MIL * MIL);
    let i = layer.ipc2221_k() * temperature_rise.powf(IPC2221_DT_EXP) * a.powf(IPC2221_AREA_EXP);
    Ok((i, ipc2221_warnings(a, temperature_rise)))
}

/// IPC-2221 area (m²) needed for a current at a temperature rise, spec 03 C3.
///
/// # Errors
/// Non-positive current or temperature rise.
pub fn ipc2221_area(
    current: f64,
    temperature_rise: f64,
    layer: Layer,
) -> Result<(f64, Vec<Warning>), CalcError> {
    positive("current", current)?;
    positive("temperature_rise", temperature_rise)?;
    let a = (current / (layer.ipc2221_k() * temperature_rise.powf(IPC2221_DT_EXP)))
        .powf(1.0 / IPC2221_AREA_EXP);
    Ok((a * MIL * MIL, ipc2221_warnings(a, temperature_rise)))
}

/// IPC-2221 temperature rise for a current, spec 03 C4.
///
/// # Errors
/// Non-positive current or area.
pub fn ipc2221_temperature_rise(
    current: f64,
    area: f64,
    layer: Layer,
) -> Result<(f64, Vec<Warning>), CalcError> {
    positive("current", current)?;
    positive("area", area)?;
    let a = area / (MIL * MIL);
    let dt = (current / (layer.ipc2221_k() * a.powf(IPC2221_AREA_EXP))).powf(1.0 / IPC2221_DT_EXP);
    Ok((dt, ipc2221_warnings(a, dt)))
}

/// Width (m) for a cross-section area, inverting [`CrossSection::area`] for one conductor.
///
/// # Errors
/// Non-positive area or thickness.
pub fn width_for_area(area: f64, thickness: f64, etch: Etch) -> Result<f64, CalcError> {
    positive("area", area)?;
    positive("thickness", thickness)?;
    let base = area / thickness;
    Ok(match etch {
        Etch::None => base,
        Etch::OneToOne => base + thickness,
        Etch::TwoToOne => base + thickness / 2.0,
    })
}

/// DC resistance with linear temperature correction, spec 03 C5: R = ρ₂₀(1 + α(T − 20))·L/A.
///
/// # Errors
/// Non-positive resistivity, length or area.
pub fn dc_resistance_with(
    resistivity_20c: f64,
    alpha: f64,
    length: f64,
    area: f64,
    temperature_c: f64,
) -> Result<f64, CalcError> {
    positive("resistivity_20c", resistivity_20c)?;
    positive("length", length)?;
    positive("area", area)?;
    Ok(resistivity_20c * (1.0 + alpha * (temperature_c - 20.0)) * length / area)
}

/// Copper DC resistance at `temperature_c` (ρ₂₀ = 1.72e-8 Ω·m, α = 0.00393), spec 03 C5.
///
/// # Errors
/// Non-positive length or area.
pub fn copper_dc_resistance(length: f64, area: f64, temperature_c: f64) -> Result<f64, CalcError> {
    dc_resistance_with(RHO_CU_20C, ALPHA_CU, length, area, temperature_c)
}

/// Skin depth δ = √(ρ / (π·f·µ₀·µr)), spec 03 C7.
///
/// # Errors
/// Non-positive frequency, resistivity or relative permeability.
pub fn skin_depth(frequency: f64, resistivity: f64, mu_r: f64) -> Result<f64, CalcError> {
    positive("frequency", frequency)?;
    positive("resistivity", resistivity)?;
    positive("mu_r", mu_r)?;
    Ok((resistivity / (PI * frequency * MU0 * mu_r)).sqrt())
}
