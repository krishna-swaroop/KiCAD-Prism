"""The interactive question flow.

Deliberately short: anything that can be derived from another answer is not
asked. Fewer questions means fewer chances for two related settings to
disagree, which is the most common way a Prism deployment ends up broken in a
way that only shows up at login.

Every question carries what it is for, a worked example, and somewhere to read
more. An operator deploying this for the first time should not have to hold the
deployment guide open in another window.
"""

from __future__ import annotations

from pathlib import Path

from . import tui
from .apply import load_existing_env
from .tailnet import local_node
from .render import generate_secret
from .schemes import (
    DNS_01,
    DNS_PROVIDERS,
    EXTERNAL_PROXY,
    HTTP_01,
    INTERNAL_CA,
    PLAIN_HTTP,
    PROVIDER_ORDER,
    TAILSCALE,
    SCHEME_ORDER,
    SCHEMES,
    SIZING_ORDER,
    SIZINGS,
    validate_emails,
    validate_host_or_local,
    validate_hostname,
    validate_issuer,
    validate_magicdns,
    validate_port,
    validate_tailscale_authkey,
    validate_resolver,
)

DOCS_DEPLOYMENT = "https://github.com/krishna-swaroop/KiCAD-Prism/blob/main/docs/DEPLOYMENT.md"
DOCS_AUTH = "https://github.com/krishna-swaroop/KiCAD-Prism/blob/main/docs/AUTHENTICATION_AND_ACCESS.md"
DOCS_CHALLENGES = "https://letsencrypt.org/docs/challenge-types/"
DOCS_RATE_LIMITS = "https://letsencrypt.org/docs/rate-limits/"
DOCS_CADDY_DNS = "https://github.com/caddy-dns"
DOCS_TS_SERVE = "https://tailscale.com/kb/1312/serve"
DOCS_TS_KEYS = "https://login.tailscale.com/admin/settings/keys"
DOCS_TS_DNS = "https://login.tailscale.com/admin/dns"

SCHEME_DETAIL = {
    TAILSCALE: "nothing to set up",
    DNS_01: "no inbound access needed",
    HTTP_01: "host must be internet-facing",
    INTERNAL_CA: "clients must trust your CA",
    EXTERNAL_PROXY: "your proxy terminates TLS",
    PLAIN_HTTP: "evaluation only",
}


