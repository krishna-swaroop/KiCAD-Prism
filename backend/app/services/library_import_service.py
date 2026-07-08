"""Background library import service.

Wraps scripts/import_kicad_library_assets.py and scripts/import_database_library.py
logic so that a ZIP upload or a local server path can be processed in the background
with live progress reporting via the ws_jobs table.
"""

from __future__ import annotations

import io
import logging
import shutil
import sys
import tempfile
import threading
import uuid
import zipfile
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_SCRIPTS_DIR = _REPO_ROOT / "scripts"


# ---------------------------------------------------------------------------
# Job helpers (thin wrappers so this module doesn't import workspace at module
# load time, avoiding circular deps)
# ---------------------------------------------------------------------------


def _job_store():
    from app.services.workspace_service import workspace  # noqa: PLC0415

    return workspace


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def start_library_import(
    *,
    source_path: str | None = None,
    zip_bytes: bytes | None = None,
    zip_filename: str = "library.zip",
    overwrite: bool = False,
    generate_previews: bool = True,
    create_stubs: bool = True,
) -> str:
    """Start a background library import and return the job_id."""
    job_id = str(uuid.uuid4())
    _job_store().create_job(
        job_id,
        "library_import",
        status="running",
        message="Queued",
        percent=0,
        logs=[],
        stats=None,
    )
    thread = threading.Thread(
        target=_run_import,
        args=(job_id,),
        kwargs=dict(
            source_path=source_path,
            zip_bytes=zip_bytes,
            zip_filename=zip_filename,
            overwrite=overwrite,
            generate_previews=generate_previews,
            create_stubs=create_stubs,
        ),
        daemon=True,
    )
    thread.start()
    return job_id


def get_import_job(job_id: str) -> dict[str, Any] | None:
    return _job_store().get_job(job_id, "library_import")


# ---------------------------------------------------------------------------
# Internal runner
# ---------------------------------------------------------------------------


def _log(job_id: str, message: str) -> None:
    logger.info("[library-import %s] %s", job_id, message)
    ws = _job_store()
    job = ws.get_job(job_id, "library_import")
    if job is None:
        return
    logs: list[str] = job.get("logs") or []
    logs.append(message)
    ws.update_job(job_id, logs=logs, message=message)


def _fail(job_id: str, message: str) -> None:
    ws = _job_store()
    job = ws.get_job(job_id, "library_import")
    logs: list[str] = (job.get("logs") or []) if job else []
    for line in message.splitlines():
        if line.strip():
            logs.append(f"ERROR: {line}")
    ws.update_job(job_id, status="failed", message=message, percent=100, logs=logs)


def _detect_library_type(root: Path) -> str:
    """Return 'kicad_folder', 'cern_db', or 'unknown'."""
    if (root / "symbols").is_dir() or (root / "footprints").is_dir():
        return "kicad_folder"
    # Look for a SQLite DB alongside SchLib/PcbLib
    for ext in (".db", ".sqlite", ".sqlite3"):
        if list(root.glob(f"*{ext}")):
            if (root / "SchLib").is_dir() or (root / "PcbLib").is_dir():
                return "cern_db"
    # Flat layout: .kicad_sym files or .pretty dirs directly at root
    if list(root.glob("*.kicad_sym")) or list(root.glob("*.pretty")):
        return "kicad_folder"
    return "unknown"


def _is_flat_layout(root: Path) -> bool:
    """True when .kicad_sym / .pretty sit directly in root (no symbols/ or footprints/ subdir)."""
    has_sym_dir = (root / "symbols").is_dir()
    has_fp_dir = (root / "footprints").is_dir()
    if has_sym_dir or has_fp_dir:
        return False
    return bool(list(root.glob("*.kicad_sym")) or list(root.glob("*.pretty")))


