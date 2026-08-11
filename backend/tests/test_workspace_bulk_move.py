from contextlib import contextmanager
import unittest
from unittest.mock import patch

from app.services.workspace_service import WorkspaceService


class _Result:
    def __init__(self, rows=None, rowcount=0):
        self._rows = list(rows or [])
        self.rowcount = rowcount

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return self._rows


class _Connection:
    def __init__(self, *, folder_exists=True, existing_project_ids=()):
        self.folder_exists = folder_exists
        self.existing_project_ids = set(existing_project_ids)
        self.statements = []
        self.commits = 0

    def execute(self, query, params=()):
        statement = " ".join(query.split())
        self.statements.append((statement, params))

        if statement.startswith("SELECT id FROM ws_folders"):
            return _Result([{"id": params[0]}] if self.folder_exists else [])
        if statement.startswith("SELECT id FROM ws_projects"):
            requested = params[0]
            return _Result(
                [{"id": project_id} for project_id in requested if project_id in self.existing_project_ids]
            )
        if statement.startswith("UPDATE ws_projects"):
            return _Result(rowcount=len(params[1]))
        raise AssertionError(f"Unexpected SQL: {statement}")

    def commit(self):
        self.commits += 1


class WorkspaceBulkMoveTests(unittest.TestCase):
    def run_with_connection(self, connection, callback):
        service = WorkspaceService()

        @contextmanager
        def connect():
            yield connection

        with patch.object(service, "_connect", connect):
            return callback(service)

    def test_bulk_move_validates_then_updates_all_projects_once(self):
        connection = _Connection(existing_project_ids={"prj_a", "prj_b"})
        moved = self.run_with_connection(
            connection,
            lambda service: service.move_projects_to_folder(
                ["prj_a", "prj_b", "prj_a"], "fld_target"
            ),
        )

        self.assertEqual(moved, 2)
        self.assertEqual(connection.commits, 1)
        self.assertEqual(
            [statement.split()[0] for statement, _ in connection.statements],
            ["SELECT", "SELECT", "UPDATE"],
        )
        update_statement, update_params = connection.statements[-1]
        self.assertIn("WHERE id = ANY(%s)", update_statement)
        self.assertEqual(update_params, ("fld_target", ["prj_a", "prj_b"]))

    def test_bulk_move_does_not_update_any_project_when_one_is_missing(self):
        connection = _Connection(existing_project_ids={"prj_a"})

        with self.assertRaisesRegex(ValueError, "Project not found: prj_missing"):
            self.run_with_connection(
                connection,
                lambda service: service.move_projects_to_folder(
                    ["prj_a", "prj_missing"], "fld_target"
                ),
            )

        self.assertEqual(connection.commits, 0)
        self.assertTrue(
            all(not statement.startswith("UPDATE") for statement, _ in connection.statements)
        )

    def test_bulk_move_does_not_update_projects_when_destination_is_missing(self):
        connection = _Connection(folder_exists=False, existing_project_ids={"prj_a", "prj_b"})

        with self.assertRaisesRegex(ValueError, "Folder not found"):
            self.run_with_connection(
                connection,
                lambda service: service.move_projects_to_folder(
                    ["prj_a", "prj_b"], "fld_missing"
                ),
            )

        self.assertEqual(connection.commits, 0)
        self.assertEqual(len(connection.statements), 1)
        self.assertTrue(connection.statements[0][0].startswith("SELECT id FROM ws_folders"))
