"""The kicad-monkey adapter: board injection and projection capability probing."""

import unittest
from types import SimpleNamespace

from app.services.kicad_monkey_design_adapter import KiCadMonkeyDesign, _accepts_keyword


class _PinnedUpstreamDesign:
    """Shape of the pinned kicad-monkey release: ``to_json`` has no board switch."""

    def __init__(self, *, board=None, pcb_path="/somewhere/board.kicad_pcb"):
        self._pcb = board
        self.pcb_path = pcb_path
        self.parsed = 0
        self.calls = []

    @property
    def pcb(self):
        if self._pcb is not None:
            return self._pcb
        if self.pcb_path is None:
            return None
        self.parsed += 1
        self._pcb = f"parsed:{self.pcb_path}"
        return self._pcb

    def to_netlist(self):
        return SimpleNamespace(components=["U1"], nets=["GND"])

    def to_json(self, include_indexes=True, *, compiled_schematic_graph=None):
        self.calls.append({"include_indexes": include_indexes, "board": self.pcb})
        return {"components": [], "nets": []}


class _OptimizedDesign(_PinnedUpstreamDesign):
    """Shape of the local optimized tree: ``to_json`` accepts ``include_pcb``."""

    def to_json(self, include_indexes=True, *, include_pcb=True):
        self.calls.append(
            {
                "include_indexes": include_indexes,
                "include_pcb": include_pcb,
                "board": self.pcb if include_pcb else None,
            }
        )
        return {"components": [], "nets": []}


class CapabilityProbeTests(unittest.TestCase):
    def test_pinned_upstream_signature_has_no_board_switch(self) -> None:
        self.assertFalse(KiCadMonkeyDesign(_PinnedUpstreamDesign()).supports_board_switch)

    def test_optimized_signature_has_a_board_switch(self) -> None:
        self.assertTrue(KiCadMonkeyDesign(_OptimizedDesign()).supports_board_switch)

    def test_var_keyword_signature_counts_as_accepting(self) -> None:
        def to_json(include_indexes=True, **kwargs):
            return {}

        self.assertTrue(_accepts_keyword(to_json, "include_pcb"))

    def test_positional_only_or_uninspectable_callables_are_the_older_shape(self) -> None:
        def positional_only(include_pcb, /):
            return {}

        self.assertFalse(_accepts_keyword(positional_only, "include_pcb"))
        self.assertFalse(_accepts_keyword(len, "include_pcb"))

    def test_installed_kicad_monkey_matches_a_supported_shape(self) -> None:
        try:
            from kicad_monkey import KiCadDesign
        except ImportError:
            self.skipTest("kicad-monkey is not installed in this runtime")
        parameters = _signature_names(KiCadDesign.to_json)
        self.assertIn("include_indexes", parameters)
        # Either shape is supported; the probe must agree with the signature.
        self.assertEqual(
            _accepts_keyword(KiCadDesign.to_json, "include_pcb"),
            "include_pcb" in parameters,
        )


def _signature_names(callable_):
    import inspect

    return set(inspect.signature(callable_).parameters)


class BoardInjectionTests(unittest.TestCase):
    def test_injected_board_is_attached_and_never_reparsed(self) -> None:
        injected = object()
        native = _PinnedUpstreamDesign()
        design = KiCadMonkeyDesign(native, board=injected)
        self.assertTrue(design.board_injected)
        self.assertIs(design.board(), injected)
        self.assertIs(native.pcb, injected)
        self.assertEqual(native.parsed, 0)

    def test_without_injection_the_board_parses_lazily_once(self) -> None:
        native = _PinnedUpstreamDesign()
        design = KiCadMonkeyDesign(native)
        self.assertFalse(design.board_injected)
        first = design.board()
        second = design.board()
        self.assertEqual(first, "parsed:/somewhere/board.kicad_pcb")
        self.assertIs(first, second)
        self.assertEqual(native.parsed, 1)

    def test_netlist_is_optional(self) -> None:
        self.assertIsNone(KiCadMonkeyDesign(SimpleNamespace(to_json=lambda **_: {})).netlist())
        netlist = KiCadMonkeyDesign(_PinnedUpstreamDesign()).netlist()
        self.assertEqual(netlist.components, ["U1"])


