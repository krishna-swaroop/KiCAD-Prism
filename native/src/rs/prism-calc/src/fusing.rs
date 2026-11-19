//! Spec 04: fusing current (adiabatic estimates).
//!
//! Both methods ignore heat loss into the laminate, so they are conservative for t ≳ 1 s.

use crate::constants::{
    ALPHA_CU, CU_DENSITY, CU_LATENT_HEAT, CU_MELT_C, CU_SPECIFIC_HEAT, RHO_CU_20C,
};
use crate::error::{CalcError, positive};
use crate::units::CIRCULAR_MIL;

/// Onderdonk's equation, spec 04 F1:
/// I = A_cmil·√(log10((Tm − Ta)/(234 + Ta) + 1)/(33·t))·m.
///
/// `area` in m², `time` in s, temperatures in °C; `multiplier` is the empirical PCB correction (1 for bare wire).
///
/// # Errors
/// Non-positive area, time or multiplier, or Ta ≥ Tm.
pub fn onderdonk(
    area: f64,
    time: f64,
    ambient_c: f64,
    melt_c: f64,
    multiplier: f64,
) -> Result<f64, CalcError> {
    positive("area", area)?;
    positive("time", time)?;
    positive("multiplier", multiplier)?;
    if ambient_c >= melt_c {
        return Err(CalcError::OutOfDomain {
            reason: "ambient temperature must be below the melting point",
        });
    }
    let cmil = area / CIRCULAR_MIL;
    let term = ((melt_c - ambient_c) / (234.0 + ambient_c) + 1.0).log10() / (33.0 * time);
    Ok(cmil * term.sqrt() * multiplier)
}

/// Onderdonk for copper melting at 1084.62 °C with no multiplier.
///
/// # Errors
/// As [`onderdonk`].
pub fn onderdonk_copper(area: f64, time: f64, ambient_c: f64) -> Result<f64, CalcError> {
    onderdonk(area, time, ambient_c, CU_MELT_C, 1.0)
}

/// Adiabatic energy balance for copper, spec 04 F2:
/// I = A·√(ρ_d(c(Tm − Ta) + L_f)/(ρ̄_e·t)), with ρ̄_e the resistivity at the mean of Ta and Tm.
///
/// # Errors
/// Non-positive area or time, or Ta ≥ Tm.
pub fn adiabatic_copper(area: f64, time: f64, ambient_c: f64) -> Result<f64, CalcError> {
    positive("area", area)?;
    positive("time", time)?;
    if ambient_c >= CU_MELT_C {
        return Err(CalcError::OutOfDomain {
            reason: "ambient temperature must be below the melting point",
        });
    }
    let rho_mean = RHO_CU_20C * (1.0 + ALPHA_CU * ((ambient_c + CU_MELT_C) / 2.0 - 20.0));
    let energy_per_volume =
        CU_DENSITY * (CU_SPECIFIC_HEAT * (CU_MELT_C - ambient_c) + CU_LATENT_HEAT);
    Ok(area * (energy_per_volume / (rho_mean * time)).sqrt())
}
