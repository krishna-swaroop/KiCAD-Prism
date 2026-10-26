"""The caller policy as a table: credential × role × action (× owner).

No TestClient and no database, except the one class that checks the generated
SQL folder predicate against the Python rule on a real PostgreSQL. The expected
tables are written out by hand so a wrong edit to the policy cannot regenerate
itself into passing tests.
"""

from __future__ import annotations

import itertools
import os
import subprocess
import sys
import unittest
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core import policy  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
EXPORT_SCRIPT = REPO_ROOT / "scripts" / "export_role_matrix.py"

ROLES = ("viewer", "qa", "designer", "admin")
ALL = frozenset(ROLES)


@dataclass
class _Caller:
    role: str
    auth_type: str = "session"
    scopes: list[str] = field(default_factory=list)
    email: str = "person@example.com"


# Credential kinds: (auth_type, scopes).
CREDENTIALS = {
    "session": ("session", []),
    "provider": ("kicad_provider", ["remote_symbols.read"]),
    "read_token": ("service_client", ["api:read"]),
    "write_token": ("service_client", ["api:write"]),
    "agent_token": ("agent", ["api:read", "api:write"]),
    "wildcard": ("external_service", ["*"]),
    "no_scope": ("service_client", []),
}

# api:write implies api:read; "*" holds every scope; sessions carry none and need none.
READERS = {"session", "read_token", "write_token", "agent_token", "wildcard"}
WRITERS = {"session", "write_token", "agent_token", "wildcard"}

# action -> (credential kinds that pass, roles that pass)
EXPECTED: dict[str, tuple[set[str], frozenset[str]]] = {
    "read": (READERS, ALL),
    "comment": (WRITERS, ALL),
    "design": (WRITERS, frozenset({"designer", "admin"})),
    "release": (WRITERS, frozenset({"designer", "qa", "admin"})),
    "admin": (WRITERS, frozenset({"admin"})),
    "catalog_browse": (READERS, ALL),
    "catalog_read": (READERS, frozenset({"designer", "qa", "admin"})),
    "catalog_write": (WRITERS, frozenset({"designer", "admin"})),
    "catalog_qa": (WRITERS, frozenset({"qa", "admin"})),
    "catalog_admin": (WRITERS, frozenset({"admin"})),
    "remote_symbols": (READERS | {"provider"}, ALL),
    # Ops (ADR §11, D20): admins only, and api:write does not imply ops scopes.
    "ops_read": ({"session", "wildcard"}, frozenset({"admin"})),
    "ops_act": ({"session", "wildcard"}, frozenset({"admin"})),
}

# Area-scoped actions: (the scope its rule names, a role the role half allows).
AREA_ACTIONS = {
    "comment": ("comments:write", "viewer"),
    "design": ("design:write", "designer"),
    "release": ("release:approve", "qa"),
    "admin": ("admin", "admin"),
    "catalog_write": ("catalog:write", "designer"),
    "catalog_qa": ("catalog:qa", "qa"),
    "catalog_admin": ("admin", "admin"),
}

HUMAN_ONLY_ACTIONS = ("release", "admin", "catalog_qa", "catalog_admin")
HUMAN_ONLY_DETAIL = "Only a person signed in to Prism can do this; open it in Prism"


