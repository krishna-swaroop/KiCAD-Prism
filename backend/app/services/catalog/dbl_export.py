"""KiCad database-library (DBL) export of released, placeable components.

The bundle is a SQLite interchange file plus per-platform ``.kicad_dbl``
configs, extracted symbol/footprint libraries, library tables, and the 3D
models those footprints use under content-addressed paths. Prism's
runtime state stays in PostgreSQL; SQLite is only the delivery format KiCad
reads. Output is byte-stable for an unchanged catalog.
"""

from __future__ import annotations

import json
from pathlib import Path
import re
import shutil
import sqlite3
from typing import Any, Callable
import uuid

from app.services.catalog.harness_fields import GROUP as HARNESS_GROUP
from app.services.catalog.normalization import sanitize_name, sha256_bytes
from app.services.catalog.placement import CatalogPlacement
from app.services.catalog.placement_payloads import materialize_asset
from app.services.catalog.runtime import CatalogRuntime


DBL_COMMON_COLUMNS: tuple[str, ...] = (
    "Part Number",
    "Part Number Nocolon",
    "Comment",
    "Value",
    "Manufacturer",
    "Manufacturer Part Number",
    "PackageDescription",
    "Status",
    "Part Description",
    "Datasheet",
    "LibSymbol",
    "LibFootprint",
)

DBL_KEY_COLUMN = "Part Number Nocolon"
DBL_LINUX_FILENAME = "Prism_Linux.kicad_dbl"
DBL_WINDOWS_FILENAME = "Prism_Windows.kicad_dbl"
DBL_LINUX_CONNECTION = "Driver={SQLite3};Database=${CWD}/Prism.sqlite;"
DBL_WINDOWS_CONNECTION = "Driver={SQLite3 ODBC Driver};Database=${CWD}/Prism.sqlite;"
DBL_MODEL_DIR = "3DModels"
DBL_EXPORT_LOCK_PREFIX = "prism-catalog-dbl-export:"


def quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def sexpr_string(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def part_number_nocolon(value: str) -> str:
    cleaned = re.sub(r":+", "_", value.strip())
    cleaned = re.sub(r"\s+", "_", cleaned)
    return cleaned or "PART"


def dbl_part_numbers(components: list[dict[str, Any]]) -> dict[str, str]:
    """Map component id to its DBL key (``Part Number Nocolon``).

    The key is the manufacturer part number (else the value, else the
    component id) with runs of colons and whitespace replaced by ``_``. When
    several exported components share a key, the oldest (component creation
    time, then id) keeps it and each other one gets ``_`` plus the first eight
    characters of its own component id; should that still collide, the whole
    id is used. The key therefore depends only on the set of exported
    components, never on their order, and adding a newer look-alike part never
    renames an existing one.
    """
    groups: dict[str, list[dict[str, Any]]] = {}
    for component in components:
        base = part_number_nocolon(component["mpn"] or component["value"] or component["id"])
        groups.setdefault(base, []).append(component)
    keys: dict[str, str] = {}
    contested: list[tuple[str, dict[str, Any]]] = []
    for base, members in groups.items():
        members.sort(key=lambda c: (str(c.get("component_created_at") or ""), str(c["id"])))
        keys[str(members[0]["id"])] = base
        contested.extend((base, member) for member in members[1:])
    taken = set(keys.values())
    short_keys = [(f"{base}_{part_number_nocolon(str(c['id'])[:8])}", base, c) for base, c in contested]
    short_counts: dict[str, int] = {}
    for key, _, _ in short_keys:
        short_counts[key] = short_counts.get(key, 0) + 1
    for key, base, component in short_keys:
        if key in taken or short_counts[key] > 1:
            key = f"{base}_{part_number_nocolon(str(component['id']))}"
        keys[str(component["id"])] = key
    return keys


def dbl_symbol_library_name(part_number: str, symbol_asset: dict[str, Any] | None) -> str:
    if not symbol_asset:
        return ""
    raw = f"Prism_{part_number}_{symbol_asset['target_library']}_{symbol_asset['target_name']}"
    return sanitize_name(raw, "Prism_Symbol")


# Another part of the app may mark released components (supply does: "Not for new designs"). It is asked for the marked ids and
# answers with the text their Status column carries instead of the workflow stage. Registered at start-up; the catalog never
# imports whoever answers, and a failure leaves every Status as it was.
StatusMarks = Callable[[list[str]], dict[str, str]]
_status_marks: StatusMarks | None = None


def set_status_marks(provider: StatusMarks | None) -> None:
    global _status_marks
    _status_marks = provider


def status_marks_for(component_ids: list[str]) -> dict[str, str]:
    if _status_marks is None or not component_ids:
        return {}
    try:
        return dict(_status_marks(component_ids))
    except Exception:  # noqa: BLE001 - a mark is a courtesy; the export must not depend on it
        return {}


def dbl_model_relpath(model_asset: dict[str, Any]) -> str:
    """Bundle path of a 3D model, keyed by the asset row's content hash."""
    name = Path(str(model_asset.get("canonical_path") or model_asset.get("name") or "model.step")).name
    return f"{DBL_MODEL_DIR}/{str(model_asset['sha256'])[:16]}/{sanitize_name(name, 'model.step')}"


def dbl_model_path(model_asset: dict[str, Any]) -> str:
    """Model path written into exported footprints."""
    return "${PRISM_LIB_DIR}/" + dbl_model_relpath(model_asset)


def dbl_footprint_ref(component: dict[str, Any]) -> str:
    """``library:name`` of the default footprint, as written to ``LibFootprint`` and ``fp-lib-table``."""
    default_representation = next(
        (item for item in component.get("representations", []) if item.get("is_default")),
        None,
    )
    footprint_asset = default_representation.get("footprint") if default_representation else None
    if not footprint_asset:
        return ""
    return f"{footprint_asset['target_library']}:{footprint_asset['target_name']}"


def dbl_row_for_component(
    component: dict[str, Any],
    part_number: str,
    custom_fields: list[dict[str, Any]],
    status_override: str = "",
) -> dict[str, str]:
    default_representation = next(
        (item for item in component.get("representations", []) if item.get("is_default")),
        None,
    )
    symbol_asset = default_representation.get("symbol") if default_representation else None
    lib_symbol = ""
    if symbol_asset:
        lib_symbol = f"{dbl_symbol_library_name(part_number, symbol_asset)}:{symbol_asset['target_name']}"
    row = {
        "Part Number": part_number,
        "Part Number Nocolon": part_number,
        "Comment": component["value"] or component["name"],
        "Value": component["value"],
        "Manufacturer": component["manufacturer"],
        "Manufacturer Part Number": component["mpn"],
        "PackageDescription": component["package_name"],
        "Status": status_override or component["workflow_stage"],
        "Part Description": component["description"],
        "Datasheet": component["datasheet_url"],
        "LibSymbol": lib_symbol,
        "LibFootprint": dbl_footprint_ref(component),
    }
    extras = dict(component.get("extra_fields") or {})
    row.update({field["key"]: str(extras.get(field["storage_key"], "")) for field in custom_fields})
    return row


def write_dbl_config(
    export_root: Path,
    *,
    filename: str,
    connection_string: str,
    libraries: list[dict[str, Any]],
) -> None:
    payload = {
        "meta": {"version": 0},
        "name": "KiCAD Prism Database Library",
        "description": "KiCAD Prism released component database library",
        "source": {
            "type": "odbc",
            "dsn": "",
            "username": "",
            "password": "",
            "timeout_seconds": 2,
            "connection_string": connection_string,
        },
        "cache": {"max_age": 28800},
        "libraries": libraries,
    }
    (export_root / filename).write_text(json.dumps(payload, indent=4) + "\n", encoding="utf-8")


class CatalogDblExport:
    """Write the DBL bundle for an already-selected set of components."""

    def __init__(self, placement: CatalogPlacement) -> None:
        self._placement = placement

    def collect_dbl_assets(
        self,
        conn: Any,
        component: dict[str, Any],
        part_number: str,
        export_root: Path,
        exported_models: dict[str, str] | None = None,
        missing_models: list[dict[str, Any]] | None = None,
    ) -> None:
        """Write the component's symbol, footprint and 3D models into ``export_root``.

        ``exported_models`` maps written model paths to their SHA-256 across
        components; unreadable or mismatching models go to ``missing_models``.
        """
        exported_models = {} if exported_models is None else exported_models
        missing_models = [] if missing_models is None else missing_models
        _, assets = self._placement.placement_assets(conn, component["revision_id"])
        # Exactly what ``LibFootprint`` says, empty included: without a default
        # footprint the symbol must not name the remote provider's library.
        footprint_ref = dbl_footprint_ref(component)
        for raw_asset in assets:
            if raw_asset["asset_type"] not in {"symbol", "footprint"}:
                continue
            asset = materialize_asset(
                raw_asset, assets, component, footprint_ref=footprint_ref, model_path=dbl_model_path
            )
            if raw_asset["asset_type"] == "symbol":
                library_name = dbl_symbol_library_name(part_number, asset)
                destination = export_root / "SchLib" / f"{library_name}.kicad_sym"
            else:
                destination = (
                    export_root / "PcbLib" / f"{asset['target_library']}.pretty" / f"{asset['target_name']}.kicad_mod"
                )
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(asset["payload"])

        for model in assets:
            if model["asset_type"] == "3dmodel":
                self._export_model(
                    export_root, component["id"], component["revision_id"], model, exported_models, missing_models
                )

    def collect_released_models(
        self,
        conn: Any,
        export_root: Path,
        exported_models: dict[str, str],
        missing_models: list[dict[str, Any]],
    ) -> None:
        """Export the models of every revision ever released, of any library part.

        Boards keep referencing a model after its component moves to a newer
        release or is deactivated, so this does not follow the exported set.
        Modules and assemblies are never library parts (``is_library_part``),
        so their models never ship.
        """
        rows = conn.execute(
            """
            SELECT DISTINCT rr.component_id, rr.revision_id, a.*
            FROM component_release_records rr
            JOIN components c ON c.id = rr.component_id
            JOIN revision_assets ra ON ra.revision_id = rr.revision_id
            JOIN assets a ON a.id = ra.asset_id
            WHERE a.asset_type = '3dmodel' AND c.kind = %s
            ORDER BY rr.component_id, rr.revision_id, a.sha256, a.id
            """,
            ("part",),
        ).fetchall()
        for row in rows:
            model = dict(row)
            self._export_model(
                export_root, model["component_id"], model["revision_id"], model, exported_models, missing_models
            )

    @staticmethod
    def _export_model(
        export_root: Path,
        component_id: str,
        revision_id: str,
        model: dict[str, Any],
        exported_models: dict[str, str],
        missing_models: list[dict[str, Any]],
    ) -> None:
        relpath = dbl_model_relpath(model)
        expected = str(model["sha256"])
        if exported_models.get(relpath) == expected:
            return
        if relpath in exported_models:
            raise ValueError(f"3D model path collision in DBL export: {relpath}")
        try:
            payload = Path(str(model["canonical_path"])).read_bytes()
        except OSError:
            reason = "file_missing"
        else:
            reason = "" if sha256_bytes(payload) == expected else "sha256_mismatch"
        if reason:
            missing_models.append(
                {
                    "component_id": component_id,
                    "revision_id": revision_id,
                    "asset_id": str(model["id"]),
                    "reason": reason,
                }
            )
            return
        destination = export_root / relpath
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(payload)
        exported_models[relpath] = expected

    def export_bundle(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        components: list[dict[str, Any]],
        metadata_fields: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Rebuild the export root from ``components`` (already released and placeable).

        The bundle is written to a sibling directory and swapped in by rename,
        so a failed export leaves the previous bundle untouched. Exports to the
        same root are serialized by a transaction-scoped advisory lock on
        ``conn``, held until the caller ends the transaction, so any build or
        retired sibling found here belongs to an interrupted export.
        """
        export_root = runtime.export_root
        conn.execute(
            "SELECT pg_advisory_xact_lock(hashtext(%s))", (f"{DBL_EXPORT_LOCK_PREFIX}{export_root}",)
        ).fetchone()
        export_root.parent.mkdir(parents=True, exist_ok=True)
        sweep_leftovers(export_root)
        build_root = _sibling(export_root, "build")
        build_root.mkdir()
        try:
            summary = self._write_bundle(conn, build_root, components, metadata_fields)
            _swap_in(build_root, export_root)
        except BaseException:
            shutil.rmtree(build_root, ignore_errors=True)
            raise
        return {
            "export_root": str(export_root),
            "component_count": summary["component_count"],
            "category_count": summary["category_count"],
            "sqlite_path": str(export_root / "Prism.sqlite"),
            "linux_dbl": str(export_root / DBL_LINUX_FILENAME),
            "windows_dbl": str(export_root / DBL_WINDOWS_FILENAME),
            "sym_lib_table": str(export_root / "sym-lib-table"),
            "fp_lib_table": str(export_root / "fp-lib-table"),
            "model_count": summary["model_count"],
            "missing_models": summary["missing_models"],
        }

    def _write_bundle(
        self,
        conn: Any,
        export_root: Path,
        components: list[dict[str, Any]],
        metadata_fields: list[dict[str, Any]],
    ) -> dict[str, Any]:
        (export_root / "SchLib").mkdir(parents=True, exist_ok=True)
        (export_root / "PcbLib").mkdir(parents=True, exist_ok=True)

        components = sorted(components, key=lambda c: (c["category"], c["mpn"], c["id"]))
        # Harness attributes (System Builder §16.1) describe wiring parts, not KiCad symbols.
        custom_fields = [
            field
            for field in metadata_fields
            if field["storage_kind"] == "extra"
            and field["key"] not in DBL_COMMON_COLUMNS
            and field.get("group") != HARNESS_GROUP
        ]
        effective_columns = (*DBL_COMMON_COLUMNS, *(field["key"] for field in custom_fields))
        db_path = export_root / "Prism.sqlite"
        part_numbers = dbl_part_numbers(components)
        grouped_rows: dict[str, list[dict[str, str]]] = {}
        exported_models: dict[str, str] = {}
        missing_models: list[dict[str, Any]] = []

        marks = status_marks_for([component["id"] for component in components])
        for component in components:
            part_number = part_numbers[str(component["id"])]
            category = component["category"] or "Uncategorized"
            grouped_rows.setdefault(category, []).append(
                dbl_row_for_component(component, part_number, custom_fields, marks.get(component["id"], ""))
            )
            self.collect_dbl_assets(conn, component, part_number, export_root, exported_models, missing_models)
        self.collect_released_models(conn, export_root, exported_models, missing_models)
        # The current revision's models are seen again through its release
        # record, and an unchanged model is shared by every later revision:
        # report each stored model once, at the first revision that names it.
        reported: set[str] = set()
        unique_missing_models: list[dict[str, Any]] = []
        for entry in missing_models:
            if entry["asset_id"] not in reported:
                reported.add(entry["asset_id"])
                unique_missing_models.append(entry)

        with sqlite3.connect(db_path) as dbl_conn:
            for category, rows in sorted(grouped_rows.items()):
                table = quote_identifier(category)
                columns_sql = ", ".join(
                    f"{quote_identifier(column)} TEXT NOT NULL DEFAULT ''" for column in effective_columns
                )
                dbl_conn.execute(f"CREATE TABLE {table} ({columns_sql})")
                column_names = ", ".join(quote_identifier(column) for column in effective_columns)
                placeholders = ", ".join("?" for _ in effective_columns)
                for row in rows:
                    dbl_conn.execute(
                        f"INSERT INTO {table} ({column_names}) VALUES ({placeholders})",
                        tuple(row.get(column, "") for column in effective_columns),
                    )

        fields = [
            {
                "column": column,
                "name": column,
                "visible_on_add": False,
                "visible_in_chooser": column not in {"LibSymbol", "LibFootprint"},
                "show_name": True,
                "inherit_properties": True,
            }
            for column in effective_columns
            if column != DBL_KEY_COLUMN
        ]
        libraries = [
            {
                "name": category,
                "table": category,
                "key": DBL_KEY_COLUMN,
                "symbols": "LibSymbol",
                "footprints": "LibFootprint",
                "fields": fields,
            }
            for category in sorted(grouped_rows)
        ]
        write_dbl_config(
            export_root,
            filename=DBL_LINUX_FILENAME,
            connection_string=DBL_LINUX_CONNECTION,
            libraries=libraries,
        )
        write_dbl_config(
            export_root,
            filename=DBL_WINDOWS_FILENAME,
            connection_string=DBL_WINDOWS_CONNECTION,
            libraries=libraries,
        )

        symbol_libraries = sorted(path.stem for path in (export_root / "SchLib").glob("*.kicad_sym"))
        # Only libraries actually written: a component's other footprints
        # (non-default representations) are never exported.
        footprint_libraries = sorted(path.stem for path in (export_root / "PcbLib").glob("*.pretty"))
        sym_lines = [
            "(sym_lib_table",
            f'  (lib (name "Prism")(type "Database")(uri "${{PRISM_LIB_DIR}}/{DBL_LINUX_FILENAME}")(options "")(descr ""))',
        ]
        sym_lines.extend(
            f'  (lib (name "{sexpr_string(library)}")(type "KiCad")(uri "${{PRISM_LIB_DIR}}/SchLib/{sexpr_string(library)}.kicad_sym")(options "")(descr "")(hidden))'
            for library in symbol_libraries
        )
        sym_lines.append(")")
        (export_root / "sym-lib-table").write_text("\n".join(sym_lines) + "\n", encoding="utf-8")

        fp_lines = ["(fp_lib_table"]
        fp_lines.extend(
            f'  (lib (name "{sexpr_string(library)}")(type "KiCad")(uri "${{PRISM_LIB_DIR}}/PcbLib/{sexpr_string(library)}.pretty")(options "")(descr ""))'
            for library in footprint_libraries
        )
        fp_lines.append(")")
        (export_root / "fp-lib-table").write_text("\n".join(fp_lines) + "\n", encoding="utf-8")

        return {
            "component_count": len(components),
            "category_count": len(grouped_rows),
            "model_count": len(exported_models),
            "missing_models": unique_missing_models,
        }


def _sibling(export_root: Path, role: str) -> Path:
    """A unique hidden directory next to ``export_root``, on the same filesystem so renames are atomic."""
    return export_root.parent / f".{export_root.name}.{role}-{uuid.uuid4().hex}"


def sweep_leftovers(export_root: Path) -> list[Path]:
    """Remove build and retired siblings an interrupted export left behind.

    Call only while holding the export lock: a running export's build
    directory looks exactly like a leftover.
    """
    removed: list[Path] = []
    for role in ("build", "old"):
        for path in sorted(export_root.parent.glob(f".{export_root.name}.{role}-*")):
            if path.is_dir() and not path.is_symlink():
                shutil.rmtree(path, ignore_errors=True)
                removed.append(path)
    return removed


def _swap_in(build_root: Path, export_root: Path) -> None:
    """Replace ``export_root`` with ``build_root``; the old bundle is restored if the swap fails."""
    if not export_root.exists():
        build_root.rename(export_root)
        return
    retired = _sibling(export_root, "old")
    export_root.rename(retired)
    try:
        build_root.rename(export_root)
    except BaseException:
        retired.rename(export_root)
        raise
    shutil.rmtree(retired, ignore_errors=True)


__all__ = [
    "DBL_COMMON_COLUMNS",
    "DBL_KEY_COLUMN",
    "DBL_EXPORT_LOCK_PREFIX",
    "DBL_LINUX_FILENAME",
    "DBL_MODEL_DIR",
    "DBL_WINDOWS_FILENAME",
    "CatalogDblExport",
    "dbl_footprint_ref",
    "dbl_model_path",
    "dbl_model_relpath",
    "dbl_part_numbers",
    "dbl_row_for_component",
    "dbl_symbol_library_name",
    "sweep_leftovers",
    "part_number_nocolon",
    "quote_identifier",
    "sexpr_string",
    "write_dbl_config",
]
