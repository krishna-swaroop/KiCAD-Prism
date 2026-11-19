//! Spec 01: single-ended transmission-line impedance.
//!
//! Every model returns a [`LineResult`] with Z₀, εeff and the derived per-unit-length
//! quantities (spec 01 E13).

mod cpw;
mod microstrip;
mod stripline;

pub use cpw::{CoplanarWaveguide, conductor_backed_cpw};
pub use microstrip::{
    EmbeddedMicrostrip, Microstrip, hammerstad_jensen, ipc2141_embedded_microstrip,
    ipc2141_microstrip, kirschning_jansen_eps_eff, microstrip_dispersive, z0_dispersion_simple,
};
pub use stripline::{
    AsymmetricStripline, DualStripline, Stripline, ipc2141_asymmetric_stripline,
    ipc2141_dual_stripline, ipc2141_stripline, wheeler_stripline,
};

use crate::Warning;
use crate::constants::C0;

/// Result of a single-ended line calculation.
#[derive(Debug, Clone, PartialEq)]
pub struct LineResult {
    /// Characteristic impedance, Ω.
    pub z0: f64,
    /// Effective relative permittivity.
    pub eps_eff: f64,
    /// Propagation delay per metre, s/m (√εeff / c₀).
    pub delay_per_m: f64,
    /// Capacitance per metre, F/m (delay / Z₀).
    pub capacitance_per_m: f64,
    /// Inductance per metre, H/m (Z₀ · delay).
    pub inductance_per_m: f64,
    /// Inputs outside the formula's validated range.
    pub warnings: Vec<Warning>,
}

impl LineResult {
    /// Build a result from Z₀ and εeff (spec 01 E13).
    #[must_use]
    pub fn new(z0: f64, eps_eff: f64, warnings: Vec<Warning>) -> Self {
        let delay_per_m = eps_eff.sqrt() / C0;
        Self {
            z0,
            eps_eff,
            delay_per_m,
            capacitance_per_m: delay_per_m / z0,
            inductance_per_m: z0 * delay_per_m,
            warnings,
        }
    }
}
