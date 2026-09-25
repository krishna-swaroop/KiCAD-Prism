"""KiCad database-library (DBL) export of released, placeable components.

The bundle is a SQLite interchange file plus per-platform ``.kicad_dbl``
configs, extracted symbol/footprint libraries, and library tables. Prism's
runtime state stays in PostgreSQL; SQLite is only the delivery format KiCad
reads. Output is byte-stable for an unchanged catalog.
"""

from __future__ import annotations

import json
from pathlib import Path
import re
import shutil
import sqlite3
from typing import Any

from app.services.catalog.normalization import sanitize_name
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


def quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def sexpr_string(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def part_number_nocolon(value: str) -> str:
    cleaned = re.sub(r":+", "_", value.strip())
    cleaned = re.sub(r"\s+", "_", cleaned)
    return cleaned or "PART"


def dbl_symbol_library_name(part_number: str, symbol_asset: dict[str, Any] | None) -> str:
    if not symbol_asset:
        return ""
    raw = f"Prism_{part_number}_{symbol_asset['target_library']}_{symbol_asset['target_name']}"
    return sanitize_name(raw, "Prism_Symbol")


def dbl_row_for_component(
    component: dict[str, Any],
    part_number: str,
    custom_fields: list[dict[str, Any]],
) -> dict[str, str]:
    default_representation = next(
        (item for item in component.get("representations", []) if item.get("is_default")),
        None,
    )
    symbol_asset = default_representation.get("symbol") if default_representation else None
    footprint_asset = default_representation.get("footprint") if default_representation else None
    lib_symbol = ""
    lib_footprint = ""
    if symbol_asset:
        lib_symbol = f"{dbl_symbol_library_name(part_number, symbol_asset)}:{symbol_asset['target_name']}"
    if footprint_asset:
        lib_footprint = f"{footprint_asset['target_library']}:{footprint_asset['target_name']}"
    row = {
        "Part Number": part_number,
        "Part Number Nocolon": part_number,
        "Comment": component["value"] or component["name"],
        "Value": component["value"],
        "Manufacturer": component["manufacturer"],
        "Manufacturer Part Number": component["mpn"],
        "PackageDescription": component["package_name"],
        "Status": component["workflow_stage"],
        "Part Description": component["description"],
        "Datasheet": component["datasheet_url"],
        "LibSymbol": lib_symbol,
        "LibFootprint": lib_footprint,
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
    ) -> None:
        _, assets = self._placement.placement_assets(conn, component["revision_id"])
        for raw_asset in assets:
            if raw_asset["asset_type"] not in {"symbol", "footprint"}:
                continue
            asset = materialize_asset(raw_asset, assets, component)
            if raw_asset["asset_type"] == "symbol":
                library_name = dbl_symbol_library_name(part_number, asset)
                destination = export_root / "SchLib" / f"{library_name}.kicad_sym"
            else:
                destination = (
                    export_root / "PcbLib" / f"{asset['target_library']}.pretty" / f"{asset['target_name']}.kicad_mod"
                )
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(asset["payload"])

    def export_bundle(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        components: list[dict[str, Any]],
        metadata_fields: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Rebuild the export root from ``components`` (already released and placeable)."""
        export_root = runtime.export_root
        if export_root.exists():
            shutil.rmtree(export_root)
        (export_root / "SchLib").mkdir(parents=True, exist_ok=True)
        (export_root / "PcbLib").mkdir(parents=True, exist_ok=True)

        components = sorted(components, key=lambda c: (c["category"], c["mpn"], c["id"]))
        custom_fields = [
            field
            for field in metadata_fields
            if field["storage_kind"] == "extra" and field["key"] not in DBL_COMMON_COLUMNS
        ]
        effective_columns = (*DBL_COMMON_COLUMNS, *(field["key"] for field in custom_fields))
        db_path = export_root / "Prism.sqlite"
        used_part_numbers: set[str] = set()
        grouped_rows: dict[str, list[dict[str, str]]] = {}

        for component in components:
            base_part = part_number_nocolon(component["mpn"] or component["value"] or component["id"])
            part_number = base_part
            counter = 2
            while part_number in used_part_numbers:
                part_number = f"{base_part}_{counter}"
                counter += 1
            used_part_numbers.add(part_number)
            category = component["category"] or "Uncategorized"
            grouped_rows.setdefault(category, []).append(
                dbl_row_for_component(component, part_number, custom_fields)
            )
            self.collect_dbl_assets(conn, component, part_number, export_root)

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
        footprint_libraries = sorted(
            {
                asset["target_library"]
                for component in components
                for asset in component["assets"]
                if asset["asset_type"] == "footprint"
            }
        )
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
            "export_root": str(export_root),
            "component_count": len(components),
            "category_count": len(grouped_rows),
            "sqlite_path": str(db_path),
            "linux_dbl": str(export_root / DBL_LINUX_FILENAME),
            "windows_dbl": str(export_root / DBL_WINDOWS_FILENAME),
            "sym_lib_table": str(export_root / "sym-lib-table"),
            "fp_lib_table": str(export_root / "fp-lib-table"),
        }


__all__ = [
    "DBL_COMMON_COLUMNS",
    "DBL_KEY_COLUMN",
    "DBL_LINUX_FILENAME",
    "DBL_WINDOWS_FILENAME",
    "CatalogDblExport",
    "dbl_row_for_component",
    "dbl_symbol_library_name",
    "part_number_nocolon",
    "quote_identifier",
    "sexpr_string",
    "write_dbl_config",
]
