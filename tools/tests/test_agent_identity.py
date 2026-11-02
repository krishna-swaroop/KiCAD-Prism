"""The agent finding a project by its marker instead of by comparing paths.

The bug this replaces: the agent asked the server for every project's `path` and
string-compared it against the local one. That is only ever correct when the server
and the client are the same machine. These tests pin the new behaviour, and in
particular the two cases where marker-matching and path-matching disagree.
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from prism_agent import identity, prism_client, server  # noqa: E402
from prism_agent.prism_client import PrismClient, PrismConfig  # noqa: E402


def stamp(directory: Path, project_id: str, server: str = "") -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    block = {"id": project_id}
    if server:
        block["server"] = server
    (directory / ".prism.json").write_text(json.dumps({"project": block}))
    return directory


# -- reading the marker ----------------------------------------------------


def test_reads_the_id_from_a_marker(tmp_path):
    stamp(tmp_path, "prj_abc", "https://prism.example.com")
    assert identity.project_id(tmp_path) == "prj_abc"
    assert identity.read(tmp_path)["server"] == "https://prism.example.com"


def test_no_marker_means_no_id(tmp_path):
    assert identity.project_id(tmp_path) == ""
    assert identity.read(tmp_path) is None


def test_an_unparseable_marker_means_no_id(tmp_path):
    (tmp_path / ".prism.json").write_text("{not json")
    assert identity.project_id(tmp_path) == ""


def test_a_marker_without_a_project_block_means_no_id(tmp_path):
    # A .prism.json that only carries path config is the common pre-phase-1 case.
    (tmp_path / ".prism.json").write_text(json.dumps({"paths": {"pcb": "a.kicad_pcb"}}))
    assert identity.project_id(tmp_path) == ""


# -- searching the roots ---------------------------------------------------


def test_finds_a_project_nested_under_a_root(tmp_path):
    stamp(tmp_path / "work" / "boards" / "widget", "prj_abc")
    assert identity.find_by_id("prj_abc", [str(tmp_path)]) == str(
        tmp_path / "work" / "boards" / "widget"
    )


def test_finds_a_root_that_is_itself_the_project(tmp_path):
    # A user can name a single project folder as a root. Do not require it to be a
    # container.
    stamp(tmp_path, "prj_abc")
    assert identity.find_by_id("prj_abc", [str(tmp_path)]) == str(tmp_path.resolve())


def test_returns_empty_when_the_project_is_not_under_any_root(tmp_path):
    stamp(tmp_path / "elsewhere", "prj_abc")
    root = tmp_path / "roots"
    root.mkdir()
    assert identity.find_by_id("prj_abc", [str(root)]) == ""


def test_returns_empty_when_no_roots_are_configured(tmp_path):
    stamp(tmp_path / "proj", "prj_abc")
    assert identity.find_by_id("prj_abc", []) == ""


def test_earlier_roots_win(tmp_path):
    # Two checkouts of the same project is a real situation (a scratch clone beside
    # a working one). Whichever we pick, it has to be predictable.
    first = stamp(tmp_path / "a" / "widget", "prj_abc")
    stamp(tmp_path / "b" / "widget", "prj_abc")
    found = identity.find_by_id("prj_abc", [str(tmp_path / "a"), str(tmp_path / "b")])
    assert found == str(first)


def test_a_missing_root_is_skipped_not_fatal(tmp_path):
    stamp(tmp_path / "real" / "widget", "prj_abc")
    found = identity.find_by_id(
        "prj_abc", [str(tmp_path / "does-not-exist"), str(tmp_path / "real")]
    )
    assert found == str(tmp_path / "real" / "widget")


def test_does_not_descend_into_skipped_directories(tmp_path):
    # node_modules and .git can be enormous. Walking them to find a marker that will
    # never be there is how an agent ends up hanging on startup.
    stamp(tmp_path / "node_modules" / "pkg", "prj_abc")
    assert identity.find_by_id("prj_abc", [str(tmp_path)]) == ""


def test_an_empty_id_never_matches(tmp_path):
    stamp(tmp_path / "proj", "prj_abc")
    assert identity.find_by_id("", [str(tmp_path)]) == ""


# -- the client's lookup ---------------------------------------------------


class FakeClient(PrismClient):
    """A PrismClient whose /api/projects response we control."""

    def __init__(self, rows):
        super().__init__(PrismConfig(base_url="http://server"))
        self.rows = rows

    def _request(self, method, path, body=None):
        return self.rows


def test_marker_wins_over_path(tmp_path):
    """The whole point. The server reports a path that is meaningless here (it is
    the server's own disk), and the marker still resolves the project correctly."""
    local = stamp(tmp_path / "widget", "prj_abc")
    client = FakeClient(
        [
            {"id": "prj_abc", "name": "widget", "path": "/srv/prism/data/widget"},
        ]
    )
    assert client.find_project(str(local))["id"] == "prj_abc"


def test_a_marker_for_an_unknown_project_returns_nothing(tmp_path):
    """The checkout names a project this server does not have. Answering "none" is
    correct; falling back to a path match could return the WRONG project, and a
    wrong answer is worse than no answer."""
    local = stamp(tmp_path / "widget", "prj_gone")
    client = FakeClient([{"id": "prj_other", "path": str(local)}])
    assert client.find_project(str(local)) is None


def test_falls_back_to_the_git_origin_when_there_is_no_marker(tmp_path, monkeypatch):
    """Projects imported before the marker existed still have to resolve. The fallback
    is the git origin, NOT the filesystem path: two clones of the same repo agree on
    their remote no matter where they sit on disk, so this works off-machine too."""
    local = tmp_path / "widget"
    local.mkdir()
    monkeypatch.setattr(
        prism_client, "_git_origin", lambda _: "https://github.com/x/widget.git"
    )
    client = FakeClient(
        [{"id": "prj_legacy", "origin_url": "https://github.com/x/widget"}]
    )
    # Matched despite the .git suffix on one side and not the other.
    assert client.find_project(str(local))["id"] == "prj_legacy"


def test_the_origin_fallback_folds_separator_spellings(tmp_path, monkeypatch):
    # A NAS share genuinely appears as both \\HOST\share\x and //HOST/share/x
    # depending on who wrote it. They are the same remote and must match.
    local = tmp_path / "widget"
    local.mkdir()
    monkeypatch.setattr(
        prism_client, "_git_origin", lambda _: "//MYCLOUD/matteo/Projects/test board"
    )
    client = FakeClient(
        [{"id": "prj_nas", "origin_url": "\\\\MYCLOUD\\matteo\\Projects\\test board"}]
    )
    assert client.find_project(str(local))["id"] == "prj_nas"


def test_a_project_with_no_origin_never_matches_by_origin(tmp_path, monkeypatch):
    """origin_owner == "none" means Prism knows the project but git does not. There is
    nothing to match on, and guessing would be worse than saying no."""
    local = tmp_path / "widget"
    local.mkdir()
    monkeypatch.setattr(prism_client, "_git_origin", lambda _: "")
    client = FakeClient([{"id": "prj_nogit", "origin_url": "", "origin_owner": "none"}])
    assert client.find_project(str(local)) is None


def test_the_server_no_longer_sends_a_path_to_match_on(tmp_path, monkeypatch):
    """The old same-machine path match is gone. Even if a row somehow carried a `path`
    equal to ours, it must not be used: that is the co-location assumption returning
    through the back door."""
    local = tmp_path / "widget"
    local.mkdir()
    monkeypatch.setattr(prism_client, "_git_origin", lambda _: "")
    client = FakeClient([{"id": "prj_legacy", "path": str(local)}])
    assert client.find_project(str(local)) is None


def test_returns_none_when_the_server_is_unreachable(tmp_path):
    stamp(tmp_path / "widget", "prj_abc")
    client = FakeClient(None)  # _request returns None when the backend is down
    assert client.find_project(str(tmp_path / "widget")) is None


# -- comparing git remotes -------------------------------------------------


@pytest.mark.parametrize(
    "a,b",
    [
        ("https://github.com/x/y.git", "https://github.com/x/y"),
        ("https://github.com/x/y/", "https://github.com/x/y"),
        ("\\\\HOST\\share\\board", "//HOST/share/board"),
        ("https://GitHub.com/X/Y", "https://github.com/x/y"),
    ],
)
def test_these_spell_the_same_remote(a, b):
    assert prism_client._normalise_url(a) == prism_client._normalise_url(b)


@pytest.mark.parametrize(
    "a,b",
    [
        # Genuinely different remotes to git. Equating them would be a guess, and a
        # wrong one would attach a checkout to the wrong project.
        ("git@github.com:x/y.git", "https://github.com/x/y"),
        ("https://github.com/x/y", "https://github.com/x/z"),
        ("https://gitlab.com/x/y", "https://github.com/x/y"),
    ],
)
def test_these_do_not(a, b):
    assert prism_client._normalise_url(a) != prism_client._normalise_url(b)


# -- tidying the roots the user typed --------------------------------------


def test_blank_and_non_string_roots_are_dropped(tmp_path):
    assert server._clean_roots(["", "   ", None, 42]) == []


def test_the_same_folder_spelled_twice_is_stored_once(tmp_path):
    a = tmp_path / "work"
    a.mkdir()
    spellings = [str(a), str(a) + "/", str(a / "sub" / "..")]
    assert len(server._clean_roots(spellings)) == 1


def test_a_root_that_does_not_exist_is_kept(tmp_path):
    """A removable drive or an offline network share is still where the user keeps
    their projects. Silently deleting it from their settings because we could not
    stat it right now would be its own bug."""
    missing = str(tmp_path / "usb-stick")
    assert server._clean_roots([missing]) == [missing]


def test_order_is_preserved(tmp_path):
    # find_by_id searches roots in order and the first wins, so the order the user
    # chose has to survive being saved.
    a, b = tmp_path / "a", tmp_path / "b"
    a.mkdir()
    b.mkdir()
    assert server._clean_roots([str(b), str(a)]) == [str(b), str(a)]


def test_garbage_input_is_not_a_crash(tmp_path):
    assert server._clean_roots("not a list") == []
    assert server._clean_roots(None) == []


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))


