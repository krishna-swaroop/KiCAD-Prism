import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from app.api import design_compare
from app.core.security import guest_user


class DesignCompareDebugLogTests(unittest.IsolatedAsyncioTestCase):
    async def test_writes_ordered_jsonl_to_the_configured_temp_file(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "comparison.jsonl"
            with (
                mock.patch.object(design_compare, "_DEBUG_LOG_PATH", path),
                mock.patch.object(
                    design_compare,
                    "get_project_for_role_or_404",
                ),
            ):
                await design_compare.append_design_compare_debug_log(
                    "project-1",
                    design_compare.DesignCompareDebugEvent(
                        session_id="session-1",
                        sequence=0,
                        event="session.start",
                        timestamp="2026-07-22T00:00:00Z",
                        payload={"base": "a", "compare": "b"},
                        reset=True,
                    ),
                    guest_user(),
                )
                response = await design_compare.append_design_compare_debug_log(
                    "project-1",
                    design_compare.DesignCompareDebugEvent(
                        session_id="session-1",
                        sequence=1,
                        event="difference.click",
                        timestamp="2026-07-22T00:00:01Z",
                        payload={"id": "net:VCC"},
                    ),
                    guest_user(),
                )

            records = [
                json.loads(line)
                for line in path.read_text(encoding="utf-8").splitlines()
            ]
            self.assertEqual([record["sequence"] for record in records], [0, 1])
            self.assertEqual(records[1]["event"], "difference.click")
            self.assertEqual(records[1]["payload"], {"id": "net:VCC"})
            self.assertEqual(response["path"], str(path))


if __name__ == "__main__":
    unittest.main()
