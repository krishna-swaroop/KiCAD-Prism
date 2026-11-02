"""Check a draft symbol or footprint before it becomes part of a component.

A draft is a file that is not in the catalog yet: an agent or a script made it
and wants to know whether Prism will accept it. The check answers three things
with the same tools a revision's assets go through, and stores nothing:

* whether KiCad can read it (``kicad-cli sym upgrade`` / ``fp upgrade``, whose
  error text is returned as is);
* what the KLC checker finds (``CatalogKlcValidation.run_checker``);
* what it looks like: each symbol unit, or the footprint, rendered by
  ``kicad-cli`` and rasterised to a PNG.

How the file was made is not Prism's concern; the check is the same for a
hand-drawn symbol and a generated one.
"""

from __future__ import annotations

import base64
import hashlib
from pathlib import Path
import tempfile
from typing import Any

from app.services.catalog.asset_files import (
    CatalogAssetFiles,
    discover_footprint_name_in_text,
    discover_symbol_names_in_text,
)
from app.services.catalog.klc_validation import (
    VALIDATION_SEVERITY_ERROR,
    VALIDATION_SEVERITY_WARNING,
    CatalogKlcValidation,
)
from app.services.catalog.normalization import sanitize_name
from app.services.catalog.preview_pipeline import run_kicad_for_catalog
from app.services.catalog.preview_renderer import PREVIEW_STATUS_READY, CatalogPreviewRenderer
from app.services.kicad_tools import KicadTool

DRAFT_ASSET_TYPES = frozenset({"symbol", "footprint"})
PREVIEW_WIDTH = 900
# A large part split into many units would otherwise return dozens of images.
MAX_PREVIEW_UNITS = 8
# Enough to fix a part; a whole-library mistake would otherwise flood the reply.
MAX_FINDINGS = 50
# A vendor library can hold hundreds of symbols; the check is about one.
MAX_NAMES = 20


def unbalanced(text: str) -> str:
    """Why ``text`` is not one complete S-expression, or ``""``.

    ``kicad-cli fp upgrade`` (KiCad 10.0) spins until its timeout on a
    truncated footprint, so a draft cut short is caught here first.
    """
    depth = 0
    in_string = False
    escaped = False
    for index, char in enumerate(text):
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
        elif char == '"':
            in_string = True
        elif char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth < 0:
                line = text.count("\n", 0, index) + 1
                return f"Unexpected ')' on line {line}"
    if in_string:
        return "The file ends inside a quoted string"
    if depth:
        return f"The file ends with {depth} unclosed '('; it looks truncated"
    return ""


def _png(svg: bytes) -> dict[str, Any]:
    import cairosvg

    png = cairosvg.svg2png(bytestring=svg, output_width=PREVIEW_WIDTH, background_color="white")
    return {"png_base64": base64.b64encode(png).decode("ascii")}


def _previews(svgs: list[tuple[int, bytes]]) -> tuple[list[dict[str, Any]], str]:
    """PNG previews of ``svgs``; none, and why, when Cairo cannot rasterise."""
    try:
        return [{"unit": unit, **_png(svg)} for unit, svg in svgs[:MAX_PREVIEW_UNITS]], ""
    except Exception as exc:  # noqa: BLE001 - a missing native Cairo must not fail the check
        return [], f"Previews unavailable: {exc}".splitlines()[0]


def _klc(asset_type: str, path: Path, scratch: Path, name: str) -> dict[str, Any]:
    status, exit_code, findings, _stdout, stderr = CatalogKlcValidation.run_checker(
        asset_type, path, scratch / "klc.junit.xml", object_name=name
    )
    # Errors first, so a capped list still shows what blocks the part.
    ordered = sorted(findings, key=lambda f: f["severity"] != VALIDATION_SEVERITY_ERROR)
    return {
        "status": status,
        "exit_code": exit_code,
        "error_count": sum(1 for f in findings if f["severity"] == VALIDATION_SEVERITY_ERROR),
        "warning_count": sum(1 for f in findings if f["severity"] == VALIDATION_SEVERITY_WARNING),
        "findings": ordered[:MAX_FINDINGS],
        "findings_omitted": max(0, len(findings) - MAX_FINDINGS),
        "message": stderr.strip()[-2000:] if not findings else "",
    }


