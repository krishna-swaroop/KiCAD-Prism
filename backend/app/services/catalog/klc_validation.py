"""KLC validation: run the KiCad library checkers and persist their evidence.

Every run writes an immutable report directory under the runtime's validation
root and one ``asset_validation_runs`` row with its findings. Nothing here
commits; the facade owns the transaction.
"""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
from typing import Any
import uuid
from xml.etree import ElementTree

from app.core.config import settings
from app.services.catalog.component_read_models import (
    KLC_RELEASE_GATE_VALUES,
    VALIDATION_STATUS_FAILED,
    VALIDATION_STATUS_PASSED,
    VALIDATION_STATUS_SKIPPED,
    VALIDATION_STATUS_WARNING,
    CatalogComponentReadModels,
)
from app.services.catalog.normalization import utc_now_iso
from app.services.catalog.revision_kernel import CatalogRevisionKernel
from app.services.catalog.runtime import CatalogRuntime


VALIDATION_SEVERITY_ERROR = "error"
VALIDATION_SEVERITY_WARNING = "warning"
VALIDATION_SEVERITY_INFO = "info"

KLC_ASSET_TYPES = frozenset({"symbol", "footprint"})
KLC_TOOL_VERSION_TIMEOUT_SECONDS = 5

# Report files a caller may download, keyed by the public name and the column
# that stores the path.
VALIDATION_REPORT_COLUMNS: dict[str, str] = {
    "report.json": "json_path",
    "report.junit.xml": "junit_path",
    "stdout": "stdout_path",
    "stderr": "stderr_path",
}


