"""Turn answers into deployment artifacts.

Every function here is pure: answers in, file contents out, no filesystem and no
subprocesses. That is what makes the generated output golden-testable without a
Docker daemon, and it is the reason this module holds no I/O helpers.
"""

from __future__ import annotations

import json
import secrets

from . import schemes
from .schemes import (
    DNS_01, EXTERNAL_PROXY, HTTP_01, INTERNAL_CA, PLAIN_HTTP, TAILSCALE,
    DNS_PROVIDERS, SIZINGS,
)

CADDY_IMAGE_TAG = "kicad-prism-caddy-dns:2"
TAILSCALE_IMAGE = "tailscale/tailscale:stable"

SECRET_KEYS = frozenset(
    {"POSTGRES_PASSWORD", "SESSION_SECRET", "OIDC_CLIENT_SECRET", "TS_AUTHKEY"}
)
REDACTION = "<redacted>"


def generate_secret(length: int = 48) -> str:
    return secrets.token_urlsafe(length)[:length]


def secret_values(answers: dict) -> list[str]:
    """Every answer that must not reach a terminal, a log, or a paste buffer.

    Longest first, so a short secret that happens to be a substring of a longer
    one cannot mask half of it and leave the rest legible.
    """
    candidates = [
        answers.get("session_secret"),
        answers.get("postgres_password"),
        answers.get("oidc_client_secret"),
        answers.get("dns_credential"),
        answers.get("ts_authkey"),
        *(answers.get("extra_provider_env") or {}).values(),
    ]
    return sorted(
        {str(value) for value in candidates if value and len(str(value)) >= 8},
        key=len,
        reverse=True,
    )


def redact(content: str, answers: dict) -> str:
    """Mask secrets in a rendered file before it is shown to anybody.

    Two passes, because neither alone is sufficient. Matching values catches a
    secret wherever it appears, including a file that was not expected to carry
    one. Matching assignment keys catches a value too short for the first pass
    to touch safely -- a weak OIDC secret is still a secret.
    """
    for value in secret_values(answers):
        content = content.replace(value, REDACTION)

    provider = DNS_PROVIDERS.get(answers.get("dns_provider", ""))
    keys = set(SECRET_KEYS) | set(answers.get("extra_provider_env") or {})
    if provider:
        keys.add(provider.env_var)

    lines = []
    for line in content.split("\n"):
        key, separator, _ = line.partition("=")
        if separator and key.strip() in keys:
            lines.append(f"{key}={REDACTION}")
        else:
            lines.append(line)
    return "\n".join(lines)


def normalise(answers: dict) -> dict:
    """Fill in every value that can be derived rather than asked for.

    Divergence between related settings is a recurring source of broken
    deployments: a PUBLIC_BASE_URL that does not match CORS_ORIGINS_STR, or a
    cookie Secure flag that contradicts the scheme. Deriving them removes the
    opportunity.
    """
    result = dict(answers)
    scheme = result["scheme"]
    hostname = result["hostname"]

    result.setdefault("http_port", "8080")
    result.setdefault("bind_address", "127.0.0.1")
    result.setdefault("sizing", "small-team")
    result.setdefault("workspace_name", "KiCAD Prism")
    result.setdefault("acme_staging", scheme in (HTTP_01, DNS_01))

    if scheme == TAILSCALE:
        # The node name is the first label of the MagicDNS name; Tailscale
        # derives the certificate domain from it, so they cannot disagree.
        result["ts_hostname"] = hostname.split(".")[0]
        result.setdefault("ts_mode", "sidecar")
    if scheme == PLAIN_HTTP:
        # No TLS terminator, so the frontend port is part of the public origin,
        # and a Secure cookie would never be sent back over http.
        base_url = f"http://{hostname}:{result['http_port']}"
        result["session_cookie_secure"] = "false"
        # The interview offers to skip single sign-on for plain-http and
        # defaults to skipping it, so an unattended run of the same scheme must
        # not demand four OIDC settings it will not use. Infer from whether an
        # issuer was actually given, rather than assuming either way: an answers
        # file that names a provider clearly wants one.
        if scheme == PLAIN_HTTP:
            result.setdefault("auth_enabled", bool(str(result.get("oidc_issuer", "")).strip()))
        else:
            result.setdefault("auth_enabled", True)
        result.setdefault("bind_address", "127.0.0.1")
    else:
        base_url = f"https://{hostname}"
        result["session_cookie_secure"] = "true"
        result["auth_enabled"] = True
        result["bind_address"] = "127.0.0.1"
    result["public_base_url"] = base_url
    result["cors_origins"] = base_url
    result["redirect_uris"] = [
        f"{base_url}/auth/callback",
        f"{base_url}/oauth/oidc/callback",
    ]

    result["reused_password"] = bool(result.get("postgres_password"))
    for key in ("session_secret", "postgres_password"):
        if not result.get(key):
            result[key] = generate_secret(48 if key == "session_secret" else 32)

    if scheme == DNS_01:
        result["caddy_image"] = CADDY_IMAGE_TAG
        provider = DNS_PROVIDERS[result["dns_provider"]]
        result["dns_provider_module"] = provider.module
    else:
        result["caddy_image"] = "caddy:2"

    result["runs_caddy"] = schemes.SCHEMES[scheme].runs_caddy
    return result


