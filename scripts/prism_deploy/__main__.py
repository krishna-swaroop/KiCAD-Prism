"""Entry point for the Prism deployment installer.

    python3 -m scripts.prism_deploy              # interactive
    python3 -m scripts.prism_deploy --dry-run    # render and print, write nothing
    python3 -m scripts.prism_deploy --answers answers.json --non-interactive
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from . import interview, preflight, render, tui
from .apply import apply, load_existing_env
from .render import CADDY_IMAGE_TAG
from .schemes import DNS_01, DNS_PROVIDERS, HTTP_01, PLAIN_HTTP, SCHEMES, TAILSCALE

# render_plan redacts these; the values are recovered from the generated .env.
REDACTED_FROM_ENV = {
    "session_secret": "SESSION_SECRET",
    "postgres_password": "POSTGRES_PASSWORD",
    "oidc_client_secret": "OIDC_CLIENT_SECRET",
    "ts_authkey": "TS_AUTHKEY",
}

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]

REQUIRED_ANSWERS = ("scheme", "hostname")
# Only meaningful when authentication is on, which every scheme but plain-http
# enforces.
AUTH_ANSWERS = ("oidc_issuer", "oidc_client_id", "oidc_client_secret", "bootstrap_admins")


def load_answers(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    missing = [key for key in REQUIRED_ANSWERS if not data.get(key)]
    # Match the interview, which offers to skip single sign-on only for
    # plain-http and defaults to skipping it. Requiring OIDC here instead meant
    # the one scheme built for a quick unattended evaluation was the one that
    # could not be run unattended without four settings it has no use for.
    # An answers file that does name an issuer still gets it validated.
    auth_default = data.get("scheme") != PLAIN_HTTP or bool(str(data.get("oidc_issuer", "")).strip())
    if data.get("auth_enabled", auth_default):
        missing += [key for key in AUTH_ANSWERS if not data.get(key)]
    if missing:
        raise SystemExit(f"answers file is missing: {', '.join(missing)}")
    if data["scheme"] not in SCHEMES:
        raise SystemExit(f"unknown scheme '{data['scheme']}'; expected one of {', '.join(SCHEMES)}")
    if data["scheme"] == DNS_01:
        for key in ("dns_provider", "dns_credential"):
            if not data.get(key):
                raise SystemExit(f"scheme dns-01 requires '{key}' in the answers file")
        if data["dns_provider"] not in DNS_PROVIDERS:
            raise SystemExit(f"unknown dns_provider '{data['dns_provider']}'")
        # Refuse now rather than let issuance fail with a provider error long
        # after the installer has reported everything green.
        provider = DNS_PROVIDERS[data["dns_provider"]]
        supplied = data.get("extra_provider_env") or {}
        absent = [c.key for c in provider.companions if not str(supplied.get(c.key, "")).strip()]
        if absent:
            raise SystemExit(
                f"dns_provider '{provider.key}' also needs {', '.join(absent)}. "
                "Supply them under 'extra_provider_env' in the answers file."
            )
    if data["scheme"] == TAILSCALE and data.get("ts_mode", "sidecar") == "sidecar" and not data.get("ts_authkey"):
        raise SystemExit("scheme tailscale in sidecar mode requires 'ts_authkey' in the answers file")
    return data


def rehydrate(plan: dict, env: dict) -> dict:
    """Rebuild a full answer set from the redacted plan plus the generated .env.

    The plan records every choice but masks secrets, so repeating a deployment
    unattended means reading those back out of the .env it produced.
    """
    answers = {key: value for key, value in plan.items() if value != "<redacted>"}
    for key, variable in REDACTED_FROM_ENV.items():
        if plan.get(key) == "<redacted>" and env.get(variable):
            answers[key] = env[variable]
    if plan.get("dns_credential") == "<redacted>":
        provider = DNS_PROVIDERS.get(plan.get("dns_provider", ""))
        if provider and env.get(provider.env_var):
            answers["dns_credential"] = env[provider.env_var]
    return answers


def promote(root: Path, *, assume_yes: bool, dry_run: bool) -> int:
    """Move an existing deployment from the staging CA to production.

    By hand this meant re-answering the whole interview and then remembering to
    discard the staging ACME account, which is the step people skip.
    """
    plan_path = root / "generated" / "deploy-plan.json"
    env_path = root / "generated" / ".env"
    if not plan_path.is_file() or not env_path.is_file():
        raise SystemExit("No generated deployment found. Run the installer first.")

    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    if plan.get("scheme") not in (DNS_01, HTTP_01):
        raise SystemExit(f"Scheme '{plan.get('scheme')}' does not use Let's Encrypt; nothing to promote.")
    if not plan.get("acme_staging"):
        tui.ok("Already using the production CA. Nothing to do.")
        return 0

    answers = render.normalise(dict(rehydrate(plan, load_existing_env(env_path)), acme_staging=False))
    files = render.render_all((root / ".env.example").read_text(encoding="utf-8"), answers)
    compose = render.compose_command(answers)
    volume = f"{preflight.project_name(root)}_caddy_data"

    tui.banner("Promote to the production CA", answers["hostname"])
    tui.info("Rewrites the proxy configuration to use the production endpoint, then:")
    tui.write()
    tui.info("  1. stops the stack")
    tui.info(f"  2. deletes the volume {volume}, discarding the staging account")
    tui.info("     and any certificate issued under it")
    tui.info("  3. starts again and obtains a trusted certificate")
    tui.write()
    tui.note("The database and project data are untouched.")

    if dry_run:
        tui.write()
        tui.note("Dry run: nothing was written or restarted.")
        return 0
    if not assume_yes and not tui.confirm("Proceed?", default=True):
        tui.warn("Cancelled. Nothing changed.")
        return 130

    apply(root, files)
    tui.ok("Configuration rewritten for production")

    # Removing the volume is the whole point of promoting: the configuration
    # change alone leaves the staging account and its certificates in place, so
    # Caddy keeps serving something no browser trusts. Reporting success after a
    # failed removal sends the operator away believing the job is done.
    steps = (
        ("Stopping", compose + ["down"]),
        ("Discarding the staging certificate state", ["docker", "volume", "rm", volume]),
        ("Starting", compose + ["up", "-d", "--wait"]),
    )
    for label, command in steps:
        tui.write()
        tui.note(label)
        tui.info("$ " + " ".join(command))
        result = subprocess.run(command, cwd=root)
        if result.returncode != 0:
            tui.fail(f"{label} failed.", f"Inspect with: {' '.join(compose + ['logs', '--tail=100'])}")
            if "volume" in command:
                tui.write()
                tui.info(f"The staging account is still in {volume}. Until it is gone, the")
                tui.info("production endpoint in the configuration changes nothing. Remove it")
                tui.info("by hand once nothing references it, then run --promote again:")
                tui.info(f"  docker volume rm {volume}")
            return result.returncode

    tui.write()
    tui.ok("Promoted to the production CA")
    tui.info("Watch issuance: " + " ".join(compose + ["logs", "-f", "caddy"]))
    tui.info("Look for 'certificate obtained successfully' with ca acme-v02.")
    return 0


def build_caddy_image(answers: dict, root: Path) -> bool:
    module = answers["dns_provider_module"]
    tui.write()
    tui.note(f"Building {CADDY_IMAGE_TAG} with {module}")
    tui.hint("The stock caddy:2 image cannot solve DNS-01; providers are compiled in.")

    command = [
        "docker", "build",
        "-f", "deploy/Dockerfile.caddy-dns",
        "--build-arg", f"DNS_PROVIDER_MODULE={module}",
        "-t", CADDY_IMAGE_TAG,
        ".",
    ]
    tui.info("$ " + " ".join(command))
    if subprocess.run(command, cwd=root).returncode != 0:
        tui.fail("Image build failed.")
        return False

    probe = subprocess.run(
        ["docker", "run", "--rm", CADDY_IMAGE_TAG, "caddy", "list-modules"],
        capture_output=True, text=True,
    )
    provider = answers["dns_provider"]
    if f"dns.providers.{provider}" not in probe.stdout:
        tui.fail(f"dns.providers.{provider} is not in the built image.",
                 "The module did not link. Issuance would fail with an opaque error.")
        return False
    tui.ok(f"dns.providers.{provider} present")
    return True


def report_preflight(report: preflight.Report) -> bool:
    tui.section("", "Preflight")
    for result in report.results:
        if result.ok:
            tui.ok(result.name, result.detail)
        elif result.severity == preflight.WARNING:
            tui.warn(f"{result.name}: {result.detail}", result.fix)
        else:
            tui.fail(f"{result.name}: {result.detail}", result.fix)
    return not report.failures


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="prism-deploy", description=__doc__)
    parser.add_argument("--answers", type=Path, help="JSON answers file for unattended runs")
    parser.add_argument("--non-interactive", action="store_true", help="fail rather than prompt")
    parser.add_argument("--dry-run", action="store_true", help="render to stdout without writing")
    parser.add_argument("--root", type=Path, default=REPOSITORY_ROOT, help="repository root")
    parser.add_argument("--fresh", action="store_true", help="ignore any existing generated/ configuration")
    parser.add_argument("--skip-preflight", action="store_true", help="skip environment checks")
    parser.add_argument("--skip-network-checks", action="store_true", help="skip egress and DNS probes")
    parser.add_argument("--start", action="store_true", help="build and start the stack when checks pass")
    parser.add_argument("--promote", action="store_true",
                        help="switch an existing deployment from the staging CA to production")
    parser.add_argument("--yes", action="store_true", help="do not ask for confirmation")
    args = parser.parse_args(argv)

    root: Path = args.root.resolve()
    example = root / ".env.example"
    if not example.is_file():
        raise SystemExit(f"{example} not found; run from a Prism checkout or pass --root")

    if args.promote:
        return promote(root, assume_yes=args.yes, dry_run=args.dry_run)

    try:
        if args.answers:
            raw = load_answers(args.answers)
        elif args.non_interactive:
            raise SystemExit("--non-interactive requires --answers")
        else:
            raw = interview.run(root, fresh=args.fresh)
    except tui.Abort:
        tui.write()
        tui.warn("Cancelled. Nothing was written.")
        return 130

    answers = render.normalise(raw)
    files = render.render_all(example.read_text(encoding="utf-8"), answers)

    if not args.answers:
        interview.summarise(answers)

    if args.dry_run:
        for path, content in sorted(files.items()):
            tui.write()
            tui.write(f"{tui.ACCENT}── {path} {'─' * max(0, tui.width() - len(path) - 4)}{tui.RESET}")
            # A dry run exists to be read, copied into a ticket, or captured by
            # CI. The real secrets go to disk when the run is not a dry one.
            tui.write(render.redact(content, answers).rstrip("\n"))
        tui.write()
        tui.note("Dry run: nothing was written. Secrets above are masked.")
        return 0

    if not args.answers and not args.non_interactive:
        if not tui.confirm("Write this configuration?", default=True):
            tui.warn("Cancelled. Nothing was written.")
            return 130

    backup, warnings = apply(root, files)
    tui.section("", "Generated")
    for path in sorted(files):
        tui.ok(path)
    if backup:
        tui.info(f"Previous files copied to {backup.relative_to(root)}")
    for warning in warnings:
        tui.warn(warning)

    if answers["scheme"] == DNS_01 and not build_caddy_image(answers, root):
        return 1

    compose = render.compose_command(answers)
    if not args.skip_preflight:
        report = preflight.run(answers, root, compose=compose, skip_network=args.skip_network_checks)
        if not report_preflight(report):
            tui.write()
            tui.fail("Preflight failed. Configuration was written but nothing was started.")
            return 1

    tui.section("", "Next")
    tui.info("Read generated/NEXT_STEPS.md: DNS records, firewall, and OIDC registration")
    tui.info("are yours to complete; the installer does not touch anything outside this")
    tui.info("directory.")
    tui.write()
    tui.write(f"  {tui.DIM}Start the stack with:{tui.RESET}")
    tui.write(f"  {tui.BOLD}{' '.join(compose + ['up', '-d', '--wait'])}{tui.RESET}")

    if args.start:
        tui.write()
        tui.note("Starting")
        result = subprocess.run(compose + ["up", "-d", "--wait"], cwd=root)
        if result.returncode != 0:
            tui.fail("Startup failed.", f"Inspect with: {' '.join(compose + ['logs', '--tail=100'])}")
            return result.returncode
        tui.ok("Stack is up")

    return 0


if __name__ == "__main__":
    sys.exit(main())
