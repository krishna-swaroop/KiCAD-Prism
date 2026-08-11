from __future__ import annotations

import unittest

from pipeline.topology_compiler.schematic_world import _operation_bounds, _record_bounds


class FakeOperation:
    def __init__(self, payload):
        self.payload = payload

    def to_dict(self):
        return self.payload


class FakeRecord:
    bounds = None

    def __init__(self, operations):
        self.operations = operations


class SchematicWorldBoundsTests(unittest.TestCase):
    def test_line_bounds_include_stroke_margin(self):
        bounds = _operation_bounds(
            FakeOperation(
                {
                    "kind": "Line",
                    "x1": 1_000_000,
                    "y1": 2_000_000,
                    "x2": 5_000_000,
                    "y2": 4_000_000,
                    "width_nm": 200_000,
                }
            )
        )

        self.assertEqual(bounds, [0.65, 1.65, 5.35, 4.35])

    def test_record_bounds_union_render_operations(self):
        record = FakeRecord(
            [
                FakeOperation(
                    {
                        "kind": "Line",
                        "x1": 1_000_000,
                        "y1": 1_000_000,
                        "x2": 2_000_000,
                        "y2": 2_000_000,
                    }
                ),
                FakeOperation(
                    {
                        "kind": "Circle",
                        "cx": 8_000_000,
                        "cy": 6_000_000,
                        "radius_nm": 1_000_000,
                    }
                ),
            ]
        )

        self.assertEqual(_record_bounds(record), [0.65, 0.65, 9.35, 7.35])


if __name__ == "__main__":
    unittest.main()