def _build_normalized_tree(source_root: Path, tmp_dir: Path, log: Any) -> Path:
    """Reorganise a flat KiCad layout into symbols/ + footprints/ so the import script works."""
    norm = tmp_dir / "normalized"
    sym_dir = norm / "symbols"
    fp_dir = norm / "footprints"
    sym_dir.mkdir(parents=True, exist_ok=True)
    fp_dir.mkdir(parents=True, exist_ok=True)

    sym_count = 0
    fp_count = 0

    model_count = 0
    for item in source_root.iterdir():
        if item.suffix.lower() == ".kicad_sym" and item.is_file():
            shutil.copy2(item, sym_dir / item.name)
            sym_count += 1
        elif item.suffix.lower() == ".pretty" and item.is_dir():
            dst = fp_dir / item.name
            shutil.copytree(item, dst, dirs_exist_ok=True)
            fp_count += 1
        elif item.is_dir() and (
            item.name.endswith(".3dshapes")
            or item.name in ("3D", "3d")
            or item.name.lower().startswith("3rd")
        ):
            # Preserve 3D model directories so the import script can find them
            dst = norm / item.name
            shutil.copytree(item, dst, dirs_exist_ok=True)
            model_count += 1

    log(
        f"Normalized flat layout: {sym_count} symbol lib(s), {fp_count} footprint lib(s), {model_count} 3D dir(s)"
    )
    return norm


def _run_import(
    job_id: str,
    *,
    source_path: str | None,
    zip_bytes: bytes | None,
    zip_filename: str,
    overwrite: bool,
    generate_previews: bool,
    create_stubs: bool,
) -> None:
    tmp_dir: Path | None = None
    try:
        # ── 1. Resolve source root ──────────────────────────────────────
        if zip_bytes is not None:
            _log(job_id, f"Extracting uploaded ZIP ({len(zip_bytes):,} bytes)…")
            tmp_dir = Path(tempfile.mkdtemp(prefix="prism-lib-import-"))
            try:
                with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
                    zf.extractall(tmp_dir)
            except zipfile.BadZipFile as exc:
                _fail(job_id, f"Invalid ZIP file: {exc}")
                return
            # If the ZIP has a single top-level folder, descend into it
            children = [c for c in tmp_dir.iterdir()]
            if len(children) == 1 and children[0].is_dir():
                source_root = children[0]
            else:
                source_root = tmp_dir
        elif source_path:
            source_root = Path(source_path).expanduser().resolve()
            if not source_root.is_dir():
                _fail(
                    job_id, f"Path does not exist or is not a directory: {source_root}"
                )
                return
        else:
            _fail(job_id, "No source provided (neither zip_bytes nor source_path)")
            return

        _log(job_id, f"Source root: {source_root}")

        # ── 2. Detect library type ──────────────────────────────────────
        lib_type = _detect_library_type(source_root)
        _log(job_id, f"Detected library type: {lib_type}")

        if lib_type == "unknown":
            _fail(
                job_id,
                (
                    "Could not determine library type. "
                    "Expected a folder with symbols/, footprints/, 3D/ subdirectories "
                    "or a CERN-style folder with SchLib/, PcbLib/, and a .db/.sqlite file."
                ),
            )
            return

        # ── 3. Normalise flat layouts ───────────────────────────────────
        if lib_type == "kicad_folder" and _is_flat_layout(source_root):
            if tmp_dir is None:
                tmp_dir = Path(tempfile.mkdtemp(prefix="prism-lib-import-"))
            source_root = _build_normalized_tree(
                source_root, tmp_dir, lambda msg: _log(job_id, msg)
            )
            _log(job_id, f"Normalized root: {source_root}")

        # ── 4. Dispatch ─────────────────────────────────────────────────
        _job_store().update_job(job_id, percent=5)
        if lib_type == "kicad_folder":
            _run_kicad_folder_import(
                job_id,
                source_root=source_root,
                overwrite=overwrite,
                generate_previews=generate_previews,
                create_stubs=create_stubs,
            )
        else:
            _run_cern_db_import(
                job_id,
                source_root=source_root,
                overwrite=overwrite,
                generate_previews=generate_previews,
            )

    except Exception as exc:  # noqa: BLE001
        import traceback as _tb  # noqa: PLC0415

        tb = _tb.format_exc()
        logger.error("Unexpected error in library import job %s:\n%s", job_id, tb)
        _fail(job_id, f"Unexpected error: {exc}\n{tb}")
    finally:
        if tmp_dir is not None:
            shutil.rmtree(tmp_dir, ignore_errors=True)


