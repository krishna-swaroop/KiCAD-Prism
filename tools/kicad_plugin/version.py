"""Version, and the compatibility rules between the plugin, the agent, and the server.

VENDORED: this file exists byte-for-byte in both ``kicad_plugin/`` and
``prism_agent/``. The plugin is installed into KiCad on its own and cannot import the
agent package, so the one module both sides read has to exist in both.
``tools/tests/test_vendored_parity.py`` fails the moment the two copies differ. Edit
one, copy it over the other.

The plugin and the agent are shipped together in one zip, but they do NOT
necessarily run together. The agent is a detached process that outlives KiCad, and
autostart means it's already running at login, so after an update, a **new plugin
routinely meets an old agent**. That's not an edge case; with automatic updates it's
the normal path.

Left unchecked, the plugin talks to the old agent, gets a 404 for a route that
didn't exist yet, or a payload missing a field, and fails in a way that looks like a
bug in the new code. This turns that whole class of mystery into one clear message.

Bump AGENT_MIN when the plugin starts relying on something a previous agent didn't
have. Leave it alone for changes the old agent can still serve.

Stdlib-only and free of any other project import: it runs inside KiCad's Python.
"""

from __future__ import annotations

# The package's version, for the plugin and the agent alike. One constant in one
# (vendored) file, so the two halves of a package cannot claim different versions.
# package_plugin.py reads it rather than taking one as an argument.
VERSION = "0.5.18"

# The oldest agent the plugin can work with: the last release that actually changed
# what the plugin needs, not the current one. Pinning it to VERSION forces a restart
# after every update, even when the running agent serves this plugin perfectly well.
#
# 0.5.0: switching a branch changed shape rather than merely gaining a route. In 0.4.0
# /switch was a GET reporting the pending deferred switch; from 0.5.0 it is a POST that
# performs the checkout, so a 0.4.0 agent answers this plugin's switch with a 404, and
# /remotes does not exist there at all.
#
# (0.3.0 was the floor before that, for /settings and /restart.)
AGENT_MIN = "0.5.0"

# The oldest plugin the agent can serve.
#
# Only bump this when a change in the agent genuinely BREAKS an older plugin, not
# merely when the agent gains something. Every route so far has been additive, so an
# older plugin still works fine against a newer agent; declaring otherwise would break
# working setups for no reason. The compatibility that actually bites runs the other
# way (a new plugin meeting an old agent, because autostart kept it alive), and the
# plugin checks for that itself.
PLUGIN_MIN = "0.1.0"


def parse(v: str) -> tuple:
    """'0.3.1' -> (0, 3, 1). Tolerant: anything unparseable sorts lowest, so a
    garbled version is treated as too old rather than assumed fine.

    The one parser for every comparison here. Each part reads its leading digits, so
    '0.6.0rc1' is 0.6.0 and an empty or garbled version is 0.0.0."""
    parts = []
    for chunk in str(v or "").split(".")[:3]:
        digits = ""
        for ch in chunk:
            if ch.isdigit():
                digits += ch
            else:
                break
        parts.append(int(digits) if digits else 0)
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts)


def agent_too_old(agent_version: str) -> bool:
    return parse(agent_version) < parse(AGENT_MIN)


def should_retire(incumbent_version: str, own_version: str = VERSION) -> bool:
    """Should a starting agent ask the one already running to quit?

    Only when the incumbent is older. The same version or newer is deferred to: there
    is nothing to gain by churning. An unknown version (an agent from before the field
    existed) parses lowest, so it is retired: it is by definition not newer than us.
    """
    return parse(incumbent_version) < parse(own_version)


def server_verdict(server_plugin: dict | None) -> tuple[str, str]:
    """How this plugin stands against the server it's talking to.

    The plugin follows its server. There is no independent update channel, precisely so
    the two can't drift: a plugin from six months ago against a moved-on API is exactly
    the support burden worth designing out.

    Returns (verdict, download_url):
        "ok"        current, or ahead of a server that hasn't been updated yet
        "update"    behind what the server expects, but still workable
        "required"  older than the server can serve at all

    Anything unknown (no server, an older server with no version endpoint) is "ok": the
    plugin must keep working against a backend that can't answer.
    """
    if not isinstance(server_plugin, dict):
        return "ok", ""

    url = str(server_plugin.get("download_url") or "")
    mine = parse(VERSION)

    minimum = server_plugin.get("minimum")
    if minimum and mine < parse(minimum):
        return "required", url

    expected = server_plugin.get("expected")
    if expected and mine < parse(expected):
        return "update", url

    return "ok", url


def health_verdict(health: dict | None) -> tuple[str, str]:
    """The plugin's whole compatibility answer from one agent /health payload.

    Returns (verdict, download_url):
        "agent_outdated"  the running agent is older than AGENT_MIN
        "required"        the server cannot serve this plugin at all
        "update"          the server expects a newer plugin, but this one still works
        "ok"              nothing to say

    "agent_outdated" is checked first: an agent too old to trust is not asked what the
    server thinks either.
    """
    health = health if isinstance(health, dict) else {}
    if agent_too_old(health.get("version", "")):
        return "agent_outdated", ""
    return server_verdict(health.get("server_plugin"))


def usable(verdict: str) -> bool:
    """Can the plugin go on to load the project under this verdict?"""
    return verdict in ("ok", "update")
