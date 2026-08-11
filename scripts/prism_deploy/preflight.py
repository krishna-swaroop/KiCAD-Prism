"""Environment and network checks that run before anything starts.

Each check here exists because its absence has cost real debugging time. The
network checks deliberately run inside a container rather than on the host: a
filtering appliance that intercepts container DNS while leaving the host alone
produces a TLS verification error against the CA, which reads as a certificate
problem and sends you looking in the wrong place entirely.
"""

from __future__ import annotations

import contextlib
import os
import re
import shutil
import socket
import subprocess
import tempfile
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

from .schemes import DNS_01, DNS_PROVIDERS, EXTERNAL_PROXY, HTTP_01, TAILSCALE

ACME_PRODUCTION = "https://acme-v02.api.letsencrypt.org/directory"
TAILSCALE_CONTROL = "https://controlplane.tailscale.com/health"
PROBE_IMAGE = "curlimages/curl:latest"

PROVIDER_PROBE = {
    "cloudflare": "https://api.cloudflare.com/client/v4/user/tokens/verify",
    "route53": "https://route53.amazonaws.com/",
    "digitalocean": "https://api.digitalocean.com/v2/account",
    "googleclouddns": "https://dns.googleapis.com/",
    "azure": "https://management.azure.com/",
    "desec": "https://desec.io/api/v1/",
}

MIN_COMPOSE = (2, 24)

FATAL = "fatal"
WARNING = "warning"


@dataclass
class Result:
    name: str
    ok: bool
    detail: str = ""
    fix: str = ""
    severity: str = FATAL


@dataclass
class Report:
    results: list[Result] = field(default_factory=list)

    def add(self, result: Result) -> Result:
        self.results.append(result)
        return result

    @property
    def failures(self) -> list[Result]:
        return [r for r in self.results if not r.ok and r.severity == FATAL]

    @property
    def warnings(self) -> list[Result]:
        return [r for r in self.results if not r.ok and r.severity == WARNING]


def _run(command: list[str], timeout: int = 60) -> tuple[int, str]:
    try:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError:
        return 127, f"{command[0]} not found"
    except subprocess.TimeoutExpired:
        return 124, "timed out"
    return completed.returncode, (completed.stdout + completed.stderr).strip()


def _run_split(command: list[str], timeout: int = 60) -> tuple[int, str, str]:
    """Like _run, but keeps stdout and stderr apart.

    curl writes the status code to stdout while Docker writes image-pull
    progress to stderr. Merging them makes the first probe on a clean host
    report a failure that is really just a pull.
    """
    try:
        done = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError:
        return 127, "", f"{command[0]} not found"
    except subprocess.TimeoutExpired:
        return 124, "", "timed out"
    return done.returncode, done.stdout.strip(), done.stderr.strip()


def ensure_probe_image() -> None:
    """Pull the probe image once so its progress output cannot pollute a check."""
    _run(["docker", "pull", "--quiet", PROBE_IMAGE], timeout=180)


def check_docker() -> Result:
    if not shutil.which("docker"):
        return Result("Docker CLI", False, "docker is not on PATH", "Install Docker Engine or Docker Desktop.")
    code, output = _run(["docker", "version", "--format", "{{.Server.Version}}"], timeout=30)
    if code != 0:
        return Result("Docker daemon", False, output.splitlines()[-1] if output else "unreachable",
                      "Start Docker, and on Windows enable WSL integration for this distro.")
    return Result("Docker daemon", True, output.strip())


def check_compose() -> Result:
    code, output = _run(["docker", "compose", "version", "--short"], timeout=30)
    if code != 0:
        return Result("Docker Compose v2", False, output, "Install the Compose v2 plugin.")
    raw = output.strip().lstrip("v")
    try:
        parts = tuple(int(piece) for piece in raw.split(".")[:2])
    except ValueError:
        return Result("Docker Compose v2", True, f"{raw} (version not parsed)", severity=WARNING)
    if parts < MIN_COMPOSE:
        return Result(
            "Docker Compose >= 2.24",
            False,
            f"found {raw}",
            # Without !override the generated port list is appended to, leaving
            # docker-compose.yml's 0.0.0.0 bindings exposed alongside loopback.
            "Upgrade Compose. Older versions cannot replace port lists, so the "
            "app would stay reachable over plain HTTP on the LAN.",
        )
    return Result("Docker Compose >= 2.24", True, raw)


