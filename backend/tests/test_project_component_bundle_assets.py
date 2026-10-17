"""Catalog asset extraction from a project's design bundle (CATALOG_IMPORT, C7b).

With ``PRISM_DESIGN_SOURCE_CATALOG_IMPORT=bundle`` the project component import
reads a revision's parse projections instead of walking a checkout:
``occurrences`` joins a component to its symbol and footprint, ``placements``
gives a footprint's library link and models, and ``project`` names the
project's own library tables and resolves every model. These tests build a
stored bundle with the ``prism-kicad`` stub's canonical zip writer and drive
``backend/app/services/project_component_bundle_assets.py`` through it, one test
per bug: a sibling board is never read, the symbol and footprint come from the
project's library tables (an ``extends`` symbol included), a library outside
the repository falls back with a finding, models resolve from repository,
embedded and missing targets, the payloads carry real format headers, the
board fallback strips the board-only pad and property data, a land-pattern
conflict is separated from a cosmetic difference, and the switch never opens a
bundle under ``legacy`` or a pending member.
"""

from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest import mock

from app.core.config import settings
from app.services.catalog.kicad_embedded_files import (
    compress_model,
    embedded_file_form,
    embedded_model_name,
    original_model_name,
)
from app.services import kicad_footprint_normalizer
from app.services.design_bundle import reader
from app.services.design_bundle.archive import open_archive
from app.services.design_bundle.consumer import BundleRead
from app.services.design_bundle.generator import bundle_key
from app.services.design_bundle.manifest import Readiness
from app.services.design_bundle.reader import OpenedRevision
from app.services.kicad_library_reader import form_end
from app.services.project_component_asset_extractor import (
    ContentAddressedAssetStager,
    footprint_land_pattern,
)
from app.services.project_component_bundle_assets import (
    BUNDLE_MEMBER_PATHS,
    OCCURRENCES_PATH,
    PLACEMENTS_PATH,
    PROJECT_PATH,
    ProjectBundleAssetIndex,
    flatten_symbol_definition,
)
from app.services.project_component_import_service import (
    _merge_proposal,
    _proposal,
    run_project_import_session,
)
from support import prism_kicad_stub as stub

EXAMPLES = Path(__file__).resolve().parents[2] / "native" / "contracts" / "prism" / "examples"
GENERATOR = json.loads((EXAMPLES / "CliVersionA0.example.json").read_text(encoding="utf-8"))
REVISION_KEY = "a" * 64
GENERATOR_DIGEST = "d" * 64
PROJECT_ID = "prj_demo"
COMMIT = "c" * 40

SYMBOL_UUID = "11111111-1111-1111-1111-111111111111"
FP_UUID = "22222222-2222-2222-2222-222222222222"
SHEET_PATH = "/aaaaaaaa-1111-1111-1111-111111111111"
KIID_PATH = f"{SHEET_PATH}/{SYMBOL_UUID}"

LIBRARY_VERSION = "20250114"
FOOTPRINT_LIBRARY_VERSION = "20241229"
BOARD_VERSION = "20260206"

EMBED_DATA = b"ISO-10303-21;\nembedded controller model\nEND-ISO-10303-21;\n"
EMBED_NAME = embedded_model_name("embedded_controller.step", EMBED_DATA)
REPOSITORY_MODEL = "${KIPRJMOD}/models/controller.step"
EMBEDDED_MODEL = f"kicad-embed://{EMBED_NAME}"
MISSING_MODEL = "${MISSING_VAR}/absent.step"

SYMBOL_LIBRARY = f"""(kicad_symbol_lib (version {LIBRARY_VERSION}) (generator "eeschema")
  (symbol "Base"
    (exclude_from_sim no)
    (in_bom yes)
    (on_board yes)
    (property "Reference" "U" (at 0 0 0) (effects (font (size 1.27 1.27))))
    (property "Value" "Base" (at 0 0 0) (effects (font (size 1.27 1.27))))
    (symbol "Base_0_1"
      (rectangle (start -5 -5) (end 5 5) (stroke (width 0) (type default)) (fill (type none)))
    )
    (symbol "Base_1_1"
      (pin input line (at -7.62 0 0) (length 2.54)
        (name "IN" (effects (font (size 1.27 1.27))))
        (number "1" (effects (font (size 1.27 1.27))))
      )
    )
  )
  (symbol "Controller"
    (extends "Base")
    (property "Reference" "U" (at 0 0 0) (effects (font (size 1.27 1.27))))
    (property "Value" "Controller" (at 0 0 0) (effects (font (size 1.27 1.27))))
  )
)
"""

