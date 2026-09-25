from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "import_database_library.py"
SPEC = importlib.util.spec_from_file_location("prism_database_importer", SCRIPT)
assert SPEC and SPEC.loader
importer = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = importer
SPEC.loader.exec_module(importer)


def _symbol(name: str):
    return importer.SymbolLibrary("Raw", "Symbols", Path("symbols.kicad_sym"), "", "", "", [], {}, {})


def _footprint(name: str):
    return importer.FootprintAsset("Raw", "Footprints", name, Path(f"{name}.kicad_mod"))


def _row(
    *, rowid: int, ipn: str, mpn: str, symbol: str, footprint: str,
    package: str = "SOIC", table: str = "Parts",
):
    identity_kind = "mpn" if mpn else "provisional_ipn"
    return importer.ImportRowPlan(
        table=table,
        rowid=rowid,
        part_number=ipn,
        import_name=ipn,
        metadata={
            "name": ipn,
            "value": "value",
            "description": "description",
            "datasheet_url": "https://example.test/datasheet",
            "manufacturer": "Acme",
            "mpn": mpn,
            "normalized_manufacturer": "acme",
            "normalized_mpn": mpn.casefold(),
            "normalized_part_number": (mpn or ipn).casefold(),
            "mpn_source": "manufacturer" if mpn else "provisional_ipn",
            "identity_kind": identity_kind,
            "identity_source": "manufacturer_mpn" if mpn else "cern:test",
            "category": "Test",
            "package_name": package,
            "extra_fields": {},
        },
        symbol_library=_symbol(symbol),
        symbol_name=symbol,
        footprint_asset=_footprint(footprint),
    )


def _summary(groups):
    return [
        (
            group.key,
            group.metadata["name"],
            [
                (representation.label, representation.source_ipns, representation.is_default)
                for representation in group.representations
            ],
        )
        for group in groups
    ]


def test_alternates_collapse_and_duplicate_pairs_merge_provenance() -> None:
    rows = [
        _row(rowid=3, ipn="IPN-1 [alt]", mpn="LM7815CT", symbol="RegAlt", footprint="TO220"),
        _row(rowid=1, ipn="IPN-1", mpn="LM7815CT", symbol="Reg", footprint="TO220"),
        _row(rowid=2, ipn="IPN-2", mpn="LM7815CT", symbol="Reg", footprint="TO220"),
    ]
    stats = importer.ImportStats()
    groups = importer._group_import_plans(rows, stats=stats)

    assert len(groups) == 1
    assert groups[0].metadata["name"] == "IPN-1"
    assert len(groups[0].representations) == 2
    assert groups[0].representations[0].is_default is True
    assert groups[0].representations[0].source_ipns == ["IPN-1", "IPN-2"]


def test_preflight_is_deterministic_and_missing_mpn_is_provisional() -> None:
    rows = [
        _row(rowid=2, ipn="P-2", mpn="", symbol="S2", footprint="F2"),
        _row(rowid=1, ipn="P-1", mpn="", symbol="S1", footprint="F1"),
    ]
    first = _group(rows)
    second = _group(list(reversed(rows)))
    assert _summary(first) == _summary(second)
    assert all(group.identity_kind == "provisional_ipn" for group in first)
    assert all(group.metadata["mpn"] == "" for group in first)


def _group(rows):
    return importer._group_import_plans(rows, stats=importer.ImportStats())


def test_package_conflicts_are_hard_preflight_errors() -> None:
    stats = importer.ImportStats()
    importer._group_import_plans(
        [
            _row(rowid=1, ipn="P-1", mpn="MPN", symbol="S", footprint="F", package="SOIC"),
            _row(rowid=2, ipn="P-1", mpn="MPN", symbol="S", footprint="F", package="QFN"),
        ],
        stats=stats,
    )
    assert stats.hard_conflicts
    assert "conflicting package names" in stats.hard_conflicts[0]


def test_package_differences_between_representations_are_warnings() -> None:
    stats = importer.ImportStats()
    groups = importer._group_import_plans(
        [
            _row(rowid=1, ipn="P-1", mpn="MPN", symbol="S", footprint="F1", package="Horizontal"),
            _row(rowid=2, ipn="P-2", mpn="MPN", symbol="S", footprint="F2", package="Vertical"),
        ],
        stats=stats,
    )
    assert len(groups[0].representations) == 2
    assert not stats.hard_conflicts
    assert any("package_name differs" in warning for warning in stats.warnings)
