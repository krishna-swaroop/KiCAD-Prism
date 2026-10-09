"""ComponentSpec v1 checks. These checks are necessary, never a QA approval."""

from __future__ import annotations

from collections import Counter
from math import isfinite
from typing import Any

SPEC_VERSION = "component-spec/v1"
ELECTRICAL_TYPES = {
    "input", "output", "bidirectional", "tri_state", "passive", "free",
    "unspecified", "power_in", "power_out", "open_collector",
    "open_emitter", "no_connect",
}
FIELD_STATUSES = {"sourced", "estimated", "unavailable", "not_applicable"}


def _finding(code: str, path: str, detail: str) -> dict[str, str]:
    return {"code": code, "path": path, "detail": detail}


def _text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def validate_spec(spec: Any) -> list[dict[str, str]]:
    """Reject structurally unsafe proposals before any CAD generation.

    The independent datasheet comparison belongs to ``validate_case``.
    """
    issues: list[dict[str, str]] = []
    if not isinstance(spec, dict):
        return [_finding("SPEC_OBJECT", "$", "Expected a JSON object")]
    if spec.get("schema_version") != SPEC_VERSION:
        issues.append(_finding("SPEC_VERSION", "schema_version", SPEC_VERSION))
    identity = spec.get("identity")
    if not isinstance(identity, dict):
        identity = {}
    for key in ("manufacturer", "mpn", "package_variant"):
        if not _text(identity.get(key)):
            issues.append(_finding("IDENTITY_REQUIRED", f"identity.{key}", "Exact identity required"))

    sources = spec.get("sources")
    if not isinstance(sources, list) or not sources:
        issues.append(_finding("SOURCE_REQUIRED", "sources", "At least one source required"))
        sources = []
    source_ids: set[str] = set()
    for i, source in enumerate(sources):
        if not isinstance(source, dict):
            issues.append(_finding("SOURCE_OBJECT", f"sources[{i}]", "Expected object"))
            continue
        sid, digest = source.get("id"), source.get("sha256")
        if not _text(sid) or sid in source_ids:
            issues.append(_finding("SOURCE_ID", f"sources[{i}].id", "Missing or duplicate source ID"))
        else:
            source_ids.add(sid)
        if not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
            issues.append(_finding("SOURCE_DIGEST", f"sources[{i}].sha256", "Expected lowercase SHA-256"))

    def evidence(value: Any, path: str, *, allow_estimate: bool = False) -> None:
        if allow_estimate and isinstance(value, dict) and value.get("status") == "estimated" and _text(value.get("method")):
            return
        if not isinstance(value, dict) or not _text(value.get("source_id")) or value["source_id"] not in source_ids or not isinstance(value.get("page"), int) or isinstance(value.get("page"), bool) or value["page"] < 1:
            issues.append(_finding("EVIDENCE_REQUIRED", path, "Known source ID and positive page required"))

    pins = spec.get("pins")
    if not isinstance(pins, list) or not pins:
        issues.append(_finding("PINS_REQUIRED", "pins", "At least one pin required"))
        pins = []
    pin_numbers: list[str] = []
    for i, pin in enumerate(pins):
        if not isinstance(pin, dict):
            issues.append(_finding("PIN_OBJECT", f"pins[{i}]", "Expected object"))
            continue
        number = pin.get("number")
        if not _text(number):
            issues.append(_finding("PIN_NUMBER", f"pins[{i}].number", "String pad identifier required"))
        else:
            pin_numbers.append(number)
        if not _text(pin.get("name")):
            issues.append(_finding("PIN_NAME", f"pins[{i}].name", "Pin name required"))
        if not isinstance(pin.get("electrical_type"), str) or pin["electrical_type"] not in ELECTRICAL_TYPES:
            issues.append(_finding("PIN_TYPE", f"pins[{i}].electrical_type", "Unsupported electrical type"))
        evidence(pin.get("evidence"), f"pins[{i}].evidence")
    for number, count in Counter(pin_numbers).items():
        if count > 1:
            issues.append(_finding("DUPLICATE_PIN", "pins", f"{number} appears {count} times"))

    units = spec.get("units")
    if not isinstance(units, list) or not units:
        issues.append(_finding("UNITS_REQUIRED", "units", "At least one unit required"))
        units = []
    assigned: list[str] = []
    for i, unit in enumerate(units):
        if not isinstance(unit, dict) or not _text(unit.get("name")) or not isinstance(unit.get("pin_numbers"), list):
            issues.append(_finding("UNIT_INVALID", f"units[{i}]", "Named unit and pin list required"))
            continue
        if any(not _text(number) for number in unit["pin_numbers"]):
            issues.append(_finding("UNIT_PIN_NUMBER", f"units[{i}].pin_numbers", "String pin numbers required"))
        if not unit["pin_numbers"]:
            issues.append(_finding("UNIT_EMPTY", f"units[{i}]", "Unit must contain pins"))
        assigned.extend(number for number in unit["pin_numbers"] if _text(number))
    if Counter(assigned) != Counter(pin_numbers):
        issues.append(_finding("UNIT_COVERAGE", "units", "Every pin must appear in exactly one unit"))

    package = spec.get("package")
    if not isinstance(package, dict) or not _text(package.get("family")):
        issues.append(_finding("PACKAGE_REQUIRED", "package", "Package family required"))
        package = {}
    for key in ("body_x_mm", "body_y_mm", "pitch_mm"):
        value = package.get(key)
        if value is not None:
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value) or value <= 0:
                issues.append(_finding("DIMENSION_INVALID", f"package.{key}", "Positive millimetres required"))
            evidence(package.get("evidence", {}).get(key) if isinstance(package.get("evidence"), dict) else None, f"package.evidence.{key}", allow_estimate=True)

    pads = spec.get("pads")
    if not isinstance(pads, list) or not pads:
        issues.append(_finding("PADS_REQUIRED", "pads", "Pad list required"))
        pads = []
    pad_numbers: list[str] = []
    for i, pad in enumerate(pads):
        if not isinstance(pad, dict) or not _text(pad.get("number")):
            issues.append(_finding("PAD_NUMBER", f"pads[{i}]", "String pad number required"))
            continue
        pad_numbers.append(pad["number"])
        if not isinstance(pad.get("kind"), str) or pad["kind"] not in {"electrical", "mechanical", "nc"}:
            issues.append(_finding("PAD_KIND", f"pads[{i}].kind", "Unknown pad kind"))
        if pad.get("kind") == "electrical" and pad["number"] not in pin_numbers:
            issues.append(_finding("PAD_UNMAPPED", f"pads[{i}]", "Electrical pad has no symbol pin"))
        for axis in ("x_mm", "y_mm"):
            coordinate = pad.get(axis)
            if coordinate is not None and (isinstance(coordinate, bool) or not isinstance(coordinate, (int, float)) or not isfinite(coordinate)):
                issues.append(_finding("PAD_COORDINATE", f"pads[{i}].{axis}", "Finite millimetres required"))
        evidence(pad.get("evidence"), f"pads[{i}].evidence", allow_estimate=True)
    for number in pin_numbers:
        if number not in pad_numbers:
            issues.append(_finding("PIN_UNMAPPED", "pads", f"Pin {number} has no pad"))
    for number, count in Counter(pad_numbers).items():
        if count > 1 and not all(
            isinstance(pad, dict) and pad.get("duplicate_number_reason")
            for pad in pads if isinstance(pad, dict) and pad.get("number") == number
        ):
            issues.append(_finding("DUPLICATE_PAD_UNREVIEWED", "pads", f"{number} appears {count} times without an explicit reason"))

    fields = spec.get("metadata", {})
    if not isinstance(fields, dict):
        issues.append(_finding("METADATA_OBJECT", "metadata", "Expected object"))
    else:
        for name, field in fields.items():
            if not isinstance(field, dict) or not isinstance(field.get("status"), str) or field["status"] not in FIELD_STATUSES:
                issues.append(_finding("FIELD_STATUS", f"metadata.{name}", "Explicit status required"))
                continue
            if field["status"] == "sourced":
                if field.get("value") is None:
                    issues.append(_finding("FIELD_VALUE", f"metadata.{name}", "Sourced value required"))
                evidence(field.get("evidence"), f"metadata.{name}.evidence")
            elif field["status"] == "estimated" and (field.get("value") is None or not _text(field.get("method"))):
                issues.append(_finding("FIELD_ESTIMATE", f"metadata.{name}", "Value and method required"))
            elif field["status"] in {"unavailable", "not_applicable"} and field.get("value") is not None:
                issues.append(_finding("FIELD_UNSUPPORTED", f"metadata.{name}", "No numeric placeholder allowed"))
    return issues


