#!/usr/bin/env python3
"""Mint a real kicad_prism_session for capacity/load benchmarks.

Sessions are now server-side and revocable, so a benchmark cookie can no longer be
forged from SESSION_SECRET alone: a row must exist in the session store. This
script therefore runs inside the backend container, where both the application
code and PostgreSQL are reachable.

    docker compose exec backend /app/venv/bin/python \
        /app/scripts/mint_benchmark_session.py --email you@example.com

Add the account to BOOTSTRAP_ADMIN_USERS_STR (or give it a role assignment) so the
session resolves to a role. Revoke it when finished:

    docker compose exec backend /app/venv/bin/python -c \
        "from app.services import session_store_service as s; \
         print(s.revoke_sessions_for_email('you@example.com', reason='benchmark_done'))"
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.core.config import settings  # noqa: E402
from app.core.session import create_session_token  # noqa: E402
from app.services import session_store_service  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", default="", help="Account to mint for (default: first bootstrap admin)")
    parser.add_argument(
        "--output",
        default="/tmp/prism-benchmark-session.txt",
        help="Write raw cookie value here",
    )
    args = parser.parse_args()

    bootstrap = settings.BOOTSTRAP_ADMIN_USERS
    email = (args.email or (bootstrap[0] if bootstrap else "")).strip().lower()
    if not email or "@" not in email:
        raise SystemExit("Provide --email or set BOOTSTRAP_ADMIN_USERS_STR")

    session_id, record = session_store_service.create_session(
        email=email,
        name="Capacity Hammer",
        picture="",
        user_agent="prism-benchmark",
        client_ip="benchmark",
    )
    token = create_session_token(session_id)

    out = Path(args.output)
    out.write_text(token, encoding="utf-8")
    print(f"Wrote {out}")
    print(f"email={email} expires_at={record.expires_at.isoformat()}")
    print(f'export PRISM_BENCHMARK_SESSION_COOKIE="$(cat {out})"')


if __name__ == "__main__":
    main()