class ProjectionTests(unittest.TestCase):
    def test_pinned_upstream_schematic_only_detaches_an_uninjected_board(self) -> None:
        native = _PinnedUpstreamDesign()
        payload = KiCadMonkeyDesign(native).to_json(include_pcb=False)
        self.assertEqual(payload, {"components": [], "nets": []})
        self.assertEqual(native.calls, [{"include_indexes": True, "board": None}])
        self.assertIsNone(native._pcb)
        self.assertIsNone(native.pcb_path)
        self.assertEqual(native.parsed, 0, "the projection must not parse the board")

    def test_pinned_upstream_schematic_only_keeps_an_injected_board(self) -> None:
        injected = object()
        native = _PinnedUpstreamDesign(board=injected)
        KiCadMonkeyDesign(native, board=injected).to_json(include_pcb=False)
        self.assertIs(native._pcb, injected)
        self.assertEqual(native.pcb_path, "/somewhere/board.kicad_pcb")
        self.assertEqual(native.calls, [{"include_indexes": True, "board": injected}])

    def test_pinned_upstream_full_build_keeps_the_board_path(self) -> None:
        native = _PinnedUpstreamDesign()
        KiCadMonkeyDesign(native).to_json(include_pcb=True)
        self.assertEqual(native.pcb_path, "/somewhere/board.kicad_pcb")
        self.assertEqual(native.parsed, 1)

    def test_optimized_shape_passes_the_switch_through_and_never_detaches(self) -> None:
        native = _OptimizedDesign()
        KiCadMonkeyDesign(native).to_json(include_pcb=False)
        self.assertEqual(
            native.calls,
            [{"include_indexes": True, "include_pcb": False, "board": None}],
        )
        self.assertEqual(native.pcb_path, "/somewhere/board.kicad_pcb")
        self.assertEqual(native.parsed, 0)

        injected = object()
        native = _OptimizedDesign(board=injected)
        KiCadMonkeyDesign(native, board=injected).to_json(include_pcb=True)
        self.assertEqual(native.calls[-1]["include_pcb"], True)
        self.assertIs(native.calls[-1]["board"], injected)

    def test_include_indexes_is_forwarded_on_both_shapes(self) -> None:
        for factory in (_PinnedUpstreamDesign, _OptimizedDesign):
            with self.subTest(shape=factory.__name__):
                native = factory()
                KiCadMonkeyDesign(native).to_json(include_indexes=False, include_pcb=True)
                self.assertFalse(native.calls[-1]["include_indexes"])

    def test_type_error_from_inside_upstream_propagates_on_the_pinned_shape(self) -> None:
        class Broken(_PinnedUpstreamDesign):
            def to_json(self, include_indexes=True, *, compiled_schematic_graph=None):
                raise TypeError("unsupported operand type(s) for include_pcb projection")

        native = Broken()
        with self.assertRaises(TypeError) as caught:
            KiCadMonkeyDesign(native).to_json(include_pcb=False)
        self.assertIn("unsupported operand", str(caught.exception))
        # The message mentions include_pcb, but the failure is upstream's own:
        # it must not be retried as a fallback call.
        self.assertEqual(native.calls, [])

    def test_type_error_from_inside_upstream_propagates_on_the_optimized_shape(self) -> None:
        class Broken(_OptimizedDesign):
            def to_json(self, include_indexes=True, *, include_pcb=True):
                self.calls.append("attempt")
                raise TypeError("got an unexpected keyword argument 'include_pcb' (nested)")

        native = Broken()
        with self.assertRaises(TypeError):
            KiCadMonkeyDesign(native).to_json(include_pcb=False)
        self.assertEqual(native.calls, ["attempt"], "no second call without the switch")
        self.assertEqual(native.pcb_path, "/somewhere/board.kicad_pcb", "no detach on failure")


if __name__ == "__main__":
    unittest.main()