FOOTPRINT_LIBRARY = f"""(footprint "Controller_QFN"
  (version {FOOTPRINT_LIBRARY_VERSION})
  (generator "pcbnew")
  (layer "F.Cu")
  (descr "Acme Controller QFN")
  (property "Reference" "REF**" (at 0 0 0) (layer "F.SilkS") (effects (font (size 1 1))))
  (property "Value" "Controller_QFN" (at 0 0 0) (layer "F.Fab") (effects (font (size 1 1))))
  (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu" "F.Paste" "F.Mask"))
  (pad "2" smd rect (at 2 0) (size 1 1) (layers "F.Cu" "F.Paste" "F.Mask"))
)
"""

SCHEMATIC = f"""(kicad_sch (version {LIBRARY_VERSION}) (generator "eeschema")
  (lib_symbols
    (symbol "Acme:Controller"
      (property "Reference" "U" (at 0 0 0) (effects (font (size 1.27 1.27))))
      (property "Value" "Controller" (at 0 0 0) (effects (font (size 1.27 1.27))))
      (symbol "Controller_0_1"
        (rectangle (start -5 -5) (end 5 5) (stroke (width 0) (type default)) (fill (type none)))
      )
      (symbol "Controller_1_1"
        (pin input line (at -7.62 0 0) (length 2.54)
          (name "IN" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
  (symbol
    (lib_id "Acme:Controller")
    (at 100 100 0)
    (unit 1)
    (uuid "{SYMBOL_UUID}")
    (property "Reference" "U12" (at 0 0 0) (effects (font (size 1.27 1.27))))
    (property "Value" "Controller" (at 0 0 0) (effects (font (size 1.27 1.27))))
  )
)
"""

CONFIG = {
    "schema": "prism.revision_key.effective_config.a1",
    "project_file": "demo.kicad_pro",
    "root_schematic": "demo.kicad_sch",
    "board": "demo.kicad_pcb",
    "excluded_dirs": [],
}

COMPONENT = {
    "componentUid": "cmp-1",
    "reference": "U12",
    "value": "Controller",
    "footprint": "Acme:Controller_QFN",
    "fields": {
        "Manufacturer": "Acme",
        "Manufacturer Part Number": "ACME-CTRL-1",
        "Description": "Acme controller",
    },
    "schematicRefs": [{"symbolUuid": SYMBOL_UUID}],
    "pcbRefs": [{"footprintUuid": FP_UUID}],
}


def board_text(*, embedded: bytes | None = EMBED_DATA, pad_one_size: str = "1 1") -> str:
    """A board holding the placed controller, with its embedded model data."""

    embedded_block = ""
    if embedded is not None:
        form = embedded_file_form(EMBED_NAME, embedded, compress_model(embedded), "\t\t", "\t")
        embedded_block = f"\t\t(embedded_files\n{form}\t\t)\n"
    return (
        f'(kicad_pcb (version {BOARD_VERSION}) (generator "pcbnew")\n'
        "\t(general (thickness 1.6))\n"
        '\t(footprint "Acme:Controller_QFN"\n'
        '\t\t(layer "F.Cu")\n'
        "\t\t(at 10 20)\n"
        f'\t\t(uuid "{FP_UUID}")\n'
        '\t\t(property "Reference" "U12" (at 0 0 0) (layer "F.SilkS") (effects (font (size 1 1))))\n'
        '\t\t(property "Value" "Controller_QFN" (at 0 0 0) (layer "F.Fab") (effects (font (size 1 1))))\n'
        '\t\t(property "Sheetname" "Root" (at 0 0 0) (layer "F.Fab") (effects (font (size 1 1))))\n'
        '\t\t(property "Sheetfile" "demo.kicad_sch" (at 0 0 0) (layer "F.Fab") (effects (font (size 1 1))))\n'
        f'\t\t(pad "1" smd rect (at 0 0) (size {pad_one_size}) (layers "F.Cu" "F.Paste" "F.Mask") '
        '(net 1 "VCC") (pinfunction "V") (pintype "power_in") '
        "(teardrops (best_length_ratio 0.5)) (uuid \"pad-1\"))\n"
        '\t\t(pad "2" smd rect (at 2 0) (size 1 1) (layers "F.Cu" "F.Paste" "F.Mask") '
        '(net 2 "GND") (pinfunction "G") (pintype "input") (uuid "pad-2"))\n'
        f'\t\t(model "{REPOSITORY_MODEL}" (offset (xyz 0 0 0)) (scale (xyz 1 1 1)) (rotate (xyz 0 0 0)))\n'
        f'\t\t(model "{EMBEDDED_MODEL}" (offset (xyz 0 0 0)) (scale (xyz 1 1 1)) (rotate (xyz 0 0 0)))\n'
        f"{embedded_block}"
        "\t)\n"
        ")\n"
    )


