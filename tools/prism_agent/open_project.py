"""Opening a Prism project on this machine: `prism://open/<id>`.

Everything phases 1 to 3 built exists to make this one function honest:

    have it?  -> open it in KiCad
    not?      -> ask to clone; the user picks where; then open it
    no git?   -> say so; do not pretend

The client never asks where the *server* keeps its copy, and never compares paths. It
looks for a `.prism.json` marker under the user's projects roots.

When it does not have the project, it offers to clone -- but only the project's own
Prism-known `origin_url`, and only if that is a genuine remote (https/ssh/git). Prism is
a reader here, not a repo host: it never clones an arbitrary URL and never clones from
its own disk. The clone is a standard `git clone` that uses the user's local git
credentials; the user chooses the folder, and a folder outside the configured roots is
added to the project list (and the user is told). If anything fails, the error names
git's reason and the manual way to finish.
"""

from __future__ import annotations

import logging
import os
import subprocess
import sys
from pathlib import Path

from . import checkout, identity
from . import settings as settings_store
from .prism_client import PrismClient

log = logging.getLogger(__name__)

# Give a clone room to finish. A board repo with 3D models is not small, and killing
# a half-finished clone would leave a broken tree the user then has to clean up.
CLONE_TIMEOUT = 900


class OpenError(Exception):
    """Couldn't open the project, with a reason worth showing the user."""


def _no_window() -> int:
    """Stop a console window flashing up on Windows for a background subprocess."""
    return getattr(subprocess, "CREATE_NO_WINDOW", 0)


def find_project_file(directory: str | Path) -> str:
    """The `.kicad_pro` to hand to KiCad, or "" if there isn't one.

    The project file, not the board: opening the .kicad_pro gets you KiCad's project
    window with the schematic and PCB both reachable, which is what someone following
    a link to a *project* expects.
    """
    try:
        pro = sorted(Path(directory).glob("*.kicad_pro"))
    except OSError:
        return ""
    return str(pro[0]) if pro else ""


def launch_kicad(project_dir: str | Path) -> None:
    """Open a project directory in KiCad.

    By default hands the `.kicad_pro` to the OS, which opens it with whatever KiCad
    the user has associated. When the user has pinned a specific KiCad (the
    `kicad_command` setting, chosen from the tray), that exact executable is run
    instead, so a machine with several versions opens the one they meant rather than
    whichever won the file association.
    """
    pro = find_project_file(project_dir)
    if not pro:
        raise OpenError("No KiCad project file (.kicad_pro) in %s" % project_dir)

    settings = settings_store.load()
    command = settings.kicad_command.strip()
    # Linux only: no KiCad pinned, but the plugin runs inside a KiCad AppImage.
    # Opening that beats the desktop association, which an AppImage usually does
    # not set: on the Debian test machine .kicad_pro was associated with LibreOffice.
    appimage = settings.kicad_appimage.strip()
    if (
        not command
        and sys.platform.startswith("linux")
        and appimage
        and os.path.isfile(appimage)
    ):
        command = appimage
    try:
        if command:
            _launch_with(command, pro)
        elif sys.platform == "win32":
            os.startfile(pro)  # noqa: S606
        elif sys.platform == "darwin":
            subprocess.Popen(["open", pro])
        else:
            subprocess.Popen(["xdg-open", pro])
    except OSError as exc:
        raise OpenError("Couldn't open %s: %s" % (pro, exc)) from exc


def _launch_with(command: str, pro: str) -> None:
    """Open `pro` with a specific KiCad the user chose.

    Handles the three shapes discovery produces: a macOS `.app` bundle (opened with
    `open -a`, which finds its executable), a Flatpak command line, and a plain
    executable path (Windows/Linux). Detached and windowless, like everything else
    the agent launches.
    """
    flags = {"creationflags": _no_window()} if sys.platform == "win32" else {}

    if sys.platform == "darwin" and command.endswith(".app"):
        subprocess.Popen(["open", "-a", command, pro], **flags)
    elif command.startswith("flatpak "):
        subprocess.Popen([*command.split(), pro], **flags)
    else:
        subprocess.Popen([command, pro], **flags)


