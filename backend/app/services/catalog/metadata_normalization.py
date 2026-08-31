"""Pure catalog metadata normalization and search primitives."""

from __future__ import annotations

import re
from typing import Any, Iterable


IDENTITY_KIND_MPN = "mpn"
IDENTITY_KIND_PROVISIONAL_IPN = "provisional_ipn"
MPN_SOURCE_MANUFACTURER = "manufacturer"
MPN_SOURCE_PROVISIONAL_IPN = "provisional_ipn"


def dedupe(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            ordered.append(value)
    return ordered


def normalize_identity_value(value: Any) -> str:
    """Canonical catalog identity normalization: trim and lowercase only."""
    return str(value or "").strip().lower()


def metadata_search_document(payload: dict[str, Any]) -> str:
    fixed = " ".join(
        str(payload.get(key) or "")
        for key in (
            "name",
            "value",
            "description",
            "manufacturer",
            "mpn",
            "package_name",
            "category",
            "vendor",
            "vendor_part_number",
            "sap_code",
        )
    ).strip()
    extra_fields = payload.get("extra_fields") or {}
    extra = " ".join(f"{key} {value}" for key, value in dict(extra_fields).items())
    return f"{fixed} {extra}".strip()


def metadata_keywords(payload: dict[str, Any]) -> list[str]:
    return dedupe(
        [
            str(payload.get("value") or ""),
            str(payload.get("manufacturer") or ""),
            str(payload.get("mpn") or ""),
            str(payload.get("package_name") or ""),
            str(payload.get("category") or ""),
            str(payload.get("vendor") or ""),
        ]
    )


def fts_query(query: str) -> str:
    tokens = re.findall(r"[A-Za-z0-9_]+", query.strip().lower())
    return " ".join(f"{token}*" for token in tokens[:8])


def normalize_metadata(payload: dict[str, Any]) -> dict[str, Any]:
    requested_kind = str(payload.get("identity_kind") or "").strip().lower()
    mpn_source = str(payload.get("mpn_source") or "").strip().lower()
    identity_kind = requested_kind or (
        IDENTITY_KIND_PROVISIONAL_IPN
        if mpn_source in {MPN_SOURCE_PROVISIONAL_IPN, "fallback_ipn"}
        else IDENTITY_KIND_MPN
    )
    if identity_kind not in {IDENTITY_KIND_MPN, IDENTITY_KIND_PROVISIONAL_IPN}:
        raise ValueError("identity_kind must be 'mpn' or 'provisional_ipn'")
    normalized = {
        "value": str(payload.get("value") or "").strip(),
        "description": str(payload.get("description") or "").strip(),
        "datasheet_url": str(payload.get("datasheet_url") or payload.get("datasheet") or "").strip(),
        "manufacturer": str(payload.get("manufacturer") or "").strip(),
        "mpn": str(payload.get("mpn") or payload.get("manufacturer_part_number") or "").strip(),
        "category": str(payload.get("category") or "").strip(),
        "package_name": str(payload.get("package_name") or "").strip(),
        "vendor": str(payload.get("vendor") or "").strip(),
        "vendor_part_number": str(payload.get("vendor_part_number") or "").strip(),
        "mass_g": str(payload.get("mass_g") or "").strip(),
        "rqjc_c_w": str(payload.get("rqjc_c_w") or "").strip(),
        "rqjc_top_c_w": str(payload.get("rqjc_top_c_w") or "").strip(),
        "temp_max_c": str(payload.get("temp_max_c") or "").strip(),
        "temp_min_c": str(payload.get("temp_min_c") or "").strip(),
        "power_dissipation_w": str(payload.get("power_dissipation_w") or "").strip(),
        "rate": str(payload.get("rate") or "").strip(),
        "sap_code": str(payload.get("sap_code") or "").strip(),
        "identity_kind": identity_kind,
        "identity_source": str(payload.get("identity_source") or "").strip(),
        "source_internal_part_number": str(
            payload.get("source_internal_part_number")
            or payload.get("internal_part_number")
            or ""
        ).strip(),
    }
    for field in ("value", "description", "datasheet_url", "manufacturer"):
        if not normalized[field]:
            raise ValueError(f"{field} is required")
    if identity_kind == IDENTITY_KIND_MPN and not normalized["mpn"]:
        raise ValueError("mpn is required for manufacturer-part identities")
    if identity_kind == IDENTITY_KIND_PROVISIONAL_IPN:
        normalized["mpn"] = ""
        if not normalized["identity_source"]:
            raise ValueError("identity_source is required for provisional parts")
        if not normalized["source_internal_part_number"]:
            normalized["source_internal_part_number"] = str(payload.get("name") or "").strip()
        if not normalized["source_internal_part_number"]:
            raise ValueError("source_internal_part_number is required for provisional parts")
    # An explicit name wins. Database-library imports carry an internal part
    # number that is not the manufacturer part number, and deriving the name
    # from `mpn` would drop it from the record entirely.
    normalized["name"] = (
        str(payload.get("name") or "").strip()
        or normalized["mpn"]
        or normalized["value"]
    )
    normalized["summary"] = normalized["description"]
    normalized["normalized_manufacturer"] = normalize_identity_value(normalized["manufacturer"])
    normalized["normalized_mpn"] = normalize_identity_value(normalized["mpn"])
    normalized["normalized_part_number"] = normalize_identity_value(
        normalized["mpn"]
        if identity_kind == IDENTITY_KIND_MPN
        else normalized["source_internal_part_number"]
    )
    normalized["mpn_source"] = (
        MPN_SOURCE_MANUFACTURER
        if identity_kind == IDENTITY_KIND_MPN
        else MPN_SOURCE_PROVISIONAL_IPN
    )
    raw_extra_fields = payload.get("extra_fields") or payload.get("fields") or {}
    normalized["extra_fields"] = {
        str(key): str(value or "")
        for key, value in dict(raw_extra_fields).items()
        if str(key).strip()
    }
    return normalized


__all__ = [
    "IDENTITY_KIND_MPN",
    "IDENTITY_KIND_PROVISIONAL_IPN",
    "MPN_SOURCE_MANUFACTURER",
    "MPN_SOURCE_PROVISIONAL_IPN",
    "dedupe",
    "fts_query",
    "metadata_keywords",
    "metadata_search_document",
    "normalize_identity_value",
    "normalize_metadata",
]