def render_env(example: str, answers: dict) -> str:
    """Rewrite .env.example in place, preserving its comments and ordering.

    Keys the operator did not set keep the template's documented defaults, so
    the generated file stays readable and reviewable rather than becoming a
    bare list of assignments.
    """
    values = env_values(answers)
    pending = dict(values)
    lines: list[str] = []

    for raw in example.replace("\r\n", "\n").split("\n"):
        stripped = raw.strip()
        if stripped and not stripped.startswith("#") and "=" in raw:
            key = raw.split("=", 1)[0].strip()
            if key in pending:
                lines.append(f"{key}={pending.pop(key)}")
                continue
        lines.append(raw)

    if pending:
        lines.append("")
        lines.append("# ===========================================")
        lines.append("# Added by scripts/prism_deploy")
        lines.append("# ===========================================")
        for key, value in pending.items():
            lines.append(f"{key}={value}")

    return "\n".join(lines).rstrip("\n") + "\n"


def env_values(answers: dict) -> dict[str, str]:
    """The settings this installer owns. Everything else keeps its default."""
    values: dict[str, str] = {
        "WORKSPACE_NAME": answers["workspace_name"],
        "AUTH_ENABLED": "true" if answers.get("auth_enabled", True) else "false",
        # Absent when authentication is disabled, which only plain-http allows.
        "OIDC_ISSUER_URL": answers.get("oidc_issuer", ""),
        "OIDC_CLIENT_ID": answers.get("oidc_client_id", ""),
        "OIDC_CLIENT_SECRET": answers.get("oidc_client_secret", ""),
        "OIDC_PROVIDER_NAME": answers.get("oidc_provider_name", "SSO"),
        "BOOTSTRAP_ADMIN_USERS_STR": answers.get("bootstrap_admins", ""),
        "SESSION_SECRET": answers["session_secret"],
        "SESSION_COOKIE_SECURE": answers["session_cookie_secure"],
        "PUBLIC_BASE_URL": answers["public_base_url"],
        "CORS_ORIGINS_STR": answers["cors_origins"],
        "POSTGRES_PASSWORD": answers["postgres_password"],
        "PRISM_HTTP_PORT": answers["http_port"],
    }
    if not answers.get("auth_enabled", True):
        # Every request is served as this role. viewer keeps an open evaluation
        # instance read-only rather than handing out admin.
        values["DEV_GUEST_ROLE"] = answers.get("guest_role", "viewer")
    values.update(SIZINGS[answers["sizing"]].values)

    if answers["scheme"] == TAILSCALE and answers.get("ts_mode") == "sidecar":
        values["TS_AUTHKEY"] = answers["ts_authkey"]

    if answers["scheme"] == DNS_01:
        provider = DNS_PROVIDERS[answers["dns_provider"]]
        values["PRISM_CADDY_IMAGE"] = answers["caddy_image"]
        values[provider.env_var] = answers["dns_credential"]
        for key, value in answers.get("extra_provider_env", {}).items():
            values[key] = value

    return values


