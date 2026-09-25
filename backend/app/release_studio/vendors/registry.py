"""Vendor profile registry.

A profile is a named generator plus the dossier/evidence/pack layout it owns.
The HTTP surface and the inspect/sign UI list whatever is registered here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Mapping, Protocol, Sequence

from app.release_studio.steps import StepSpec

DEFAULT_VENDORS: tuple[str, ...] = ("jlcpcb",)
KNOWN_VENDOR_IDS: frozenset[str] = frozenset(DEFAULT_VENDORS)

CruncherRunner = Callable[..., Any]


class VendorProfile(Protocol):
    """One fab house's generator and pack layout."""

    id: str
    title: str
    pack_filename: str
    description: str
    required_pack_artifacts: tuple[str, ...]

    def generate(
        self,
        *,
        cruncher_path: str,
        design_file: Path,
        output_root: Path,
        variant: str = "",
        runner: CruncherRunner | None = None,
        timeout_seconds: int = 900,
    ) -> VendorArtifacts: ...


@dataclass(frozen=True, slots=True)
class VendorArtifacts:
    """Files one vendor generator produced, split by fingerprintability."""

    canonical_files: Mapping[str, Path]
    evidence_files: Mapping[str, Path] = field(default_factory=dict)
    stdout: str = ""
    stderr: str = ""
    elapsed_ms: int = 0
    returncode: int = 0
    normalized_argv: tuple[str, ...] = ()


def vendor_step_spec(vendor_id: str) -> StepSpec:
    """Member-producing spec for one vendor's canonical files."""

    return StepSpec(
        step_id=f"vendor-{vendor_id}",
        step_type="prism_vendor_pack",
        argv=(),
        source="board",
        output_kind="dir",
        output_name=f"manufacturing/vendors/{vendor_id}",
        member_kind="vendor_csv",
        canonicalizer="csv",
        domains=("assembly",),
        optional=True,
        variant_flag=True,
    )


def registered_profiles() -> tuple[VendorProfile, ...]:
    from .jlcpcb import JLCPCB_PROFILE

    return (JLCPCB_PROFILE,)


def known_vendor_ids() -> frozenset[str]:
    return KNOWN_VENDOR_IDS | frozenset(profile.id for profile in registered_profiles())


def profile_by_id(vendor_id: str) -> VendorProfile:
    for profile in registered_profiles():
        if profile.id == vendor_id:
            return profile
    raise KeyError(vendor_id)


def resolve_vendor_ids(config: Mapping[str, Any] | None) -> tuple[str, ...]:
    """Return the vendor ids a configuration asked for, defaulting to JLCPCB."""

    if not config:
        return DEFAULT_VENDORS
    raw = config.get("vendors")
    if raw is None:
        return DEFAULT_VENDORS
    return tuple(str(item) for item in raw)


def public_profile_payload() -> list[dict[str, Any]]:
    """JSON the UI uses to render the manufacturer picker."""

    return [
        {
            "id": profile.id,
            "title": profile.title,
            "pack_filename": profile.pack_filename,
            "description": profile.description,
            "required_pack_artifacts": list(profile.required_pack_artifacts),
        }
        for profile in registered_profiles()
    ]


__all__ = [
    "DEFAULT_VENDORS",
    "VendorArtifacts",
    "VendorProfile",
    "known_vendor_ids",
    "profile_by_id",
    "public_profile_payload",
    "registered_profiles",
    "resolve_vendor_ids",
    "vendor_step_spec",
]