def run(root: Path, *, fresh: bool = False) -> dict:
    tui.banner("KiCAD Prism deployment", "Generates .env, proxy config, and a Compose overlay")

    existing, source = ({}, None) if fresh else _previous_settings(root)
    if existing:
        tui.note(f"Reusing settings from {source}")
        tui.hint("Secrets carry over, including the database password. That matters:")
        tui.hint("PostgreSQL keeps the password from first initialisation, so a new")
        tui.hint("one against an existing volume locks the backend out.")
        tui.hint("Pass --fresh to ignore it and start from nothing.")
    elif fresh:
        tui.note("Starting fresh; any existing generated/ is ignored and backed up.")

    answers: dict = {}

    tui.section("1", "Deployment scheme")
    answers["scheme"] = tui.select(
        "How should Prism obtain and serve its TLS certificate?",
        [(key, SCHEMES[key].label, SCHEME_DETAIL[key]) for key in SCHEME_ORDER],
        description=(
            "Decides whether this host needs inbound internet access, and\n"
            "whether users need a CA certificate installed."
        ),
        docs=DOCS_CHALLENGES,
    )
    scheme = answers["scheme"]

    tui.section("2", "Identity")
    if scheme == TAILSCALE:
        node = local_node()
        if node:
            tui.ok(f"This host is on a tailnet as {node['name']}")
            if not node["online"]:
                tui.warn("The node is not currently online.")
            if not node["cert_ready"]:
                tui.warn("HTTPS Certificates are not enabled for this tailnet.",
                         "Enable them on the DNS page of the admin console, or TLS cannot start.")
        answers["hostname"] = tui.ask(
            "MagicDNS name for this node",
            default=(node or {}).get("name") or _previous_hostname(existing),
            description=(
                "Tailscale issues certificates only for MagicDNS names, so this is\n"
                "<node>.<tailnet>.ts.net. Pick any node name; the tailnet part is\n"
                "shown as 'Tailnet name' on the DNS page of the admin console.\n"
                "MagicDNS and HTTPS Certificates must both be enabled there first."
            ),
            example="prism.tail1a2b3c.ts.net",
            validate=validate_magicdns,
            docs=DOCS_TS_DNS,
        )
    elif scheme == PLAIN_HTTP:
        answers["hostname"] = tui.ask(
            "Hostname or address",
            default=_previous_hostname(existing) or "localhost",
            description=(
                "How you will reach this instance. localhost, a LAN name, or an IP\n"
                "are all fine here; the port is asked for later and appended for you."
            ),
            example="localhost",
            validate=validate_host_or_local,
        )
    else:
        answers["hostname"] = tui.ask(
            "Public hostname",
            default=_previous_hostname(existing),
            description="Must match the DNS record, the certificate, and the OIDC\nredirect URIs. No scheme, no port.",
            example="prism.example.com",
            validate=validate_hostname,
        )
    answers["workspace_name"] = tui.ask(
        "Workspace name",
        default=existing.get("WORKSPACE_NAME", "KiCAD Prism"),
        description="Shown on the login page. Cosmetic.",
        example="Engineering ECAD",
    )

    if scheme == DNS_01:
        tui.section("3", "DNS provider")
        answers["dns_provider"] = tui.select(
            "Which provider hosts the authoritative DNS for this zone?",
            [(key, DNS_PROVIDERS[key].label, DNS_PROVIDERS[key].module.rsplit("/", 1)[-1]) for key in PROVIDER_ORDER],
            description="The zone's DNS host, which is not always the registrar.",
            docs=DOCS_CADDY_DNS,
        )
        provider = DNS_PROVIDERS[answers["dns_provider"]]
        answers["dns_credential"] = tui.ask_secret(
            provider.credential_label,
            description=f"{provider.credential_hint}\nPaste it; a retyping slip fails as an authentication error.",
            example=provider.credential_example,
            docs=provider.credential_docs,
        )
        tui.hint("Input is hidden, so the credential stays out of scrollback and history.")

        # Most providers need more than one value. Asking here is the difference
        # between a working first issuance and an opaque provider error after
        # the operator has been told everything passed.
        companions: dict[str, str] = {}
        for companion in provider.companions:
            ask = tui.ask_secret if companion.secret else tui.ask
            companions[companion.key] = ask(
                companion.label,
                description=companion.hint,
                example=companion.example,
            )
        answers["extra_provider_env"] = companions

        pin = tui.confirm(
            "Pin container DNS to a specific resolver?",
            default=False,
            description=(
                "Say no unless outbound DNS is filtered. Preflight detects that and\n"
                "will tell you to come back. A pin breaks silently if this host's\n"
                "network later changes."
            ),
        )
        if pin:
            answers["dns_pin"] = tui.ask(
                "Resolver IP",
                description="The resolver this host uses. Get-DnsClientServerAddress\non Windows, resolvectl status on Linux.",
                example="10.0.0.53",
                validate=validate_resolver,
            )

    if scheme == TAILSCALE:
        tui.section("3", "Tailnet")
        on_tailnet = bool(node) and answers["hostname"] == node["name"]
        answers["ts_mode"] = tui.select(
            "How should Prism join the tailnet?",
            [
                ("host", "Use this host's Tailscale", "no sidecar, no auth key"),
                ("sidecar", "Run a Tailscale container", "for hosts not on the tailnet"),
            ],
            default=0 if on_tailnet else 1,
            description=(
                "If this machine is already on your tailnet, Tailscale Serve can\n"
                "proxy to Prism directly and nothing extra needs to run or\n"
                "authenticate. A sidecar is for hosts that are not members."
            ),
            docs=DOCS_TS_SERVE,
        )
        if answers["ts_mode"] == "host":
            tui.note("No auth key needed; this host is already authenticated.")
            tui.hint("The generated notes give the one 'tailscale serve' command to run.")
        else:
            answers["ts_authkey"] = tui.ask_secret(
                "Tailscale auth key",
                description=(
                    "Lets this container join your tailnet unattended. Generate a\n"
                    "reusable key, and leave 'Ephemeral' off so the node keeps its\n"
                    "name and certificate across restarts.\n"
                    "Used once at first start; state persists in a volume."
                ),
                example="tskey-auth-kXXXXXXXXXXXX-XXXXXXXXXXXXXXXXXXXXXXXXXXX",
                docs=DOCS_TS_KEYS,
                validate=validate_tailscale_authkey,
            )
            tui.hint("Input is hidden, so the key stays out of scrollback and history.")
        tui.note("Tailscale terminates TLS and renews the certificate itself.")
        tui.hint("No public DNS record, no inbound firewall rule, and nothing to renew.")
        tui.hint("Only devices on your tailnet can reach it.")

    if scheme == INTERNAL_CA:
        tui.section("3", "Certificates")
        answers["certificate_dir"] = tui.ask(
            "Directory containing prism.crt and prism.key",
            default="./deploy/certs",
            description=(
                "Mounted read-only into the proxy at /certs. The certificate must\n"
                "cover the hostname above, and every browser and KiCad workstation\n"
                "must already trust the issuing CA."
            ),
            example="./deploy/certs",
            validate=lambda value: _validate_certs(root, value),
        )

    if scheme == PLAIN_HTTP:
        tui.section("3", "Exposure")
        tui.warn("This deployment has no TLS. Everything crosses the network in the clear.")
        tui.hint("The KiCad remote symbol panel is not supported without HTTPS, and most")
        tui.hint("identity providers reject non-HTTPS redirect URIs. Other features work.")
        answers["bind_address"] = tui.select(
            "Who should be able to reach it?",
            [
                ("127.0.0.1", "This host only", "loopback; safest for evaluation"),
                ("0.0.0.0", "Anyone who can route here", "unencrypted over the network"),
            ],
            description="Sets the interface the frontend port is published on.",
        )
        answers["auth_enabled"] = tui.confirm(
            "Configure single sign-on?",
            default=False,
            description=(
                "Say no for a quick look at the features. Every request is then served\n"
                "as an unauthenticated guest, so anyone who can reach the address has\n"
                "that access with no login and no audit trail.\n"
                "Say yes only if your provider accepts an http:// redirect URI."
            ),
        )
        if not answers["auth_enabled"]:
            answers["guest_role"] = tui.select(
                "What can that guest do?",
                [
                    ("viewer", "Read only", "browse projects and the catalog"),
                    ("admin", "Everything", "import, edit, release, administer"),
                ],
                description="Applies to every visitor, since there is no login.",
            )

    step = 4 if scheme in (DNS_01, INTERNAL_CA, PLAIN_HTTP, TAILSCALE) else 3
    if scheme == PLAIN_HTTP and not answers["auth_enabled"]:
        answers.update(
            oidc_issuer="",
            oidc_client_id="",
            oidc_client_secret="",
            oidc_provider_name="",
            bootstrap_admins=existing.get("BOOTSTRAP_ADMIN_USERS_STR", ""),
            sizing="evaluation",
            session_secret=existing.get("SESSION_SECRET") or generate_secret(48),
            postgres_password=existing.get("POSTGRES_PASSWORD") or generate_secret(32),
        )
        answers["http_port"] = tui.ask(
            "Port to publish the frontend on",
            default=existing.get("PRISM_HTTP_PORT", "8080"),
            description="Becomes part of the URL, as there is no TLS terminator in front.",
            example="8080",
            validate=validate_port,
        )
        return answers

    tui.section(str(step), "Single sign-on")
    tui.info("Prism will not start without a working OIDC client: serving without")
    tui.info("a login would expose every project to anyone who can reach it.")
    answers["oidc_issuer"] = tui.ask(
        "OIDC issuer URL",
        default=existing.get("OIDC_ISSUER_URL", ""),
        description=(
            "Whose /.well-known/openid-configuration describes your provider.\n"
            "Google https://accounts.google.com · Keycloak .../realms/<realm>"
        ),
        example="https://sso.example.com/realms/engineering",
        validate=validate_issuer,
        docs=DOCS_AUTH,
    )
    answers["oidc_client_id"] = tui.ask(
        "OIDC client ID",
        default=existing.get("OIDC_CLIENT_ID", "kicad-prism"),
        description="The application identifier your provider issued for Prism.",
        example="kicad-prism",
    )
    reuse = bool(existing.get("OIDC_CLIENT_SECRET"))
    if reuse and not tui.confirm("Replace the stored OIDC client secret?", default=False):
        answers["oidc_client_secret"] = existing["OIDC_CLIENT_SECRET"]
    else:
        answers["oidc_client_secret"] = tui.ask_secret(
            "OIDC client secret",
            description="Issued alongside the client ID. Stored only in generated/.env.",
        )
    answers["oidc_provider_name"] = tui.ask(
        "Provider display name",
        default=existing.get("OIDC_PROVIDER_NAME", "Company SSO"),
        description="Labels the sign-in button, as in 'Sign in with ...'.",
        example="Google",
    )
    answers["bootstrap_admins"] = tui.ask(
        "Bootstrap administrators",
        default=existing.get("BOOTSTRAP_ADMIN_USERS_STR", ""),
        description=(
            "Comma-separated. Administrators on first login; name at least two\n"
            "so losing one account cannot lock you out."
        ),
        example="ada@example.com,grace@example.com",
        validate=validate_emails,
        docs=DOCS_AUTH,
    )

    tui.section(str(step + 1), "Capacity")
    answers["sizing"] = tui.select(
        "How large is this installation?",
        [(key, SIZINGS[key].label, SIZINGS[key].description) for key in SIZING_ORDER],
        default=1,
        description=(
            "Sets worker concurrency and CPU/memory ceilings. Start low: KiCad\n"
            "rendering is memory-hungry and over-provisioning causes swapping."
        ),
        docs=DOCS_DEPLOYMENT,
    )
    answers["http_port"] = tui.ask(
        "Loopback port for the frontend",
        default=existing.get("PRISM_HTTP_PORT", "8080"),
        description="Loopback only. Change it only if 8080 is already taken.",
        example="8080",
        validate=validate_port,
    )

    if scheme in (HTTP_01, DNS_01):
        tui.section(str(step + 2), "Certificate authority")
        answers["acme_staging"] = tui.confirm(
            "Use the Let's Encrypt staging CA for this run?",
            default=True,
            description=(
                "Recommended for a first deployment: it proves issuance works without\n"
                "spending production quota, which allows only 5 failures per hostname\n"
                "per hour. Verify with the logs, not a browser -- Prism sends HSTS, so\n"
                "once this host has served a trusted certificate no browser will offer\n"
                "an exception for the untrusted staging one."
            ),
            docs=DOCS_RATE_LIMITS,
        )

    answers["session_secret"] = existing.get("SESSION_SECRET") or generate_secret(48)
    answers["postgres_password"] = existing.get("POSTGRES_PASSWORD") or generate_secret(32)
    return answers


