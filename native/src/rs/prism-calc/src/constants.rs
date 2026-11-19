//! Physical and material constants (SI).

/// Speed of light in vacuum, m/s (exact).
pub const C0: f64 = 299_792_458.0;
/// Vacuum permeability, H/m (CODATA 2018).
pub const MU0: f64 = 1.256_637_062_12e-6;
/// Vacuum permittivity, F/m (CODATA 2018).
pub const EPS0: f64 = 8.854_187_812_8e-12;
/// Free-space impedance, ohm (CODATA 2018). Some calculators use the approximation 120π = 376.99.
pub const ETA0: f64 = 376.730_313_668;

/// Copper resistivity at 20 °C, Ω·m, as used by the IPC current charts (annealed copper is 1.7241e-8).
pub const RHO_CU_20C: f64 = 1.72e-8;
/// Copper temperature coefficient of resistance near 20 °C, 1/°C.
pub const ALPHA_CU: f64 = 0.00393;
/// Copper melting point, °C (ITS-90 fixed point).
pub const CU_MELT_C: f64 = 1084.62;
/// Copper density, kg/m³.
pub const CU_DENSITY: f64 = 8940.0;
/// Copper specific heat, J/(kg·K).
pub const CU_SPECIFIC_HEAT: f64 = 385.0;
/// Copper latent heat of fusion, J/kg.
pub const CU_LATENT_HEAT: f64 = 208.7e3;
/// Copper thermal conductivity, W/(m·K).
pub const CU_THERMAL_CONDUCTIVITY: f64 = 401.0;