#: A sibling copy of the same part, in another board a directory walk would find.
SIBLING_BOARD = """(kicad_pcb (version 20260206) (generator "pcbnew")
  (footprint "Acme:Controller_QFN"
    (layer "F.Cu")
    (at 0 0)
    (uuid "33333333-3333-3333-3333-333333333333")
    (property "Reference" "U12" (at 0 0 0) (layer "F.SilkS"))
    (pad "1" smd rect (at 0 0) (size 9 9) (layers "F.Cu") (net 1 "OTHER"))
  )
)
"""


def default_sources() -> dict[str, str]:
    board = board_text()
    return {
        "demo.kicad_pro": "{}\n",
        "demo.kicad_sch": SCHEMATIC,
        "demo.kicad_pcb": board,
        "lib/Acme.kicad_sym": SYMBOL_LIBRARY,
        "lib/Acme.pretty/Controller_QFN.kicad_mod": FOOTPRINT_LIBRARY,
        "models/controller.step": "ISO-10303-21;\nrepository model\n",
        "sibling/other.kicad_pcb": SIBLING_BOARD,
    }


def board_span(text: str) -> tuple[int, int]:
    start = text.index('(footprint "Acme:Controller_QFN"')
    end = form_end(text, start)
    assert end is not None
    return start, end - start


def model(path: str) -> dict:
    return {
        "path": path,
        "hidden": False,
        "offset": {"xNm": 0, "yNm": 0, "zNm": 0},
        "rotation": {"xDeg": 0, "yDeg": 0, "zDeg": 0},
        "scale": {"x": 1, "y": 1, "z": 1},
    }


def occurrences_doc() -> dict:
    return {
        "schema": "prism.occurrences.a0",
        "sheets": [
            {
                "sheetPath": SHEET_PATH,
                "dnp": False,
                "excludeFromBom": False,
                "excludeFromBoard": False,
                "excludeFromSim": False,
                "variants": [],
            }
        ],
        "symbols": [
            {
                "kiidPath": KIID_PATH,
                "sheetPath": SHEET_PATH,
                "symbolUuid": SYMBOL_UUID,
                "documentPath": "demo.kicad_sch",
                "libId": "Acme:Controller",
                "reference": "U12",
                "instanceMatched": True,
                "unit": 1,
                "dnp": False,
                "excludeFromBom": False,
                "excludeFromBoard": False,
                "excludeFromSim": False,
                "excludeFromPosFiles": False,
                "properties": {"Reference": "U12", "Value": "Controller"},
                "bomFields": {"value": "Controller"},
                "variants": [],
            }
        ],
        "footprints": [
            {
                "uuid": FP_UUID,
                "documentPath": "demo.kicad_pcb",
                "reference": "U12",
                "dnp": False,
                "excludeFromBom": False,
                "excludeFromPosFiles": False,
                "variants": [],
            }
        ],
        "references": [{"reference": "U12", "symbols": [KIID_PATH], "footprints": [FP_UUID]}],
        "variantDeclarations": [],
    }