def clone(origin_url: str, destination: str | Path) -> None:
    """Clone a project into `destination`.

    A normal working-tree clone, never bare: KiCad opens files off the disk, so a bare
    clone would be useless to it. Bare only ever applies to a Prism-hosted origin on
    the *server* side.
    """
    dest = Path(destination)
    if dest.exists() and any(dest.iterdir()):
        raise OpenError("%s already exists and is not empty" % dest)

    env = os.environ.copy()
    # Never block on a credential prompt: this runs detached from any terminal, so a
    # prompt would hang forever with nothing on screen to answer it.
    env["GIT_TERMINAL_PROMPT"] = "0"

    try:
        result = subprocess.run(
            ["git", "clone", origin_url, str(dest)],
            capture_output=True,
            text=True,
            timeout=CLONE_TIMEOUT,
            check=False,
            env=env,
            creationflags=_no_window(),
        )
    except subprocess.TimeoutExpired as exc:
        raise OpenError("The clone timed out.") from exc
    except OSError as exc:
        raise OpenError("Couldn't run git: %s" % exc) from exc

    if result.returncode != 0:
        # git's own last line is almost always the useful one ("Repository not found",
        # "Permission denied (publickey)"). Our own wording would only bury it.
        detail = (result.stderr or "").strip().splitlines()
        raise OpenError(detail[-1] if detail else "The clone failed.")


def resolve(project_id: str) -> dict:
    """Work out what opening this project would involve, without doing it.

    Returns:
        found     the local directory, if we already have it
        origin    what we would clone
        owner     external | prism | none
        name      for the confirmation prompt
        roots     configured projects roots (empty = we did not look anywhere)
    """
    saved = settings_store.load()
    client = PrismClient(_config(saved))
    rows = client._request("GET", "/api/projects")
    row = None
    if isinstance(rows, list):
        row = next(
            (r for r in rows if isinstance(r, dict) and r.get("id") == project_id),
            None,
        )
    found = identity.find_checkout(
        project_id,
        saved.projects_roots,
        origin_url=(row or {}).get("origin_url") or "",
        sub_path=(row or {}).get("sub_path") or "",
        server=saved.server_url,
    )

    return {
        "id": project_id,
        "found": found,
        "origin": (row or {}).get("origin_url") or "",
        "owner": (row or {}).get("origin_owner") or "",
        "name": (row or {}).get("name") or project_id,
        "known": row is not None,
        "roots": saved.projects_roots,
    }


def _config(saved):
    from .prism_client import PrismConfig

    return PrismConfig(base_url=saved.server_url, token=saved.api_token)