# -- finding a checkout with no marker by its git origin ---------------------


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], capture_output=True, text=True, check=True
    ).stdout


def hand_clone(directory: Path, origin: str = "https://github.com/x/widget.git") -> Path:
    """A clone made outside the agent: git, an origin, and no marker."""
    git("init", "-q", str(directory))
    git("-C", str(directory), "remote", "add", "origin", origin)
    return directory


def test_finds_a_hand_made_clone_by_its_origin_and_stamps_it(tmp_path):
    clone = hand_clone(tmp_path / "boards" / "my-widget")

    found = identity.find_checkout(
        "prj_a", [str(tmp_path)], origin_url="https://github.com/x/widget"
    )

    assert found == str(clone.resolve())
    assert identity.project_id(clone) == "prj_a"
    # Stamped, but git ignores it: nothing to commit, nothing that reaches the repo.
    assert git("-C", str(clone), "status", "--porcelain") == ""
    # And the next lookup is by marker, no origin needed.
    assert identity.find_by_id("prj_a", [str(tmp_path)]) == str(clone.resolve())


def test_a_project_inside_a_larger_repo_is_found_at_its_sub_path(tmp_path):
    repo = hand_clone(tmp_path / "mono")
    (repo / "boards" / "power").mkdir(parents=True)

    found = identity.find_checkout(
        "prj_power",
        [str(tmp_path)],
        origin_url="https://github.com/x/widget",
        sub_path="boards/power",
    )

    assert found == str((repo / "boards" / "power").resolve())
    assert identity.project_id(repo / "boards" / "power") == "prj_power"
    assert identity.project_id(repo) == ""
    assert git("-C", str(repo), "status", "--porcelain") == ""


