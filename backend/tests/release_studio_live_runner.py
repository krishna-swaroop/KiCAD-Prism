"""Strict unittest runner for Release Studio live executor gates.

Exits nonzero when zero tests ran, any test was skipped, or any test failed
or errored. Includes the R00a identity module, R0 fixture module, and the R4
semantic-null module so its live-generated tests cannot silently skip.
"""

from __future__ import annotations

import sys
import unittest


LIVE_MODULES: tuple[str, ...] = (
    "tests.test_release_studio_live_ci",
    "tests.test_release_studio_fixtures",
    "tests.test_release_studio_canonicalization",
    "tests.test_release_studio_projections",
)


def run_live_modules(module_names: tuple[str, ...] = LIVE_MODULES) -> int:
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    for module_name in module_names:
        suite.addTests(loader.loadTestsFromName(module_name))

    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if result.testsRun < 1:
        print("Release Studio live runner executed zero tests", file=sys.stderr)
        return 1
    if result.skipped:
        print(
            f"Release Studio live runner forbids skips ({len(result.skipped)} skipped)",
            file=sys.stderr,
        )
        return 1
    if result.failures or result.errors:
        return 1
    return 0


def main() -> int:
    return run_live_modules()


if __name__ == "__main__":
    raise SystemExit(main())