class CallerPolicyTableTests(unittest.TestCase):
    def test_every_action_is_in_the_table(self) -> None:
        self.assertEqual(set(policy.RULES), set(EXPECTED))

    def test_credential_role_action_table(self) -> None:
        for action, (credentials, roles) in EXPECTED.items():
            for (kind, (auth_type, scopes)), role in itertools.product(CREDENTIALS.items(), ROLES):
                caller = _Caller(role=role, auth_type=auth_type, scopes=list(scopes))
                expected = kind in credentials and role in roles
                with self.subTest(action=action, credential=kind, role=role):
                    self.assertEqual(policy.allows(caller, action), expected)
                    if expected:
                        self.assertIs(policy.authorize(caller, action), caller)
                    else:
                        with self.assertRaises(HTTPException) as ctx:
                            policy.authorize(caller, action)
                        self.assertEqual(ctx.exception.status_code, 403)

    def test_provider_refusal_comes_before_scope_and_role(self) -> None:
        caller = _Caller(role="admin", auth_type="kicad_provider", scopes=["*"])
        self.assertEqual(policy.refusal(caller, "read"), "KiCad remote-provider tokens can only read remote symbols")
        self.assertEqual(policy.refusal(caller, "admin"), "KiCad remote-provider tokens cannot access admin APIs")
        self.assertEqual(policy.refusal(caller, "catalog_write"), "KiCad remote-provider tokens cannot modify catalog resources")
        self.assertIsNone(policy.refusal(caller, "remote_symbols"))

    def test_scope_refusal_comes_before_role(self) -> None:
        caller = _Caller(role="viewer", auth_type="service_client", scopes=["api:read"])
        self.assertEqual(policy.refusal(caller, "design"), "design:write scope required")
        self.assertEqual(
            policy.refusal(_Caller(role="viewer", auth_type="agent", scopes=["api:write"]), "design"),
            "Designer role required",
        )

    def test_effective_scopes_expand_implied_scopes(self) -> None:
        self.assertEqual(
            policy.effective_scopes(["api:write"]),
            {"api:write", "api:read", *policy.AREA_WRITE_SCOPES},
        )
        self.assertEqual(policy.effective_scopes(["design:write"]), {"design:write", "api:read"})

    def test_area_scope_grants_exactly_its_action_to_a_bearer(self) -> None:
        for action, (scope, role) in AREA_ACTIONS.items():
            with self.subTest(action=action, scope=scope):
                self.assertTrue(policy.allows(_Caller(role=role, auth_type="agent", scopes=[scope]), action))
                self.assertTrue(policy.allows(_Caller(role=role, auth_type="agent", scopes=["api:write"]), action))
                self.assertTrue(policy.allows(_Caller(role=role, auth_type="agent", scopes=["*"]), action))
                other = next(name for name in policy.AREA_WRITE_SCOPES if name != scope)
                refused = _Caller(role=role, auth_type="agent", scopes=[other])
                self.assertEqual(policy.refusal(refused, action), f"{scope} scope required")

    def test_mcp_admin_holding_every_scope_is_refused_human_only_actions(self) -> None:
        caller = _Caller(role="admin", auth_type="mcp", scopes=["*"])
        for action in HUMAN_ONLY_ACTIONS:
            with self.subTest(action=action):
                self.assertEqual(policy.refusal(caller, action), HUMAN_ONLY_DETAIL)
                with self.assertRaises(HTTPException) as ctx:
                    policy.authorize(caller, action)
                self.assertEqual(ctx.exception.status_code, 403)

    def test_mcp_admin_may_still_read_comment_design_and_write_catalog(self) -> None:
        caller = _Caller(role="admin", auth_type="mcp", scopes=["*"])
        for action in ("read", "comment", "design", "catalog_write"):
            with self.subTest(action=action):
                self.assertIsNone(policy.refusal(caller, action))
                self.assertIs(policy.authorize(caller, action), caller)

    def test_a_session_admin_may_do_human_only_actions(self) -> None:
        caller = _Caller(role="admin")
        for action in HUMAN_ONLY_ACTIONS:
            with self.subTest(action=action):
                self.assertTrue(policy.allows(caller, action))

    def test_provider_refusal_comes_before_human_only(self) -> None:
        caller = _Caller(role="admin", auth_type="kicad_provider", scopes=["*"])
        expected = {
            "release": "KiCad remote-provider tokens cannot modify Prism resources",
            "admin": "KiCad remote-provider tokens cannot access admin APIs",
            "catalog_qa": "KiCad remote-provider tokens cannot modify catalog resources",
            "catalog_admin": "KiCad remote-provider tokens cannot modify catalog resources",
        }
        for action, detail in expected.items():
            with self.subTest(action=action):
                self.assertEqual(policy.refusal(caller, action), detail)
                self.assertNotEqual(policy.refusal(caller, action), HUMAN_ONLY_DETAIL)

    def test_bearer_scope_rule_table(self) -> None:
        # (held scopes, required scope) -> satisfied
        cases = [
            ([], "api:read", False),
            (["api:read"], "api:read", True),
            (["api:write"], "api:read", True),
            (["api:read", "api:write"], "api:read", True),
            (["*"], "api:read", True),
            (["remote_symbols.read"], "api:read", False),
            (["api:read"], "api:write", False),
            (["api:write"], "api:write", True),
            (["*"], "api:write", True),
            (["api:write"], "remote_symbols.read", False),
            (["remote_symbols.read"], "remote_symbols.read", True),
        ]
        for held, required, expected in cases:
            caller = _Caller(role="viewer", auth_type="service_client", scopes=held)
            with self.subTest(held=held, required=required):
                self.assertEqual(policy.has_scope(caller, required), expected)

    def test_sessions_need_no_scope_to_read(self) -> None:
        for role in ROLES:
            self.assertTrue(policy.allows(_Caller(role=role), "read"))

    def test_role_allows_is_the_role_half_only(self) -> None:
        for action, (_credentials, roles) in EXPECTED.items():
            for role in ROLES:
                with self.subTest(action=action, role=role):
                    self.assertEqual(policy.role_allows(role, action), role in roles)


