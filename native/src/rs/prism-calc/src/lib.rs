//! Closed-form PCB calculators.
//!
//! Each module implements one of the shared calculator specs:
//!
//! | Module | Spec |
//! |---|---|
//! | [`tline`] | 01, single-ended transmission-line impedance |
//! | [`coupled`] | 02, differential pairs and near-end crosstalk |
//! | [`current`] | 03, conductor current, DC resistance, skin depth |
//! | [`fusing`] | 04, fusing current |
//! | [`via`] | 05, via properties and differential vias |
//!
//! Conventions:
//! - Inputs and outputs are SI (metres, ohms, farads, henries, seconds, amperes, °C for temperatures).
//!   [`units`] has the mil/inch/ounce conversions.
//! - Physical constants are exact (CODATA); see [`constants`].
//! - Invalid geometry returns [`CalcError`]. Inputs outside an empirical fit's validated range still
//!   compute and attach a [`Warning`].
//!
//! The functions are pure and allocation-light so the crate can back the CLI, the simulation
//! workers and a WASM build alike.

pub mod constants;
pub mod coupled;
pub mod current;
mod elliptic;
mod error;
pub mod fusing;
pub mod tline;
pub mod units;
pub mod via;

pub use elliptic::{agm, elliptic_k_ratio};
pub use error::{CalcError, Warning};
