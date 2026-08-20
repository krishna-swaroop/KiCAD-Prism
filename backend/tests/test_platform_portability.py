"""Guards against the backend quietly becoming Linux-only.

Most contributors run Windows or macOS, and the backend is expected to start
outside Docker there. Two habits break that: writing to a literal `/tmp`, which
does not exist on Windows, and POSIX-only syscalls with no platform guard.
"""

import ast
import os
import tempfile
import unittest
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
SOURCES = sorted((BACKEND / "app").rglob("*.py"))


def _path_call_arguments(tree: ast.AST) -> set[int]:
    """Ids of string constants passed directly to `Path(...)`.

    Naming `/tmp` as one root among several — in a redaction pattern, say — is
    reasonable. Handing it to `Path` is how a hardcoded location gets built.
    """

    found: set[int] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        name = node.func.id if isinstance(node.func, ast.Name) else (
            node.func.attr if isinstance(node.func, ast.Attribute) else ""
        )
        if name != "Path":
            continue
        for argument in node.args:
            if isinstance(argument, ast.Constant) and isinstance(argument.value, str):
                found.add(id(argument))
    return found


class TemporaryPathTests(unittest.TestCase):
    def test_no_module_builds_a_path_under_a_hardcoded_tmp(self) -> None:
        offenders = []
        for source in SOURCES:
            tree = ast.parse(source.read_text(encoding="utf-8"))
            path_arguments = _path_call_arguments(tree)
            for node in ast.walk(tree):
                if not isinstance(node, ast.Constant) or not isinstance(node.value, str):
                    continue
                builds_a_path = node.value.startswith("/tmp/") or (
                    node.value == "/tmp" and id(node) in path_arguments
                )
                if builds_a_path:
                    offenders.append(
                        f"{source.relative_to(BACKEND)}:{node.lineno} {node.value!r}"
                    )

        self.assertEqual(
            offenders,
            [],
            "Use tempfile.gettempdir(); a literal /tmp does not exist on Windows:\n"
            + "\n".join(offenders),
        )

    def test_the_compare_roots_sit_under_the_platform_temporary_directory(self) -> None:
        if os.environ.get("PRISM_DESIGN_COMPARE_CACHE") or os.environ.get(
            "PRISM_DESIGN_COMPARE_JOBS"
        ):
            self.skipTest(
                "compare roots are overridden by deployment env "
                "(PRISM_DESIGN_COMPARE_CACHE / PRISM_DESIGN_COMPARE_JOBS)"
            )
        from app.services import design_compare_service

        temporary = Path(tempfile.gettempdir())
        for root in (
            design_compare_service._CACHE_ROOT,
            design_compare_service._JOB_ROOT,
        ):
            self.assertEqual(root.parent, temporary, root)


class DirectorySyncTests(unittest.TestCase):
    def test_syncing_a_directory_works_where_it_is_supported(self) -> None:
        from app.services.job_artifact_service import _fsync_directory

        with tempfile.TemporaryDirectory() as directory:
            _fsync_directory(Path(directory))  # must not raise

    @unittest.skipIf(os.name == "nt", "the POSIX branch is the one under test")
    def test_a_missing_directory_is_still_reported(self) -> None:
        """The Windows guard must not turn into a blanket except-and-ignore."""
        from app.services.job_artifact_service import _fsync_directory

        with self.assertRaises(OSError):
            _fsync_directory(Path(tempfile.gettempdir()) / "prism-does-not-exist")


if __name__ == "__main__":
    unittest.main()
