"""TR-46: policy lookups must find workspace tables on the worker's real search path.

The worker connects with ``SET search_path TO comments, workspace, public``.
Taking the first entry resolved ``comments.project_trackers`` (absent) and
reported every configured destination as unconfigured, parking every outbound
op with ``forbidden``. Unit tests never saw it because the disposable schema
mirrors workspace tables into a single schema.
"""

from __future__ import annotations

import sys
import unittest
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.trackers.create_executor import _comment_dict_from_row, _encrypt_context  # noqa: E402
from app.services.trackers.connector_service import _context as connector_context  # noqa: E402
from app.services.trackers.drafts import board_name_from_comment, render_context_block_lines  # noqa: E402
from app.services.trackers.executor_support import workspace_schema  # noqa: E402
from app.services.trackers.promotion import load_policy_row  # noqa: E402
from tracker_fault_harness import POSTGRES_URL, SHARED_APPLICATION_DATABASE  # noqa: E402

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover
    psycopg = None  # type: ignore[assignment]


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class WorkerSearchPathPolicyTests(unittest.TestCase):
    """Two real schemas, worker search_path order, workspace tables only in the second."""

    def setUp(self) -> None:
        tag = uuid.uuid4().hex[:10]
        self.comments_schema = f"c46_{tag}"
        self.workspace_schema = f"w46_{tag}"
        self.conn = psycopg.connect(POSTGRES_URL, row_factory=dict_row)
        self.conn.execute(f'CREATE SCHEMA "{self.comments_schema}"')
        self.conn.execute(f'CREATE SCHEMA "{self.workspace_schema}"')
        self.conn.execute(
            f"""
            CREATE TABLE "{self.workspace_schema}".tracker_connectors (
                id TEXT PRIMARY KEY, paused BOOLEAN NOT NULL DEFAULT FALSE, provider TEXT NOT NULL DEFAULT 'github'
            );
            CREATE TABLE "{self.workspace_schema}".project_trackers (
                id TEXT PRIMARY KEY, project_id TEXT NOT NULL, connector_id TEXT NOT NULL,
                promote_min_role TEXT NOT NULL DEFAULT 'designer', visibility TEXT NOT NULL DEFAULT 'private'
            );
            INSERT INTO "{self.workspace_schema}".tracker_connectors (id) VALUES ('cn_a');
            INSERT INTO "{self.workspace_schema}".project_trackers (id, project_id, connector_id)
            VALUES ('pt_a', 'prj_a', 'cn_a');
            """
        )
        # The worker's order: comments first, workspace second.
        self.conn.execute(f'SET search_path TO "{self.comments_schema}", "{self.workspace_schema}", public')
        self.conn.commit()

    def tearDown(self) -> None:
        self.conn.rollback()
        self.conn.execute(f'DROP SCHEMA "{self.comments_schema}" CASCADE')
        self.conn.execute(f'DROP SCHEMA "{self.workspace_schema}" CASCADE')
        self.conn.commit()
        self.conn.close()

    def test_resolves_schema_that_holds_project_trackers(self) -> None:
        self.assertEqual(workspace_schema(self.conn), self.workspace_schema)

    def test_policy_row_is_found_on_worker_search_path(self) -> None:
        row = load_policy_row(self.conn, "prj_a", workspace_schema=workspace_schema(self.conn))
        self.assertIsNotNone(row, "configured destination must not read as unconfigured")
        self.assertEqual(row["connector_id"], "cn_a")
        self.assertEqual(row["connector_provider"], "github")

    def test_single_mirrored_schema_still_resolves(self) -> None:
        # Disposable test layout: everything in one schema, listed first.
        self.conn.execute(f'SET search_path TO "{self.workspace_schema}", public')
        self.assertEqual(workspace_schema(self.conn), self.workspace_schema)


if __name__ == "__main__":
    unittest.main()


class ExecutorRowMappingTests(unittest.TestCase):
    """Defects only visible with a real row: AAD context, board name, URL escaping."""

    def test_executor_decrypt_context_matches_admin_api(self) -> None:
        # The admin API wrote the envelope with {"record", "field"}; a bytes
        # context crashed decrypt_secret (`'bytes' object has no attribute 'items'`).
        self.assertEqual(_encrypt_context("cn_x"), connector_context("cn_x"))

    def test_board_name_comes_from_project_relative_path(self) -> None:
        row = {
            "id": "c_1",
            "anchor_state": "pinned",
            "anchor_source": "client",
            "anchor_commit": "0" * 40,
            "project_relative_path": "USB-PD-Trigger-Board.kicad_pro",
            "file_path": "USB-PD-Trigger-Board.kicad_sch",
        }
        comment = _comment_dict_from_row(row)
        self.assertEqual(board_name_from_comment(comment), "USB-PD-Trigger-Board")
        self.assertEqual(comment["anchor"]["source"], "client")

    def test_prism_url_is_not_html_escaped(self) -> None:
        url = "https://prism.example/projects/prj_a?commit=abc&view=sch&comment=c_1"
        lines = render_context_block_lines(
            comment={"context": "SCH", "location": {}, "anchor": {}},
            prism_url=url,
            requested_by="Requested by: someone",
            assignment_hints=[],
        )
        self.assertIn(f"Prism: {url}", lines)
        self.assertFalse(any("&amp;" in line for line in lines))
