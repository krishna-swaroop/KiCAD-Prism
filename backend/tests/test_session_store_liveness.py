"""Idle-expired browser sessions must be neither listed nor accepted.

`list_sessions` and `load_session` share one liveness predicate, so a session
that the idle timeout has killed cannot appear as active in Settings.
"""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.services import session_store_service
from app.services.postgres_database import database

DATABASE_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()


@unittest.skipUnless(DATABASE_URL, "PRISM_DATABASE_URL is required for session liveness tests")
class SessionLivenessTests(unittest.TestCase):
    def setUp(self) -> None:
        session_store_service.initialize_session_store()
        self.email = f"session-liveness-{uuid.uuid4().hex[:10]}@example.com"
        self.session_id, _ = session_store_service.create_session(
            email=self.email, name="Liveness", picture=""
        )
        self.addCleanup(session_store_service.revoke_session, self.session_id)

    def _age_last_seen(self, minutes: int) -> None:
        with database.connection() as connection:
            connection.execute("SET search_path TO workspace, public")
            connection.execute(
                """
                UPDATE user_sessions
                SET last_seen_at = NOW() - make_interval(mins => %s)
                WHERE session_digest = %s
                """,
                (minutes, session_store_service.session_id_digest(self.session_id)),
            )
            connection.commit()

    def _listed(self) -> bool:
        listed_id = session_store_service.session_id_digest(self.session_id)[:16]
        return any(
            row["id"] == listed_id
            for row in session_store_service.list_sessions(self.email)
        )

    def test_an_idle_expired_session_is_not_listed_and_is_refused(self) -> None:
        self._age_last_seen(120)
        with patch.object(settings, "SESSION_IDLE_TIMEOUT_MINUTES", 60):
            self.assertFalse(self._listed())
            self.assertIsNone(session_store_service.load_session(self.session_id))

    def test_an_idle_session_is_listed_and_accepted_when_the_timeout_is_off(self) -> None:
        self._age_last_seen(120)
        with patch.object(settings, "SESSION_IDLE_TIMEOUT_MINUTES", 0):
            self.assertTrue(self._listed())
            self.assertIsNotNone(session_store_service.load_session(self.session_id))


if __name__ == "__main__":
    unittest.main()
