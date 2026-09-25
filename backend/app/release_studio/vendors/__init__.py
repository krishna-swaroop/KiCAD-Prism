"""Manufacturer (fab-house) vendor packs for Release Studio.

The signed dossier stays manufacturer-agnostic. Each registered profile can
emit attested CSV under ``manufacturing/vendors/{id}/`` and a derived upload
zip that a fab house actually accepts. JLCPCB is the first profile; adding
another house is a new module plus a registry entry.
"""

from __future__ import annotations

from .generate import generate_vendor_outputs
from .pack import VendorPackError, build_vendor_pack, vendor_pack_readiness
from .registry import (
    DEFAULT_VENDORS,
    VendorArtifacts,
    VendorProfile,
    known_vendor_ids,
    profile_by_id,
    registered_profiles,
    resolve_vendor_ids,
    vendor_step_spec,
    public_profile_payload,
)

__all__ = [
    "DEFAULT_VENDORS",
    "VendorArtifacts",
    "VendorPackError",
    "VendorProfile",
    "build_vendor_pack",
    "vendor_pack_readiness",
    "generate_vendor_outputs",
    "known_vendor_ids",
    "profile_by_id",
    "public_profile_payload",
    "registered_profiles",
    "resolve_vendor_ids",
    "vendor_step_spec",
]
