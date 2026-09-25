"""Every Prism runtime must consume one repository-owned dependency identity."""

from __future__ import annotations

import re
import unittest
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
_RUNTIME_INPUT = _REPO_ROOT / "requirements" / "runtime.in"
_RUNTIME_LOCK = _REPO_ROOT / "requirements" / "runtime.lock"
_BACKEND_REQUIREMENTS = _REPO_ROOT / "backend" / "requirements.txt"
_VIEWER_REQUIREMENTS = _REPO_ROOT / "kicad-prism-viewer" / "requirements-runtime.txt"
_DOCKERFILE = _REPO_ROOT / "backend" / "Dockerfile"


def _pinned_version(requirements: Path, distribution: str) -> str | None:
    pattern = re.compile(
        rf"^{re.escape(distribution)}\s*==\s*(?P<version>[^\s#]+)",
        re.IGNORECASE,
    )
    for raw in requirements.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        match = pattern.match(line)
        if match:
            return match.group("version")
    return None


class ToolchainPinTests(unittest.TestCase):
    def test_runtime_input_pins_a_matching_published_toolchain(self) -> None:
        monkey = _pinned_version(_RUNTIME_INPUT, "kicad-monkey")
        cruncher = _pinned_version(_RUNTIME_INPUT, "kicad-cruncher")
        self.assertIsNotNone(monkey)
        self.assertEqual(monkey, cruncher)

    def test_lock_preserves_selected_toolchain(self) -> None:
        for distribution in ("kicad-monkey", "kicad-cruncher"):
            self.assertEqual(
                _pinned_version(_RUNTIME_INPUT, distribution),
                _pinned_version(_RUNTIME_LOCK, distribution),
            )

    def test_backend_and_viewer_are_aliases_of_same_lock(self) -> None:
        expected = "-r ../requirements/runtime.lock"
        for requirements in (_BACKEND_REQUIREMENTS, _VIEWER_REQUIREMENTS):
            active_lines = [
                line.strip()
                for line in requirements.read_text(encoding="utf-8").splitlines()
                if line.strip() and not line.lstrip().startswith("#")
            ]
            self.assertEqual(active_lines, [expected])

    def test_docker_installs_lock_once(self) -> None:
        dockerfile = _DOCKERFILE.read_text(encoding="utf-8")
        self.assertEqual(dockerfile.count("uv pip sync"), 1)
        self.assertNotIn("backend/requirements.txt", dockerfile)
        self.assertNotIn("requirements-runtime.txt", dockerfile)

    def test_the_image_verifies_only_the_python_half(self) -> None:
        """The image has no JavaScript manifests where the checker looks for them.

        ``verify_dependency_identity.py`` resolves its root from its own
        location, so inside the image it reads ``/app/frontend/package.json``
        and ``/app/kicad-prism-viewer/package.json``. Neither path is ever
        populated -- the viewer manifests land in ``/opt`` and the frontend is
        only ever built in a separate stage -- so an unscoped invocation raises
        FileNotFoundError and fails the build after a clean ``uv pip sync``.
        """
        dockerfile = _DOCKERFILE.read_text(encoding="utf-8")
        invocations = [
            line.strip()
            for line in dockerfile.splitlines()
            if "verify_dependency_identity.py" in line and "COPY" not in line
        ]
        self.assertTrue(invocations)
        for invocation in invocations:
            self.assertIn("--python-only", invocation)

    def test_local_image_replaces_monkey_and_cruncher_together(self) -> None:
        dockerfile = _DOCKERFILE.read_text(encoding="utf-8")
        local_stage = dockerfile.split("AS kicad-monkey-local", maxsplit=1)[1]
        self.assertIn("/tmp/kicad-toolchain/packages/kicad_cruncher", local_stage)
        self.assertIn("/tmp/kicad-toolchain", local_stage)
        self.assertIn("uv pip check", local_stage)


if __name__ == "__main__":
    unittest.main()
