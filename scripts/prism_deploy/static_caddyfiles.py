"""The committed Caddyfile templates, rendered from the installer's site block.

``deploy/`` and ``deploy/release/`` carry three hand-copyable Caddyfiles each
(public HTTP-01, internal CA, DNS-01). Their site block comes from
``render.caddy_site``, the same one the installer writes, so a proxy started
from a template sends Prism exactly what an installed one does. Only the
explanatory comments differ between the two folders.

    python3 -m scripts.prism_deploy.static_caddyfiles           # check
    python3 -m scripts.prism_deploy.static_caddyfiles --write   # regenerate

``scripts/test_prism_deploy.py`` fails when a committed file drifts.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import schemes
from .render import caddy_site, forwarded_proto

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
PUBLIC_HOST = "prism.example.com"
INTERNAL_HOST = "kicad-prism.corp.internal"

_PUBLIC_HEADER = """\
# KiCAD Prism reverse proxy (public HTTPS)

# Replace prism.example.com with your public DNS name.
# Point this site at the Compose frontend service on the Docker network.
#
# Prerequisites:
# - DNS A/AAAA records for the hostname
# - Ports 80 and 443 reachable for ACME HTTP-01
# - Prism .env configured with SESSION_COOKIE_SECURE=true and an HTTPS CORS origin
"""

_INTERNAL_HEADER = """\
# KiCAD Prism reverse proxy (internal CA / custom certificates)

# Replace kicad-prism.corp.internal and certificate paths.
#
# Serving a bare IP? Clients that send no SNI (Windows Schannel, Chrome) fail
# the handshake unless this file starts with a global block naming that IP:
#
#   {
#   	default_sni 192.168.1.20
#   }
#
"""

_INTERNAL_REPOSITORY_NOTE = """\
# Mount this file and the cert directory into the Caddy container.
#
# Example docker-compose.proxy.yml volume additions:
#   - ./deploy/Caddyfile.internal:/etc/caddy/Caddyfile:ro
#   - ./deploy/certs:/certs:ro
#
# Distribute deploy/certs/corp-root-ca.crt (or your real root) to every
# KiCad workstation OS trust store. See
# https://krishna-swaroop.github.io/KiCAD-Prism/admin/deployment/.
"""

_INTERNAL_BUNDLE_NOTE = """\
# Put prism.crt and prism.key in the bundle's certs directory.
"""

_DNS_HEADER = """\
# KiCAD Prism reverse proxy (public ACME, DNS-01 challenge)

# Use this when Prism must be reachable over publicly trusted HTTPS but the
# host must not accept inbound connections from the internet. DNS-01 proves
# domain control by publishing a TXT record, so:
#
# - ports 80 and 443 never need to be reachable from outside your network;
# - the A record may resolve to a private address in internal DNS only;
# - no root CA has to be distributed to KiCad workstations.
#
# Requires a Caddy binary with your DNS provider module compiled in. The stock
# caddy:2 image will not work. See {dockerfile}.
#
# Replace prism.example.com and the provider directive below.
#
# See {guide}.
"""

_DNS_TLS = """\
\ttls {{
\t\t# Cloudflare shown as an example. Each caddy-dns module documents its
\t\t# own directive and arguments; substitute yours. Read credentials from
\t\t# the environment so they stay out of this file and out of Git.
\t\t{directive}

\t\t# Caddy confirms the TXT record is visible before asking the CA to
\t\t# validate. Name resolvers that can see the public zone: a split-horizon
\t\t# corporate resolver may never return the public answer. On a network
\t\t# that intercepts outbound DNS, these must be resolvers the network
\t\t# permits, or the propagation check times out.
\t\tresolvers 1.1.1.1 8.8.8.8

\t\t# Rehearse against the staging CA first. Staging issues untrusted
\t\t# certificates but has far higher rate limits than production, which
\t\t# allows only 5 failed validations per hostname per hour.
\t\t# Inside a tls block the subdirective is `ca`; `acme_ca` is the
\t\t# global-options spelling and is rejected here.
\t\t# ca {staging}
\t}}
"""


def _templates(folder: str, *, bundle: bool) -> dict[str, str]:
    deployment_docs = "https://krishna-swaroop.github.io/KiCAD-Prism/admin/deployment/"
    guide = f"the Deployment guide at {deployment_docs}" if bundle else deployment_docs
    public = _PUBLIC_HEADER if bundle else _PUBLIC_HEADER + f"#\n# See {deployment_docs}\n"
    internal = _INTERNAL_HEADER + (_INTERNAL_BUNDLE_NOTE if bundle else _INTERNAL_REPOSITORY_NOTE)
    dns = _DNS_HEADER.format(
        dockerfile="Dockerfile.caddy-dns" if bundle else "deploy/Dockerfile.caddy-dns",
        guide=guide,
    )
    dns_tls = _DNS_TLS.format(
        directive=schemes.DNS_PROVIDERS["cloudflare"].directive,
        staging=schemes.STAGING_ACME,
    )
    return {
        f"{folder}/Caddyfile": public
        + "\n"
        + caddy_site(PUBLIC_HOST, "", forwarded_proto(schemes.HTTP_01)),
        f"{folder}/Caddyfile.internal": internal
        + "\n"
        + caddy_site(
            INTERNAL_HOST,
            "\ttls /certs/prism.crt /certs/prism.key\n",
            forwarded_proto(schemes.INTERNAL_CA),
        ),
        f"{folder}/Caddyfile.dns-01": dns
        + "\n"
        + caddy_site(PUBLIC_HOST, dns_tls, forwarded_proto(schemes.DNS_01)),
    }


def render_static_caddyfiles() -> dict[str, str]:
    """Repository-relative path -> content for every committed Caddyfile template."""
    return {
        **_templates("deploy", bundle=False),
        **_templates("deploy/release", bundle=True),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--write", action="store_true", help="regenerate the committed files")
    args = parser.parse_args(argv)
    drifted = []
    for name, text in render_static_caddyfiles().items():
        path = REPOSITORY_ROOT / name
        current = path.read_text(encoding="utf-8") if path.exists() else None
        if current == text:
            continue
        if args.write:
            path.write_text(text, encoding="utf-8", newline="\n")
            print(f"wrote {name}")
        else:
            drifted.append(name)
    for name in drifted:
        print(f"{name} differs from the rendered template", file=sys.stderr)
    return 1 if drifted else 0


if __name__ == "__main__":
    raise SystemExit(main())
