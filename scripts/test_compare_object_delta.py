#!/usr/bin/env python3

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from compare_object_delta import _agreement


def python_change(
    uuid: str,
    kind: str,
    status: str,
    changed_fields: list[str],
) -> dict:
    return {
        "uuid": uuid,
        "kind": kind,
        "status": status,
        "changedFields": changed_fields,
    }


def node_change(
    uuid: str,
    kind: str,
    status: str,
    *,
    in_sidecar_vocabulary: bool = True,
) -> dict:
    return {
        "uuid": uuid,
        "kind": kind,
        "status": status,
        "inSidecarVocabulary": in_sidecar_vocabulary,
    }


class ObjectDeltaAgreementTests(unittest.TestCase):
    def test_classifies_every_expected_model_difference(self) -> None:
        python = [
            python_change("same", "wire", "changed", ["points"]),
            python_change("semantic", "wire", "changed", ["net", "semantic_id"]),
            python_change("generated", "zone", "changed", ["points", "bounds"]),
            python_change("unsupported", "graphic", "changed", ["points"]),
            python_change("churn", "symbol", "added", ["source_id"]),
            python_change("churn", "symbol", "removed", ["source_id"]),
        ]
        node = {
            "changes": [
                node_change("same", "wire", "changed"),
                node_change("churn", "symbol", "changed"),
                node_change(
                    "new-kind",
                    "pad",
                    "added",
                    in_sidecar_vocabulary=False,
                ),
                node_change("parser-only", "footprint", "changed"),
            ],
            "ignored": [
                {
                    "uuid": "generated",
                    "kind": "zone",
                    "reason": "generated-content-only",
                }
            ],
        }

        report = _agreement(python, node)
        counts = {
            row["classification"]: row["count"]
            for row in report["classifications"]
        }

        self.assertEqual(report["totals"]["agreed"], 1)
        self.assertEqual(
            counts,
            {
                "generated-content-only": 1,
                "object-kind-without-sidecar": 1,
                "parser-authored-content-only": 1,
                "semantic-enrichment-only": 1,
                "semantic-identity-churn": 2,
                "viewer-parser-unsupported-graphic": 1,
            },
        )
        self.assertEqual(report["unexplained"], 0)

    def test_marks_an_unexplained_sidecar_only_change_as_a_regression(self) -> None:
        report = _agreement(
            [python_change("missed", "wire", "changed", ["points"])],
            {"changes": [], "ignored": []},
        )

        self.assertEqual(report["unexplained"], 1)
        self.assertEqual(
            report["classifications"][0]["classification"],
            "unexplained-sidecar-only",
        )
        self.assertFalse(report["classifications"][0]["improvement"])


if __name__ == "__main__":
    unittest.main()