def open_project(
    project_id: str,
    confirm=None,
    ref: str = "",
    ask_choice=None,
    clone_flow=None,
    on_root_added=None,
    offer_reapply=None,
) -> str:
    """Open a Prism project, cloning it first if this machine does not have it.

    `ref`, when given, is a commit/branch/tag to move the working tree to first. That is
    what makes a link to a *specific revision* mean something on the desktop rather than
    just opening whatever the user happens to have checked out.

    `confirm(question) -> bool` is asked before anything is written to disk. Cloning a
    repo the user did not ask for, into a folder they did not choose, is exactly the
    kind of thing a URL handler must not do silently: a link in a browser is not
    consent to write to the filesystem. The same applies to a checkout, which moves
    every file under a KiCad that may have them open.

    `ask_choice(question) -> (action, message)` offers the three ways out of uncommitted
    work: "stash", "discard", or "cancel". Without it, uncommitted changes are still a
    refusal: a link is not consent to move, let alone destroy, somebody's unsaved board.

    `clone_flow(name, origin) -> parent_dir | None` drives the "not on disk" case: it
    asks whether to clone, lets the user pick a parent folder, and confirms. It returns
    the chosen parent directory (the clone lands in ``<parent>/<name>``) or None to
    cancel. Prism only ever clones a project's own Prism-known ``origin_url`` -- never an
    arbitrary URL, never from the server's disk -- and the clone is a standard git clone
    that uses the user's own local git credentials. Prism is a reader here, not a repo
    host or credential manager.

    Returns the directory the project was opened from.
    """
    state = resolve(project_id)

    if state["found"]:
        if ref:
            _checkout_ref(
                state["found"], ref, confirm, ask_choice, offer_reapply=offer_reapply
            )
        launch_kicad(state["found"])
        return state["found"]

    # From here on we would have to create something, so every path needs a reason the
    # user can act on.
    if not state["known"]:
        raise OpenError(
            "This server has no project %s. It may have been deleted, or the link "
            "may point at a different Prism server." % project_id
        )

    if state["owner"] == "none":
        raise OpenError(
            "%s is not backed by git, so there is nothing to clone. Open it on the "
            "machine that holds it." % state["name"]
        )

    if not state["origin"]:
        # The project HAS git (owner is "prism" or "external"), but the server gave no
        # URL to reach it at.
        #
        # Do NOT fall through to "not backed by git". That is a different problem with a
        # different fix, and telling someone their repository does not exist when it does
        # is worse than saying nothing at all. Name the real cause.
        if state["owner"] == "prism":
            raise OpenError(
                "%s has no clone URL.\n\n"
                "Prism is hosting its git, but the server has no public URL configured "
                "(PRISM_SERVER_URL), so it cannot say where to clone from."
                % state["name"]
            )
        raise OpenError(
            "%s has no clone URL, so there is nowhere to clone it from." % state["name"]
        )

    if not _is_remote_url(state["origin"]):
        # Prism is a reader, not a repo host: it must never hand us a local path or a
        # file:// URL that would clone from the server's own disk. Only a genuine remote
        # (https/ssh/git) is clonable here; anything else is opened on the machine that
        # holds it, not pulled off Prism.
        raise OpenError(
            "%s can only be opened on the machine that has it.\n\n"
            "Prism doesn't clone from its own storage; it points you at a remote "
            "repository, and this project's origin isn't one (%s)."
            % (state["name"], state["origin"])
        )

    # The user picks where to clone. We never impose a folder or require one to be
    # pre-configured: the flow asks, opens a picker, and (on success) adds the folder
    # to the project list for them. Prism clones the project's own Prism-known origin
    # with the user's local git; it is not a repo host.
    if clone_flow is None:
        # No way to ask (e.g. a headless invocation). Cloning silently is exactly what
        # a link must not do, so decline with the manual path spelled out.
        raise OpenError(_manual_clone_help(state))

    parent = clone_flow(state["name"], state["origin"])
    if not parent:
        raise OpenError("Cancelled.")

    destination = Path(parent) / _safe_dirname(state["name"])

    try:
        clone(state["origin"], destination)
    except OpenError as exc:
        # Any clone failure (auth, network, non-empty folder, git missing) ends here.
        # Report the real reason and tell the user how to finish by hand, since the
        # automated path could not.
        raise OpenError(_clone_failed_help(state, destination, str(exc))) from exc

    marker_dir = str(destination)

    # Add the freshly cloned folder to the project roots so the agent can find it next
    # time, UNLESS it or its parent is already covered. Telling the user keeps the
    # settings change from being a silent surprise; the caller shows the note.
    added = _register_root(marker_dir)

    # Stamp the clone so the next link finds it by marker rather than by origin.
    if not identity.project_id(marker_dir):
        identity.stamp_clone(marker_dir, project_id, settings_store.load().server_url)

    if ref:
        # A fresh clone is clean by definition, so this cannot destroy anything and
        # needs no second confirmation: the user already agreed to the clone.
        _checkout_ref(marker_dir, ref, confirm=None)

    launch_kicad(marker_dir)
    if added and on_root_added is not None:
        on_root_added(marker_dir)
    return marker_dir