def placements_doc(span: tuple[int, int]) -> dict:
    return {
        "schema": "prism.placements.a0",
        "footprints": [
            {
                "uuid": FP_UUID,
                "reference": "U12",
                "libId": "Acme:Controller_QFN",
                "side": "front",
                "positionNm": {"xNm": 10000000, "yNm": 20000000},
                "rotationDeg": 0,
                "dnp": False,
                "excludeFromPosFiles": False,
                "pads": [{"number": "1", "type": "smd", "shape": "rect",
                          "positionNm": {"xNm": 0, "yNm": 0}, "size": {"xNm": 1000000, "yNm": 1000000}}],
                "models": [model(REPOSITORY_MODEL), model(EMBEDDED_MODEL), model(MISSING_MODEL)],
                "sourceSpan": {"offsetBytes": span[0], "lengthBytes": span[1]},
            }
        ],
        "designators": ["U12"],
    }


def project_doc(
    *,
    symbol_target: dict | None = None,
    footprint_target: dict | None = None,
) -> dict:
    symbol_target = symbol_target or {
        "kind": "repository",
        "path": "lib/Acme.kicad_sym",
        "base": "project-directory",
        "inSources": True,
    }
    footprint_target = footprint_target or {
        "kind": "repository",
        "path": "lib/Acme.pretty",
        "base": "project-directory",
        "inSources": True,
    }
    references: list[dict] = []
    if symbol_target is not None:
        references.append({
            "kind": "symbol-library",
            "documentPath": "sym-lib-table",
            "libraryName": "Acme",
            "raw": "${KIPRJMOD}/lib/Acme.kicad_sym",
            "variables": [],
            "target": symbol_target,
        })
    if footprint_target is not None:
        references.append({
            "kind": "footprint-library",
            "documentPath": "fp-lib-table",
            "libraryName": "Acme",
            "raw": "${KIPRJMOD}/lib/Acme.pretty",
            "variables": [],
            "target": footprint_target,
        })
    references.extend([
        {
            "kind": "model-3d",
            "documentPath": "demo.kicad_pcb",
            "raw": REPOSITORY_MODEL,
            "variables": ["KIPRJMOD"],
            "target": {
                "kind": "repository",
                "path": "models/controller.step",
                "base": "project-variable",
                "inSources": True,
            },
        },
        {
            "kind": "model-3d",
            "documentPath": "demo.kicad_pcb",
            "raw": EMBEDDED_MODEL,
            "variables": [],
            "target": {
                "kind": "embedded",
                "name": EMBED_NAME,
                "documentPath": "demo.kicad_pcb",
                "footprintUuid": FP_UUID,
                "fileType": "model",
            },
        },
        {
            "kind": "model-3d",
            "documentPath": "demo.kicad_pcb",
            "raw": MISSING_MODEL,
            "variables": ["MISSING_VAR"],
            "target": {"kind": "unresolved", "reason": "undefined-variable", "variable": "MISSING_VAR"},
        },
    ])
    return {
        "schema": "prism.project.a0",
        "projectFile": "demo.kicad_pro",
        "projectName": "demo",
        "textVariables": {},
        "netClasses": [],
        "documents": [
            {"path": "demo.kicad_sch", "kind": "root-schematic", "properties": {}},
            {"path": "demo.kicad_pcb", "kind": "board", "properties": {}},
        ],
        "references": references,
    }


def source_role(path: str) -> str:
    name = path.rsplit("/", 1)[-1].lower()
    if name in ("fp-lib-table", "sym-lib-table"):
        return "source-library-table"
    if name.endswith(".kicad_pro"):
        return "source-project"
    if name.endswith(".kicad_sch"):
        return "source-schematic"
    if name.endswith(".kicad_pcb"):
        return "source-board"
    if name.endswith(".kicad_sym"):
        return "source-symbol-library"
    if name.endswith(".kicad_mod"):
        return "source-footprint"
    return "source-3d-model"