def _previous_settings(root: Path) -> tuple[dict[str, str], str | None]:
    """Find settings from an earlier deployment, generated or hand-written.

    A hand-written .env at the repository root is the common case for someone
    moving to the installer from a manual setup. Its database password matches
    the existing PostgreSQL volume, so carrying it over is what keeps the
    upgrade from bricking the backend.
    """
    for relative in ("generated/.env", ".env"):
        values = load_existing_env(root / relative)
        if values:
            return values, relative
    return {}, None


def _previous_hostname(existing: dict[str, str]) -> str:
    base = existing.get("PUBLIC_BASE_URL", "")
    return base.removeprefix("https://").removeprefix("http://").rstrip("/")


def _validate_certs(root: Path, value: str) -> str | None:
    directory = Path(value) if Path(value).is_absolute() else (root / value).resolve()
    if not directory.is_dir():
        return f"{directory} is not a directory."
    missing = [name for name in ("prism.crt", "prism.key") if not (directory / name).is_file()]
    if missing:
        return f"Missing {', '.join(missing)} in {directory}."
    return None


def summarise(answers: dict) -> None:
    scheme = SCHEMES[answers["scheme"]]
    rows = [
        ("Scheme", scheme.label),
        ("URL", f"{tui.BOLD}{answers['public_base_url']}{tui.RESET}"),
        ("Workspace", answers["workspace_name"]),
        ("Identity provider", answers["oidc_issuer"]),
        ("Administrators", answers["bootstrap_admins"]),
        ("Capacity", SIZINGS[answers["sizing"]].label),
        ("Frontend port", f"127.0.0.1:{answers['http_port']}"),
    ]
    if answers["scheme"] == DNS_01:
        rows.insert(2, ("DNS provider", DNS_PROVIDERS[answers["dns_provider"]].label))
        if answers.get("dns_pin"):
            rows.insert(3, ("Container resolver", answers["dns_pin"]))
    if answers.get("acme_staging"):
        rows.append(("Certificate authority", f"{tui.YELLOW}Let's Encrypt staging{tui.RESET}"))
    elif answers["scheme"] in (HTTP_01, DNS_01):
        rows.append(("Certificate authority", "Let's Encrypt production"))

    tui.write()
    tui.panel("Configuration", rows)

    if answers["scheme"] != EXTERNAL_PROXY:
        tui.write()
        tui.note("Register these redirect URIs with your identity provider:")
        for uri in answers["redirect_uris"]:
            tui.info(f"  {uri}")
        tui.info("Sign-in fails with a redirect_uri mismatch until both exist.")
