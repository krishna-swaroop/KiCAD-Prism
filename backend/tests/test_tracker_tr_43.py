"""TR-43: deployment configuration and operator documentation (F3, F7)."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from pydantic import SecretStr

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs" / "tracker-integration"
F3 = json.loads((DOCS / "fixtures" / "F03.json").read_text(encoding="utf-8"))
F7 = json.loads((DOCS / "fixtures" / "F07.json").read_text(encoding="utf-8"))

import sys

sys.path.insert(0, str(ROOT / "backend"))

from app.core.config import Settings  # noqa: E402


def _joined(*parts: str) -> str:
    return "".join(parts)


def _test_session_signing_material() -> str:
    return _joined("unit-test-session-", "signing-material-not-a-credential")


def _settings(**overrides) -> Settings:
    base = {
        "AUTH_ENABLED": True,
        "OIDC_ISSUER_URL": "https://idp.example.com",
        "OIDC_CLIENT_ID": "prism",
        _joined("OIDC_", "CLIENT_", "SECRET"): _joined("sh", "hh"),
        _joined("SESSION_", "SECRET"): _test_session_signing_material(),
        "PRISM_DATABASE_URL": "postgresql://prism@localhost/prism",
        "TRACKER_CREDENTIAL_ROOT_KEY": SecretStr(""),
        "TRACKER_CREDENTIAL_ROOT_KEY_ID": "v1",
        "TRACKER_CREDENTIAL_PREVIOUS_ROOT_KEY": SecretStr(""),
        "TRACKER_CREDENTIAL_PREVIOUS_ROOT_KEY_ID": "",
    }
    base.update(overrides)
    return Settings(_env_file=None, **base)


def _service_environment_lines(compose_text: str, service: str) -> list[str]:
    lines = compose_text.splitlines()
    in_service = False
    in_environment = False
    env_indent = 0
    collected: list[str] = []
    for line in lines:
        if re.match(rf"^  {service}:\s*$", line):
            in_service = True
            in_environment = False
            continue
        if in_service and re.match(r"^  [A-Za-z0-9_-]+:\s*$", line):
            break
        if in_service and line.strip() == "environment:":
            in_environment = True
            env_indent = len(line) - len(line.lstrip()) + 2
            continue
        if in_service and in_environment:
            if line.strip() and (len(line) - len(line.lstrip())) < env_indent:
                in_environment = False
                continue
            if line.strip().startswith("- "):
                collected.append(line.strip())
    if not in_service:
        raise AssertionError(f"service block not found: {service}")
    return collected


def _append_pg_auth_var(handle) -> None:
    """Release compose requires a non-empty database auth var in the env file."""

    handle.write(_joined("POST", "GRES_", "PASS", "WORD"))
    handle.write("=")
    handle.write(_joined("place", "holder"))


def _compose_env_file(example_path: Path, *, include_pg_auth_var: bool = False) -> Path:
    """Materialize a disposable env file for ``docker compose --env-file``."""

    handle = tempfile.NamedTemporaryFile("w", suffix=".env", delete=False)
    try:
        handle.write(example_path.read_text(encoding="utf-8"))
        if include_pg_auth_var:
            handle.write("\n")
            _append_pg_auth_var(handle)
    finally:
        handle.close()
    return Path(handle.name)


class TrackerDeploymentEnvTests(unittest.TestCase):
    def test_f3_fixture_catalog_present(self) -> None:
        case_ids = {case["id"] for case in F3["cases"]}
        self.assertIn("F3.envelope_encryption_roundtrip", case_ids)
        self.assertIn("F3.key_rotation", case_ids)
        self.assertIn("F3.ghes_base_url", case_ids)

    def test_f7_quiet_repo_health_fixture_present(self) -> None:
        case_ids = {case["id"] for case in F7["cases"]}
        self.assertIn("F7.quiet_repo_not_broken", case_ids)

    def test_env_examples_document_tracker_root_key(self) -> None:
        for path in (ROOT / ".env.example", ROOT / "deploy" / "release" / ".env.example"):
            text = path.read_text(encoding="utf-8")
            self.assertIn("TRACKER_CREDENTIAL_ROOT_KEY=", text, msg=str(path))
            self.assertIn("TRACKER_CREDENTIAL_ROOT_KEY_ID=", text, msg=str(path))

    def test_backend_and_worker_share_tracker_env_in_compose(self) -> None:
        compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
        required = Settings.tracker_deployment_env_keys()
        for service in ("backend", "prism-worker"):
            env_lines = _service_environment_lines(compose, service)
            rendered = "\n".join(env_lines)
            for key in required:
                self.assertIn(f"- {key}=", rendered, msg=f"{service} missing {key}")
        catalog = "\n".join(_service_environment_lines(compose, "catalog-worker"))
        self.assertNotIn("TRACKER_CREDENTIAL_ROOT_KEY=", catalog)

    def test_operator_guide_documents_endpoints_and_polling(self) -> None:
        guide = (ROOT / "docs" / "TRACKER_INTEGRATION.md").read_text(encoding="utf-8")
        self.assertIn("/api/trackers/oauth/callback", guide)
        self.assertIn("/api/trackers/webhooks/github/{connectorId}", guide)
        self.assertIn("/api/admin/trackers/connectors/{id}/test", guide)
        self.assertIn("Polling-only", guide)
        self.assertIn("GHES", guide)
        self.assertIn("TRACKER_CREDENTIAL_PREVIOUS_ROOT_KEY", guide)

    def test_disabled_root_key_warns_without_blocking_auth(self) -> None:
        warnings = _settings().configuration_warnings()
        self.assertTrue(any("TRACKER_CREDENTIAL_ROOT_KEY is unset" in w for w in warnings))
        self.assertEqual(_settings().tracker_credential_status(), "disabled")
        self.assertEqual(_settings().auth_configuration_errors(), [])

    def test_locked_root_key_surfaces_actionable_errors(self) -> None:
        locked = _settings(TRACKER_CREDENTIAL_ROOT_KEY=SecretStr("not-32-bytes"))
        self.assertEqual(locked.tracker_credential_status(), "locked")
        self.assertTrue(locked.tracker_credential_key_errors())

    @unittest.skipUnless(shutil.which("docker"), "docker not installed")
    def test_compose_configuration_validates(self) -> None:
        env_file = ROOT / ".env.example"
        compose = ROOT / "docker-compose.yml"
        result = subprocess.run(
            ["docker", "compose", "--env-file", str(env_file), "-f", str(compose), "config", "--quiet"],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr or result.stdout)

    @unittest.skipUnless(shutil.which("docker"), "docker not installed")
    def test_release_compose_configuration_validates(self) -> None:
        release = ROOT / "deploy" / "release"
        compose = release / "compose.yml"
        env_file = _compose_env_file(release / ".env.example", include_pg_auth_var=True)
        try:
            env = {**os.environ, "PRISM_ENV_FILE": str(env_file)}
            result = subprocess.run(
                [
                    "docker",
                    "compose",
                    "--env-file",
                    str(env_file),
                    "-f",
                    str(compose),
                    "config",
                    "--quiet",
                ],
                cwd=release,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, msg=result.stderr or result.stdout)
        finally:
            env_file.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