# ---------------------------------------------------------------------------
# KiCad folder import
# ---------------------------------------------------------------------------


def _run_kicad_folder_import(
    job_id: str,
    *,
    source_root: Path,
    overwrite: bool,
    generate_previews: bool,
    create_stubs: bool,
) -> None:
    import os  # noqa: PLC0415
    import subprocess  # noqa: PLC0415

    from app.services import kicad_cli as kicad_cli_resolver  # noqa: PLC0415

    script = _SCRIPTS_DIR / "import_kicad_library_assets.py"
    if not script.is_file():
        _fail(job_id, f"Import script not found: {script}")
        return

    cmd = [sys.executable, str(script), str(source_root)]
    if overwrite:
        cmd.append("--overwrite")
    if not generate_previews:
        cmd.append("--no-previews")

    env = os.environ.copy()
    kicad_cli_path = kicad_cli_resolver.resolve_optional()
    if kicad_cli_path:
        env["KICAD_CLI"] = kicad_cli_path
        env["KICAD_CLI_PATH"] = kicad_cli_path
        _log(job_id, f"kicad-cli: {kicad_cli_path}")
    else:
        _log(job_id, "WARNING: kicad-cli not found — previews will be skipped")

    _log(job_id, f"Running: {' '.join(cmd)}")
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env=env,
        )
        assert proc.stdout is not None
        for line in proc.stdout:
            stripped = line.rstrip()
            if stripped:
                _log(job_id, stripped)
        proc.wait()
        if proc.returncode != 0:
            _fail(job_id, f"Import script exited with code {proc.returncode}")
            return
    except Exception as exc:
        import traceback  # noqa: PLC0415

        tb = traceback.format_exc()
        logger.error("KiCad folder import failed for job %s:\n%s", job_id, tb)
        _fail(job_id, f"Subprocess error: {exc}\n{tb}")
        return

    if create_stubs:
        _log(job_id, "Creating component stubs from imported assets…")
        _create_stubs_from_assets(job_id)
    else:
        _job_store().update_job(
            job_id,
            status="completed",
            message="Import complete — assets available in Link tab",
            percent=100,
        )


# ---------------------------------------------------------------------------
# Stub component creation
# ---------------------------------------------------------------------------

_KICAD_3D_VARS = (
    "${KICAD6_3DMODEL_DIR}",
    "${KICAD7_3DMODEL_DIR}",
    "${KICAD8_3DMODEL_DIR}",
    "${KICAD9_3DMODEL_DIR}",
    "${KISYS3DMOD}",
    "${KICAD_3RD_PARTY}",
    "${KICAD3DLIBS}",
)


def _extract_3d_refs_from_footprint(text: str) -> list[str]:
    import re as _re  # noqa: PLC0415

    return _re.findall(r'\(model\s+"([^"]+)"', text) + _re.findall(
        r'\(model\s+([^\s")\n]+)', text
    )


def _resolve_3d_asset(ref: str, model_by_filename: dict[str, Any]) -> Any | None:
    ref = ref.strip().replace("\\", "/")
    for var in _KICAD_3D_VARS:
        if ref.startswith(var):
            ref = ref[len(var) :].lstrip("/")
            break
    if not ref:
        return None
    basename = ref.split("/")[-1]
    # Try exact filename match first, then stem-only match
    return model_by_filename.get(basename) or model_by_filename.get(Path(basename).stem)