def manifest_for(members: dict[str, bytes], config: dict) -> dict:
    listed = []
    for path, data in sorted(members.items(), key=lambda item: item[0].encode("utf-8")):
        entry = {"path": path, "stage": "parse", "sha256": stub.digest(data), "bytes": len(data)}
        if path.startswith("sources/"):
            entry.update(
                role=source_role(path),
                source={"path": path[len("sources/"):], "kind": "regular", "object_id": stub.blob_id(data)},
            )
        else:
            entry.update(
                role="projection",
                member_schema=next(s["schema"] for s in GENERATOR["member_schemas"] if s["path"] == path),
            )
        listed.append(entry)
    return {
        "schema": "prism.bundle.manifest.a3",
        "generator": GENERATOR,
        "revision_key": REVISION_KEY,
        "bundle_key": bundle_key(REVISION_KEY, GENERATOR),
        "config": config,
        "board_id": "main",
        "stages": {
            "parse": {"status": "complete", "warnings": [], "failed_members": []},
            "board": {"status": "pending", "warnings": [], "failed_members": []},
            "models": {"status": "pending", "warnings": [], "failed_members": []},
        },
        "read_set": {"probes": [], "listings": [], "gitlinks": []},
        "members": listed,
    }


def write_bundle(path: Path, members: dict[str, bytes], config: dict):
    manifest = manifest_for(members, config)
    bundle = stub.compact(manifest) + b"\n"
    entries = [("bundle.json", bundle)] + [(m["path"], members[m["path"]]) for m in manifest["members"]]
    path.write_bytes(stub.zip_bytes(entries))
    return open_archive(path)