def render_caddyfile(answers: dict) -> str | None:
    """The proxy site config, or None when an external proxy terminates TLS."""
    scheme = answers["scheme"]
    if scheme in (EXTERNAL_PROXY, PLAIN_HTTP, TAILSCALE):
        return None

    hostname = answers["hostname"]
    header = (
        "# Generated by scripts/prism_deploy. Edits are overwritten on re-run.\n"
        f"# Scheme: {scheme}\n\n"
    )

    if scheme == INTERNAL_CA:
        tls_block = "\ttls /certs/prism.crt /certs/prism.key\n"
    elif scheme == DNS_01:
        provider = DNS_PROVIDERS[answers["dns_provider"]]
        resolvers = answers.get("dns_resolvers", "1.1.1.1 8.8.8.8")
        lines = ["\ttls {", f"\t\t{provider.directive}", f"\t\tresolvers {resolvers}"]
        if answers.get("acme_staging"):
            lines.append(f"\t\tca {schemes.STAGING_ACME}")
        lines.append("\t}")
        tls_block = "\n".join(lines) + "\n"
    else:
        if answers.get("acme_staging"):
            tls_block = "\ttls {\n" f"\t\tca {schemes.STAGING_ACME}\n" "\t}\n"
        else:
            tls_block = ""

    if tls_block:
        tls_block += "\n"

    forwarded_proto = "https" if scheme == INTERNAL_CA else "{scheme}"

    return (
        f"{header}{hostname} {{\n"
        f"{tls_block}"
        "\tencode gzip zstd\n"
        "\n"
        "\t# Large catalog imports and long-running semantic generation\n"
        "\trequest_body {\n"
        "\t\tmax_size 2GB\n"
        "\t}\n"
        "\n"
        "\treverse_proxy frontend:80 {\n"
        "\t\theader_up Host {host}\n"
        "\t\theader_up X-Real-IP {remote_host}\n"
        f"\t\theader_up X-Forwarded-Proto {forwarded_proto}\n"
        "\n"
        "\t\ttransport http {\n"
        "\t\t\tread_timeout 300s\n"
        "\t\t\twrite_timeout 300s\n"
        "\t\t}\n"
        "\t}\n"
        "}\n"
    )


def render_serve_config(answers: dict) -> str:
    """Tailscale Serve configuration: terminate TLS on 443, proxy to the frontend.

    ${TS_CERT_DOMAIN} is substituted by the container with the node's MagicDNS
    name, so this file does not need to repeat the hostname.
    """
    config = {
        "TCP": {"443": {"HTTPS": True}},
        "Web": {
            "${TS_CERT_DOMAIN}:443": {
                "Handlers": {"/": {"Proxy": "http://frontend:80"}}
            }
        },
    }
    return json.dumps(config, indent=2) + "\n"


