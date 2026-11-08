"""The compatibility rules between plugin, agent and server, in one vendored module.

version.py is byte-identical in both packages (test_vendored_parity), so the agent's
copy is tested here and the plugin's is the same code.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from prism_agent import version  # noqa: E402


@pytest.mark.parametrize(
    "raw, parsed",
    [
        ("0.5.17", (0, 5, 17)),
        ("1.0", (1, 0, 0)),
        ("0.6.0rc1", (0, 6, 0)),
        ("0.5.17.1", (0, 5, 17)),
        ("", (0, 0, 0)),
        (None, (0, 0, 0)),
        ("garbage", (0, 0, 0)),
    ],
)
def test_one_tolerant_parser(raw, parsed):
    assert version.parse(raw) == parsed


# -- should a starting agent retire the running one ----------------------------


def test_an_older_agent_is_retired():
    assert version.should_retire("0.5.16", "0.5.17") is True


def test_the_same_version_is_deferred_to():
    assert version.should_retire("0.5.17", "0.5.17") is False


def test_a_newer_agent_is_deferred_to():
    assert version.should_retire("0.6.0", "0.5.17") is False


def test_an_unknown_version_is_retired():
    """An agent from before the field existed: by definition not newer than us."""
    assert version.should_retire("", "0.5.17") is True
    assert version.should_retire("garbage", "0.5.17") is True


def test_a_suffixed_newer_version_is_not_retired():
    """The reconciled rule. The agent's own parser used to read any non-numeric part as
    "unparseable, oldest", so a 0.6.0rc1 incumbent was retired by a 0.5.17 newcomer.
    The plugin's tolerant parser reads it as 0.6.0, which is what it is."""
    assert version.should_retire("0.6.0rc1", "0.5.17") is False


def test_retire_defaults_to_this_version():
    assert version.should_retire(version.VERSION) is False


# -- the plugin's verdict from one /health payload -----------------------------


def test_an_agent_below_the_minimum_is_outdated():
    assert version.health_verdict({"version": "0.4.0"}) == ("agent_outdated", "")


def test_no_health_at_all_is_an_outdated_agent():
    """No version reported parses lowest, the same as the dialog always treated it."""
    assert version.health_verdict(None)[0] == "agent_outdated"


def test_an_outdated_agent_wins_over_the_server():
    health = {"version": "0.1.0", "server_plugin": {"minimum": "99.0.0"}}
    assert version.health_verdict(health)[0] == "agent_outdated"


def test_a_server_that_cannot_serve_this_plugin_is_required():
    health = {
        "version": version.VERSION,
        "server_plugin": {"minimum": "99.0.0", "download_url": "https://x/p.zip"},
    }
    assert version.health_verdict(health) == ("required", "https://x/p.zip")


def test_a_server_expecting_newer_is_an_update():
    health = {"version": version.VERSION, "server_plugin": {"expected": "99.0.0"}}
    assert version.health_verdict(health)[0] == "update"


def test_no_server_answer_is_ok():
    assert version.health_verdict({"version": version.VERSION}) == ("ok", "")


@pytest.mark.parametrize(
    "verdict, ok",
    [("ok", True), ("update", True), ("required", False), ("agent_outdated", False)],
)
def test_only_ok_and_update_load_the_project(verdict, ok):
    assert version.usable(verdict) is ok


# -- the plugin's backend state from one /health payload -----------------------


@pytest.mark.parametrize("state", ["unknown", "up", "down", "refused"])
def test_a_known_backend_state_is_passed_through(state):
    assert version.backend_state({"backend": state}) == state


def test_an_older_agent_falls_back_to_its_boolean():
    """Agents from before the tri-state only report whether it answered."""
    assert version.backend_state({"backend_reachable": True}) == "up"
    assert version.backend_state({"backend_reachable": False}) == "down"
    assert version.backend_state({}) == "down"
    assert version.backend_state(None) == "down"


def test_an_unknown_backend_state_does_not_read_as_unreachable():
    assert version.backend_state({"backend": "unknown"}) == "unknown"