def _checkout_ref(project_dir: str, ref: str, confirm, ask_choice=None, offer_reapply=None) -> None:
    """Move a checkout to a specific revision, refusing to destroy uncommitted work.

    The guards live in checkout.py; this is the part that decides whether to ASK. A
    checkout replaces every file in the tree under a KiCad that may have them open, so
    it is not something a link should do silently to a project the user is working in.

    `offer_reapply(stash_entry) -> bool` is asked after a successful checkout when we land
    on a BRANCH that has a Prism stash set aside from it: work the user put away last time
    they switched off this branch. Returning True brings it back. Never applied without
    that yes: a restore can conflict, and the user may not want it back yet.
    """
    state = checkout.status(project_dir, ref)

    if state.get("reason") == "already_here":
        _maybe_offer_reapply(project_dir, offer_reapply)
        return  # nothing to move, but there may still be set-aside work to bring back

    # Uncommitted work is the one refusal with a way out. Offer both ways rather than
    # dead-ending the user, who followed a link and now has to go and use git by hand to
    # do the thing they just asked for.
    stash_message = None
    discard_changes = False
    clearable = ("dirty", "untracked_collision")

    if not state["can"] and state["reason"] in clearable and ask_choice is not None:
        action, stash_message = ask_choice(_uncommitted_question(project_dir, state))
        if action == "cancel":
            raise OpenError("Cancelled.")
        discard_changes = action == "discard"
    elif not state["can"]:
        raise OpenError(state["message"])

    if not stash_message and not discard_changes and confirm is not None:
        # Only ask twice when we have not already asked: a second "are you sure" straight
        # after the first is just noise.
        if not confirm(
            "Switch this project to %s?\n\n%s\n\nKiCad will show the files as they "
            "were at that revision." % (ref, state["target"].get("subject") or "")
        ):
            raise OpenError("Cancelled.")

    try:
        result = checkout.checkout(project_dir, ref, stash_message, discard_changes)
    except checkout.CheckoutError as exc:
        raise OpenError(str(exc)) from exc

    # Landed on a branch. If work was set aside from it before, offer to bring it back
    # (only when we did not just stash onto it this very checkout).
    if not result.get("detached") and not result.get("stashed"):
        _maybe_offer_reapply(project_dir, offer_reapply)


def _maybe_offer_reapply(project_dir: str, offer_reapply) -> None:
    """Offer to restore work set aside from the branch we are now on, if any.

    Read-only until the user says yes. A restore can conflict with the current tree, in
    which case git keeps the stash and we say nothing was lost.
    """
    if offer_reapply is None:
        return
    branch = checkout.status(project_dir).get("current_branch") or ""
    if not branch:
        return
    entry = checkout.find_returnable_stash(project_dir, branch)
    if not entry:
        return
    if offer_reapply(entry):
        try:
            checkout.restore(project_dir, entry["ref"])
        except checkout.CheckoutError as exc:
            raise OpenError(str(exc)) from exc


def _uncommitted_question(project_dir: str, state: dict) -> str:
    """What to ask before clearing someone's uncommitted work.

    Names the files. Discard is unrecoverable, and "3 files" is not something anyone can
    weigh: they need to see it is the board they spent the afternoon on.

    KiCad's own churn is separated out rather than listed alongside. A question that says
    "you will lose fp-info-cache" alongside a real board invites the user to skim, and
    skimming is exactly what you cannot afford in front of the Discard button.
    """
    from .worktree_diff import _is_noise

    losing = sorted(
        set(state.get("blocking") or []) | set(state.get("clobbered") or [])
    )
    yours = [f for f in losing if not _is_noise(f)]
    churn = len(losing) - len(yours)

    if yours:
        shown = "\n".join("    " + f for f in yours[:8])
        if len(yours) > 8:
            shown += "\n    ... and %d more" % (len(yours) - 8)
        lead = "You have uncommitted changes in this project:\n\n%s" % shown
        if churn:
            lead += "\n\n(plus %d generated file(s) KiCad will rebuild)" % churn
    else:
        # Everything in the way is churn. Say so: "discard your changes" would be a lie
        # about work that was never the user's.
        lead = "%d generated file(s) are in the way. KiCad will rebuild them." % churn

    return (
        "%s\n\nSet them aside to bring back later, or discard them for good.\n\n"
        "What were you working on?" % lead
    )


