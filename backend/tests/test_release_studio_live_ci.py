"""Focused Release Studio CI coverage for the pinned KiCad executor."""

from __future__ import annotations

import os
import re
import subprocess
import unittest

from tests.release_studio_support import (
    BAKED_KICAD_BASE_IMAGE_PATH,
    EXECUTOR_IMAGE_ENV,
    read_baked_kicad_base_image,
)


class ReleaseStudioLiveCiTests(unittest.TestCase):
    @unittest.skipUnless(
        EXECUTOR_IMAGE_ENV in os.environ,
        "PRISM_RELEASE_EXECUTOR_IMAGE is required for the live executor test",
    )
    def test_pinned_executor_has_kicad_cli_10_0_4(self) -> None:
        """Require baked image identity, matching env, and KiCad 10.0.4."""
        baked = read_baked_kicad_base_image()
        runtime = os.environ.get(EXECUTOR_IMAGE_ENV, "")
        self.assertEqual(
            runtime,
            baked,
            msg=(
                f"{EXECUTOR_IMAGE_ENV} must match the baked identity at "
                f"{BAKED_KICAD_BASE_IMAGE_PATH}"
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
