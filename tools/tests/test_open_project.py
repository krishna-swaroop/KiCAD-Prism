"""prism://open/<id>: open a project here, cloning it first if we don't have it.

This is a URL handler, which means a web page can invoke it. Two things follow, and
most of these tests are about them:

  * It must never write to disk without asking. A link in a browser is not consent to
    clone a repository into someone's filesystem.
  * A project name comes from the server and can contain anything. It must never be
    able to steer a clone outside the projects root.
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from prism_agent import checkout, open_project  # noqa: E402
from prism_agent.open_project import OpenError  # noqa: E402


@pytest.fixture
def roots(tmp_path, monkeypatch):
    """A configured projects root, and a stub server that knows one project."""
    root = tmp_path / "projects"
    root.mkdir()

    class FakeSettings:
        projects_roots = [str(root)]
        server_url = "https://prism.example.com"
        api_token = ""

    monkeypatch.setattr(open_project.settings_store, "load", lambda: FakeSettings())
    return root


def stub_server(monkeypatch, rows):
    monkeypatch.setattr(
        open_project.PrismClient, "_request", lambda self, m, p, body=None: rows
    )


def stamp(directory: Path, project_id: str) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / ".prism.json").write_text(json.dumps({"project": {"id": project_id}}))
    return directory


# -- the name can never escape the root ------------------------------------


@pytest.mark.parametrize(
    "name",
    [
        "../../../etc/passwd",
        "..\\..\\Windows\\System32",
        "/absolute/elsewhere",
        "C:\\Windows",
        "..",
        ".",
    ],
)
def test_a_hostile_project_name_cannot_steer_the_clone_out_of_the_root(name):
    """The name comes from the server. A separator or a `..` in it must not let a link
    write outside the projects root."""
    safe = open_project._safe_dirname(name)
    assert "/" not in safe
    assert "\\" not in safe
    assert ".." not in safe
    assert safe not in ("", ".")


@pytest.mark.parametrize(
    "origin",
    [
        "https://github.com/acme/widget.git",
        "http://gitlab.local/acme/widget",
        "ssh://git@host/acme/widget.git",
        "git://host/acme/widget",
        "git@github.com:acme/widget.git",
        "gitlab.example.com:acme/widget.git",
    ],
)
def test_remote_origins_are_clonable(origin):
    assert open_project._is_remote_url(origin) is True


@pytest.mark.parametrize(
    "origin",
    [
        "",
        "/data/repos/widget.git",  # a path on Prism's disk
        "file:///data/repos/widget.git",
        "C:\\repos\\widget",
        "./widget",
        "../widget",
        "widget",
    ],
)
def test_local_or_disk_origins_are_refused(origin):
    """Prism must never clone from its own storage: a local path or file:// URL is not
    a remote and is not clonable here."""
    assert open_project._is_remote_url(origin) is False


def test_a_local_disk_origin_is_not_cloned(roots, monkeypatch):
    """End to end: the server hands back a filesystem origin (its own disk). The agent
    refuses to clone it and points the user at the machine that holds it."""
    stub_server(
        monkeypatch,
        [
            {
                "id": "prj_a",
                "name": "widget",
                "origin_url": "/srv/prism/repos/widget.git",
                "origin_owner": "prism",
            }
        ],
    )
    monkeypatch.setattr(
        open_project, "clone", lambda *a: pytest.fail("must not clone from disk")
    )
    with pytest.raises(OpenError, match="doesn't clone from its own storage"):
        open_project.open_project("prj_a", clone_flow=lambda name, origin: "/tmp/x")


def test_an_ordinary_name_survives_intact():
    assert open_project._safe_dirname("SatNOGS Comms v2.1") == "SatNOGS Comms v2.1"


def test_a_name_of_pure_punctuation_still_yields_a_directory():
    assert open_project._safe_dirname("///") == "project"


# -- nothing is written without a yes --------------------------------------


def _external(pid="prj_a", name="widget"):
    return [
        {
            "id": pid,
            "name": name,
            "origin_url": "https://h/x",
            "origin_owner": "external",
        }
    ]


def test_declining_the_clone_writes_nothing(roots, monkeypatch):
    """The user cancels the clone flow. Nothing is written, and it is not an error."""
    stub_server(monkeypatch, _external())
    cloned = []
    monkeypatch.setattr(open_project, "clone", lambda *a: cloned.append(a))

    with pytest.raises(OpenError, match="Cancelled"):
        # clone_flow returning None is the user cancelling at any step.
        open_project.open_project("prj_a", clone_flow=lambda name, origin: None)

    assert cloned == []
    assert list(roots.iterdir()) == []


def test_without_a_clone_flow_it_declines_with_manual_help(roots, monkeypatch):
    """No way to ask (a headless invocation) must not clone silently. It names the
    manual git command and the settings step instead."""
    stub_server(monkeypatch, _external())
    monkeypatch.setattr(
        open_project, "clone", lambda *a: pytest.fail("must not clone with no flow")
    )
    with pytest.raises(OpenError) as exc:
        open_project.open_project("prj_a")
    assert "git clone https://h/x" in str(exc.value)


def test_the_clone_flow_receives_the_name_and_prism_origin(roots, monkeypatch):
    """Prism only ever clones the project's own Prism-known origin, never an arbitrary
    URL. The flow is handed exactly that."""
    stub_server(monkeypatch, _external())
    seen = {}

    def flow(name, origin):
        seen["name"] = name
        seen["origin"] = origin
        return None  # cancel; we only care what it was offered

    with pytest.raises(OpenError, match="Cancelled"):
        open_project.open_project("prj_a", clone_flow=flow)
    assert seen == {"name": "widget", "origin": "https://h/x"}


def test_accepting_clones_into_the_chosen_parent_then_opens(roots, tmp_path, monkeypatch):
    stub_server(monkeypatch, _external())
    # Stub the roots-update: these tests are about the clone/open, not the settings
    # write, and the fixture's fake settings is not a real dataclass to save.
    monkeypatch.setattr(open_project.settings_store, "update", lambda **kw: None)
    parent = tmp_path / "chosen"
    parent.mkdir()

    def fake_clone(origin, dest):
        Path(dest).mkdir(parents=True)
        (Path(dest) / "widget.kicad_pro").write_text("{}")

    opened = []
    monkeypatch.setattr(open_project, "clone", fake_clone)
    monkeypatch.setattr(open_project, "launch_kicad", lambda d: opened.append(str(d)))

    result = open_project.open_project(
        "prj_a", clone_flow=lambda name, origin: str(parent)
    )

    assert result == str(parent / "widget")
    assert opened == [str(parent / "widget")]


def test_a_fresh_clone_gets_a_marker(roots, tmp_path, monkeypatch):
    """Without this we would fail to find it next time and clone it all over again.
    The marker stays local: git ignores it, so the clone is still clean."""
    stub_server(monkeypatch, _external())
    monkeypatch.setattr(open_project.settings_store, "update", lambda **kw: None)
    parent = tmp_path / "chosen"
    parent.mkdir()
    monkeypatch.setattr(
        open_project,
        "clone",
        lambda origin, dest: subprocess.run(["git", "init", "-q", str(dest)], check=True),
    )
    monkeypatch.setattr(open_project, "launch_kicad", lambda d: None)

    open_project.open_project("prj_a", clone_flow=lambda name, origin: str(parent))

    clone = parent / "widget"
    marker = json.loads((clone / ".prism.json").read_text())
    assert marker["project"]["id"] == "prj_a"
    status = subprocess.run(
        ["git", "-C", str(clone), "status", "--porcelain"],
        capture_output=True, text=True, check=True,
    )
    assert status.stdout == ""


def test_a_hand_made_clone_is_found_by_its_origin_not_cloned_again(roots, monkeypatch):
    clone = roots / "my-widget"
    subprocess.run(["git", "init", "-q", str(clone)], check=True)
    subprocess.run(
        ["git", "-C", str(clone), "remote", "add", "origin", "https://h/x.git"],
        check=True,
    )
    stub_server(monkeypatch, _external())
    monkeypatch.setattr(
        open_project, "clone", lambda *a: pytest.fail("cloned a project already on disk")
    )
    opened = []
    monkeypatch.setattr(open_project, "launch_kicad", lambda d: opened.append(str(d)))

    open_project.open_project("prj_a")

    assert opened == [str(clone.resolve())]
    assert json.loads((clone / ".prism.json").read_text())["project"]["id"] == "prj_a"


def test_a_clone_outside_the_roots_is_added_to_the_project_list(roots, tmp_path, monkeypatch):
    """The chosen folder is not under any configured root, so the agent adds the cloned
    folder to the project list and tells the user."""
    stub_server(monkeypatch, _external())
    parent = tmp_path / "elsewhere"
    parent.mkdir()
    monkeypatch.setattr(
        open_project, "clone", lambda origin, dest: Path(dest).mkdir(parents=True)
    )
    monkeypatch.setattr(open_project, "launch_kicad", lambda d: None)

    saved_roots = []
    monkeypatch.setattr(
        open_project.settings_store,
        "update",
        lambda **kw: saved_roots.append(kw.get("projects_roots")),
    )
    told = []

    open_project.open_project(
        "prj_a",
        clone_flow=lambda name, origin: str(parent),
        on_root_added=lambda d: told.append(d),
    )

    cloned = str((parent / "widget").resolve())
    assert saved_roots and cloned in saved_roots[-1]
    assert told == [str(parent / "widget")]


def test_a_clone_inside_an_existing_root_is_not_re_added(roots, monkeypatch):
    """The chosen parent is already a configured root, so its child is covered and the
    project list is left untouched, no note either."""
    stub_server(monkeypatch, _external())
    monkeypatch.setattr(
        open_project, "clone", lambda origin, dest: Path(dest).mkdir(parents=True)
    )
    monkeypatch.setattr(open_project, "launch_kicad", lambda d: None)
    monkeypatch.setattr(
        open_project.settings_store,
        "update",
        lambda **kw: pytest.fail("must not touch roots when already covered"),
    )
    told = []

    open_project.open_project(
        "prj_a",
        clone_flow=lambda name, origin: str(roots),
        on_root_added=lambda d: told.append(d),
    )
    assert told == []


def test_a_clone_failure_reports_the_manual_path(roots, tmp_path, monkeypatch):
    """Prism clones with the user's own git, so a failure is theirs to fix. Report git's
    reason, then the exact manual command and the settings step."""
    stub_server(monkeypatch, _external())
    parent = tmp_path / "chosen"
    parent.mkdir()

    def failing_clone(origin, dest):
        raise OpenError("Permission denied (publickey).")

    monkeypatch.setattr(open_project, "clone", failing_clone)

    with pytest.raises(OpenError) as exc:
        open_project.open_project("prj_a", clone_flow=lambda name, origin: str(parent))
    message = str(exc.value)
    assert "Permission denied (publickey)." in message
    assert "git clone https://h/x" in message


# -- we already have it ----------------------------------------------------


def test_a_project_we_already_have_opens_without_asking_or_cloning(roots, monkeypatch):
    local = stamp(roots / "widget", "prj_a")
    stub_server(monkeypatch, [{"id": "prj_a", "name": "widget"}])

    opened = []
    monkeypatch.setattr(open_project, "launch_kicad", lambda d: opened.append(str(d)))
    monkeypatch.setattr(
        open_project, "clone", lambda *a: pytest.fail("must not clone what we have")
    )

    def confirm(_):
        pytest.fail("must not ask about a project we already have")

    assert open_project.open_project("prj_a", confirm=confirm) == str(local)
    assert opened == [str(local)]


# -- the honest refusals ---------------------------------------------------


def test_a_project_with_no_git_says_so_rather_than_pretending(roots, monkeypatch):
    """origin_owner == "none" is the real CIAA_ACC case: registered with Prism, not in
    git. There is nothing to clone, and inventing something would be worse."""
    stub_server(
        monkeypatch,
        [{"id": "prj_a", "name": "CIAA_ACC", "origin_url": "", "origin_owner": "none"}],
    )
    with pytest.raises(OpenError, match="not backed by git"):
        open_project.open_project("prj_a", confirm=lambda _: True)


def test_a_prism_hosted_project_with_no_url_names_the_real_cause(roots, monkeypatch):
    """Found in the wild. origin_owner is "prism", so Prism IS hosting the git, but the
    server has no PRISM_SERVER_URL and so cannot say where. The old code lumped this in
    with "not backed by git", which told the user their repository did not exist when it
    did. A wrong diagnosis is worse than none: it sends them to fix the wrong thing."""
    stub_server(
        monkeypatch,
        [{"id": "prj_a", "name": "widget", "origin_url": "", "origin_owner": "prism"}],
    )
    with pytest.raises(OpenError, match="PRISM_SERVER_URL"):
        open_project.open_project("prj_a", confirm=lambda _: True)


def test_a_prism_hosted_project_with_no_url_is_not_called_ungitted(roots, monkeypatch):
    stub_server(
        monkeypatch,
        [{"id": "prj_a", "name": "widget", "origin_url": "", "origin_owner": "prism"}],
    )
    with pytest.raises(OpenError) as exc:
        open_project.open_project("prj_a", confirm=lambda _: True)
    assert "not backed by git" not in str(exc.value)


# -- opening a commit on a project with unsaved work -----------------------


def board_repo(root: Path, project_id: str) -> Path:
    """A checkout with a marker and two commits, as a real project would be."""
    import subprocess

    def git(*a):
        subprocess.run(["git", *a], cwd=str(local), capture_output=True, check=True)

    local = root / "widget"
    local.mkdir(parents=True)
    git("init", "-b", "main")
    git("config", "user.email", "t@t.t")
    git("config", "user.name", "T")
    (local / "widget.kicad_pro").write_text("{}")
    (local / "board.kicad_pcb").write_text("(kicad_pcb v1)")
    (local / ".prism.json").write_text(json.dumps({"project": {"id": project_id}}))
    git("add", "-A")
    git("commit", "-m", "first")
    first = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=str(local),
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    (local / "board.kicad_pcb").write_text("(kicad_pcb v2)")
    git("add", "-A")
    git("commit", "-m", "second")
    return local, first


def test_opening_a_commit_offers_to_stash_uncommitted_work(roots, monkeypatch):
    """The bug: prism://open?commit= dead-ended on "commit or stash them first". The
    user followed a link and was told to go and use git by hand to do the thing they had
    just asked for."""
    local, first = board_repo(roots, "prj_a")
    (local / "board.kicad_pcb").write_text("(kicad_pcb UNSAVED)")

    stub_server(monkeypatch, [{"id": "prj_a", "name": "widget"}])
    monkeypatch.setattr(open_project, "launch_kicad", lambda d: None)

    asked = []

    def ask_choice(question):
        asked.append(question)
        return "stash", "rerouting the power rail"

    open_project.open_project(
        "prj_a", confirm=lambda _: True, ref=first, ask_choice=ask_choice
    )

    # It asked, it named the problem, and it NAMED THE FILES: "3 files" is not something
    # anyone can weigh against losing an afternoon's work.
    assert asked and "uncommitted" in asked[0]
    assert "board.kicad_pcb" in asked[0]
    # The tree really moved, and the work is safely stashed rather than destroyed.
    assert (local / "board.kicad_pcb").read_text() == "(kicad_pcb v1)"
    assert checkout.stashes(local)[0]["message"] == "rerouting the power rail"


def test_opening_a_commit_can_discard_uncommitted_work(roots, monkeypatch):
    """The other way out. Unrecoverable, so it only ever happens on an explicit
    "discard" from a question that named the files."""
    local, first = board_repo(roots, "prj_a")
    (local / "board.kicad_pcb").write_text("(kicad_pcb A FAILED EXPERIMENT)")

    stub_server(monkeypatch, [{"id": "prj_a", "name": "widget"}])
    monkeypatch.setattr(open_project, "launch_kicad", lambda d: None)

    open_project.open_project(
        "prj_a",
        confirm=lambda _: True,
        ref=first,
        ask_choice=lambda _q: ("discard", ""),
    )

    assert (local / "board.kicad_pcb").read_text() == "(kicad_pcb v1)"
    # Gone, not hidden: discard is not a stash with a different label.
    assert checkout.stashes(local) == []


def test_declining_leaves_everything_alone(roots, monkeypatch):
    local, first = board_repo(roots, "prj_a")
    (local / "board.kicad_pcb").write_text("(kicad_pcb UNSAVED)")

    stub_server(monkeypatch, [{"id": "prj_a", "name": "widget"}])
    monkeypatch.setattr(
        open_project, "launch_kicad", lambda d: pytest.fail("must not open")
    )

    with pytest.raises(OpenError, match="Cancelled"):
        open_project.open_project(
            "prj_a",
            confirm=lambda _: True,
            ref=first,
            ask_choice=lambda _q: ("cancel", ""),
        )

    assert (local / "board.kicad_pcb").read_text() == "(kicad_pcb UNSAVED)"
    assert checkout.stashes(local) == []


def test_the_question_separates_your_work_from_kicads_churn():
    """A question that says "you will lose fp-info-cache" alongside a real board invites
    skimming, and skimming is exactly what you cannot afford in front of Discard."""
    question = open_project._uncommitted_question(
        "",
        {
            "blocking": ["board.kicad_pcb"],
            "clobbered": ["fp-info-cache", "~board.kicad_pcb.lck"],
        },
    )

    assert "board.kicad_pcb" in question
    # The churn is counted, not listed as though it were the user's.
    assert "fp-info-cache" not in question
    assert "2 generated" in question


def test_a_tree_dirtied_only_by_churn_does_not_claim_it_is_your_work():
    question = open_project._uncommitted_question(
        "", {"blocking": [], "clobbered": ["fp-info-cache"]}
    )

    assert "uncommitted changes" not in question
    assert "generated" in question
    assert "rebuild" in question


def test_a_long_list_is_capped_and_says_so():
    """A dialog listing 200 files is a dialog nobody reads."""
    question = open_project._uncommitted_question(
        "", {"blocking": [f"sheet{n}.kicad_sch" for n in range(20)], "clobbered": []}
    )
    assert "... and 12 more" in question


def test_without_a_way_to_ask_uncommitted_work_is_still_a_refusal(roots, monkeypatch):
    """No ask_choice (an old caller, or a platform with no prompt) must not silently
    stash, and above all must not silently discard. Moving someone's unsaved board needs
    an explicit yes."""
    local, first = board_repo(roots, "prj_a")
    (local / "board.kicad_pcb").write_text("(kicad_pcb UNSAVED)")

    stub_server(monkeypatch, [{"id": "prj_a", "name": "widget"}])

    with pytest.raises(OpenError, match="uncommitted"):
        open_project.open_project("prj_a", confirm=lambda _: True, ref=first)

    assert (local / "board.kicad_pcb").read_text() == "(kicad_pcb UNSAVED)"


def test_a_clean_tree_is_not_asked_about_uncommitted_work(roots, monkeypatch):
    local, first = board_repo(roots, "prj_a")

    stub_server(monkeypatch, [{"id": "prj_a", "name": "widget"}])
    monkeypatch.setattr(open_project, "launch_kicad", lambda d: None)

    def ask_choice(_):
        pytest.fail("nothing to clear, so nothing to ask about")

    open_project.open_project(
        "prj_a", confirm=lambda _: True, ref=first, ask_choice=ask_choice
    )
    assert (local / "board.kicad_pcb").read_text() == "(kicad_pcb v1)"


def test_returning_to_the_branch_offers_to_bring_set_aside_work_back(roots, monkeypatch):
    """The round-trip that motivates the whole stash-origin change: set work aside to open
    a commit, then come back to the branch and be offered it back, rather than having to
    remember it is in the stash list."""
    local, first = board_repo(roots, "prj_a")
    (local / "board.kicad_pcb").write_text("(kicad_pcb UNSAVED WORK)")

    stub_server(monkeypatch, [{"id": "prj_a", "name": "widget"}])
    monkeypatch.setattr(open_project, "launch_kicad", lambda d: None)

    # Open the earlier commit: dirty tree, so it stashes (origin = main).
    open_project.open_project(
        "prj_a",
        confirm=lambda _: True,
        ref=first,
        ask_choice=lambda _q: ("stash", "unsaved work"),
    )
    assert (local / "board.kicad_pcb").read_text() == "(kicad_pcb v1)"

    # Now return to main. The tree is clean, so no stash prompt, but a matching stash
    # exists, so re-apply is offered, and accepted here.
    offered = []

    def offer_reapply(entry):
        offered.append(entry["message"])
        return True

    open_project.open_project(
        "prj_a", confirm=lambda _: True, ref="main", offer_reapply=offer_reapply
    )

    assert offered == ["unsaved work"]
    # The work is back in the tree, and the stash is gone (pop, not apply).
    assert (local / "board.kicad_pcb").read_text() == "(kicad_pcb UNSAVED WORK)"
    assert checkout.stashes(local) == []


def test_declining_the_reapply_leaves_the_stash_in_place(roots, monkeypatch):
    """Never auto-apply: "Not now" keeps the work safely stashed for later."""
    local, first = board_repo(roots, "prj_a")
    (local / "board.kicad_pcb").write_text("(kicad_pcb UNSAVED)")

    stub_server(monkeypatch, [{"id": "prj_a", "name": "widget"}])
    monkeypatch.setattr(open_project, "launch_kicad", lambda d: None)

    open_project.open_project(
        "prj_a", confirm=lambda _: True, ref=first, ask_choice=lambda _q: ("stash", "x")
    )
    open_project.open_project(
        "prj_a", confirm=lambda _: True, ref="main", offer_reapply=lambda _e: False
    )

    # Declined: tree stays at the committed version and the stash is still there.
    assert (local / "board.kicad_pcb").read_text() == "(kicad_pcb v2)"
    assert len(checkout.stashes(local)) == 1


def test_an_unknown_project_says_the_server_does_not_have_it(roots, monkeypatch):
    stub_server(monkeypatch, [])
    with pytest.raises(OpenError, match="no project"):
        open_project.open_project("prj_gone", confirm=lambda _: True)


def test_no_configured_root_is_fine_because_the_user_picks_one(tmp_path, monkeypatch):
    """No pre-configured root is no longer a dead end: the user picks a folder, and the
    agent adds the cloned folder to the (previously empty) project list."""
    saved = {"projects_roots": []}

    class NoRoots:
        projects_roots = []
        server_url = "https://prism.example.com"
        api_token = ""

    monkeypatch.setattr(open_project.settings_store, "load", lambda: NoRoots())
    monkeypatch.setattr(
        open_project.settings_store,
        "update",
        lambda **kw: saved.update(kw),
    )
    stub_server(
        monkeypatch,
        [
            {
                "id": "prj_a",
                "name": "widget",
                "origin_url": "https://h/x",
                "origin_owner": "external",
            }
        ],
    )
    parent = tmp_path / "chosen"
    parent.mkdir()
    monkeypatch.setattr(
        open_project, "clone", lambda origin, dest: Path(dest).mkdir(parents=True)
    )
    monkeypatch.setattr(open_project, "launch_kicad", lambda d: None)

    result = open_project.open_project(
        "prj_a", clone_flow=lambda name, origin: str(parent)
    )
    assert result == str(parent / "widget")
    assert str((parent / "widget").resolve()) in saved["projects_roots"]


def test_a_server_that_is_down_does_not_silently_clone(roots, monkeypatch):
    stub_server(monkeypatch, None)  # _request returns None when unreachable
    with pytest.raises(OpenError):
        open_project.open_project("prj_a", confirm=lambda _: True)


# -- finding the project file ----------------------------------------------


def test_finds_the_kicad_pro(tmp_path):
    (tmp_path / "board.kicad_pro").write_text("{}")
    assert open_project.find_project_file(tmp_path).endswith("board.kicad_pro")


def test_a_directory_with_no_project_file_reports_nothing(tmp_path):
    (tmp_path / "board.kicad_pcb").write_text("")
    assert open_project.find_project_file(tmp_path) == ""


def test_launching_a_directory_with_no_project_file_is_an_error(tmp_path):
    with pytest.raises(OpenError, match="No KiCad project file"):
        open_project.launch_kicad(tmp_path)


def test_refuses_to_clone_over_a_non_empty_directory(tmp_path):
    dest = tmp_path / "existing"
    dest.mkdir()
    (dest / "work.kicad_pcb").write_text("do not destroy me")
    with pytest.raises(OpenError, match="already exists"):
        open_project.clone("https://h/x", dest)


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