class CatalogKlcValidation:
    """Execute KLC checkers for revision assets and read back their runs."""

    def __init__(
        self,
        revision_kernel: CatalogRevisionKernel,
        read_models: CatalogComponentReadModels,
    ) -> None:
        self._revision_kernel = revision_kernel
        self._read_models = read_models

    # -- configuration ------------------------------------------------------

    @staticmethod
    def release_gate() -> str:
        gate = settings.CATALOG_KLC_RELEASE_GATE.strip().lower()
        return gate if gate in KLC_RELEASE_GATE_VALUES else "warn"

    @staticmethod
    def utils_root() -> Path:
        return Path(settings.CATALOG_KLC_UTILS_PATH).expanduser().resolve()

    @classmethod
    def checker_path(cls, asset_type: str) -> Path | None:
        script = (
            "check_symbol.py"
            if asset_type == "symbol"
            else "check_footprint.py"
            if asset_type == "footprint"
            else ""
        )
        if not script:
            return None
        path = cls.utils_root() / "klc-check" / script
        return path if path.is_file() else None

    @classmethod
    def checker_available(cls) -> bool:
        return bool(cls.checker_path("symbol") and cls.checker_path("footprint"))

    @classmethod
    def tool_version(cls) -> str:
        root = cls.utils_root()
        if not root.exists():
            return ""
        try:
            result = subprocess.run(
                ["git", "-C", str(root), "rev-parse", "--short", "HEAD"],
                capture_output=True,
                text=True,
                timeout=KLC_TOOL_VERSION_TIMEOUT_SECONDS,
                check=False,
            )
            if result.returncode == 0:
                return result.stdout.strip()
        except (OSError, subprocess.SubprocessError):
            return ""
        return ""

    @staticmethod
    def rule_args(asset_type: str) -> list[str]:
        if asset_type == "symbol":
            rules = settings.CATALOG_KLC_SYMBOL_RULES.strip()
            excludes = settings.CATALOG_KLC_SYMBOL_EXCLUDE_RULES.strip()
        else:
            rules = settings.CATALOG_KLC_FOOTPRINT_RULES.strip()
            excludes = settings.CATALOG_KLC_FOOTPRINT_EXCLUDE_RULES.strip()
        args: list[str] = []
        if rules:
            args.extend(["--rule", rules])
        if excludes:
            args.extend(["--exclude", excludes])
        return args

    # -- report shaping -----------------------------------------------------

    @staticmethod
    def parse_klc_junit(junit_path: Path) -> list[dict[str, Any]]:
        if not junit_path.is_file():
            return []
        root = ElementTree.parse(junit_path).getroot()
        findings: list[dict[str, Any]] = []
        for testcase in root.iter("testcase"):
            object_name = (
                str(testcase.attrib.get("name", "")).removesuffix(" - Errors").removesuffix(" - Warnings")
            )
            testcase_type = str(testcase.attrib.get("type", ""))
            for failure in testcase.findall("failure"):
                raw_type = str(failure.attrib.get("type", testcase_type)).upper()
                if raw_type == "WARNING" or testcase_type == "Warnings":
                    severity = VALIDATION_SEVERITY_WARNING
                elif raw_type == "INFO" or testcase_type == "Info":
                    severity = VALIDATION_SEVERITY_INFO
                else:
                    severity = VALIDATION_SEVERITY_ERROR
                message = str(failure.attrib.get("message") or "").strip()
                rule_code = message.split(":", 1)[0].strip() if ":" in message else ""
                text = (failure.text or "").strip()
                lines = [line.strip() for line in text.splitlines() if line.strip()]
                rule_url = next(
                    (line for line in lines if line.startswith("http://") or line.startswith("https://")),
                    "",
                )
                details = [line for line in lines if line != message and line != rule_url]
                findings.append(
                    {
                        "severity": severity,
                        "rule_code": rule_code,
                        "rule_url": rule_url,
                        "message": message or text or "KLC finding",
                        "details": details,
                        "object_name": object_name,
                    }
                )
        return findings

    @staticmethod
    def write_validation_report_json(
        path: Path,
        *,
        run_id: str,
        asset: dict[str, Any],
        status: str,
        exit_code: int | None,
        findings: list[dict[str, Any]],
        stdout: str,
        stderr: str,
        tool_version: str,
        created_at: str,
        finished_at: str,
    ) -> None:
        payload = {
            "run_id": run_id,
            "asset_id": str(asset["id"]),
            "asset_type": str(asset["asset_type"]),
            "asset_name": str(asset["name"]),
            "target_library": str(asset["target_library"]),
            "target_name": str(asset["target_name"]),
            "status": status,
            "exit_code": exit_code,
            "error_count": sum(1 for finding in findings if finding["severity"] == VALIDATION_SEVERITY_ERROR),
            "warning_count": sum(
                1 for finding in findings if finding["severity"] == VALIDATION_SEVERITY_WARNING
            ),
            "tool_version": tool_version,
            "created_at": created_at,
            "finished_at": finished_at,
            "stdout": stdout,
            "stderr": stderr,
            "findings": findings,
        }
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    # -- persistence --------------------------------------------------------

    def store_validation_run(
        self,
        conn: Any,
        *,
        run_id: str,
        component_id: str,
        revision_id: str,
        asset: dict[str, Any],
        status: str,
        exit_code: int | None,
        findings: list[dict[str, Any]],
        report_dir: Path,
        stdout_path: Path,
        stderr_path: Path,
        junit_path: Path,
        json_path: Path,
        raw_output: str,
        tool_version: str,
        created_at: str,
        finished_at: str,
    ) -> dict[str, Any]:
        error_count = sum(1 for finding in findings if finding["severity"] == VALIDATION_SEVERITY_ERROR)
        warning_count = sum(1 for finding in findings if finding["severity"] == VALIDATION_SEVERITY_WARNING)
        conn.execute("DELETE FROM asset_validation_findings WHERE run_id = %s", (run_id,))
        conn.execute(
            """
            INSERT INTO asset_validation_runs (
                id, component_id, revision_id, asset_id, asset_type, checker_type, status,
                error_count, warning_count, exit_code, tool_version, report_dir, stdout_path,
                stderr_path, junit_path, json_path, raw_output, created_at, finished_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                run_id,
                component_id,
                revision_id,
                asset["id"],
                asset["asset_type"],
                f"klc_{asset['asset_type']}",
                status,
                error_count,
                warning_count,
                exit_code,
                tool_version,
                str(report_dir),
                str(stdout_path),
                str(stderr_path),
                str(junit_path),
                str(json_path),
                raw_output[-20000:],
                created_at,
                finished_at,
            ),
        )
        for finding in findings:
            conn.execute(
                """
                INSERT INTO asset_validation_findings (
                    id, run_id, severity, rule_code, rule_url, message, details_json, object_name, created_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    str(uuid.uuid4()),
                    run_id,
                    finding["severity"],
                    finding.get("rule_code", ""),
                    finding.get("rule_url", ""),
                    finding["message"],
                    json.dumps(finding.get("details", [])),
                    finding.get("object_name", ""),
                    finished_at,
                ),
            )
        row = conn.execute("SELECT * FROM asset_validation_runs WHERE id = %s", (run_id,)).fetchone()
        return self._read_models.validation_run_payload(dict(row), include_findings=True, conn=conn) if row else {}

    # -- execution ----------------------------------------------------------

    def run_klc_for_asset(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        *,
        component_id: str,
        revision_id: str,
        asset: dict[str, Any],
    ) -> dict[str, Any]:
        """Run the checker for one asset and persist the evidence.

        A missing checker records a ``skipped`` run instead of raising so the
        release gate can still see that validation did not happen.
        """
        asset_type = str(asset["asset_type"])
        if asset_type not in KLC_ASSET_TYPES:
            raise ValueError("KLC validation only supports symbol and footprint assets")
        run_id = str(uuid.uuid4())
        created_at = utc_now_iso()
        report_dir = runtime.validation_root / run_id
        report_dir.mkdir(parents=True, exist_ok=True)
        stdout_path = report_dir / "stdout.txt"
        stderr_path = report_dir / "stderr.txt"
        junit_path = report_dir / "report.junit.xml"
        json_path = report_dir / "report.json"
        checker = self.checker_path(asset_type)
        tool_version = self.tool_version()
        findings: list[dict[str, Any]] = []
        stdout = ""
        stderr = ""
        exit_code: int | None = None

        if checker is None:
            status = VALIDATION_STATUS_SKIPPED
            stderr = f"KLC checker unavailable under {self.utils_root()}"
        else:
            cmd = [
                "python3",
                str(checker),
                str(asset["canonical_path"]),
                "-vv",
                "--nocolor",
                "--junit",
                str(junit_path),
            ]
            cmd.extend(self.rule_args(asset_type))
            if asset_type == "symbol" and settings.CATALOG_KLC_FOOTPRINT_LIB_DIR.strip():
                cmd.extend(["--footprints", settings.CATALOG_KLC_FOOTPRINT_LIB_DIR.strip()])
            try:
                result = subprocess.run(
                    cmd,
                    cwd=str(checker.parent),
                    capture_output=True,
                    text=True,
                    timeout=settings.CATALOG_KLC_TIMEOUT_SECONDS,
                    check=False,
                )
                stdout = result.stdout or ""
                stderr = result.stderr or ""
                exit_code = result.returncode
                try:
                    findings = self.parse_klc_junit(junit_path)
                except ElementTree.ParseError as exc:
                    findings = [
                        {
                            "severity": VALIDATION_SEVERITY_ERROR,
                            "rule_code": "",
                            "rule_url": "",
                            "message": f"Could not parse KLC JUnit report: {exc}",
                            "details": [],
                            "object_name": str(asset["target_name"] or asset["name"]),
                        }
                    ]
                if (
                    any(finding["severity"] == VALIDATION_SEVERITY_ERROR for finding in findings)
                    or result.returncode not in {0, 2, 3}
                ):
                    status = VALIDATION_STATUS_FAILED
                elif (
                    any(finding["severity"] == VALIDATION_SEVERITY_WARNING for finding in findings)
                    or result.returncode == 2
                ):
                    status = VALIDATION_STATUS_WARNING
                else:
                    status = VALIDATION_STATUS_PASSED
            except subprocess.TimeoutExpired as exc:
                status = VALIDATION_STATUS_FAILED
                stdout = exc.stdout if isinstance(exc.stdout, str) else ""
                stderr = f"KLC validation timed out after {settings.CATALOG_KLC_TIMEOUT_SECONDS}s"
                exit_code = None
            except OSError as exc:
                status = VALIDATION_STATUS_FAILED
                stderr = str(exc)
                exit_code = None

        finished_at = utc_now_iso()
        stdout_path.write_text(stdout, encoding="utf-8")
        stderr_path.write_text(stderr, encoding="utf-8")
        if not junit_path.exists():
            junit_path.write_text("<testsuites />\n", encoding="utf-8")
        self.write_validation_report_json(
            json_path,
            run_id=run_id,
            asset=asset,
            status=status,
            exit_code=exit_code,
            findings=findings,
            stdout=stdout,
            stderr=stderr,
            tool_version=tool_version,
            created_at=created_at,
            finished_at=finished_at,
        )
        return self.store_validation_run(
            conn,
            run_id=run_id,
            component_id=component_id,
            revision_id=revision_id,
            asset=asset,
            status=status,
            exit_code=exit_code,
            findings=findings,
            report_dir=report_dir,
            stdout_path=stdout_path,
            stderr_path=stderr_path,
            junit_path=junit_path,
            json_path=json_path,
            raw_output=f"{stdout}\n{stderr}",
            tool_version=tool_version,
            created_at=created_at,
            finished_at=finished_at,
        )

    def validate_component(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        component_id: str,
    ) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
        """Run KLC for every placement asset on the current revision.

        Returns ``(component_row, revision_row, runs)`` so the facade can shape
        the payload after committing.
        """
        if not settings.CATALOG_KLC_ENABLED:
            raise ValueError("KLC validation is disabled")
        component = self._revision_kernel.component_row(conn, component_id)
        if not component:
            raise ValueError("Component not found")
        revision = self._revision_kernel.revision_row(conn, str(component["current_revision_id"]))
        if not revision:
            raise ValueError("Component revision not found")
        assets = [
            asset
            for asset in self._revision_kernel.load_assets_for_revision(conn, str(revision["id"]))
            if str(asset["asset_type"]) in KLC_ASSET_TYPES
        ]
        if not assets:
            raise ValueError("No symbol or footprint assets are attached")
        runs = [
            self.run_klc_for_asset(
                conn,
                runtime,
                component_id=component_id,
                revision_id=str(revision["id"]),
                asset=asset,
            )
            for asset in assets
        ]
        return component, revision, runs

    # -- reads --------------------------------------------------------------

    def component_validation(self, conn: Any, component_id: str) -> dict[str, Any]:
        component = self._revision_kernel.component_row(conn, component_id)
        if not component:
            raise ValueError("Component not found")
        revision = self._revision_kernel.revision_row(conn, str(component["current_revision_id"]))
        if not revision:
            raise ValueError("Component revision not found")
        revision_id = str(revision["id"])
        assets = self._revision_kernel.load_assets_for_revision(conn, revision_id)
        summary = self._read_models.component_validation_summary(conn, revision_id, assets)
        run_ids = [str(asset["latest_run"]["id"]) for asset in summary["assets"] if asset.get("latest_run")]
        inherited_by_run = {
            str(asset["latest_run"]["id"]): dict(asset["latest_run"])
            for asset in summary["assets"]
            if asset.get("latest_run") and asset["latest_run"].get("inherited")
        }
        runs: list[dict[str, Any]] = []
        if run_ids:
            placeholders = ",".join("%s" for _ in run_ids)
            rows = conn.execute(
                f"SELECT * FROM asset_validation_runs WHERE id IN ({placeholders})",
                tuple(run_ids),
            ).fetchall()
            for row in rows:
                payload = self._read_models.validation_run_payload(dict(row), include_findings=True, conn=conn)
                inherited = inherited_by_run.get(payload["id"])
                if inherited:
                    payload["inherited"] = True
                    payload["inherited_from_revision_id"] = inherited.get("inherited_from_revision_id", "")
                runs.append(payload)
        return {"summary": summary, "runs": runs}

    def validation_run(self, conn: Any, run_id: str) -> dict[str, Any] | None:
        row = conn.execute("SELECT * FROM asset_validation_runs WHERE id = %s", (run_id,)).fetchone()
        if not row:
            return None
        return self._read_models.validation_run_payload(dict(row), include_findings=True, conn=conn)

    @staticmethod
    def report_path(conn: Any, runtime: CatalogRuntime, run_id: str, report_name: str) -> Path | None:
        """Resolve a stored report file, confined to the validation root."""
        column = VALIDATION_REPORT_COLUMNS.get(report_name)
        if not column:
            return None
        row = conn.execute("SELECT * FROM asset_validation_runs WHERE id = %s", (run_id,)).fetchone()
        if not row:
            return None
        path = Path(str(row[column])).resolve()
        try:
            path.relative_to(runtime.validation_root)
        except ValueError:
            return None
        return path if path.is_file() else None


__all__ = [
    "CatalogKlcValidation",
    "KLC_ASSET_TYPES",
    "KLC_TOOL_VERSION_TIMEOUT_SECONDS",
    "VALIDATION_REPORT_COLUMNS",
    "VALIDATION_SEVERITY_ERROR",
    "VALIDATION_SEVERITY_INFO",
    "VALIDATION_SEVERITY_WARNING",
]
