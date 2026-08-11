"""Read the local Tailscale node, so the interview can prefill what it knows."""

from __future__ import annotations

import json
import os
import shutil
import subprocess

CLI_CANDIDATES = (
    "tailscale",
    "/usr/local/bin/tailscale",
    "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
)


def cli() -> str | None:
    for candidate in CLI_CANDIDATES:
        if "/" in candidate:
            if os.path.exists(candidate):
                return candidate
            continue
        found = shutil.which(candidate)
        if found:
            return found
    return None


def local_node() -> dict | None:
    """Return {name, online, cert_ready} for this host, or None if not on a tailnet.

    cert_ready reflects whether the tailnet has HTTPS Certificates enabled, which
    is the prerequisite operators most often miss.
    """
    binary = cli()
    if not binary:
        return None
    try:
        done = subprocess.run([binary, "status", "--json"], capture_output=True, text=True, timeout=15)
    except (OSError, subprocess.SubprocessError):
        return None
    if done.returncode != 0:
        return None
    try:
        status = json.loads(done.stdout)
    except json.JSONDecodeError:
        return None

    name = ((status.get("Self") or {}).get("DNSName") or "").rstrip(".")
    if not name:
        return None
    return {
        "name": name,
        "online": bool((status.get("Self") or {}).get("Online")),
        "cert_ready": bool(status.get("CertDomains")),
    }
