"""Typed errors for Release Studio configuration loading."""

from __future__ import annotations


class ConfigError(ValueError):
    """Base class for configuration errors."""


class ConfigSchemaError(ConfigError):
    """YAML failed schema validation."""


class ConfigLoadError(ConfigError):
    """Configuration or policy could not be loaded."""


class SubstitutionError(ConfigError):
    """Strict field substitution failed."""