def _create_stubs_from_assets(job_id: str) -> None:
    """Create one catalog component per symbol asset that has no component yet."""
    from app.services.component_catalog_service import catalog_service  # noqa: PLC0415

    svc = catalog_service
    try:
        svc.initialize()
    except Exception:  # noqa: S110, BLE001
        pass

    created = 0
    skipped = 0
    errors: list[str] = []

    with svc._connect() as conn:  # type: ignore[attr-defined]
        # All symbol assets not yet linked to any revision
        unlinked = conn.execute(
            """
            SELECT a.*
            FROM assets a
            WHERE a.asset_type = 'symbol'
              AND NOT EXISTS (
                  SELECT 1 FROM revision_assets ra WHERE ra.asset_id = a.id
              )
            ORDER BY a.target_library, a.target_name
            """
        ).fetchall()

        # Build footprint lookup: target_name -> asset row
        fp_assets = conn.execute(
            "SELECT * FROM assets WHERE asset_type = 'footprint'"
        ).fetchall()
        fp_by_name: dict[str, Any] = {}
        for fp in fp_assets:
            fp_by_name[fp["target_name"]] = dict(fp)
            # also index without library prefix
            fp_by_name[fp["target_name"].split(":")[-1]] = dict(fp)

        # Build 3D model lookup: filename (stem + suffix) -> asset row
        model_assets = conn.execute(
            "SELECT * FROM assets WHERE asset_type = '3dmodel'"
        ).fetchall()
        model_by_filename: dict[str, Any] = {}
        for ma in model_assets:
            model_by_filename[ma["target_name"]] = dict(ma)
            # also index by stem only (without extension) for fuzzy matching
            stem = Path(ma["target_name"]).stem
            if stem not in model_by_filename:
                model_by_filename[stem] = dict(ma)

        _log(job_id, f"Found {len(unlinked)} symbol asset(s) without a component stub")

        import uuid as _uuid  # noqa: PLC0415
        from datetime import UTC, datetime  # noqa: PLC0415

        for sym_row in unlinked:
            sym = dict(sym_row)
            symbol_name = sym["target_name"]
            library = sym["target_library"]

            try:
                # Read symbol file to extract properties
                sym_path = sym["canonical_path"]
                props = _extract_symbol_properties(sym_path, symbol_name)

                value = props.get("Value") or symbol_name
                description = props.get("Description") or value
                datasheet = props.get("Datasheet") or ""
                manufacturer = (
                    props.get("Manufacturer") or props.get("Manufacturer_Name") or ""
                )
                mpn = (
                    props.get("Manufacturer Part Number")
                    or props.get("MPN")
                    or props.get("Part Number")
                    or f"{library}:{symbol_name}"
                )
                footprint_ref = props.get("Footprint") or ""
                category = library.replace("_", " ").strip()

                # Check if a component with this MPN already exists
                existing = conn.execute(
                    "SELECT c.id, cr.id as rev_id FROM components c "
                    "JOIN component_revisions cr ON cr.id = c.current_revision_id "
                    "WHERE cr.mpn = ?",
                    (mpn,),
                ).fetchone()

                if existing:
                    skipped += 1
                    continue

                now = datetime.now(UTC).isoformat()
                component_id = str(_uuid.uuid4())

                metadata = {
                    "name": value,
                    "value": value,
                    "description": description,
                    "datasheet_url": datasheet,
                    "manufacturer": manufacturer,
                    "mpn": mpn,
                    "category": category,
                    "package_name": "",
                    "vendor": "",
                    "vendor_part_number": "",
                    "mass_g": "",
                    "rqjc_c_w": "",
                    "rqjc_top_c_w": "",
                    "temp_max_c": "",
                    "temp_min_c": "",
                    "power_dissipation_w": "",
                    "rate": "",
                    "sap_code": "",
                    "summary": "",
                }

                _, revision_id = svc._upsert_component_metadata_row(  # type: ignore[attr-defined]
                    conn,
                    component_id=component_id,
                    metadata=metadata,
                    now=now,
                    existing_component_id=None,
                )

                # Link symbol asset
                svc._link_asset_to_revision(conn, revision_id, sym, required=True)  # type: ignore[attr-defined]

                # Try to match a footprint
                fp_name = (
                    footprint_ref.split(":")[-1]
                    if ":" in footprint_ref
                    else footprint_ref
                )
                fp_asset = fp_by_name.get(fp_name) or fp_by_name.get(footprint_ref)
                if fp_asset:
                    svc._link_asset_to_revision(
                        conn, revision_id, fp_asset, required=True
                    )  # type: ignore[attr-defined]

                    # Try to link 3D model referenced by the matched footprint file
                    fp_path = fp_asset.get("canonical_path", "")
                    if fp_path:
                        try:
                            fp_text = Path(fp_path).read_text(
                                encoding="utf-8", errors="ignore"
                            )
                            for model_ref in _extract_3d_refs_from_footprint(fp_text):
                                model_asset = _resolve_3d_asset(
                                    model_ref, model_by_filename
                                )
                                if model_asset:
                                    svc._link_asset_to_revision(
                                        conn, revision_id, model_asset, required=False
                                    )  # type: ignore[attr-defined]
                                    break  # link first match only
                        except Exception:  # noqa: BLE001, S110
                            pass

                # Release immediately so the remote provider exposes it
                conn.execute(
                    "UPDATE component_revisions SET release_status = 'released', updated_at = ? WHERE id = ?",
                    (now, revision_id),
                )
                conn.execute(
                    "UPDATE components SET released_revision_id = ?, updated_at = ? WHERE id = ?",
                    (revision_id, now, component_id),
                )

                created += 1

            except Exception as exc:  # noqa: BLE001
                errors.append(f"{library}:{symbol_name}: {exc}")
                logger.warning(
                    "Stub creation failed for %s:%s: %s", library, symbol_name, exc
                )

        conn.commit()

    summary = f"Created {created} component stub(s)"
    if skipped:
        summary += f", skipped {skipped} (already exist)"
    if errors:
        summary += f", {len(errors)} error(s)"
    _log(job_id, summary)
    status = "completed" if not errors else "completed_with_errors"
    _job_store().update_job(job_id, status=status, message=summary, percent=100)