def test_a_missing_sub_path_is_not_a_match(tmp_path):
    hand_clone(tmp_path / "mono")
    assert identity.find_by_origin(
        "https://github.com/x/widget", "boards/power", [str(tmp_path)]
    ) == ""


def test_a_clone_of_another_repo_is_not_a_match(tmp_path):
    hand_clone(tmp_path / "other", origin="https://github.com/x/gadget.git")
    assert identity.find_checkout(
        "prj_a", [str(tmp_path)], origin_url="https://github.com/x/widget"
    ) == ""


def test_no_origin_url_means_no_origin_search(tmp_path):
    hand_clone(tmp_path / "widget")
    assert identity.find_by_origin("", "", [str(tmp_path)]) == ""


def test_a_tracked_prism_json_is_found_but_never_edited(tmp_path):
    """Adding the id to a tracked file would show up as a change to commit."""
    clone = hand_clone(tmp_path / "widget")
    config = {"paths": {"pcb": "main.kicad_pcb"}}
    (clone / ".prism.json").write_text(json.dumps(config))
    git("-C", str(clone), "add", ".prism.json")

    found = identity.find_checkout(
        "prj_a", [str(tmp_path)], origin_url="https://github.com/x/widget"
    )

    assert found == str(clone.resolve())
    assert json.loads((clone / ".prism.json").read_text()) == config


def test_a_marker_naming_another_project_is_not_overwritten(tmp_path):
    clone = hand_clone(tmp_path / "widget")
    stamp(clone, "prj_other")

    assert identity.stamp_clone(clone, "prj_a") is False
    assert identity.project_id(clone) == "prj_other"


def test_the_exclude_line_is_written_once(tmp_path):
    clone = hand_clone(tmp_path / "widget")
    identity.stamp_clone(clone, "prj_a")
    (clone / ".prism.json").unlink()
    identity.stamp_clone(clone, "prj_a")

    exclude = (clone / ".git" / "info" / "exclude").read_text().splitlines()
    assert exclude.count("/.prism.json") == 1


def test_locate_falls_back_to_the_origin(tmp_path, monkeypatch):
    clone = hand_clone(tmp_path / "widget")

    class FakeSettings:
        projects_roots = [str(tmp_path)]
        server_url = ""

    monkeypatch.setattr(server.settings_store, "load", lambda: FakeSettings())
    client = FakeClient([{"id": "prj_a", "origin_url": "https://github.com/x/widget"}])
    handler = type("H", (), {"state": type("S", (), {"prism": client})()})()

    payload = server._Handler._locate_payload(handler, "prj_a")

    assert payload["path"] == str(clone.resolve())
