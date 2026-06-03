from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException
from git import Actor, Repo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import file_service  # noqa: E402

AUTHOR = Actor("Prism Test", "prism@example.com")


def _commit_all(repo: Repo, message: str):
    repo.git.add(A=True)
    return repo.index.commit(message, author=AUTHOR, committer=AUTHOR)


class CommitFileServiceTests(unittest.TestCase):
    def test_lists_files_from_selected_commit_without_checkout(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            repo = Repo.init(root)
            outputs = root / "Design-Outputs"
            outputs.mkdir()
            (outputs / "old.pdf").write_text("old", encoding="utf-8")
            old_commit = _commit_all(repo, "old outputs").hexsha

            (outputs / "old.pdf").unlink()
            (outputs / "new.pdf").write_text("new", encoding="utf-8")
            _commit_all(repo, "new outputs")

            items = file_service.get_files_from_commit(
                str(root), old_commit, "Design-Outputs"
            )

            self.assertEqual([item.path for item in items], ["old.pdf"])
            self.assertEqual((outputs / "new.pdf").read_text(encoding="utf-8"), "new")

    def test_reads_type2_prefixed_file_from_selected_commit(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            repo = Repo.init(root)
            subproject = root / "boards" / "demo" / "Design-Outputs"
            subproject.mkdir(parents=True)
            (subproject / "report.txt").write_text("historical", encoding="utf-8")
            commit = _commit_all(repo, "add subproject output").hexsha

            blob = file_service.read_file_from_commit(
                str(root),
                commit,
                "report.txt",
                relative_prefix="boards/demo/Design-Outputs",
            )

            self.assertEqual(blob.name, "report.txt")
            self.assertEqual(blob.content.decode("utf-8"), "historical")

    def test_rejects_invalid_paths_and_directories(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            repo = Repo.init(root)
            outputs = root / "Design-Outputs"
            outputs.mkdir()
            (outputs / "report.txt").write_text("ok", encoding="utf-8")
            commit = _commit_all(repo, "add output").hexsha

            with self.assertRaises(HTTPException) as invalid_ctx:
                file_service.read_file_from_commit(str(root), commit, "../secret.txt")
            self.assertEqual(invalid_ctx.exception.status_code, 400)

            with self.assertRaises(HTTPException) as dir_ctx:
                file_service.read_file_from_commit(str(root), commit, "Design-Outputs")
            self.assertEqual(dir_ctx.exception.status_code, 400)

    def test_missing_commit_and_file_return_not_found(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            repo = Repo.init(root)
            (root / "README.md").write_text("ok", encoding="utf-8")
            commit = _commit_all(repo, "initial").hexsha

            with self.assertRaises(HTTPException) as missing_file_ctx:
                file_service.read_file_from_commit(str(root), commit, "missing.txt")
            self.assertEqual(missing_file_ctx.exception.status_code, 404)

            with self.assertRaises(HTTPException) as missing_commit_ctx:
                file_service.read_file_from_commit(
                    str(root), "does-not-exist", "README.md"
                )
            self.assertEqual(missing_commit_ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
