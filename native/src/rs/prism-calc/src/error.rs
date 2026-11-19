//! Errors for invalid input and warnings for inputs outside a fit's validated range.

use std::fmt;

/// Input that the formula cannot evaluate.
#[derive(Debug, Clone, PartialEq)]
pub enum CalcError {
    /// A quantity that must be finite and strictly positive was not.
    NotPositive { name: &'static str, value: f64 },
    /// The inputs are individually valid but jointly outside the formula's domain.
    OutOfDomain { reason: &'static str },
}

impl fmt::Display for CalcError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotPositive { name, value } => {
                write!(f, "{name} must be finite and > 0 (got {value})")
            }
            Self::OutOfDomain { reason } => write!(f, "outside the formula's domain: {reason}"),
        }
    }
}

impl std::error::Error for CalcError {}

/// A computed result whose input lies outside the range the formula was fitted or validated for.
#[derive(Debug, Clone, PartialEq)]
pub struct Warning {
    pub parameter: &'static str,
    pub value: f64,
    pub min: f64,
    pub max: f64,
}

impl fmt::Display for Warning {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{} = {} is outside the validated range {}..{}",
            self.parameter, self.value, self.min, self.max
        )
    }
}

/// Require a finite, strictly positive value.
pub(crate) fn positive(name: &'static str, value: f64) -> Result<f64, CalcError> {
    if value.is_finite() && value > 0.0 {
        Ok(value)
    } else {
        Err(CalcError::NotPositive { name, value })
    }
}

/// Require a finite, non-negative value (for example a thickness that may be zero).
pub(crate) fn non_negative(name: &'static str, value: f64) -> Result<f64, CalcError> {
    if value.is_finite() && value >= 0.0 {
        Ok(value)
    } else {
        Err(CalcError::NotPositive { name, value })
    }
}

/// Append a warning when `value` is outside the open interval `(min, max)`.
pub(crate) fn check_range(
    warnings: &mut Vec<Warning>,
    parameter: &'static str,
    value: f64,
    min: f64,
    max: f64,
) {
    if !(value > min && value < max) {
        warnings.push(Warning {
            parameter,
            value,
            min,
            max,
        });
    }
}
