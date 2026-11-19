//! Unit conversions to and from SI.

/// One mil (thou) in metres.
pub const MIL: f64 = 25.4e-6;
/// One inch in metres.
pub const INCH: f64 = 0.0254;
/// One millimetre in metres.
pub const MM: f64 = 1e-3;
/// Copper thickness of 1 oz/ft² in metres (1.378 mil).
pub const OZ_CU: f64 = 1.378 * MIL;
/// One circular mil in square metres (area of a 1 mil diameter circle).
pub const CIRCULAR_MIL: f64 = std::f64::consts::PI / 4.0 * MIL * MIL;

/// Convert mils to metres.
#[must_use]
pub fn mil(value: f64) -> f64 {
    value * MIL
}

/// Convert metres to mils.
#[must_use]
pub fn to_mil(metres: f64) -> f64 {
    metres / MIL
}

/// Convert millimetres to metres.
#[must_use]
pub fn mm(value: f64) -> f64 {
    value * MM
}

/// Convert copper weight in oz/ft² to thickness in metres.
#[must_use]
pub fn oz(value: f64) -> f64 {
    value * OZ_CU
}
