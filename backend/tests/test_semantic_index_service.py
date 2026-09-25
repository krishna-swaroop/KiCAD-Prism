import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app.services import semantic_index_service, semantic_visualizer_service


class SemanticIndexServiceTests(unittest.TestCase):
    def test_reused_sheet_objects_keep_every_instance_path_and_buses(self) -> None:
        wire = SimpleNamespace(uuid="wire-shared")
        label = SimpleNamespace(uuid="label-shared")
        bus = SimpleNamespace(
            uuid="bus-shared",
            points=[(1, 2), (3, 4)],
        )
        schematic = SimpleNamespace(
            wires=[wire],
            junctions=[],
            labels=[label],
            global_labels=[],
            hierarchical_labels=[],
            symbols=[],
            buses=[bus],
            bus_entries=[],
            bus_aliases=[],
        )

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "Sheets" / "shared.kicad_sch"
            source.parent.mkdir()
            instances = [
                SimpleNamespace(
                    sheet_path=f"/Channel {suffix}/",
                    sheet_path_uuids=f"/{suffix}/",
                    source_path=source,
                    parent_sheet_path_uuids="/",
                    sheet_symbol_uid=f"sheet-{suffix}",
                    sheet_name=f"Channel {suffix}",
                    is_top_level=False,
                    schematic=schematic,
                )
                for suffix in ("a", "b")
            ]
            design = SimpleNamespace(schematic_instances=lambda: instances)
            sheets, buses, placements = (
                semantic_index_service._schematic_semantic_projection(
                    design,
                    root / "board.kicad_pro",
                )
            )

        self.assertEqual(
            [item["sheetInstancePath"] for item in sheets],
            ["/a/", "/b/"],
        )
        self.assertEqual(
            [item["sheetInstancePath"] for item in buses],
            ["/a/", "/b/"],
        )
        refs = semantic_index_service._group_schematic_refs(
            {"wires": ["wire-shared"], "labels": ["label-shared"]},
            placements,
        )
        self.assertEqual(
            [ref["sheetInstancePath"] for ref in refs],
            ["/a/", "/b/"],
        )
        self.assertEqual([ref["labelInstanceCount"] for ref in refs], [1, 1])

    def test_schematic_stage_does_not_materialize_lazy_pcb(self) -> None:
        class FakeDesign:
            def to_netlist(self):
                return SimpleNamespace(components=[], nets=[])

            @property
            def pcb(self):
                raise AssertionError("Stage 1 accessed the PCB")

            def to_json(self, include_indexes=True, *, include_pcb=True):
                self.include_indexes = include_indexes
                self.include_pcb = include_pcb
                return {"components": [], "nets": []}

        design = FakeDesign()
        class FakeKiCadDesign:
            @staticmethod
            def from_project_file(_path):
                return design

        with tempfile.TemporaryDirectory() as temporary, patch.dict(
            sys.modules,
            {"kicad_monkey": SimpleNamespace(KiCadDesign=FakeKiCadDesign)},
        ):
            payload = semantic_index_service.build_semantic_index(
                Path(temporary) / "board.kicad_pro",
                source_revision_key="revision-a",
                include_assembly=False,
                include_pcb=False,
            )

        self.assertFalse(design.include_pcb)
        self.assertEqual(payload["components"], [])

    def test_an_injected_pcb_is_not_reparsed(self) -> None:
        class FakeDesign:
            def __init__(self):
                self._pcb = None

            def to_netlist(self):
                return SimpleNamespace(components=[], nets=[])

            @property
            def pcb(self):
                if self._pcb is not None:
                    return self._pcb
                raise AssertionError("semantic index re-parsed the PCB")

            def to_json(self, include_indexes=True, *, include_pcb=True):
                return {"components": [], "nets": []}

        design = FakeDesign()
        injected = object()

        class FakeKiCadDesign:
            @staticmethod
            def from_project_file(_path):
                return design

        with tempfile.TemporaryDirectory() as temporary, patch.dict(
            sys.modules,
            {"kicad_monkey": SimpleNamespace(KiCadDesign=FakeKiCadDesign)},
        ):
            semantic_index_service.build_semantic_index(
                Path(temporary) / "board.kicad_pro",
                source_revision_key="revision-a",
                include_assembly=False,
                pcb=injected,
            )

        self.assertIs(design._pcb, injected)
        self.assertIs(design.pcb, injected)

    def test_split_nets_fold_into_the_board_net_through_shared_pads(self) -> None:
        # A bus member crossing sheet pins: the board calls it /SIG, the
        # netlist splits it into two sheet-local nets. R1.2 sits on a net the
        # netlist names the same way; R1.1 is on a board-only net; U2.1's net
        # straddles two board nets and must be left alone.
        def net(name, *terminals, wires=()):
            return {
                "name": name,
                "net_class": "Fast",
                "aliases": [],
                "terminals": [{"designator": d, "pin": p} for d, p in terminals],
                "graphical": {
                    "wires": list(wires),
                    "pins": [{"designator": d, "pin": p, "svg_id": f"pin-{d}-{p}"} for d, p in terminals],
                },
            }

        payload = {
            "components": [{"designator": d} for d in ("U1", "J1", "R1", "U2")],
            "nets": [
                net("/Port/SIG", ("U1", "1"), ("U1", "2"), wires=("wire-port",)),
                net("/SOM/SIG", ("J1", "2"), wires=("wire-som",)),
                net("GND", ("R1", "2")),
                net("/Ambiguous", ("U2", "1"), ("U2", "2")),
            ],
        }

        class FakeDesign:
            _pcb = None

            @property
            def pcb(self):
                return self._pcb

            def to_netlist(self):
                return SimpleNamespace(components=[], nets=[])

            def to_json(self, include_indexes=True, *, include_pcb=True):
                return payload

        def pad(number, uuid, name, code):
            return SimpleNamespace(uuid=uuid, number=number, net=SimpleNamespace(name=name, ordinal=code))

        def footprint(reference, uuid, *pads):
            return SimpleNamespace(
                uuid=uuid,
                properties=[SimpleNamespace(name="Reference", value=reference)],
                pads=list(pads),
            )

        board = SimpleNamespace(
            footprints=[
                footprint("U1", "fp-u1", pad("1", "pad-u1-1", "/SIG", 7)),  # U1.2 has no pad
                footprint("J1", "fp-j1", pad("2", "pad-j1-2", "/SIG", 7)),
                footprint("R1", "fp-r1", pad("1", "pad-r1-1", "/ORPHAN", 8), pad("2", "pad-r1-2", "GND", 1)),
                footprint("U2", "fp-u2", pad("1", "pad-u2-1", "/X", 9), pad("2", "pad-u2-2", "/Y", 10)),
            ],
            segments=[SimpleNamespace(uuid="track-sig", net=SimpleNamespace(name="/SIG", ordinal=7))],
            arcs=[],
            vias=[],
            zones=[],
        )

        class FakeKiCadDesign:
            @staticmethod
            def from_project_file(_path):
                return FakeDesign()

        with tempfile.TemporaryDirectory() as temporary, patch.dict(
            sys.modules,
            {"kicad_monkey": SimpleNamespace(KiCadDesign=FakeKiCadDesign)},
        ):
            index = semantic_index_service.build_semantic_index(
                Path(temporary) / "board.kicad_pro",
                source_revision_key="revision-a",
                include_assembly=False,
                pcb=board,
            )

        nets = {entry["name"]: entry for entry in index["nets"]}
        self.assertEqual(
            list(nets),
            ["GND", "/Ambiguous", "/SIG", "/ORPHAN", "/X", "/Y"],
        )
        sig = nets["/SIG"]
        self.assertEqual(sig["aliases"], ["/Port/SIG", "/SOM/SIG"])
        self.assertEqual(sig["netCode"], 7)
        self.assertEqual(sig["netClass"], "Fast")
        self.assertEqual(sig["netUid"], semantic_index_service._stable_uid("net", "/SIG"))
        self.assertEqual(sig["pcbRefs"][0]["padUuids"], ["pad-u1-1", "pad-j1-2"])
        self.assertEqual(sig["pcbRefs"][0]["trackUuids"], ["track-sig"])
        wires = sorted(uuid for ref in sig["schematicRefs"] for uuid in ref["wireUuids"])
        self.assertEqual(wires, ["wire-port", "wire-som"])
        pins = sorted(uuid for ref in sig["schematicRefs"] for uuid in ref["pinUuids"])
        self.assertEqual(pins, ["pin-J1-2", "pin-U1-1", "pin-U1-2"])

        by_name = index["indexes"]["netByName"]
        sig_index = index["nets"].index(sig)
        for name in ("/SIG", "/Port/SIG", "/SOM/SIG"):
            self.assertEqual(by_name[name], sig_index, name)
        self.assertEqual(index["indexes"]["netByNetCode"]["7"], sig_index)
        self.assertEqual(index["indexes"]["netByPcbUuid"]["track-sig"], sig_index)
        self.assertEqual(index["indexes"]["netByPcbUuid"]["pad-j1-2"], sig_index)
        self.assertEqual(index["indexes"]["netBySchematicUuid"]["wire-som"], sig_index)
        self.assertEqual(index["indexes"]["netBySchematicUuid"]["pin-U1-2"], sig_index)
        # Every other index still points at its own record after renumbering.
        self.assertEqual(index["indexes"]["netByName"]["GND"], index["nets"].index(nets["GND"]))
        self.assertEqual(index["indexes"]["netByPcbUuid"]["pad-r1-1"], index["nets"].index(nets["/ORPHAN"]))
        self.assertEqual(index["indexes"]["netBySchematicUuid"]["pin-U2-1"], index["nets"].index(nets["/Ambiguous"]))

        terminals = {f"{t['reference']}.{t['pin']}": t for t in index["terminals"]}
        for pair in ("U1.1", "U1.2", "J1.2"):
            self.assertEqual(terminals[pair]["netName"], "/SIG", pair)
            self.assertEqual(terminals[pair]["netUid"], sig["netUid"], pair)
        self.assertEqual(index["indexes"]["terminalByPcbPadUuid"]["pad-j1-2"], index["terminals"].index(terminals["J1.2"]))
        # The straddling net keeps its wires; its pads belong to the board nets.
        self.assertEqual(nets["/Ambiguous"]["pcbRefs"][0]["padUuids"], [])
        self.assertEqual(nets["/X"]["pcbRefs"][0]["padUuids"], ["pad-u2-1"])
        self.assertNotIn("aliases", nets["/X"])

    def test_upstream_to_json_detaches_the_board_for_a_schematic_build(self) -> None:
        # The default production build is the pip kicad-monkey, whose to_json has
        # no include_pcb switch. Model that shape: the adapter must detach the
        # board so the PnP projection does not lazily parse the whole
        # .kicad_pcb. Pin that the board is dropped and pcb_path cleared, so
        # design.pcb returns None instead of re-parsing.
        class UpstreamDesign:
            def __init__(self):
                self._pcb = "a-parsed-board"
                self.pcb_path = "/somewhere/board.kicad_pcb"
                self.calls = []

            def to_netlist(self):
                return SimpleNamespace(components=[], nets=[])

            @property
            def pcb(self):
                raise AssertionError("the schematic build re-parsed the PCB")

            def to_json(self, include_indexes=True, *, compiled_schematic_graph=None):
                # Pinned upstream signature: no include_pcb keyword.
                self.calls.append("fallback")
                return {"components": [], "nets": []}

        design = UpstreamDesign()

        class FakeKiCadDesign:
            @staticmethod
            def from_project_file(_path):
                return design

        with tempfile.TemporaryDirectory() as temporary, patch.dict(
            sys.modules,
            {"kicad_monkey": SimpleNamespace(KiCadDesign=FakeKiCadDesign)},
        ):
            semantic_index_service.build_semantic_index(
                Path(temporary) / "board.kicad_pro",
                source_revision_key="revision-a",
                include_assembly=False,
                include_pcb=False,
            )

        self.assertEqual(design.calls, ["fallback"])
        self.assertIsNone(design._pcb)
        self.assertIsNone(design.pcb_path)

    def test_upstream_fallback_keeps_an_injected_board(self) -> None:
        # If a caller both injects an already-parsed board and asks for a
        # schematic-only build, the detach must not throw the injected board
        # away: the caller paid to parse it.
        injected = object()

        class UpstreamDesign:
            def __init__(self):
                self._pcb = None
                self.pcb_path = "/somewhere/board.kicad_pcb"

            def to_netlist(self):
                return SimpleNamespace(components=[], nets=[])

            @property
            def pcb(self):
                return self._pcb

            def to_json(self, include_indexes=True, *, compiled_schematic_graph=None):
                return {"components": [], "nets": []}

        design = UpstreamDesign()

        class FakeKiCadDesign:
            @staticmethod
            def from_project_file(_path):
                return design

        with tempfile.TemporaryDirectory() as temporary, patch.dict(
            sys.modules,
            {"kicad_monkey": SimpleNamespace(KiCadDesign=FakeKiCadDesign)},
        ):
            semantic_index_service.build_semantic_index(
                Path(temporary) / "board.kicad_pro",
                source_revision_key="revision-a",
                include_assembly=False,
                include_pcb=False,
                pcb=injected,
            )

        self.assertIs(design._pcb, injected)

    def test_full_bundle_overlay_commits_bundle_json_last(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            staging = root / "staging"
            target = root / "target"
            (staging / "scene-gltf").mkdir(parents=True)
            target.mkdir()
            (target / "bundle.json").write_text('{"stage":"board-ready"}', encoding="utf-8")
            (staging / "scene-gltf" / "scene.manifest.json").write_text(
                '{"schema":"prism.semantic_gltf_a0"}',
                encoding="utf-8",
            )
            (staging / "semantic_geometry.json").write_text(
                '{"schema":"prism.semantic_geometry_a0"}',
                encoding="utf-8",
            )
            (staging / "bundle.json").write_text(
                '{"stage":"semantic-ready"}',
                encoding="utf-8",
            )
            copied: list[str] = []
            original_atomic_copy = semantic_visualizer_service._atomic_copy

            def recording_copy(source: Path, destination: Path) -> None:
                copied.append(source.relative_to(staging).as_posix())
                original_atomic_copy(source, destination)

            with patch.object(
                semantic_visualizer_service,
                "_atomic_copy",
                side_effect=recording_copy,
            ):
                semantic_visualizer_service._overlay_staged_tree(staging, target)

            self.assertEqual(copied[-1], "bundle.json")
            self.assertEqual(
                json.loads((target / "bundle.json").read_text(encoding="utf-8"))["stage"],
                "semantic-ready",
            )
            self.assertTrue((target / "scene-gltf" / "scene.manifest.json").is_file())

    def test_staged_webgpu_bundle_publishes_board_then_components(self) -> None:
        with tempfile.TemporaryDirectory() as temporary, patch.object(
            semantic_visualizer_service,
            "semantic_store_root",
            return_value=Path(temporary) / "semantic-store",
        ):
            root = Path(temporary)
            output = root / "compiler-output"
            geometry = output / "geometry"
            geometry.mkdir(parents=True)
            (geometry / "base_board.glb").write_bytes(b"board")
            project = SimpleNamespace(id="prj_test", name="Demo", display_name="Demo board")
            source_hash = "revision-a"
            target = semantic_visualizer_service.bundle_dir(project.id, source_hash)
            job = {"logs": []}

            semantic_visualizer_service._publish_partial_bundle(
                project,
                output,
                target,
                source_hash,
                "board-ready",
                job,
                lambda: None,
            )

            bundle = json.loads((target / "bundle.json").read_text(encoding="utf-8"))
            semantic = json.loads((target / "semantic_geometry.json").read_text(encoding="utf-8"))
            self.assertEqual(bundle["readiness"]["stage"], "board-ready")
            self.assertEqual(semantic["assets"], {"base_board_glb": "geometry/base_board.glb"})
            self.assertEqual(job["readiness_stage"], "board-ready")
            source_status = semantic_visualizer_service.get_status_for_source(project, source_hash)
            self.assertEqual(source_status["status"], "building")
            self.assertTrue(source_status["available"])
            self.assertIsNotNone(source_status["bundle_url"])

            (geometry / "components.glb").write_bytes(b"components")
            semantic_visualizer_service._publish_partial_bundle(
                project,
                output,
                target,
                source_hash,
                "components-ready",
                job,
                lambda: None,
            )

            bundle = json.loads((target / "bundle.json").read_text(encoding="utf-8"))
            self.assertEqual(bundle["readiness"]["stage"], "components-ready")
            self.assertEqual(
                bundle["readiness"]["available_assets"],
                ["board", "components"],
            )
            self.assertEqual((target / "geometry" / "components.glb").read_bytes(), b"components")

    def test_webgpu_bundle_path_rejects_cache_key_traversal(self) -> None:
        for source_key, build_key in (
            ("../outside", "build-a"),
            ("revision-a", "../../outside"),
            ("revision/a", "build-a"),
        ):
            with self.subTest(source_key=source_key, build_key=build_key):
                with self.assertRaises(ValueError):
                    semantic_visualizer_service.bundle_dir("prj_test", source_key, build_key)

    def test_webgpu_fast_status_reads_metadata_without_scanning_sources(self) -> None:
        project = SimpleNamespace(
            id="prj_test",
            path="/must-not-be-scanned",
            last_modified="revision-7",
        )
        ready = {
            "status": "ready",
            "available": True,
            "sourceRevisionKey": "source-a",
            "build_fingerprint": semantic_visualizer_service.BUILD_FINGERPRINT,
        }
        with patch.object(
            semantic_visualizer_service.jobs,
            "get_webgpu_ready",
            return_value=ready,
        ) as lookup, patch.object(
            semantic_visualizer_service,
            "source_fingerprint",
            side_effect=AssertionError("fast status scanned project sources"),
        ):
            status = semantic_visualizer_service.get_status_fast(project)

        self.assertEqual(status, ready)
        anchor_suffix = semantic_visualizer_service._anchor_selector_suffix(project)
        lookup.assert_called_once_with(
            "prj_test",
            f"workspace:revision-7{anchor_suffix}",
            semantic_visualizer_service.BUILD_FINGERPRINT,
        )

    def test_build_fingerprint_hashes_the_selected_rust_helper(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            helper = root / "prism-kicad-native"
            helper.write_bytes(b"helper-a")
            environment = {
                "PRISM_PCB_GEOMETRY_BACKEND": "rust",
                "PRISM_KICAD_NATIVE_PATH": str(helper),
            }
            with patch.dict(
                semantic_visualizer_service.os.environ,
                environment,
                clear=False,
            ), patch(
                "app.services.semantic_viewer_runtime.find_viewer_repo_root",
                return_value=root,
            ):
                first = semantic_visualizer_service._compute_build_fingerprint()
                helper.write_bytes(b"helper-b")
                second = semantic_visualizer_service._compute_build_fingerprint()

        self.assertNotEqual(first, second)

    def test_webgpu_fast_status_returns_metadata_only_missing_record(self) -> None:
        project = SimpleNamespace(
            id="prj_test",
            path="/must-not-be-scanned",
            last_modified="revision-8",
        )
        with patch.object(
            semantic_visualizer_service.jobs,
            "get_webgpu_ready",
            return_value=None,
        ):
            status = semantic_visualizer_service.get_status_fast(project)

        self.assertEqual(status["status"], "missing")
        self.assertFalse(status["available"])
        self.assertEqual(
            status["status_selector"],
            semantic_visualizer_service.status_selector_for_project(
                project, last_modified="revision-8"
            ),
        )

    def test_webgpu_fast_status_never_invokes_git_for_symbolic_refs(self) -> None:
        project = SimpleNamespace(
            id="prj_test",
            path="/must-not-resolve",
            last_modified="revision-9",
        )
        with patch.object(
            semantic_visualizer_service,
            "_resolve_commit",
            side_effect=AssertionError("fast status must not call git"),
        ), patch.object(
            semantic_visualizer_service.jobs,
            "get_webgpu_ready",
            side_effect=AssertionError("symbolic refs skip exact selector lookup"),
        ):
            status = semantic_visualizer_service.get_status_fast(project, commit="HEAD")

        self.assertEqual(status["status"], "missing")
        self.assertTrue(status["unresolved_ref"])
        self.assertEqual(status["status_selector"], "ref:HEAD")

    def test_webgpu_fast_status_uses_prefix_lookup_for_abbreviated_sha(self) -> None:
        project = SimpleNamespace(
            id="prj_test",
            path="/must-not-resolve",
            last_modified="revision-10",
        )
        ready = {
            "status": "ready",
            "available": True,
            "commit": "abcdef0123456789abcdef0123456789abcdef01",
            "status_selector": "commit:abcdef0123456789abcdef0123456789abcdef01",
        }
        with patch.object(
            semantic_visualizer_service,
            "_resolve_commit",
            side_effect=AssertionError("fast status must not call git"),
        ), patch.object(
            semantic_visualizer_service.jobs,
            "find_webgpu_ready_by_commit_prefix",
            return_value=ready,
        ) as lookup:
            status = semantic_visualizer_service.get_status_fast(
                project,
                commit="abcdef012345",
            )

        self.assertEqual(status, ready)
        lookup.assert_called_once_with(
            "prj_test",
            semantic_visualizer_service.BUILD_FINGERPRINT,
            "abcdef012345",
            selector_suffix=semantic_visualizer_service._anchor_selector_suffix(
                project
            ),
        )

    def test_source_revision_key_ignores_heavy_assets(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            project = root / "board.kicad_pro"
            schematic = root / "board.kicad_sch"
            model = root / "board.glb"
            project.write_text("project-a", encoding="utf-8")
            schematic.write_text("schematic-a", encoding="utf-8")
            model.write_bytes(b"model-a")

            initial = semantic_index_service.source_revision_key_for_project_file(project)
            model.write_bytes(b"model-b")
            self.assertEqual(semantic_index_service.source_revision_key_for_project_file(project), initial)

            schematic.write_text("schematic-b", encoding="utf-8")
            self.assertNotEqual(semantic_index_service.source_revision_key_for_project_file(project), initial)

    def test_build_semantic_index_maps_schematic_and_pcb_identities(self) -> None:
        design_payload = {
            "components": [{
                "designator": "U12",
                "svg_id": "symbol-u12",
                "value": "TPS55289",
                "footprint": "QFN",
                "description": "Buck-boost controller",
                "parameters": {"Manufacturer": "TI", "MPN": "TPS55289"},
                "hierarchy": {"sheet_path": "/Power/", "sheet": "power.kicad_sch"},
            }],
            "nets": [{
                "name": "VBUS",
                "net_class": "Power",
                "graphical": {
                    "wires": ["wire-vbus"],
                    "labels": ["label-vbus"],
                    "junctions": ["junction-vbus"],
                    "ports": [],
                    "power_ports": [],
                    "sheet_entries": [],
                    "pins": [{
                        "designator": "U12",
                        "pin": "5",
                        "source_pin_id": "pin-u12-5",
                    }],
                },
                "terminals": [{"designator": "U12", "pin": "5"}],
            }],
        }

        net_ref = SimpleNamespace(name="VBUS", ordinal=17)
        pad = SimpleNamespace(uuid="pad-u12-5", number="5", net=net_ref)
        footprint = SimpleNamespace(
            uuid="footprint-u12",
            properties=[SimpleNamespace(name="Reference", value="U12")],
            pads=[pad],
        )
        track = SimpleNamespace(uuid="track-vbus", net=net_ref)
        pcb = SimpleNamespace(
            footprints=[footprint],
            segments=[track],
            arcs=[],
            vias=[],
            zones=[],
            resolve_net_name=lambda ref: ref.name,
        )

        class FakeDesign:
            def __init__(self):
                self.pcb = pcb

            def to_json(self, include_indexes=True):
                if not include_indexes:
                    raise AssertionError("semantic index requires kicad-monkey indexes")
                return design_payload

        class FakeKiCadDesign:
            @staticmethod
            def from_project_file(_path):
                return FakeDesign()

        with tempfile.TemporaryDirectory() as temporary, patch.dict(
            sys.modules,
            {"kicad_monkey": SimpleNamespace(KiCadDesign=FakeKiCadDesign)},
        ):
            Path(temporary, "board.kicad_sch").write_text(
                '(kicad_sch (symbol (lib_id "Acme:U12") (uuid "symbol-u12") '
                '(property "Datasheet" "https://example.test/u12.pdf")))',
                encoding="utf-8",
            )
            payload = semantic_index_service.build_semantic_index(
                Path(temporary) / "board.kicad_pro",
                source_revision_key="revision-a",
                include_assembly=False,
            )

        component_index = payload["indexes"]["componentByReference"]["U12"]
        component = payload["components"][component_index]
        self.assertTrue(component["componentUid"].startswith("cmp:"))
        self.assertEqual(component["pcbRefs"][0]["footprintUuid"], "footprint-u12")
        self.assertEqual(component["fields"]["Datasheet"], "https://example.test/u12.pdf")
        self.assertTrue(all(field in component["fields"] for field in semantic_index_service.REQUIRED_BOM_FIELDS))

        net_index = payload["indexes"]["netByName"]["VBUS"]
        net = payload["nets"][net_index]
        self.assertEqual(net["netCode"], 17)
        self.assertEqual(payload["indexes"]["netBySchematicUuid"]["wire-vbus"], net_index)
        self.assertEqual(payload["indexes"]["netByPcbUuid"]["track-vbus"], net_index)

        terminal_index = payload["indexes"]["terminalByReferencePin"]["U12:5"]
        terminal = payload["terminals"][terminal_index]
        self.assertEqual(terminal["schematicPinUuid"], "pin-u12-5")
        self.assertEqual(terminal["pcbPadUuid"], "pad-u12-5")

    def test_canonical_fields_accepts_standard_and_custom_datasheet_spellings(self) -> None:
        fields = semantic_index_service._canonical_fields(
            {
                "parameters": {
                    "Datasheet Link": "",
                    "Datasheet": "https://example.test/part.pdf",
                }
            }
        )
        self.assertEqual(fields["Datasheet"], "https://example.test/part.pdf")

    def test_graphical_pin_without_terminal_row_still_counts_as_connectivity(self) -> None:
        design_payload = {
            "components": [{
                "designator": "U30",
                "svg_id": "symbol-u30",
                "hierarchy": {"sheet": "io.kicad_sch"},
            }],
            "nets": [{
                "name": "LLCE_CAN5_TX",
                "graphical": {
                    "wires": ["wire-can5"],
                    "labels": ["label-can5"],
                    "pins": [{
                        "designator": "U30",
                        "pin": "16",
                        "source_pin_id": "pin-u30-16",
                    }],
                },
                "terminals": [],
            }],
        }

        class FakeDesign:
            pcb = None

            def to_json(self, include_indexes=True):
                self.assert_include_indexes = include_indexes
                return design_payload

        class FakeKiCadDesign:
            @staticmethod
            def from_project_file(_path):
                return FakeDesign()

        with tempfile.TemporaryDirectory() as temporary, patch.dict(
            sys.modules,
            {"kicad_monkey": SimpleNamespace(KiCadDesign=FakeKiCadDesign)},
        ):
            payload = semantic_index_service.build_semantic_index(
                Path(temporary) / "board.kicad_pro",
                source_revision_key="revision-a",
                include_assembly=False,
            )

        terminal = payload["terminals"][0]
        self.assertEqual(terminal["reference"], "U30")
        self.assertEqual(terminal["pin"], "16")
        self.assertEqual(terminal["schematicPinUuid"], "pin-u30-16")
        net = payload["nets"][0]
        self.assertEqual(net["schematicRefs"][0]["pinUuids"], ["pin-u30-16"])


class RevisionIdentityTests(unittest.TestCase):
    """A revision has to be identifiable without materializing it.

    Resolving a commit means extracting the whole repository into a temporary
    directory. Doing that before checking the cache made every hit pay for a
    miss, which on a large repository is most of the cost of a comparison.
    """

    def _repository(self, root: Path, project_dir: str) -> Path:
        board = root / project_dir if project_dir else root
        board.mkdir(parents=True, exist_ok=True)
        (board / "board.kicad_pro").write_text("{}", encoding="utf-8")
        (board / "board.kicad_sch").write_text("(kicad_sch)", encoding="utf-8")
        (board / "notes.md").write_text("not a semantic source", encoding="utf-8")
        for command in (
            ["git", "init", "-q"],
            ["git", "add", "-A"],
            ["git", "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "board"],
        ):
            subprocess.run(command, cwd=root, check=True)
        return board

    def test_a_commit_and_the_working_tree_agree_on_the_key(self) -> None:
        """Otherwise the two paths cache the same content under two names."""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            board = self._repository(root, "boards/main")
            project = SimpleNamespace(id="p1", path=str(board))

            from_disk, _ = semantic_index_service._revision_identity(project, None)
            from_commit, resolved = semantic_index_service._revision_identity(
                project, "HEAD"
            )

            self.assertEqual(from_disk, from_commit)
            self.assertEqual(len(resolved), 40)

    def test_a_project_at_the_repository_root_resolves(self) -> None:
        """The listing takes no pathspec in this case; it is easy to get wrong."""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            board = self._repository(root, "")
            project = SimpleNamespace(id="p1", path=str(board))

            from_disk, _ = semantic_index_service._revision_identity(project, None)
            from_commit, _ = semantic_index_service._revision_identity(project, "HEAD")

            self.assertEqual(from_disk, from_commit)

    def test_a_non_semantic_file_does_not_change_the_key(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            board = self._repository(root, "boards/main")
            project = SimpleNamespace(id="p1", path=str(board))
            before, _ = semantic_index_service._revision_identity(project, None)

            (board / "notes.md").write_text("edited", encoding="utf-8")
            (board / "fab.zip").write_bytes(b"\x00\x01")

            after, _ = semantic_index_service._revision_identity(project, None)
            self.assertEqual(before, after)

    def test_editing_a_schematic_does_change_the_key(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            board = self._repository(root, "boards/main")
            project = SimpleNamespace(id="p1", path=str(board))
            before, _ = semantic_index_service._revision_identity(project, None)

            (board / "board.kicad_sch").write_text("(kicad_sch (symbol))", encoding="utf-8")

            after, _ = semantic_index_service._revision_identity(project, None)
            self.assertNotEqual(before, after)

    def test_a_cache_hit_never_extracts_the_repository(self) -> None:
        """This is the whole point of the change, so it is asserted directly."""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            board = self._repository(root, "boards/main")
            project = SimpleNamespace(id="p1", path=str(board))
            key, _ = semantic_index_service._revision_identity(project, "HEAD")

            # KICAD_PROJECTS_ROOT is a computed property on the settings model,
            # so the module's own root function is the patch point.
            index_root = root / "index"
            index_root.mkdir()
            self.enterContext(
                patch.object(
                    semantic_index_service,
                    "semantic_index_root",
                    return_value=index_root,
                )
            )
            artifact = semantic_index_service.artifact_path("p1", key)
            artifact.parent.mkdir(parents=True, exist_ok=True)
            artifact.write_text('{"schema": "cached"}', encoding="utf-8")

            with patch.object(
                semantic_visualizer_service,
                "_archive_checkout",
                side_effect=AssertionError("a cache hit must not check out the repo"),
            ):
                self.assertEqual(
                    semantic_index_service.get_or_build(project, "HEAD")["schema"],
                    "cached",
                )
                self.assertEqual(
                    semantic_index_service.get_existing(project, "HEAD")["schema"],
                    "cached",
                )
                self.assertTrue(
                    semantic_index_service.get_status(project, "HEAD")["available"]
                )


class NetResolutionTests(unittest.TestCase):
    """Resolving a net per element rebuilds the board's whole net mapping.

    Every pad, track, arc, via and zone carries a net reference, so doing that
    per element makes projecting a board O(elements x nets) — 126 million
    attribute reads on a 1,388-net design. A shared snapshot makes it linear.
    """

    class FakeNetTable:
        def __init__(self) -> None:
            self.calls = 0

        def name_of(self, net) -> str:
            self.calls += 1
            return getattr(net, "name", "") or "FROM_TABLE"

    def test_the_shared_table_answers_instead_of_the_board(self) -> None:
        table = self.FakeNetTable()
        board = SimpleNamespace(
            resolve_net_name=lambda net: self.fail("must not resolve per element")
        )
        item = SimpleNamespace(net=SimpleNamespace(name=""))

        self.assertEqual(
            semantic_index_service._net_name(board, item, table), "FROM_TABLE"
        )
        self.assertEqual(table.calls, 1)

    def test_an_older_kicad_monkey_still_resolves_per_element(self) -> None:
        """Without net_table the slow path must still produce the right answer."""
        board = SimpleNamespace(resolve_net_name=lambda net: "GND")
        item = SimpleNamespace(net=SimpleNamespace(name="GND"))

        self.assertIsNone(semantic_index_service._net_table(board))
        self.assertEqual(semantic_index_service._net_name(board, item), "GND")

    def test_a_board_that_cannot_build_a_table_falls_back(self) -> None:
        def unavailable():
            raise RuntimeError("net table unavailable")

        board = SimpleNamespace(net_table=unavailable, resolve_net_name=lambda net: "VCC")
        item = SimpleNamespace(net=SimpleNamespace(name="VCC"))

        self.assertIsNone(semantic_index_service._net_table(board))
        self.assertEqual(semantic_index_service._net_name(board, item), "VCC")


class BalancedSExpressionTests(unittest.TestCase):
    """The scanner steps between structural characters rather than over all of
    them, so the cases that matter are the ones where a paren is not structural."""

    def test_it_returns_the_offset_past_the_closing_paren(self) -> None:
        text = "(symbol (at 1 2))tail"
        self.assertEqual(
            semantic_index_service._balanced_s_expression_end(text, 0),
            len("(symbol (at 1 2))"),
        )

    def test_parens_inside_a_string_do_not_change_depth(self) -> None:
        text = '(property "Value" "TPS55289 (rev B)")after'
        end = semantic_index_service._balanced_s_expression_end(text, 0)
        self.assertEqual(text[:end], '(property "Value" "TPS55289 (rev B)")')

    def test_an_escaped_quote_does_not_end_the_string(self) -> None:
        text = r'(property "Note" "a \" (b" ) rest'
        end = semantic_index_service._balanced_s_expression_end(text, 0)
        self.assertEqual(text[:end], r'(property "Note" "a \" (b" )')

    def test_an_unterminated_form_reports_no_end(self) -> None:
        self.assertIsNone(
            semantic_index_service._balanced_s_expression_end("(symbol (at 1", 0)
        )

    def test_an_unterminated_string_reports_no_end(self) -> None:
        self.assertIsNone(
            semantic_index_service._balanced_s_expression_end('(property "open', 0)
        )

    def test_an_escaped_backslash_still_closes_the_string(self) -> None:
        # The escape consumes the second backslash, so the quote after it is
        # a real terminator and the following paren is structural again. Read
        # the other way, the string would swallow the rest of the form.
        text = r'(property "Path" "C:\\" ) rest'
        end = semantic_index_service._balanced_s_expression_end(text, 0)
        self.assertEqual(text[:end], r'(property "Path" "C:\\" )')

    def test_an_empty_string_is_not_mistaken_for_an_unterminated_one(self) -> None:
        text = '(property "Value" "")tail'
        end = semantic_index_service._balanced_s_expression_end(text, 0)
        self.assertEqual(text[:end], '(property "Value" "")')

    def test_a_start_past_the_opening_paren_reports_no_end(self) -> None:
        self.assertIsNone(
            semantic_index_service._balanced_s_expression_end("(symbol (at 1 2))", 8 + 9)
        )

    def test_nested_forms_close_at_the_outermost_paren(self) -> None:
        text = "(footprint (pad (at 0 0)) (pad (at 1 1)))after"
        end = semantic_index_service._balanced_s_expression_end(text, 0)
        self.assertEqual(text[:end], "(footprint (pad (at 0 0)) (pad (at 1 1)))")


class SchematicInstanceFieldTests(unittest.TestCase):
    LIBRARY = """
\t(lib_symbols
\t\t(symbol "Device:R"
\t\t\t(property "Reference" "R")
\t\t\t(symbol "R_0_1" (rectangle (start 0 0) (end 1 1)))
\t\t)
\t)
"""
    PLACED = """
\t(symbol
\t\t(lib_id "Device:R")
\t\t(uuid "placed-uuid-1")
\t\t(property "Reference" "R7")
\t\t(property "Datasheet" "https://example.invalid/r.pdf")
\t\t(pin "1" (uuid "pin-uuid-1"))
\t)
"""

    def _fields(self, body: str) -> dict:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "sheet.kicad_sch").write_text(
                f"(kicad_sch{body})", encoding="utf-8"
            )
            return semantic_index_service._schematic_instance_fields(
                root / "board.kicad_pro"
            )

    def test_a_placed_symbol_contributes_its_properties(self) -> None:
        fields = self._fields(self.LIBRARY + self.PLACED)

        self.assertEqual(list(fields), ["placed-uuid-1"])
        self.assertEqual(fields["placed-uuid-1"]["Reference"], "R7")
        self.assertEqual(
            fields["placed-uuid-1"]["Datasheet"], "https://example.invalid/r.pdf"
        )

    def test_library_definitions_are_not_mistaken_for_instances(self) -> None:
        """The library's own `(property "Reference" "R")` must not appear."""
        self.assertEqual(self._fields(self.LIBRARY), {})

    def test_a_placed_symbol_before_the_library_block_is_still_found(self) -> None:
        """The library span is skipped in place, not used as a starting offset.

        KiCad writes `lib_symbols` ahead of the placed symbols, so this ordering
        does not occur today. It is asserted because the cheaper alternative —
        beginning the scan after the library block — would silently drop every
        symbol here, and silence is exactly the wrong failure for an overlay
        that feeds the BOM.
        """
        fields = self._fields(self.PLACED + self.LIBRARY)

        self.assertEqual(list(fields), ["placed-uuid-1"])

    def test_a_sheet_without_a_library_block_still_scans(self) -> None:
        self.assertEqual(list(self._fields(self.PLACED)), ["placed-uuid-1"])

    def test_the_symbol_uuid_wins_over_its_pin_uuids(self) -> None:
        fields = self._fields(self.LIBRARY + self.PLACED)

        self.assertNotIn("pin-uuid-1", fields)


class CanonicalFieldTests(unittest.TestCase):
    """How a component's DNP state and aliased fields are read.

    KiCad records "do not populate" in two unrelated shapes, and Prism sees
    both: kicad-monkey's parsed ``kicad_dnp`` boolean, and the raw netlist's
    valueless ``dnp`` property, which is what carries DNP inherited from a
    parent sheet.  Reading only the first key that exists made every DNP part
    report "No", because the valueless one sorts first and looks empty.
    """

    @staticmethod
    def _fields(**parameters: str) -> dict[str, str]:
        return semantic_index_service._canonical_fields({"parameters": parameters})

    def test_the_parsed_symbol_attribute_marks_a_part_dnp(self) -> None:
        self.assertEqual(self._fields(kicad_dnp="true")["DNP"], "Yes")

    def test_a_valueless_netlist_flag_marks_a_part_dnp(self) -> None:
        """KiCad emits `(property (name "dnp"))` only for parts that are DNP."""
        self.assertEqual(self._fields(dnp="")["DNP"], "Yes")

    def test_the_valueless_flag_does_not_shadow_the_parsed_attribute(self) -> None:
        self.assertEqual(self._fields(dnp="", kicad_dnp="true")["DNP"], "Yes")

    def test_a_populated_part_reports_no(self) -> None:
        self.assertEqual(self._fields(kicad_dnp="false")["DNP"], "No")

    def test_a_blank_user_field_named_dnp_means_populated(self) -> None:
        """Unlike the netlist flag, an empty user field is the default, not a mark."""
        self.assertEqual(self._fields(DNP="", kicad_dnp="false")["DNP"], "No")

    def test_a_user_field_alias_can_mark_a_part_dnp(self) -> None:
        self.assertEqual(self._fields(**{"Do Not Populate": "yes"})["DNP"], "Yes")

    def test_the_parsed_attribute_overrules_a_stale_user_field(self) -> None:
        self.assertEqual(self._fields(DNP="no", kicad_dnp="true")["DNP"], "Yes")

    def test_a_component_with_no_dnp_information_reports_no(self) -> None:
        self.assertEqual(self._fields(Value="10k")["DNP"], "No")

    def test_a_blank_field_does_not_shadow_a_populated_alias(self) -> None:
        fields = self._fields(
            **{"Datasheet": "", "Datasheet Link": "https://example.invalid/ds.pdf"}
        )

        self.assertEqual(fields["Datasheet"], "https://example.invalid/ds.pdf")


class VariantAssemblyIntegrationTests(unittest.TestCase):
    """VAR-10: the index publishes the packet-3.2 ``assembly`` block.

    Fixture expectations key components by reference because the index owns
    the componentUid join; this test translates through
    ``indexes.componentByReference`` exactly as the packet notes say a
    consumer does.
    """

    FIXTURES = Path(__file__).resolve().parent / "fixtures" / "design_variants"
    CATALOG_CODES = {"catalog-name-case-mismatch", "source-unparseable"}

    def _project_file(self, fixture: str) -> Path:
        expected = json.loads(
            (self.FIXTURES / "expected" / f"{fixture}.json").read_text(
                encoding="utf-8"
            )
        )
        return self.FIXTURES / fixture / expected["project"]

    def _build(self, fixture: str, *, include_assembly: bool = True) -> dict:
        return semantic_index_service.build_semantic_index(
            self._project_file(fixture),
            source_revision_key="revision-variants",
            include_assembly=include_assembly,
        )

    def _expected(self, fixture: str) -> dict:
        return json.loads(
            (self.FIXTURES / "expected" / f"{fixture}.json").read_text(
                encoding="utf-8"
            )
        )

    @staticmethod
    def _uid_map(payload: dict) -> dict[str, str]:
        return {
            component["reference"]: component["componentUid"]
            for component in payload["components"]
        }

    def _translate_components(
        self, payload: dict, mapping: dict[str, dict]
    ) -> dict[str, dict]:
        uids = self._uid_map(payload)
        return {
            uids.get(reference, reference): state
            for reference, state in mapping.items()
        }

    @staticmethod
    def _without_component_uid(entry: dict) -> dict:
        return {key: value for key, value in entry.items() if key != "componentUid"}

    def _project_occurrences(self, mapping: dict[str, dict]) -> dict[str, dict]:
        return {
            occurrence_id: self._without_component_uid(entry)
            for occurrence_id, entry in mapping.items()
        }

    def _project_footprints(self, mapping: dict[str, dict]) -> dict[str, dict]:
        return {
            uuid: self._without_component_uid(entry)
            for uuid, entry in mapping.items()
        }

    def test_the_oracle_fixture_matches_the_differential_expectations(self) -> None:
        payload = self._build("oracle")
        assembly = payload["assembly"]
        expected = self._expected("oracle")

        self.assertEqual(assembly["schema"], "prism.assembly_state_a0")
        self.assertEqual(assembly["catalog"], expected["catalog"])
        self.assertEqual(
            self._project_occurrences(assembly["default"]["occurrences"]),
            expected["default"]["occurrences"],
        )
        self.assertEqual(
            self._translate_components(
                payload, assembly["default"]["components"]
            ),
            self._translate_components(payload, expected["default"]["components"]),
        )
        self.assertEqual(
            self._project_footprints(assembly["default"]["footprints"]),
            expected["default"]["footprints"],
        )

        for expected_variant in expected["variants"]:
            actual = next(
                variant
                for variant in assembly["variants"]
                if variant["name"] == expected_variant["name"]
            )
            self.assertEqual(
                self._project_occurrences(actual["occurrences"]),
                expected_variant["occurrences"],
                expected_variant["name"],
            )
            self.assertEqual(
                self._translate_components(payload, actual["components"]),
                self._translate_components(payload, expected_variant["components"]),
                expected_variant["name"],
            )
            self.assertEqual(
                self._project_footprints(actual["footprints"]),
                expected_variant["footprints"],
                expected_variant["name"],
            )

    def test_diagnostics_match_the_expectation(self) -> None:
        payload = self._build("oracle")
        expected = self._expected("oracle")

        def projection(diagnostic: dict) -> dict:
            return {
                key: diagnostic[key]
                for key in (
                    "code",
                    "variant",
                    "reference",
                    "path",
                    "detail",
                    "footprintUuids",
                )
                if key in diagnostic
            }

        self.assertEqual(
            [projection(d) for d in payload["assembly"]["diagnostics"]],
            [projection(d) for d in expected["diagnostics"]],
        )

    def test_component_default_state_corrects_dnp_and_in_bom(self) -> None:
        payload = self._build("oracle")
        by_reference = {
            component["reference"]: component for component in payload["components"]
        }

        # R2 is base-DNP; R3 is populated by default.
        self.assertEqual(by_reference["R2"]["fields"]["DNP"], "Yes")
        self.assertEqual(by_reference["R2"]["fields"]["In BOM"], "Yes")
        self.assertEqual(by_reference["R3"]["fields"]["DNP"], "No")
        self.assertEqual(by_reference["R3"]["fields"]["In BOM"], "Yes")

    def test_schematic_refs_gain_the_representative_occurrence_id(self) -> None:
        payload = self._build("oracle")
        component = next(
            entry for entry in payload["components"] if entry["reference"] == "Q1"
        )
        occurrence_id = component["schematicRefs"][0]["occurrenceId"]
        expected_id = (
            "/df45a56d-eafa-53fe-96d8-7823ed0c0fa3/"
            "7d201bda-eaa8-50cb-a4b8-98b6f582e55e"
        )
        self.assertEqual(occurrence_id, expected_id)
        # Q1 carries no default-state flags, so its occurrence appears only in
        # the differential Lite map, where it resolves its field overrides.
        lite = next(
            variant
            for variant in payload["assembly"]["variants"]
            if variant["name"] == "Lite"
        )
        self.assertIn(expected_id, lite["occurrences"])

    def test_the_index_join_adds_component_uids_to_every_map(self) -> None:
        payload = self._build("oracle")
        assembly = payload["assembly"]
        uids = set(self._uid_map(payload).values())

        for entry in assembly["default"]["occurrences"].values():
            self.assertIn(entry["componentUid"], uids)
        for key in assembly["default"]["components"]:
            self.assertIn(key, uids)
        for entry in assembly["default"]["footprints"].values():
            if entry["componentUid"] is not None:
                self.assertIn(entry["componentUid"], uids)

    def test_the_key_sets_are_the_frozen_ones(self) -> None:
        payload = self._build("oracle")
        assembly = payload["assembly"]
        flags = {
            "dnp",
            "excludeFromBom",
            "excludeFromBoard",
            "excludeFromSim",
            "excludeFromPosFiles",
        }

        for entry in assembly["default"]["occurrences"].values():
            self.assertLessEqual(set(entry), flags | {"reference", "componentUid"})
            self.assertLessEqual({"reference", "componentUid"}, set(entry))
        for entry in assembly["default"]["components"].values():
            self.assertLessEqual(set(entry), flags)
            self.assertTrue(entry)
        for entry in assembly["default"]["footprints"].values():
            self.assertLessEqual(
                set(entry),
                {"reference", "componentUid", "dnp", "excludeFromBom", "excludeFromPosFiles"},
            )
            self.assertIn("reference", entry)
            self.assertIn("componentUid", entry)
        for variant in assembly["variants"]:
            for entry in variant["occurrences"].values():
                self.assertLessEqual(set(entry), flags | {"fields"})
            for entry in variant["components"].values():
                self.assertLessEqual(set(entry), flags | {"fields"})
            for entry in variant["footprints"].values():
                self.assertLessEqual(
                    set(entry),
                    {"dnp", "excludeFromBom", "excludeFromPosFiles", "fields"},
                )

    def test_existing_keys_are_unchanged_apart_from_the_documented_fields(self) -> None:
        with_assembly = self._build("oracle", include_assembly=True)
        without_assembly = self._build("oracle", include_assembly=False)

        self.assertNotIn("assembly", without_assembly)
        for key in ("nets", "terminals", "sheetInstances", "buses", "indexes"):
            self.assertEqual(with_assembly[key], without_assembly[key], key)

        differences: list[tuple[str, str]] = []
        for before, after in zip(
            without_assembly["components"], with_assembly["components"]
        ):
            self.assertEqual(before["componentUid"], after["componentUid"])
            self.assertEqual(before["value"], after["value"])
            self.assertEqual(before["footprint"], after["footprint"])
            for field in set(before["fields"]) | set(after["fields"]):
                if before["fields"].get(field) != after["fields"].get(field):
                    differences.append((before["reference"], field))
            for ref_before, ref_after in zip(
                before["schematicRefs"], after["schematicRefs"]
            ):
                self.assertEqual(
                    {k: v for k, v in ref_after.items() if k != "occurrenceId"},
                    ref_before,
                )
        self.assertEqual(
            sorted(set(differences)),
            sorted(
                {
                    (reference, field)
                    for reference, field in differences
                    if field in ("DNP", "In BOM")
                }
            ),
            "only DNP and In BOM may be corrected by the assembly join",
        )

    def test_empty_catalog_still_publishes_an_additive_assembly_block(self) -> None:
        payload = self._build("no_variants")
        assembly = payload["assembly"]
        self.assertEqual(assembly["catalog"], [])
        self.assertEqual(assembly["variants"], [])
        self.assertEqual(
            assembly["default"],
            {"occurrences": {}, "components": {}, "footprints": {}},
        )

    def test_catalog_diagnostics_are_merged_into_the_block_first(self) -> None:
        payload = self._build("case_fold")
        codes = [
            diagnostic["code"] for diagnostic in payload["assembly"]["diagnostics"]
        ]
        self.assertEqual(codes[0], "catalog-name-case-mismatch")
        self.assertEqual(codes.count("catalog-name-case-mismatch"), 2)
        self.assertIn("source-state-mismatch", codes)

    def test_case_fold_publishes_source_state_mismatches(self) -> None:
        payload = self._build("case_fold")
        diagnostics = payload["assembly"]["diagnostics"]
        mismatches = [
            diagnostic
            for diagnostic in diagnostics
            if diagnostic["code"] == "source-state-mismatch"
        ]
        self.assertEqual(
            [(d["variant"], d["reference"]) for d in mismatches],
            [("Lite", "R2"), ("lite", "R1")],
        )

    def test_generator_identity_covers_the_variant_modules(self) -> None:
        from app.services import (
            project_source_snapshot,
            semantic_index_variants,
            variant_catalog_service,
        )

        for module in (
            semantic_index_variants,
            variant_catalog_service,
            project_source_snapshot,
        ):
            self.assertIn(
                Path(module.__file__),
                semantic_index_service.GENERATOR_MODULE_PATHS,
                module.__name__,
            )
        recomputed = hashlib.sha256(
            b"\0".join(
                (
                    "|".join(semantic_index_service._GENERATOR_INPUTS).encode("utf-8"),
                    *(
                        path.read_bytes()
                        for path in semantic_index_service.GENERATOR_MODULE_PATHS
                    ),
                )
            )
        ).hexdigest()[:12]
        self.assertEqual(recomputed, semantic_index_service.GENERATOR_BUILD)
        self.assertEqual(semantic_index_service.GENERATOR_VERSION, "0.2.0")
        self.assertIn(
            "0.2.0", semantic_index_service.generator_cache_tag()
        )


if __name__ == "__main__":
    unittest.main()