def _unreadable(asset_type: str, name: str, names: list[str], message: str, sha256: str) -> dict[str, Any]:
    return {
        "asset_type": asset_type,
        "name": name,
        "names": names[:MAX_NAMES],
        "name_count": len(names),
        "sha256": sha256,
        "readable": False,
        "kicad_message": message.strip()[-4000:] or "KiCad could not read the file",
        "klc": None,
        "previews": [],
    }


def check_draft(
    kicad: KicadTool,
    *,
    asset_type: str,
    file_name: str,
    payload: bytes,
    name: str = "",
) -> dict[str, Any]:
    """Read, KLC-check and render one draft file; never raises for a bad file."""

    if asset_type not in DRAFT_ASSET_TYPES:
        raise ValueError("Only symbol and footprint drafts can be checked")
    sha256 = hashlib.sha256(payload).hexdigest()
    text = payload.decode("utf-8", errors="replace")
    run = lambda args: run_kicad_for_catalog(kicad, args)  # noqa: E731
    problem = unbalanced(text)
    if problem:
        return _unreadable(asset_type, name, [], problem, sha256)

    with tempfile.TemporaryDirectory(prefix="prism_draft_check_") as tmp:
        scratch = Path(tmp)
        if asset_type == "symbol":
            names = discover_symbol_names_in_text(text)
            chosen = name or (names[0] if names else "")
            source = scratch / sanitize_name(Path(file_name).name, "draft.kicad_sym")
            if source.suffix != ".kicad_sym":
                source = source.with_suffix(".kicad_sym")
            source.write_bytes(payload)
            upgraded = scratch / "upgraded.kicad_sym"
            ok, error = run(["sym", "upgrade", "--force", "--output", str(upgraded), str(source)])
            if not ok or not upgraded.is_file():
                return _unreadable(asset_type, chosen, names, error, sha256)
            if not chosen or chosen not in names:
                message = f"No symbol named {chosen!r}" if chosen else "The library holds no symbol"
                return _unreadable(asset_type, chosen, names, message, sha256)
            # Check what attaching would store: the chosen symbol alone, flattened
            # if it is derived, not the library it came in.
            stored = scratch / f"{sanitize_name(chosen, 'symbol')}.kicad_sym"
            try:
                stored.write_bytes(
                    CatalogAssetFiles.single_symbol_payload(upgraded.read_text(encoding="utf-8"), chosen)
                )
            except ValueError as exc:
                return _unreadable(asset_type, chosen, names, str(exc), sha256)
            ok, error = run(["sym", "upgrade", "--force", "--output", str(scratch / "stored.kicad_sym"), str(stored)])
            if not ok:
                return _unreadable(asset_type, chosen, names, f"{chosen} does not load on its own: {error}", sha256)
            status, units = CatalogPreviewRenderer.generate_symbol_preview_units(
                {"canonical_path": str(stored), "target_name": chosen}, run
            )
            if status == PREVIEW_STATUS_READY and isinstance(units, list):
                previews, render_error = _previews(units)
            else:
                previews, render_error = [], str(units)
            klc = _klc(asset_type, stored, scratch, chosen)
        else:
            declared = discover_footprint_name_in_text(text)
            names = [declared] if declared else []
            chosen = name or declared or Path(file_name).stem
            library = scratch / "draft.pretty"
            library.mkdir()
            source = library / f"{sanitize_name(chosen, 'draft')}.kicad_mod"
            source.write_bytes(payload)
            upgraded_library = scratch / "upgraded.pretty"
            ok, error = run(["fp", "upgrade", "--force", "--output", str(upgraded_library), str(library)])
            if not ok:
                return _unreadable(asset_type, chosen, names, error, sha256)
            status, svg = CatalogPreviewRenderer.generate_footprint_preview(
                {"canonical_path": str(source), "target_name": chosen}, run
            )
            if status == PREVIEW_STATUS_READY and isinstance(svg, bytes):
                previews, render_error = _previews([(1, svg)])
            else:
                previews, render_error = [], str(svg)
            klc = _klc(asset_type, source, scratch, chosen)

    return {
        "asset_type": asset_type,
        "name": chosen,
        "names": names[:MAX_NAMES],
        "name_count": len(names),
        "sha256": sha256,
        "readable": True,
        "kicad_message": render_error[-4000:],
        "klc": klc,
        "previews": previews,
    }


__all__ = ["DRAFT_ASSET_TYPES", "MAX_PREVIEW_UNITS", "check_draft", "unbalanced"]