def render_compose(answers: dict) -> str:
    """Compose overlay: loopback port bindings, plus the proxy when Caddy runs.

    `!override` replaces the port lists rather than appending to them. A plain
    merge would leave docker-compose.yml's 0.0.0.0 bindings in place alongside
    the loopback ones, so the app would still be reachable over plain HTTP.
    """
    port = answers["http_port"]
    bind = answers.get("bind_address", "127.0.0.1")
    blocks = [
        "# Generated by scripts/prism_deploy. Edits are overwritten on re-run.",
        f"# Scheme: {answers['scheme']}",
        "",
        "services:",
        "  backend:",
        "    ports: !override",
        '      - "127.0.0.1:8000:8000"',
        "",
        "  frontend:",
        "    ports: !override",
        f'      - "{bind}:{port}:80"',
    ]

    if answers["runs_caddy"]:
        caddy = [
            "",
            "  caddy:",
            f"    image: {answers['caddy_image']}",
        ]
        if answers.get("dns_pin"):
            caddy += ["    dns:", f"      - {answers['dns_pin']}"]

        volumes = [
            "    volumes: !override",
            "      - ./generated/Caddyfile:/etc/caddy/Caddyfile:ro",
        ]
        if answers["scheme"] == INTERNAL_CA:
            volumes.append(f"      - {answers['certificate_dir']}:/certs:ro")
        volumes += [
            "      - caddy_data:/data",
            "      - caddy_config:/config",
        ]

        if answers["scheme"] == DNS_01:
            provider = DNS_PROVIDERS[answers["dns_provider"]]
            env_vars = [provider.env_var, *answers.get("extra_provider_env", {})]
            caddy.append("    environment:")
            for name in env_vars:
                caddy.append(f"      - {name}=${{{name}:?Set {name} in the generated .env}}")

        blocks += caddy + volumes

    if answers["scheme"] == TAILSCALE and answers.get("ts_mode") == "sidecar":
        blocks += [
            "",
            "  tailscale:",
            f"    image: {TAILSCALE_IMAGE}",
            "    container_name: kicad-prism-tailscale",
            "    restart: unless-stopped",
            "    depends_on:",
            "      - frontend",
            "    environment:",
            "      - TS_AUTHKEY=${TS_AUTHKEY:?Set TS_AUTHKEY in the generated .env}",
            f"      - TS_HOSTNAME={answers['ts_hostname']}",
            "      - TS_STATE_DIR=/var/lib/tailscale",
            "      - TS_SERVE_CONFIG=/config/serve.json",
            # Userspace networking avoids needing /dev/net/tun and NET_ADMIN.
            # Serve proxies inside tailscaled, so no kernel interface is needed.
            "      - TS_USERSPACE=true",
            "    volumes:",
            "      - ./generated/tailscale-serve.json:/config/serve.json:ro",
            "      - tailscale-state:/var/lib/tailscale",
            "",
            "volumes:",
            "  tailscale-state:",
        ]

    return "\n".join(blocks) + "\n"


def compose_files(answers: dict) -> list[str]:
    """The -f arguments, in the order Compose must receive them."""
    files = ["docker-compose.yml"]
    if answers["runs_caddy"]:
        files.append("docker-compose.proxy.yml")
    files.append("generated/docker-compose.generated.yml")
    return files


def compose_command(answers: dict, *args: str) -> list[str]:
    command = ["docker", "compose", "--env-file", "generated/.env"]
    for path in compose_files(answers):
        command += ["-f", path]
    return command + list(args)


def render_plan(answers: dict) -> str:
    """A redacted record of the run, for re-runs and for support requests."""
    redacted = {
        key: (
            "<redacted>"
            if key in ("session_secret", "postgres_password", "oidc_client_secret", "dns_credential", "ts_authkey")
            else value
        )
        for key, value in answers.items()
    }
    redacted.pop("extra_provider_env", None)
    return json.dumps(redacted, indent=2, sort_keys=True) + "\n"