def _is_remote_url(origin: str) -> bool:
    """Is this origin a real remote we should clone over the network?

    Accepts the transports git uses for a remote: https/http, ssh, git, and the
    scp-style ``git@host:path`` (and ``ssh://``). Rejects a local filesystem path or a
    ``file://`` URL, which would clone from Prism's own disk, the one thing this must
    never do. Conservative on purpose: when in doubt it declines, and the user opens the
    project on the machine that actually holds it.
    """
    value = (origin or "").strip()
    if not value:
        return False
    lowered = value.lower()
    if lowered.startswith(("https://", "http://", "ssh://", "git://")):
        return True
    # scp-style: user@host:path, with a colon before any slash and no leading drive
    # letter (C:\...). A Windows path like C:\repo has its colon at index 1.
    if "://" not in value and ":" in value:
        host = value.split(":", 1)[0]
        if "@" in host or ("/" not in host and "\\" not in host and len(host) > 1):
            return True
    return False


def _register_root(cloned_dir: str) -> bool:
    """Add the cloned folder to the project roots, unless it is already covered.

    Adds the folder itself (not its parent): narrow by design, Prism is a reader and
    should not start scanning a whole parent tree the user did not choose. Skips the
    add when the folder OR its parent is already a root, so re-cloning a sibling into an
    existing root does not pile up redundant entries. Returns whether it added one.
    """
    saved = settings_store.load()
    target = Path(cloned_dir).resolve()
    parent = target.parent

    for root in saved.projects_roots:
        try:
            existing = Path(root).resolve()
        except (OSError, ValueError):
            continue
        # Already listed if the folder itself, its parent, or any ancestor root
        # already covers it.
        if existing == target or existing == parent or existing in target.parents:
            return False

    updated = [*saved.projects_roots, str(target)]
    settings_store.update(projects_roots=updated)
    return True


def _manual_clone_help(state: dict) -> str:
    """What to tell the user when we cannot run the clone flow ourselves."""
    return (
        "Prism doesn't have %s on this machine, and it can't open a dialog here to "
        "clone it.\n\n"
        "Clone it yourself with your usual git access:\n"
        "    git clone %s\n\n"
        "then add that folder in Prism settings, in KiCad."
        % (state["name"], state["origin"])
    )


def _clone_failed_help(state: dict, destination, detail: str) -> str:
    """A clone failed. Report git's reason, then the manual way to finish.

    Prism uses the user's own local git for the clone, so a failure is almost always
    something only they can fix (credentials, network, an SSH key). Say what happened,
    then hand them the exact command and the settings step so they are not stuck.
    """
    return (
        "Couldn't clone %s.\n\n%s\n\n"
        "You can finish this by hand with your usual git access:\n"
        "    git clone %s %s\n\n"
        "then add that folder in Prism settings, in KiCad."
        % (state["name"], detail, state["origin"], destination)
    )


def _safe_dirname(name: str) -> str:
    """A project name turned into a directory name.

    Project names come from the server and can contain anything. A name with a
    separator or a `..` in it would let a link write outside the projects root, which
    a URL handler must never allow.
    """
    cleaned = "".join(c for c in name if c.isalnum() or c in " ._-").strip(" .")
    return cleaned or "project"