def validate_case(spec: Any, case: dict[str, Any]) -> list[dict[str, str]]:
    """Compare against a separately reviewed source map, never the generated CAD."""
    issues = validate_spec(spec)
    if not isinstance(spec, dict):
        return issues
    identity = spec.get("identity", {})
    for key in ("manufacturer", "mpn", "package_variant"):
        if isinstance(identity, dict) and identity.get(key) != case.get("identity", {}).get(key):
            issues.append(_finding("SOURCE_IDENTITY_MISMATCH", f"identity.{key}", "Does not match case source"))
    expected = case.get("source_pin_map", {})
    actual = {p["number"]: p.get("name") for p in spec.get("pins", []) if isinstance(p, dict) and _text(p.get("number"))} if isinstance(spec.get("pins"), list) else {}
    for number in sorted(set(expected) | set(actual)):
        if expected.get(number) != actual.get(number):
            issues.append(_finding("SOURCE_PIN_MISMATCH", f"pins.{number}", f"Expected {expected.get(number)!r}, got {actual.get(number)!r}"))
    expected_types = case.get("source_pin_types", {})
    if isinstance(expected_types, dict):
        actual_types = {p["number"]: p.get("electrical_type") for p in spec.get("pins", []) if isinstance(p, dict) and _text(p.get("number"))} if isinstance(spec.get("pins"), list) else {}
        for number, expected_type in expected_types.items():
            if actual_types.get(number) != expected_type:
                issues.append(_finding("SOURCE_PIN_TYPE_MISMATCH", f"pins.{number}", f"Expected {expected_type!r}, got {actual_types.get(number)!r}"))
    source_pad_map = case.get("source_pad_map", {})
    if isinstance(source_pad_map, dict) and source_pad_map:
        actual_pads = {pad["number"]: pad for pad in spec.get("pads", []) if isinstance(pad, dict) and _text(pad.get("number"))} if isinstance(spec.get("pads"), list) else {}
        tolerance = case.get("pad_tolerance_mm", 0.01)
        if isinstance(tolerance, bool) or not isinstance(tolerance, (int, float)) or tolerance < 0:
            raise ValueError("pad_tolerance_mm must be nonnegative")
        for number, coordinates in source_pad_map.items():
            pad = actual_pads.get(number)
            if not isinstance(coordinates, dict) or not isinstance(pad, dict):
                issues.append(_finding("SOURCE_PAD_MISMATCH", f"pads.{number}", "Expected documented pad"))
                continue
            for axis in ("x_mm", "y_mm"):
                observed, wanted = pad.get(axis), coordinates.get(axis)
                if isinstance(observed, bool) or not isinstance(observed, (int, float)) or not isfinite(observed) or isinstance(wanted, bool) or not isinstance(wanted, (int, float)) or not isfinite(wanted) or abs(observed - wanted) > tolerance:
                    issues.append(_finding("SOURCE_PAD_GEOMETRY_MISMATCH", f"pads.{number}.{axis}", f"Expected {wanted!r} mm, got {observed!r} mm"))
    return issues