def render_next_steps(answers: dict) -> str:
    """Everything the installer deliberately does not do, with values filled in."""
    scheme = answers["scheme"]
    hostname = answers["hostname"]
    started = " ".join(compose_command(answers, "up", "-d", "--wait"))

    lines = [
        f"# Next steps for {hostname}",
        "",
        "The installer generated configuration and can start the stack. It does not",
        "change anything outside this directory. The following are yours to do.",
        "",
    ]

    if scheme == PLAIN_HTTP:
        lines += [
            "## Read this first: what this deployment cannot do",
            "",
            "There is no TLS. Traffic, session cookies, and anything typed into the",
            "workspace cross the network in the clear. This scheme exists to evaluate",
            "Prism's features, not to run it.",
            "",
            "**The KiCad remote symbol panel is not supported here.** HTTPS with a",
            "certificate the workstation already trusts is a prerequisite, and over",
            "plain HTTP Prism advertises `http://` origins in its provider metadata,",
            "which the Remote Symbol Provider guide identifies as a misconfiguration to",
            "correct rather than a supported mode. Do not build a datasource package",
            "against this origin.",
            "",
            "**Single sign-on will usually not work either.** Most identity providers",
            "reject non-HTTPS redirect URIs; Google allows them only for `localhost`.",
            "",
            "Everything else -- project import, comparison, workflows, the Library",
            "Manager, and the browser viewer -- behaves normally.",
            "",
            "Move to `dns-01`, `http-01`, or `internal-ca` before anyone relies on this.",
            "",
        ]
        if not answers.get("auth_enabled", True):
            lines += [
                "### Authentication is disabled",
                "",
                f"Every request is served as an unauthenticated guest with the",
                f"`{answers.get('guest_role', 'viewer')}` role. Anyone who can reach",
                f"`{answers['public_base_url']}` has that access, with no login and no",
                "audit trail. Keep this instance off shared networks.",
                "",
            ]

    lines += [
        "## 1. DNS",
        "",
    ]

    if scheme == DNS_01:
        lines += [
            f"Create an **A record** for `{hostname}` pointing at this host. DNS-01 proves",
            "domain control with a TXT record and does not create the A record for you.",
            "Internal DNS is sufficient; the address may be private.",
            "",
            "If the record lives in a public zone, it must be DNS-only, never proxied.",
        ]
    elif scheme == HTTP_01:
        lines += [
            f"Point `{hostname}` at this host's public address, and make ports 80 and 443",
            "reachable from the internet. HTTP-01 requires the CA to connect inbound.",
        ]
    elif scheme == TAILSCALE:
        lines += [
            "Nothing to create. Tailscale registers the MagicDNS name and issues and",
            "renews the certificate itself.",
            "",
        ]
        if answers.get("ts_mode") == "host":
            lines += [
                "This host is already on the tailnet, so no sidecar is used. Point",
                "Tailscale Serve at the frontend once; it persists across reboots:",
                "",
                "```bash",
                f"tailscale serve --bg {answers['http_port']}",
                "tailscale serve status",
                "```",
                "",
                f"Serve then proxies https://{answers['hostname']} to",
                f"127.0.0.1:{answers['http_port']}, where the generated Compose overlay",
                "publishes the frontend.",
                "",
                "To undo it later: `tailscale serve reset`.",
            ]
        else:
            lines += [
                f"Confirm the node appears in the admin console as `{answers['ts_hostname']}`",
                "after the first start. If the certificate does not appear, check that",
                "**MagicDNS** and **HTTPS Certificates** are both enabled on the DNS page.",
            ]
    elif scheme == PLAIN_HTTP:
        lines += [
            f"Reach the workspace at `{answers['public_base_url']}`.",
            "",
            f"The frontend is published on `{answers.get('bind_address', '127.0.0.1')}:{answers['http_port']}`.",
        ]
        if answers.get("bind_address", "127.0.0.1") == "127.0.0.1":
            lines += [
                "That is loopback only, so it is reachable from this host alone. Re-run",
                "the installer to publish it on the network.",
            ]
        else:
            lines += [
                "That is every interface, so anyone who can route to this host can reach",
                "it over unencrypted HTTP.",
            ]
    else:
        lines += [f"Point `{hostname}` at this host on whichever DNS serves your users."]

    lines += ["", "## 2. Firewall", ""]
    if scheme == TAILSCALE:
        lines += [
            "Nothing to open. Traffic arrives over the tailnet, so no inbound port is",
            "exposed on this host.",
            "",
            "Reachability is controlled by your tailnet ACLs rather than by a firewall.",
            "Prism's own roles still apply on top of that.",
        ]
    elif scheme == PLAIN_HTTP:
        lines += [
            "Nothing to open for a loopback deployment. If you published on all",
            f"interfaces, restrict TCP {answers['http_port']} to the smallest set of",
            "hosts that needs it -- the traffic is unencrypted.",
        ]
    elif scheme == EXTERNAL_PROXY:
        lines += [
            f"Route your existing proxy to `http://127.0.0.1:{answers['http_port']}`.",
            "It must preserve the Host header and forward the public protocol.",
            "No inbound ports need opening on this host.",
        ]
    else:
        lines += [
            "Allow inbound TCP 443, and 80 for the HTTP-to-HTTPS redirect.",
            "",
            "```powershell",
            'New-NetFirewallRule -DisplayName "KiCAD Prism HTTPS" -Direction Inbound '
            "-Protocol TCP -LocalPort 443 -Action Allow -Profile Domain,Private -RemoteAddress LocalSubnet",
            "```",
            "",
            "```bash",
            "sudo ufw allow proto tcp to any port 443",
            "```",
        ]

    if not answers.get("auth_enabled", True):
        lines += [
            "",
            "## 3. Enable authentication before wider use",
            "",
            "Set `AUTH_ENABLED=true` in `generated/.env` and supply a working OIDC",
            "client. The backend fails closed if the configuration is incomplete.",
            "",
        ]
        lines += _backup_section()
        return "\n".join(lines)

    lines += [
        "",
        "## 3. Register the OIDC client",
        "",
        "Both redirect URIs must be registered with the identity provider:",
        "",
        "```text",
        *answers["redirect_uris"],
        "```",
        "",
        "The backend refuses to start if the issuer, client credentials, or session",
        "secret are incomplete. That is deliberate: starting anyway would serve every",
        "project without a login.",
    ]

    if scheme in (HTTP_01, DNS_01):
        lines += [
            "",
            "## 4. Certificate Transparency",
            "",
            f"Every publicly trusted certificate is logged, so `{hostname}` becomes",
            "publicly enumerable within minutes of issuance, even when the service itself",
            "is unreachable from the internet. Record this as a decision.",
        ]

    if answers.get("acme_staging"):
        lines += [
            "",
            "## 5. Leave staging",
            "",
            "This deployment is pointed at the Let's Encrypt **staging** CA, so browsers",
            "will not trust the certificate yet. That is correct for a first run.",
            "",
            "Verify from the Caddy logs rather than a browser. Prism sends HSTS with a",
            "one-year max-age, so once this hostname has served a trusted certificate,",
            "browsers refuse to offer an exception for the staging one and the site",
            "simply cannot be opened until you switch to production.",
            "",
            "Once issuance succeeds, promote in place. Nothing is re-asked, and the",
            "database and project data are untouched:",
            "",
            "```bash",
            "./deploy.sh --promote        # deploy.ps1 --promote on Windows",
            "```",
        ]

    if answers.get("dns_pin"):
        lines += [
            "",
            "## Pinned resolver",
            "",
            f"Container DNS is pinned to `{answers['dns_pin']}` because the default resolver",
            "returned filtered answers. This works, but it breaks silently if this host's",
            "network changes, and the failure surfaces only at certificate renewal.",
            "",
            "Ask the network team to exempt the ACME and DNS provider endpoints from",
            "filtering, then re-run without the pin.",
        ]

    lines += _backup_section()
    return "\n".join(lines)


def _backup_section() -> list[str]:
    return [
        "",
        "## Backups",
        "",
        "A complete installation needs all of:",
        "",
        "- the `prism-postgres-data` volume",
        "- `data/projects` and `data/ssh`",
        "- `generated/.env`",
        "- the `caddy_data` volume, which holds issued certificates",
        "",
    ]


def render_all(example: str, answers: dict) -> dict[str, str]:
    """Every artifact for this deployment, keyed by path relative to the root."""
    files = {
        "generated/.env": render_env(example, answers),
        "generated/docker-compose.generated.yml": render_compose(answers),
        "generated/deploy-plan.json": render_plan(answers),
        "generated/NEXT_STEPS.md": render_next_steps(answers),
    }
    caddyfile = render_caddyfile(answers)
    if caddyfile is not None:
        files["generated/Caddyfile"] = caddyfile
    if answers["scheme"] == TAILSCALE and answers.get("ts_mode") == "sidecar":
        files["generated/tailscale-serve.json"] = render_serve_config(answers)
    return files
