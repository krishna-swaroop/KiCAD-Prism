"""Focused Release Studio CI coverage for the pinned KiCad executor."""

from __future__ import annotations

import os
import re
import subprocess
import unittest


EXPECTED_KICAD_IMAGE = (
    "kicad/kicad:10.0.4@"
    "sha256:ee71e88396f8563168eb1ef282cda9ff2670fe86a677c63dd78b35e3d464454c"
)
EXECUTOR_IMAGE_ENV = "PRISM_RELEASE_EXECUTOR_IMAGE"


class ReleaseStudioLiveCiTests(unittest.TestCase):
    def test_pinned_executor_has_kicad_cli_10_0_4(self) -> None:
        """Run the real CLI and require the exact CI executor identity."""
        self.assertEqual(
            os.environ.get(EXECUTOR_IMAGE_ENV),
            EXPECTED_KICAD_IMAGE,
            msg=(
                f"{EXECUTOR_IMAGE_ENV} must contain the exact pinned KiCad "
                "image reference"
            ),
        )

        try:
            result = subprocess.run(
                ["kicad-cli", "--version"],
                check=False,
                capture_output=True,
                text=True,
                shell=False,
                timeout=30,
            )
        except FileNotFoundError:
            self.fail("kicad-cli is required for the Release Studio live gate")

        output = f"{result.stdout}\n{result.stderr}"
        self.assertEqual(
            result.returncode,
            0,
            msg=f"kicad-cli --version failed:\n{output}",
        )
        self.assertRegex(
            output,
            re.compile(r"(?<![0-9.])10\.0\.4(?![0-9.])"),
            msg=f"expected KiCad 10.0.4, got:\n{output}",
        )


if __name__ == "__main__":
    unittest.main()
