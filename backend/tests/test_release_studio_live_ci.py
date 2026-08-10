"""Focused Release Studio CI coverage for the pinned KiCad executor."""

from __future__ import annotations

import os
import re
import subprocess
import unittest
from pathlib import Path


EXECUTOR_IMAGE_ENV = "PRISM_RELEASE_EXECUTOR_IMAGE"
BAKED_KICAD_BASE_IMAGE_PATH = Path("/etc/prism/kicad-base-image")
_DIGEST_SUFFIX = re.compile(r"@sha256:([0-9a-f]{64})$")


def _read_baked_kicad_base_image() -> str:
    try:
        raw = BAKED_KICAD_BASE_IMAGE_PATH.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise AssertionError(
            f"missing baked KiCad base image identity at {BAKED_KICAD_BASE_IMAGE_PATH}"
        ) from exc
    value = raw.strip()
    if not value:
        raise AssertionError(
            f"baked KiCad base image identity at {BAKED_KICAD_BASE_IMAGE_PATH} is empty"
        )
    match = _DIGEST_SUFFIX.search(value)
    if match is None:
        raise AssertionError(
            "baked KiCad base image must end with @sha256:<64 lowercase hex>; "
            f"got {value!r}"
        )
    return value


class ReleaseStudioLiveCiTests(unittest.TestCase):
    @unittest.skipUnless(
        EXECUTOR_IMAGE_ENV in os.environ,
        "PRISM_RELEASE_EXECUTOR_IMAGE is required for the live executor test",
    )
    def test_pinned_executor_has_kicad_cli_10_0_4(self) -> None:
        """Require baked image identity, matching env, and KiCad 10.0.4."""
        baked = _read_baked_kicad_base_image()
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