class OwnershipTests(unittest.TestCase):
    def test_owner_comparison_is_normalised_once(self) -> None:
        caller = _Caller(role="designer", email="Designer@Example.com")
        for owner in ("designer@example.com", " DESIGNER@example.COM ", "Designer@Example.com"):
            with self.subTest(owner=owner):
                self.assertTrue(policy.is_owner(caller, owner))
        for owner in ("", None, "other@example.com", "designer@example.co"):
            with self.subTest(owner=owner):
                self.assertFalse(policy.is_owner(caller, owner))

    def test_owner_or_admin_table(self) -> None:
        cases = [
            ("designer", "me@example.com", True),
            ("designer", "other@example.com", False),
            ("designer", "", False),
            ("viewer", "me@example.com", True),
            ("admin", "other@example.com", True),
            ("admin", "", True),
            ("qa", None, False),
        ]
        for role, owner, expected in cases:
            caller = _Caller(role=role, email="me@example.com")
            with self.subTest(role=role, owner=owner):
                self.assertEqual(policy.owner_or_admin(caller, owner), expected)
                if not expected:
                    with self.assertRaises(HTTPException) as ctx:
                        policy.require_owner_or_admin(caller, owner, detail="denied")
                    self.assertEqual(ctx.exception.status_code, 403)


# (visibility_mode, allowed_roles) -> roles that see the folder
FOLDER_CASES = [
    (None, None, ALL),
    ("all", ["designer"], ALL),
    ("roles", [], ALL),
    ("roles", ["viewer"], frozenset({"viewer", "qa"})),
    ("roles", ["qa"], frozenset({"qa"})),
    ("roles", ["designer"], frozenset({"designer"})),
    ("roles", ["admin"], frozenset({"admin"})),
    ("roles", ["designer", "admin"], frozenset({"designer", "admin"})),
    ("roles", ["viewer", "admin"], frozenset({"viewer", "qa", "admin"})),
]


class FolderVisibilityTests(unittest.TestCase):
    def test_folder_rule_table(self) -> None:
        for (mode, allowed, visible_to), role in itertools.product(FOLDER_CASES, ROLES):
            with self.subTest(mode=mode, allowed=allowed, role=role):
                self.assertEqual(policy.folder_visible(role, mode, allowed), role in visible_to)

    def test_no_role_means_no_filter(self) -> None:
        self.assertTrue(policy.folder_visible(None, "roles", ["admin"]))


DATABASE_URL = (os.environ.get("TEST_POSTGRES_URL") or os.environ.get("PRISM_DATABASE_URL") or "").strip()


@unittest.skipUnless(DATABASE_URL, "PostgreSQL is required to evaluate the generated predicate")
class FolderVisibilitySqlTests(unittest.TestCase):
    def test_generated_sql_matches_the_python_rule(self) -> None:
        import psycopg
        from psycopg.types.json import Jsonb

        with psycopg.connect(DATABASE_URL) as conn:
            for (mode, allowed, visible_to), role in itertools.product(FOLDER_CASES, ROLES):
                folder_id = None if mode is None else "folder-1"
                row = conn.execute(
                    f"""
                    SELECT {policy.folder_visible_sql("f")} AS visible
                    FROM (SELECT %(id)s::text AS id, %(mode)s::text AS visibility_mode,
                                 %(allowed)s::jsonb AS allowed_roles) AS f
                    """,
                    {
                        "id": folder_id,
                        "mode": mode,
                        "allowed": None if allowed is None else Jsonb(allowed),
                        **policy.folder_visibility_params(role),
                    },
                ).fetchone()
                with self.subTest(mode=mode, allowed=allowed, role=role):
                    self.assertEqual(row[0], role in visible_to)


class RoleMatrixContractTests(unittest.TestCase):
    EXPECTED_MATRIX = {
        "view_projects": ["viewer", "designer", "qa", "admin"],
        "manage_projects": ["designer", "admin"],
        # The server lets every role comment (require_comment_writer); resolving
        # and publishing stay with designer+ through the per-thread permissions.
        "comment_on_projects": ["viewer", "designer", "qa", "admin"],
        "inspect_release_studio": ["viewer", "designer", "qa", "admin"],
        "start_release_builds": ["designer", "admin"],
        "approve_project_releases": ["designer", "qa", "admin"],
        "publish_project_releases": ["designer", "qa", "admin"],
        "view_catalog": ["viewer", "designer", "qa", "admin"],
        "edit_catalog": ["designer", "admin"],
        "review_catalog_qa": ["qa", "admin"],
        "administer_catalog": ["admin"],
        "administer_workspace": ["admin"],
    }

    def test_matrix_matches_the_hand_written_table(self) -> None:
        contract = policy.role_matrix_contract()
        self.assertEqual(contract["roles"], ["viewer", "designer", "qa", "admin"])
        self.assertEqual(contract["authorities"], self.EXPECTED_MATRIX)

    def test_generated_frontend_module_is_current(self) -> None:
        result = subprocess.run(
            [sys.executable, str(EXPORT_SCRIPT), "--check"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)


if __name__ == "__main__":
    unittest.main()