def check_hostname_resolves(hostname: str) -> Result:
    try:
        infos = socket.getaddrinfo(hostname, None, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        return Result(
            "Hostname resolves",
            False,
            f"{hostname}: {exc.strerror or exc}",
            "Create the A record before starting, or the service is unreachable "
            "even once the certificate is issued.",
            severity=WARNING,
        )
    addresses = sorted({info[4][0] for info in infos})
    return Result("Hostname resolves", True, f"{hostname} -> {', '.join(addresses)}")


def project_name(root) -> str:
    """The Compose project name, which is derived from the directory name."""
    return re.sub(r"[^a-z0-9_-]", "", root.name.lower())


def ports_published_by(project: str) -> set[int]:
    """Host ports currently published by containers of this Compose project."""
    code, output = _run(
        ["docker", "ps", "--filter", f"label=com.docker.compose.project={project}", "--format", "{{.Ports}}"],
        timeout=30,
    )
    if code != 0:
        return set()
    return {int(match) for match in re.findall(r":(\d+)->", output)}


def check_port_free(port: int, label: str, owned: set[int] | None = None) -> Result:
    """A port held by this deployment's own containers is not a conflict.

    Re-running the installer against a running stack would otherwise report the
    ports it is itself using as fatal collisions.
    """
    if owned and port in owned:
        return Result(f"Port {port}", True, "held by this deployment; will be replaced on restart")

    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    probe.settimeout(1.0)
    try:
        in_use = probe.connect_ex(("127.0.0.1", port)) == 0
    finally:
        probe.close()
    if in_use:
        return Result(f"Port {port} free", False, f"something else is already listening ({label})",
                      "Stop the conflicting service or choose a different port.")
    return Result(f"Port {port} free", True)


def probe_command(args: list[str], dns_pin: str | None) -> list[str]:
    """Build a `docker run` probe that resolves the way the proxy will.

    When the deployment pins a resolver, the probe must pin the same one.
    Otherwise the probe tests a path the real containers never use, and a
    working configuration is reported as broken.
    """
    command = ["docker", "run", "--rm"]
    if dns_pin:
        command += ["--dns", dns_pin]
    return command + [PROBE_IMAGE, *args]


def _curl_reason(output: str) -> str:
    """Pull the meaningful line out of curl's output rather than truncating it."""
    lines = [line.strip() for line in output.splitlines() if line.strip()]
    for line in lines:
        if line.startswith("curl:"):
            return line
    return lines[0] if lines else "no response"


def check_egress(url: str, label: str, *, expect_any_http: bool = False, dns_pin: str | None = None) -> Result:
    """Reach `url` from inside a container on the default bridge network.

    Uses the same curl-bearing image the stack already pulls, so this adds no
    new dependency. A TLS error here is the signature of an intercepting or
    blocking appliance.
    """
    code, stdout, stderr = _run_split(
        probe_command(
            ["-sS", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "20", url],
            dns_pin,
        ),
        timeout=90,
    )
    if code == 127:
        return Result(f"Container egress: {label}", True, "skipped, could not run probe", severity=WARNING)

    output = stderr
    status = stdout.strip().splitlines()[-1] if stdout.strip() else ""
    if code == 0 and status.isdigit() and status != "000":
        if expect_any_http or status.startswith("2"):
            return Result(f"Container egress: {label}", True, f"HTTP {status}")
        return Result(f"Container egress: {label}", True, f"HTTP {status}", severity=WARNING)

    hint = ""
    lowered = output.lower()
    if "self-signed" in lowered or "certificate" in lowered:
        hint = (
            "The certificate presented is not the real one. A filtering appliance "
            "is intercepting or blocking this hostname for containers. "
        )
        hint += (
            "The pinned resolver did not avoid it; ask for the hostname to be exempted."
            if dns_pin
            else "Exempt it from TLS/DNS inspection, or pin the container resolver."
        )
    return Result(f"Container egress: {label}", False, _curl_reason(output), hint)


def check_dns_consistency(hostname: str, dns_pin: str | None = None) -> Result:
    """Compare what a container resolves against what the host resolves.

    An address the host does not return is the fingerprint of DNS filtering.
    """
    code, output = _run(probe_command(["nslookup", hostname], dns_pin), timeout=90)
    if code != 0:
        return Result("Container DNS matches host", True, "skipped, could not run probe", severity=WARNING)

    container = {
        line.split("Address:", 1)[1].strip()
        for line in output.splitlines()
        if line.strip().startswith("Address:") and ":" not in line.split("Address:", 1)[1].strip()
    }
    try:
        host = {info[4][0] for info in socket.getaddrinfo(hostname, None, proto=socket.IPPROTO_TCP)}
    except socket.gaierror:
        return Result("Container DNS matches host", True, "host could not resolve; skipped", severity=WARNING)

    extra = container - host - {"127.0.0.11"}
    if extra:
        fix = (
            "Those addresses are not what the host sees, which means container DNS "
            "is being filtered. "
        )
        fix += (
            f"The pin on {dns_pin} did not prevent it; ask for the hostname to be exempted."
            if dns_pin
            else "Pin the container resolver to your internal DNS server, or have "
            "the hostname exempted."
        )
        return Result("Container DNS matches host", False, f"container also returned {', '.join(sorted(extra))}", fix, severity=WARNING)
    detail = f"resolver {dns_pin}" if dns_pin else ""
    return Result("Container DNS matches host", True, detail)


def check_database_volume(root, reused_password: bool) -> Result:
    """Warn when an existing database volume predates the generated password.

    PostgreSQL stores the superuser password at first initialisation and ignores
    POSTGRES_PASSWORD on every later start. A freshly generated password against
    an existing volume therefore leaves the server healthy and the backend
    unable to authenticate -- which reads as a Prism fault, not a stale volume.
    """
    # Compose names the volume <project>_<volume>. Matching only the suffix
    # reported another checkout's database on a host running two of them, which
    # then blamed this deployment for a password mismatch it does not have.
    expected = f"{project_name(root)}_prism-postgres-data"
    code, output = _run(["docker", "volume", "ls", "--format", "{{.Name}}"], timeout=30)
    if code != 0:
        return Result("Database volume", True, "skipped, could not list volumes", severity=WARNING)

    matches = [name for name in output.splitlines() if name.strip() == expected]
    if not matches:
        return Result("Database volume", True, "none yet; will initialise on first start")
    if reused_password:
        return Result("Database volume", True, f"{matches[0]} (password reused)")

    return Result(
        "Database volume",
        False,
        f"{matches[0]} already exists, but a new password was generated",
        "PostgreSQL keeps the password from first initialisation, so the backend "
        "will fail to authenticate. Either copy POSTGRES_PASSWORD from the old "
        f".env into generated/.env, or discard the database with "
        f"'docker volume rm {matches[0]}' -- which destroys users, projects, "
        "comments, catalog, and audit records.",
        severity=WARNING,
    )


def check_oidc_discovery(issuer: str) -> Result:
    url = issuer.rstrip("/") + "/.well-known/openid-configuration"
    try:
        with urllib.request.urlopen(url, timeout=15) as response:
            if response.status != 200:
                raise urllib.error.HTTPError(url, response.status, "unexpected status", response.headers, None)
    except Exception as exc:  # noqa: BLE001 - any failure is equally advisory here
        return Result(
            "OIDC discovery",
            False,
            f"{url}: {exc}",
            "The backend fails closed when the issuer is unreachable. Confirm the "
            "issuer URL and that this host can reach it.",
            severity=WARNING,
        )
    return Result("OIDC discovery", True, issuer)


def check_caddy_config(answers: dict, root) -> Result:
    """Ask Caddy itself whether the generated config is loadable.

    This resolves the DNS provider module and the credential together, so it
    catches a module that was never compiled in, an unset variable, and a
    malformed token in a single step.
    """
    caddyfile = root / "generated" / "Caddyfile"
    if not caddyfile.exists():
        return Result("Caddy config valid", True, "no proxy in this scheme")

    command = ["docker", "run", "--rm", "-v", f"{caddyfile}:/etc/caddy/Caddyfile:ro"]
    with contextlib.ExitStack() as stack:
        if answers["scheme"] == DNS_01:
            provider = DNS_PROVIDERS[answers["dns_provider"]]
            values = {provider.env_var: answers["dns_credential"]}
            values.update(answers.get("extra_provider_env", {}))
            # An --env-file rather than -e: a credential on the argv is legible
            # in ps output and in any process auditing on the host, to every
            # local user, for as long as the probe runs.
            # Write and close before registering the removal. Windows refuses
            # to delete a file that still has an open handle, and an ExitStack
            # unwinds LIFO, so holding the handle open across the callback would
            # raise PermissionError here on the platform this is most used from.
            with tempfile.NamedTemporaryFile(
                "w", suffix=".env", delete=False, encoding="utf-8"
            ) as handle:
                handle.write("".join(f"{key}={value}\n" for key, value in values.items()))
                env_path = Path(handle.name)
            stack.callback(env_path.unlink, missing_ok=True)
            os.chmod(env_path, 0o600)
            command += ["--env-file", str(env_path)]
        command += [
            answers["caddy_image"], "caddy", "validate",
            "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile",
        ]

        code, output = _run(command, timeout=120)
    if code != 0:
        tail = output.strip().splitlines()[-1] if output.strip() else "validation failed"
        hint = ""
        if "module not registered" in output:
            hint = "The DNS provider was not compiled into the image. Rebuild it."
        elif "appears invalid" in output:
            hint = "The provider rejected the credential's format. Re-paste it; do not retype."
        return Result("Caddy config valid", False, tail[-300:], hint)
    return Result("Caddy config valid", True)


def check_compose_config(command: list[str]) -> Result:
    code, output = _run(command + ["config", "--quiet"], timeout=120)
    if code != 0:
        return Result("Compose config valid", False, output.strip()[-400:] or "invalid",
                      "The generated overlay did not merge cleanly.")
    return Result("Compose config valid", True)


def run(answers: dict, root, *, compose: list[str], skip_network: bool = False) -> Report:
    report = Report()
    report.add(check_docker())
    report.add(check_compose())

    if report.failures:
        # Nothing below can run meaningfully without a working daemon.
        return report

    scheme = answers["scheme"]
    report.add(check_database_volume(root, answers.get("reused_password", False)))
    report.add(check_hostname_resolves(answers["hostname"]))
    owned = ports_published_by(project_name(root))
    report.add(check_port_free(int(answers["http_port"]), "frontend", owned))
    # Tailscale listens on the tailnet interface, not on the host's 443.
    if scheme not in (EXTERNAL_PROXY, TAILSCALE):
        report.add(check_port_free(443, "https", owned))
    if scheme == HTTP_01:
        # docker-compose.proxy.yml publishes 80, and Let's Encrypt reaches it
        # from outside. Miss this and the stack starts, the port silently
        # belongs to whatever got there first, and the only symptom is an
        # opaque issuance failure minutes later.
        report.add(check_port_free(80, "http-01 challenge", owned))

    if not skip_network:
        # Probe through the same resolver the proxy will use, or the checks
        # describe a network path no container in this deployment travels.
        dns_pin = answers.get("dns_pin")
        ensure_probe_image()
        if scheme in (HTTP_01, DNS_01):
            report.add(check_egress(ACME_PRODUCTION, "Let's Encrypt", expect_any_http=True, dns_pin=dns_pin))
            report.add(check_dns_consistency("acme-v02.api.letsencrypt.org", dns_pin))
        if scheme == DNS_01:
            probe = PROVIDER_PROBE.get(answers["dns_provider"])
            if probe:
                # 401/403 is success here: TLS completed and the API answered.
                report.add(
                    check_egress(probe, DNS_PROVIDERS[answers["dns_provider"]].label,
                                 expect_any_http=True, dns_pin=dns_pin)
                )
        if scheme == TAILSCALE:
            report.add(check_egress(TAILSCALE_CONTROL, "Tailscale control plane",
                                    expect_any_http=True, dns_pin=dns_pin))
        if answers.get("auth_enabled", True) and answers.get("oidc_issuer"):
            report.add(check_oidc_discovery(answers["oidc_issuer"]))

    report.add(check_caddy_config(answers, root))
    report.add(check_compose_config(compose))
    return report
