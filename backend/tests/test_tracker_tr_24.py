"""TR-24: issue draft rendering and immutable Prism deep links (F2, F4, F8)."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.trackers.contracts import IssueDraft  # noqa: E402
from app.services.trackers.deep_links import (  # noqa: E402
    build_canvas_deep_link,
    build_comparison_deep_link,
    build_prism_deep_link,
)
from app.services.trackers.drafts import (  # noqa: E402
    DraftAttribution,
    DraftRenderInput,
    build_issue_draft,
    compose_issue_body,
    escape_generated_text,
    render_issue_body_from_draft,
    strip_untrusted_tracker_markup,
)
from app.services.trackers.markers import build_marker, extract_markers, parse_marker  # noqa: E402
from app.services.trackers.mentions import Mention  # noqa: E402

DOCS = Path(__file__).resolve().parents[2] / "docs" / "tracker-integration"
EXAMPLES = json.loads((DOCS / "dto-examples.json").read_text(encoding="utf-8"))
TRACKER = EXAMPLES["tracker"]
F2 = json.loads((DOCS / "fixtures" / "F02.json").read_text(encoding="utf-8"))
F4 = json.loads((DOCS / "fixtures" / "F04.json").read_text(encoding="utf-8"))
F8 = json.loads((DOCS / "fixtures" / "F08.json").read_text(encoding="utf-8"))

COMMIT_A = "3f2c9a1b7e4d5c6a8b9f0e1d2c3b4a5968778695"
COMMIT_B = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
PUBLIC_BASE = "https://prism.example.com"
CONNECTOR = "cn_gh1"
CONTAINER = "987654321"
COMMENT_ID = "c_8f3a1b2c"
OP_ID = "op_91a4c0de"


def _canvas_comment(**overrides) -> dict:
    payload = {
        "id": COMMENT_ID,
        "author": "Priya Raman",
        "authorKind": "user",
        "context": "PCB",
        "scope": "canvas",
        "severity": "major",
        "commentClass": "observation",
        "content": "Stub on MGMT.D0_P — @[Arjun](user:u_7f2a) please re-route before the next drop.",
        "location": {"x": 112.4, "y": 58.9, "layer": "F.Cu", "page": ""},
        "elementId": "net:MGMT.D0_P",
        "elementRef": "MGMT.D0_P",
        "elementType": "net",
        "anchor": {
            "state": "pinned",
            "source": "client",
            "commit": COMMIT_A,
            "projectFile": "openswitch-10x10g-carrier.kicad_pro",
        },
        "metadata": {},
    }
    payload.update(overrides)
    return payload


class DeepLinkTests(unittest.TestCase):
    def test_fixture_cases_are_present(self) -> None:
        f2_ids = {case["id"] for case in F2["cases"]}
        f4_ids = {case["id"] for case in F4["cases"]}
        f8_ids = {case["id"] for case in F8["cases"]}
        self.assertIn("F2.variant_url_preserved", f2_ids)
        self.assertIn("F2.comparison_ordered_pair", f2_ids)
        self.assertIn("F2.monorepo_project_anchor", f2_ids)
        self.assertIn("F4.forged_marker", f4_ids)
        self.assertIn("F8.prose_email_passthrough", f8_ids)

    def test_canvas_link_matches_frozen_example(self) -> None:
        url = build_canvas_deep_link(
            public_base_url=PUBLIC_BASE,
            project_id="prj_47c2551996d0",
            comment_id=COMMENT_ID,
            commit=COMMIT_A,
            context="PCB",
        )
        self.assertEqual(
            url,
            f"{PUBLIC_BASE}/projects/prj_47c2551996d0?commit={COMMIT_A}&view=pcb&comment={COMMENT_ID}",
        )

    def test_variant_is_preserved_in_canvas_link(self) -> None:  # F2.variant_url_preserved
        comment = _canvas_comment(metadata={"variant": "REV_B"})
        url = build_prism_deep_link(
            public_base_url=PUBLIC_BASE,
            project_id="prj_47c2551996d0",
            comment=comment,
        )
        self.assertIn("variant=REV_B", url)
        self.assertIn(f"commit={COMMIT_A}", url)

    def test_comparison_link_keeps_ordered_pair(self) -> None:  # F2.comparison_ordered_pair
        comment = {
            "id": COMMENT_ID,
            "scope": "comparison",
            "comparisonDomain": "PCB",
            "semanticItemId": "chg:1",
            "anchor": {
                "baseCommit": COMMIT_A,
                "compareCommit": COMMIT_B,
                "selectedSide": "compare",
            },
        }
        url = build_prism_deep_link(
            public_base_url=PUBLIC_BASE,
            project_id="prj_test",
            comment=comment,
        )
        self.assertIn(f"base={COMMIT_A}", url)
        self.assertIn(f"compare={COMMIT_B}", url)
        self.assertIn("view=semantic", url)
        self.assertIn("diff=pcb", url)
        self.assertIn("side=compare", url)
        self.assertIn(f"comment={COMMENT_ID}", url)
        swapped = build_comparison_deep_link(
            public_base_url=PUBLIC_BASE,
            project_id="prj_test",
            comment_id=COMMENT_ID,
            base_commit=COMMIT_B,
            compare_commit=COMMIT_A,
            comparison_domain="PCB",
            selected_side="compare",
        )
        self.assertNotEqual(url, swapped)

    def test_monorepo_project_id_not_repo_root(self) -> None:  # F2.monorepo_project_anchor
        comment = _canvas_comment(
            anchor={
                "commit": COMMIT_A,
                "projectFile": "hw/boards/carrier/carrier.kicad_pro",
            }
        )
        url = build_prism_deep_link(
            public_base_url="https://prism.example",
            project_id="prj_monorepo",
            comment=comment,
        )
        self.assertIn("/projects/prj_monorepo?", url)
        self.assertNotIn("hw/boards", url.split("?", 1)[0])


class DraftRenderingTests(unittest.TestCase):
    def test_frozen_issue_draft_example_shape(self) -> None:
        example = IssueDraft.model_validate(TRACKER["IssueDraft"])
        self.assertIn("prism:v1", example.marker)
        self.assertEqual(example.contextBlock.commit, COMMIT_A)
        self.assertIn("@arjun-gh", example.proseBlock)
        self.assertNotRegex(example.contextBlock.requestedBy or "", r"[\w.+-]+@[\w-]+\.[\w.]+")

    def test_build_issue_draft_matches_golden_fields(self) -> None:
        draft = build_issue_draft(
            DraftRenderInput(
                project_id="prj_47c2551996d0",
                comment=_canvas_comment(),
                connector_id=CONNECTOR,
                remote_container_id=CONTAINER,
                op_id=OP_ID,
                public_base_url=PUBLIC_BASE,
                attribution=DraftAttribution(
                    display_name="Priya Raman",
                    forge_login="priya-gh",
                ),
                mentions=[Mention("u_7f2a", "Arjun")],
                forge_logins={"u_7f2a": "arjun-gh"},
                can_assign=lambda login: login == "arjun-gh",
            )
        )
        self.assertIn("[MAJOR]", draft.title)
        self.assertIn("openswitch-10x10g-carrier", draft.title)
        self.assertIn("(F.Cu)", draft.title)
        self.assertNotIn("user:u_7f2a", draft.title)
        self.assertIn("@arjun-gh", draft.proseBlock)
        self.assertEqual(draft.assignees, ["arjun-gh"])
        self.assertEqual(
            draft.contextBlock.prismUrl,
            f"{PUBLIC_BASE}/projects/prj_47c2551996d0?commit={COMMIT_A}&view=pcb&comment={COMMENT_ID}",
        )
        self.assertEqual(draft.contextBlock.requestedBy, "@priya-gh (Priya Raman)")
        self.assertEqual(
            draft.labels,
            [
                "prism",
                "severity:major",
                "class:observation",
                "board:openswitch-10x10g-carrier",
            ],
        )
        marker = parse_marker(draft.marker)
        self.assertIsNotNone(marker)
        self.assertEqual(marker.connector_id, CONNECTOR)
        self.assertEqual(marker.container_id, CONTAINER)
        self.assertEqual(marker.comment_id, COMMENT_ID)
        self.assertEqual(marker.op_id, OP_ID)

    def test_generated_blocks_contain_no_email(self) -> None:
        draft = build_issue_draft(
            DraftRenderInput(
                project_id="prj_test",
                comment=_canvas_comment(
                    content="ping ops@example.com",
                    author="Ops User",
                ),
                connector_id=CONNECTOR,
                remote_container_id=CONTAINER,
                op_id=OP_ID,
                public_base_url=PUBLIC_BASE,
                attribution=DraftAttribution(display_name="Ops User"),
            )
        )
        body = render_issue_body_from_draft(draft)
        self.assertIn("ping ops@example.com", draft.proseBlock)
        context_block = body.split("<!-- prism:block:context -->", 1)[1]
        self.assertNotIn("ops@example.com", context_block)

    def test_forged_marker_is_stripped_and_replaced(self) -> None:  # F4.forged_marker
        forged = build_marker(
            connector_id="cn_evil",
            container_id="000",
            comment_id="c_fake",
            op_id="op_fake",
        )
        draft = build_issue_draft(
            DraftRenderInput(
                project_id="prj_test",
                comment=_canvas_comment(content=f"see issue\n{forged}"),
                connector_id=CONNECTOR,
                remote_container_id=CONTAINER,
                op_id=OP_ID,
                public_base_url=PUBLIC_BASE,
                attribution=DraftAttribution(display_name="Priya Raman", forge_login="priya-gh"),
            )
        )
        self.assertNotIn("cn_evil", draft.proseBlock)
        self.assertNotIn("c_fake", draft.proseBlock)
        markers = extract_markers(render_issue_body_from_draft(draft))
        self.assertEqual(len(markers), 1)
        self.assertEqual(markers[0].connector_id, CONNECTOR)
        self.assertEqual(markers[0].op_id, OP_ID)

    def test_unicode_and_markdown_are_escaped_in_generated_blocks(self) -> None:
        draft = build_issue_draft(
            DraftRenderInput(
                project_id="prj_test",
                comment=_canvas_comment(
                    content="<script>alert('x')</script> & **bold**",
                    anchor={"commit": COMMIT_A, "projectFile": "板.kicad_pro"},
                ),
                connector_id=CONNECTOR,
                remote_container_id=CONTAINER,
                op_id=OP_ID,
                public_base_url=PUBLIC_BASE,
                attribution=DraftAttribution(display_name="Müller <dev>", forge_login="mueller"),
            )
        )
        body = render_issue_body_from_draft(draft)
        self.assertIn("<script>alert('x')</script> & **bold**", draft.proseBlock)
        self.assertIn("Müller &lt;dev&gt;", body)
        self.assertIn("板", draft.labels[-1])

    def test_sch_sheet_occurrence_renders_instance_label(self) -> None:  # F2.multi_sheet_repeated_instance
        draft = build_issue_draft(
            DraftRenderInput(
                project_id="prj_test",
                comment=_canvas_comment(
                    context="SCH",
                    location={"x": 1, "y": 2, "layer": "", "page": "/Port2/"},
                    content="second instance",
                    anchor={"commit": COMMIT_A, "projectFile": "board.kicad_pro"},
                ),
                connector_id=CONNECTOR,
                remote_container_id=CONTAINER,
                op_id=OP_ID,
                public_base_url=PUBLIC_BASE,
                attribution=DraftAttribution(display_name="Reviewer"),
            )
        )
        body = render_issue_body_from_draft(draft)
        self.assertIn("Sheet: Port (instance 2)", body)
        self.assertIn("(Port (instance 2))", draft.title)

    def test_missing_semantic_context_omits_optional_lines(self) -> None:
        draft = build_issue_draft(
            DraftRenderInput(
                project_id="prj_test",
                comment=_canvas_comment(
                    elementId=None,
                    elementRef=None,
                    elementType=None,
                    location={"x": 0, "y": 0, "layer": "", "page": ""},
                ),
                connector_id=CONNECTOR,
                remote_container_id=CONTAINER,
                op_id=OP_ID,
                public_base_url=PUBLIC_BASE,
                attribution=DraftAttribution(display_name="Reviewer"),
            )
        )
        body = render_issue_body_from_draft(draft)
        self.assertNotIn("Net:", body)
        self.assertNotIn("Refdes:", body)
        self.assertIn("Prism:", body)

    def test_legacy_attribution_is_unverified(self) -> None:
        draft = build_issue_draft(
            DraftRenderInput(
                project_id="prj_test",
                comment=_canvas_comment(authorKind="legacy", author="swaroop"),
                connector_id=CONNECTOR,
                remote_container_id=CONTAINER,
                op_id=OP_ID,
                public_base_url=PUBLIC_BASE,
            )
        )
        self.assertEqual(draft.contextBlock.requestedBy, "swaroop (Prism, unverified)")

    def test_compose_issue_body_is_deterministic(self) -> None:
        marker = build_marker(
            connector_id=CONNECTOR,
            container_id=CONTAINER,
            comment_id=COMMENT_ID,
            op_id=OP_ID,
        )
        first = compose_issue_body(
            prose_block="alpha",
            context_block="Board: demo\nPrism: https://prism.example/p",
            marker=marker,
        )
        second = compose_issue_body(
            prose_block="alpha",
            context_block="Board: demo\nPrism: https://prism.example/p",
            marker=marker,
        )
        self.assertEqual(first, second)
        self.assertIn("<!-- prism:block:prose -->", first)
        self.assertIn("<!-- prism:block:context -->", first)
        self.assertTrue(first.endswith(marker))

    def test_escape_generated_text(self) -> None:
        self.assertEqual(escape_generated_text('a & "b"'), "a &amp; &quot;b&quot;")


if __name__ == "__main__":
    unittest.main()