class BundleFixture(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.stager = ContentAddressedAssetStager(self.tmp / "staging")
        self.sources = default_sources()
        self.occurrences = occurrences_doc()
        self.placements = placements_doc(board_span(self.sources["demo.kicad_pcb"]))
        self.project = project_doc()

    def read(self) -> BundleRead:
        members: dict[str, bytes] = {
            f"sources/{path}": content.encode("utf-8") for path, content in self.sources.items()
        }
        members[OCCURRENCES_PATH] = (json.dumps(self.occurrences) + "\n").encode("utf-8")
        members[PLACEMENTS_PATH] = (json.dumps(self.placements) + "\n").encode("utf-8")
        members[PROJECT_PATH] = (json.dumps(self.project) + "\n").encode("utf-8")
        archive = write_bundle(self.tmp / "demo.prism", members, CONFIG)
        opened = OpenedRevision(PROJECT_ID, COMMIT, REVISION_KEY, GENERATOR_DIGEST, None, archive, False)
        states = {path: Readiness(path, "ready", "parse") for path in BUNDLE_MEMBER_PATHS}
        return BundleRead(opened, states)

    def extract(self, component: dict | None = None):
        index = ProjectBundleAssetIndex(self.read(), stager=self.stager)
        return index.extract_component_assets(component or COMPONENT)

    @staticmethod
    def by_type(assets: list[dict], asset_type: str) -> dict:
        return next(asset for asset in assets if asset["asset_type"] == asset_type)

    @staticmethod
    def payload(asset: dict) -> str:
        return Path(asset["staged_path"]).read_text(encoding="utf-8")


class ProjectBundleAssetTests(BundleFixture):
    def test_a_sibling_board_with_the_same_reference_is_never_used(self) -> None:
        assets, findings, resolved = self.extract()

        self.assertNotIn("symbol_not_resolved", {finding["code"] for finding in findings})
        footprint = self.by_type(assets, "footprint")
        self.assertEqual(footprint["source_path"], "lib/Acme.pretty/Controller_QFN.kicad_mod")
        self.assertEqual(resolved["footprint_lib_id"], "Acme:Controller_QFN")
        text = self.payload(footprint)
        self.assertIn("(size 1 1)", text)
        self.assertNotIn("(size 9 9)", text)
        self.assertNotIn("OTHER", text)

    def test_symbol_and_footprint_come_from_the_library_table(self) -> None:
        assets, findings, _resolved = self.extract()

        symbol = self.payload(self.by_type(assets, "symbol"))
        self.assertIn('(symbol "Controller"', symbol)
        self.assertIn('(symbol "Controller_0_1"', symbol)
        self.assertIn('(symbol "Controller_1_1"', symbol)
        self.assertIn("(rectangle", symbol)
        self.assertIn("(pin input line", symbol)
        self.assertIn('(property "Value" "Controller"', symbol)
        self.assertNotIn("(extends", symbol)

        footprint = self.payload(self.by_type(assets, "footprint"))
        self.assertEqual(footprint, FOOTPRINT_LIBRARY)
        self.assertNotIn("symbol_library_not_in_repository", {finding["code"] for finding in findings})
        self.assertNotIn("conflicting", {finding["code"] for finding in findings})

    def test_the_extends_symbol_is_flattened_like_a_schematic_cache_copy(self) -> None:
        flattened = flatten_symbol_definition(SYMBOL_LIBRARY, "Controller")
        assert flattened is not None
        self.assertIn('(symbol "Controller"', flattened)
        self.assertIn('(symbol "Controller_0_1"', flattened)
        self.assertIn("(rectangle", flattened)
        self.assertIn("(pin input line", flattened)
        self.assertNotIn("(extends", flattened)
        self.assertIsNone(flatten_symbol_definition(SYMBOL_LIBRARY, "Absent"))

    def test_a_library_outside_the_repository_falls_back_with_a_finding(self) -> None:
        self.project = project_doc(
            symbol_target={"kind": "kicad-library", "variable": "KICAD10_SYMBOL_DIR",
                           "library": "symbol", "relativePath": "Acme.kicad_sym"},
            footprint_target={"kind": "absolute", "path": "/opt/libs/Acme.pretty"},
        )
        assets, findings, _resolved = self.extract()
        codes = {finding["code"] for finding in findings}
        self.assertIn("symbol_library_not_in_repository", codes)
        self.assertIn("footprint_library_not_in_repository", codes)
        symbol = self.payload(self.by_type(assets, "symbol"))
        self.assertIn('(symbol "Controller"', symbol)
        footprint = self.payload(self.by_type(assets, "footprint"))
        self.assertIn('(footprint "Controller_QFN"', footprint)

    def test_models_resolve_from_repository_embedded_and_missing(self) -> None:
        assets, findings, _resolved = self.extract()
        models = {asset["filename"]: asset for asset in assets if asset["asset_type"] == "3dmodel"}

        self.assertEqual(
            Path(models["controller.step"]["staged_path"]).read_bytes(),
            b"ISO-10303-21;\nrepository model\n",
        )
        self.assertEqual(
            Path(models[original_model_name(EMBED_NAME, EMBED_DATA)]["staged_path"]).read_bytes(),
            EMBED_DATA,
        )
        self.assertEqual(
            models[original_model_name(EMBED_NAME, EMBED_DATA)]["filename"],
            "embedded_controller.step",
        )
        self.assertEqual([finding["code"] for finding in findings].count("model_not_resolved"), 1)

    def test_payloads_carry_real_format_headers(self) -> None:
        assets, _findings, _resolved = self.extract()
        symbol = self.payload(self.by_type(assets, "symbol"))
        self.assertIn(f"(version {LIBRARY_VERSION})", symbol)
        self.assertNotIn("(version 20231120)", symbol)
        footprint = self.payload(self.by_type(assets, "footprint"))
        self.assertIn(f"(version {FOOTPRINT_LIBRARY_VERSION})", footprint)

        # The board fallback writes the board's own version, not a fixed one.
        self.project = project_doc(
            footprint_target={"kind": "absolute", "path": "/opt/libs/Acme.pretty"},
        )
        assets, _findings, _resolved = self.extract()
        fallback = self.payload(self.by_type(assets, "footprint"))
        self.assertIn(f"(version {BOARD_VERSION})", fallback)
        self.assertNotIn("(version 20240108)", fallback)

    def test_the_board_fallback_strips_board_only_pad_and_property_data(self) -> None:
        self.project = project_doc(
            footprint_target={"kind": "absolute", "path": "/opt/libs/Acme.pretty"},
        )
        assets, findings, _resolved = self.extract()
        self.assertIn("footprint_library_not_in_repository", {finding["code"] for finding in findings})
        fallback = self.payload(self.by_type(assets, "footprint"))
        for board_only in ("pinfunction", "pintype", "teardrops", "Sheetname", "Sheetfile", "(net ", "(uuid "):
            self.assertNotIn(board_only, fallback)
        self.assertIn('(property "Reference" "REF**"', fallback)
        self.assertIn('(pad "1" smd rect (at 0 0) (size 1 1)', fallback)

    def test_a_rotated_board_fallback_is_returned_to_zero_degrees(self) -> None:
        self.project = project_doc(
            footprint_target={"kind": "absolute", "path": "/opt/libs/Acme.pretty"},
        )
        self.sources["demo.kicad_pcb"] = board_text().replace("\t\t(at 10 20)\n", "\t\t(at 10 20 90)\n")
        self.placements = placements_doc(board_span(self.sources["demo.kicad_pcb"]))
        seen: list[bytes] = []

        def normalize(payload: bytes, _name: str) -> kicad_footprint_normalizer.NormalizedFootprint:
            seen.append(payload)
            return kicad_footprint_normalizer.NormalizedFootprint(
                payload=payload.replace(b"(at 0 0 90)", b""), changed=True, rotated=True, rotation_degrees=90.0
            )

        with mock.patch.object(kicad_footprint_normalizer, "normalize_footprint", side_effect=normalize):
            assets, findings, _resolved = self.extract()

        # The placement angle reaches the normalizer; the position does not.
        self.assertIn(b"(at 0 0 90)", seen[0])
        self.assertNotIn(b"(at 10 20", seen[0])
        self.assertIn("footprint_rotation_normalized", {finding["code"] for finding in findings})
        self.assertNotIn("(at 0 0 90)", self.payload(self.by_type(assets, "footprint")))

    def test_a_board_land_pattern_change_is_reported(self) -> None:
        self.sources["demo.kicad_pcb"] = board_text(pad_one_size="3 3")
        self.placements = placements_doc(board_span(self.sources["demo.kicad_pcb"]))
        _assets, findings, _resolved = self.extract()
        self.assertIn("footprint_modified_on_board", {finding["code"] for finding in findings})


class LandPatternTests(BundleFixture):
    def test_a_cosmetic_difference_is_not_a_land_pattern_difference(self) -> None:
        cosmetic = FOOTPRINT_LIBRARY.replace(
            '(descr "Acme Controller QFN")',
            '(descr "changed")\n'
            '  (fp_line (start -6 -6) (end 6 -6) (layer "F.CrtYd") (stroke (width 0.05) (type solid)))\n'
            '  (model "${KIPRJMOD}/models/other.step")',
        ).replace("(version 20241229)", "(version 20260101)")
        self.assertEqual(
            footprint_land_pattern(FOOTPRINT_LIBRARY.encode()),
            footprint_land_pattern(cosmetic.encode()),
        )

    def test_a_pad_change_is_a_land_pattern_difference(self) -> None:
        base = FOOTPRINT_LIBRARY
        changed = base.replace('(pad "2" smd rect (at 2 0) (size 1 1)', '(pad "2" smd rect (at 2 0) (size 2 2)')
        self.assertNotEqual(footprint_land_pattern(base.encode()), footprint_land_pattern(changed.encode()))

    def _asset(self, name: str, payload: str) -> dict:
        path = self.tmp / name
        path.write_text(payload, encoding="utf-8")
        return {
            "asset_type": "footprint",
            "filename": name,
            "staged_path": str(path),
            "sha256": hashlib.sha256(payload.encode()).hexdigest(),
        }

    def test_merge_blocks_a_land_pattern_conflict_and_warns_on_a_cosmetic_one(self) -> None:
        changed = FOOTPRINT_LIBRARY.replace(
            '(pad "2" smd rect (at 2 0) (size 1 1)', '(pad "2" smd rect (at 2 0) (size 2 2)'
        )
        cosmetic = FOOTPRINT_LIBRARY.replace("(descr \"Acme Controller QFN\")", "(descr \"changed\")")

        conflict = _proposal(COMPONENT, project_id="p1", source_revision="r1",
                             assets=[self._asset("a.kicad_mod", FOOTPRINT_LIBRARY)])
        _merge_proposal(conflict, _proposal(COMPONENT, project_id="p2", source_revision="r2",
                                            assets=[self._asset("b.kicad_mod", changed)]))
        conflict_codes = {finding["code"] for finding in conflict["findings"]}
        self.assertIn("conflicting_footprint_land_pattern", conflict_codes)
        self.assertEqual(conflict["assets"][0]["filename"], "a.kicad_mod")
        self.assertTrue(
            any("p1" in finding["message"] and "p2" in finding["message"]
                for finding in conflict["findings"] if finding["code"] == "conflicting_footprint_land_pattern")
        )

        variant = _proposal(COMPONENT, project_id="p1", source_revision="r1",
                            assets=[self._asset("c.kicad_mod", FOOTPRINT_LIBRARY)])
        _merge_proposal(variant, _proposal(COMPONENT, project_id="p2", source_revision="r2",
                                           assets=[self._asset("d.kicad_mod", cosmetic)]))
        variant_codes = {finding["code"] for finding in variant["findings"]}
        self.assertIn("footprint_variants_cosmetic", variant_codes)
        self.assertNotIn("conflicting_footprint_land_pattern", variant_codes)
        self.assertEqual(variant["assets"][0]["filename"], "c.kicad_mod")


class SwitchTests(BundleFixture):
    @contextmanager
    def _session(self, *, resolved_commit: str | None):
        session = {
            "id": "session-1",
            "scope": "project",
            "selection": {},
            "project_ids": ["project-1"],
            "project_revisions": {"project-1": resolved_commit or ""},
            "created_by": "importer@example.com",
        }

        @contextmanager
        def project_file_for_revision(*_args: object, **_kwargs: object):
            yield self.tmp / "demo.kicad_pro", resolved_commit

        with (
            mock.patch("app.services.project_component_import_service.catalog_service") as catalog,
            mock.patch(
                "app.services.project_component_import_service.project_service.get_project_by_id",
                return_value={"id": "project-1"},
            ),
            mock.patch(
                "app.services.project_component_import_service.semantic_index_service.get_or_build",
                return_value={"components": [COMPONENT]},
            ),
            mock.patch(
                "app.services.project_component_import_service.semantic_index_service._project_file_for_revision",
                side_effect=project_file_for_revision,
            ),
            mock.patch(
                "app.services.project_component_import_service.build_project_asset_index"
            ) as build_index,
        ):
            catalog.get_project_import_session.return_value = session
            catalog.store_root = self.tmp / "catalog"
            build_index.return_value.extract_component_assets.return_value = ([], [], {})
            yield {"catalog": catalog, "build_index": build_index}

    def test_legacy_never_opens_a_bundle(self) -> None:
        with self._session(resolved_commit=COMMIT) as env:
            with (
                mock.patch.object(settings, "PRISM_DESIGN_SOURCE_CATALOG_IMPORT", "legacy"),
                mock.patch.object(reader, "open_revision") as open_revision,
            ):
                run_project_import_session("session-1")
            open_revision.assert_not_called()
            env["build_index"].assert_called_once()

    def test_a_working_tree_request_never_opens_a_bundle(self) -> None:
        with self._session(resolved_commit=None) as env:
            with (
                mock.patch.object(settings, "PRISM_DESIGN_SOURCE_CATALOG_IMPORT", "bundle"),
                mock.patch.object(reader, "open_revision") as open_revision,
            ):
                run_project_import_session("session-1")
            open_revision.assert_not_called()
            env["build_index"].assert_called_once()

    def test_a_pending_member_falls_back_to_legacy(self) -> None:
        opened = OpenedRevision(PROJECT_ID, COMMIT, REVISION_KEY, GENERATOR_DIGEST, None, None, True)
        with self._session(resolved_commit=COMMIT) as env:
            with (
                mock.patch.object(settings, "PRISM_DESIGN_SOURCE_CATALOG_IMPORT", "bundle"),
                mock.patch.object(reader, "open_revision", return_value=opened),
            ):
                run_project_import_session("session-1")
            env["build_index"].assert_called_once()

    def test_a_ready_bundle_sources_the_assets_without_the_checkout(self) -> None:
        opened = self.read().opened
        with self._session(resolved_commit=COMMIT) as env:
            with (
                mock.patch.object(settings, "PRISM_DESIGN_SOURCE_CATALOG_IMPORT", "bundle"),
                mock.patch.object(reader, "open_revision", return_value=opened),
            ):
                run_project_import_session("session-1")
            env["build_index"].assert_not_called()
        proposals = env["catalog"].stage_project_import_proposals.call_args.args[1]
        self.assertEqual(len(proposals), 1)
        asset_types = {asset["asset_type"] for asset in proposals[0]["assets"]}
        self.assertEqual(asset_types, {"symbol", "footprint", "3dmodel"})


if __name__ == "__main__":
    unittest.main()
