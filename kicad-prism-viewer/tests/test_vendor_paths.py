"""Only the lock or an explicit operator choice may select kicad-monkey."""

from __future__ import annotations

import os
import unittest
from pathlib import Path
from unittest import mock

from pipeline.topology_compiler import vendor_paths


def _make_checkout(root: Path, name: str) -> Path:
    package = root / name / "src" / "py" / "kicad_monkey"
    package.mkdir(parents=True)
    (package / "__init__.py").write_text("", encoding="utf-8")
    return package.parent


class ExplicitPathsTests(unittest.TestCase):
    def test_the_named_checkout_outranks_everything_discovered(self) -> None:
        with mock.patch.dict(
            os.environ, {"KICAD_MONKEY_PYTHONPATH": "/chosen/src/py"}
        ):
            paths = vendor_paths.reference_paths()
        self.assertEqual(paths[0], Path("/chosen/src/py"))

    def test_several_named_locations_keep_their_order(self) -> None:
        value = os.pathsep.join(["/first/src/py", "/second/src/py"])
        with mock.patch.dict(os.environ, {"KICAD_MONKEY_PYTHONPATH": value}):
            paths = vendor_paths.reference_paths()
        self.assertEqual(paths[:2], [Path("/first/src/py"), Path("/second/src/py")])

    def test_an_unset_variable_adds_nothing(self) -> None:
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("KICAD_MONKEY_PYTHONPATH", None)
            baseline = vendor_paths.reference_paths()
        with mock.patch.dict(os.environ, {"KICAD_MONKEY_PYTHONPATH": "   "}):
            blank = vendor_paths.reference_paths()
        self.assertEqual(baseline, blank)


class PythonPathTests(unittest.TestCase):
    def test_the_named_kicad_checkout_outranks_the_callers_pythonpath(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as temporary:
            chosen = Path(temporary) / "chosen" / "src" / "py"
            chosen.mkdir(parents=True)
            with mock.patch.dict(
                os.environ, {"KICAD_MONKEY_PYTHONPATH": str(chosen)}
            ):
                rendered = vendor_paths.pythonpath(current="/caller/src/py")
        self.assertEqual(rendered.split(os.pathsep)[0], str(chosen))

    def test_a_repeated_entry_is_not_emitted_twice(self) -> None:
        root = Path(__file__).resolve().parents[1]
        rendered = vendor_paths.pythonpath(repo_root=root, current=str(root))
        entries = rendered.split(os.pathsep)
        self.assertEqual(len(entries), len(set(entries)))


class AmbiguityWarningTests(unittest.TestCase):
    def test_two_explicit_checkouts_are_reported(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            first = _make_checkout(root, "kicad-monkey")
            second = _make_checkout(root, "kicad_monkey")
            repo_root = root / "viewer"
            repo_root.mkdir(parents=True)

            with mock.patch.dict(
                os.environ,
                {"KICAD_MONKEY_PYTHONPATH": os.pathsep.join((str(first), str(second)))},
            ):
                with self.assertLogs(vendor_paths.logger, level="WARNING") as logged:
                    found = vendor_paths.warn_on_ambiguous_kicad_monkey(repo_root)

        self.assertEqual(len(found), 2)
        message = logged.output[0]
        self.assertIn("kicad-monkey", message)
        self.assertIn("kicad_monkey", message)
        self.assertIn("KICAD_MONKEY_PYTHONPATH", message)

    def test_sibling_checkouts_are_not_discovered_implicitly(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as temporary:
            platform_root = Path(temporary)
            _make_checkout(platform_root, "kicad_monkey")
            repo_root = platform_root / "prism" / "viewer"
            repo_root.mkdir(parents=True)

            with mock.patch.dict(os.environ, {}, clear=False):
                os.environ.pop("KICAD_MONKEY_PYTHONPATH", None)
                with mock.patch.object(vendor_paths.logger, "warning") as warning:
                    found = vendor_paths.warn_on_ambiguous_kicad_monkey(repo_root)

        self.assertEqual(found, [])
        warning.assert_not_called()


if __name__ == "__main__":
    unittest.main()