def _extract_symbol_properties(sym_path: str, symbol_name: str) -> dict[str, str]:
    """Read a .kicad_sym file and return the properties dict for the named symbol."""
    import re  # noqa: PLC0415

    try:
        text = Path(sym_path).read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return {}

    prop_pattern = re.compile(r'\(property\s+"((?:\\.|[^"])*)"\s+"((?:\\.|[^"])*)"')
    props: dict[str, str] = {}
    for m in prop_pattern.finditer(text):
        key = m.group(1).replace('\\"', '"')
        val = m.group(2).replace('\\"', '"').replace("\\\\", "\\").strip()
        if val and key not in props:
            props[key] = val
    return props


# ---------------------------------------------------------------------------
# CERN DB import  (scripts/import_database_library.py logic)
# ---------------------------------------------------------------------------


def _run_cern_db_import(
    job_id: str,
    *,
    source_root: Path,
    overwrite: bool,
    generate_previews: bool,
) -> None:
    db_candidates = (
        list(source_root.glob("*.db"))
        + list(source_root.glob("*.sqlite"))
        + list(source_root.glob("*.sqlite3"))
    )
    if not db_candidates:
        _fail(job_id, "No .db/.sqlite file found in source root for CERN DB import")
        return

    db_path = db_candidates[0]
    _log(job_id, f"Using database: {db_path.name}")

    _run_cern_db_via_subprocess(
        job_id,
        source_root=source_root,
        db_path=db_path,
        overwrite=overwrite,
        generate_previews=generate_previews,
    )


def _run_cern_db_via_subprocess(
    job_id: str,
    *,
    source_root: Path,
    db_path: Path,
    overwrite: bool,
    generate_previews: bool,
) -> None:
    """Fallback: run import_database_library.py as a subprocess when its API isn't importable."""
    import subprocess  # noqa: PLC0415

    script = _SCRIPTS_DIR / "import_database_library.py"
    cmd = [
        sys.executable,
        str(script),
        str(source_root),
        "--database",
        str(db_path),
        "--allow-missing-assets",
    ]
    if overwrite:
        cmd.append("--overwrite-assets")
    if generate_previews:
        cmd.append("--generate-previews")

    _log(job_id, f"Running: {' '.join(cmd)}")
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        assert proc.stdout is not None
        for line in proc.stdout:
            _log(job_id, line.rstrip())
        proc.wait()
        if proc.returncode == 0:
            _job_store().update_job(
                job_id,
                status="completed",
                message="CERN DB import complete",
                percent=100,
            )
        else:
            _fail(job_id, f"Import script exited with code {proc.returncode}")
    except Exception as exc:
        _fail(job_id, f"Subprocess error: {exc}")
