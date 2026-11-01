"""Reading a project's identity, and finding a project by it.

The agent used to answer "which Prism project is this folder?" by asking the server
for every project's `path` and comparing strings. That only ever worked because the
server and the client were the same machine. Move the server one hop and the paths it
reports are *its* paths, which can never equal a local one.

The answer is a `project` block in the checkout's `.prism.json` carrying the project's
id. The agent stamps its own clones and keeps the marker out of git (`stamp_clone`), and
a checkout without one is found by its git origin, then stamped (`find_checkout`).

    read(dir)                 -> {"id": ..., "server": ...} or None
    find_by_id(id, roots)     -> the local directory holding that project, or None
    find_checkout(...)        -> the same, falling back to the git origin and
                                 stamping what it finds

`server` is a hint, not a constraint. The same repo may legitimately be registered on
a staging server and a production one, and refusing to work because we found the
"wrong" one would be worse than useless. Match on `id`.

Searching is bounded on purpose. A checkout can be anywhere, but walking a whole disk
to find one is not a plan, so we look under the user's configured projects roots and
stop. A root is a place to *look*, not a place you are forced to put things.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

MARKER_NAME = ".prism.json"

# How deep below a root to look for a marker. Roots hold project folders, sometimes
# nested one level in a monorepo, so three is generous. Unbounded recursion over a
# home directory is how you make an agent that hangs on startup.
MAX_DEPTH = 3

# Never descend into these. Cheap to skip, ruinous to walk.
SKIP_DIRS = {
    ".git",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    "build",
    "dist",
    ".cache",
    "RemoteLibrary",
}


def read(project_dir: str | Path) -> dict | None:
    """The `project` block from a checkout's `.prism.json`, or None."""
    marker = Path(project_dir) / MARKER_NAME
    try:
        data = json.loads(marker.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        # Missing, unreadable, or not JSON. All the same to us: no identity.
        return None
    if not isinstance(data, dict):
        return None
    block = data.get("project")
    if not isinstance(block, dict) or not block.get("id"):
        return None
    return block


def project_id(project_dir: str | Path) -> str:
    """The project id this checkout claims, or "" if it claims none."""
    block = read(project_dir)
    return str(block.get("id", "")) if block else ""


def _iter_candidates(root: Path, depth: int = 0):
    """Directories under `root` that could be a project, breadth-first-ish."""
    if depth > MAX_DEPTH:
        return
    try:
        entries = sorted(root.iterdir())
    except OSError:
        return  # unreadable root: not fatal, just nothing to find here
    for entry in entries:
        if not entry.is_dir() or entry.name in SKIP_DIRS or entry.name.startswith("."):
            continue
        yield entry
        yield from _iter_candidates(entry, depth + 1)


def write(project_dir: str | Path, project_id: str, server: str = "") -> bool:
    """Stamp the identity into a checkout's `.prism.json`, keeping everything else.

    A local write, not a commit. Committing on the user's behalf, into a repo they may
    not have looked at yet, is not ours to do; the marker is useful the moment it exists
    on disk. For a clone, use `stamp_clone`, which also keeps it out of git.

    Never raises. A checkout that cannot be stamped still works, it just falls back to
    matching by git origin.
    """
    marker = Path(project_dir) / MARKER_NAME

    data: dict = {}
    if marker.exists():
        try:
            loaded = json.loads(marker.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                data = loaded
        except (OSError, ValueError):
            # Do not clobber a file we could not parse. It may be hand-written and
            # merely have a trailing comma, and destroying someone's path config to
            # add an id they did not ask for is not a trade worth making.
            return False

    block = {"id": project_id}
    if server:
        block["server"] = server
    if data.get("project") == block:
        return False  # already says this; do not dirty the tree for nothing

    data["project"] = block
    try:
        marker.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    except OSError:
        return False
    return True


def find_by_id(target_id: str, roots: list[str]) -> str:
    """The local directory holding the project with this id, or "".

    Searches each root in order, so the first root wins a tie. Two checkouts of the
    same project is a real situation (a scratch clone next to a working one), and
    picking the one under the earliest root is at least predictable.
    """
    if not target_id:
        return ""
    for raw in roots:
        try:
            root = Path(raw).expanduser().resolve()
        except (OSError, ValueError):
            continue
        if not root.is_dir():
            continue
        # The root may itself be a project, not just a container of them.
        if project_id(root) == target_id:
            return str(root)
        for candidate in _iter_candidates(root):
            if project_id(candidate) == target_id:
                return str(candidate)
    return ""


def git_origin(tree: str) -> str:
    """The `origin` remote of a local checkout, or "" if it has none."""
    try:
        result = subprocess.run(
            ["git", "-C", tree, "remote", "get-url", "origin"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
            # Windows: stop a console window flashing up when KiCad's Python calls us.
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    return result.stdout.strip() if result.returncode == 0 else ""


def normalise_url(url: str) -> str:
    """Canonical form of a git remote, for comparing two spellings of the same one.

    The same NAS share really does show up as both `\\\\HOST\\share\\x` and
    `//HOST/share/x` depending on who wrote it, and a trailing `.git` is optional
    everywhere. Compared raw, those name the same remote and fail to match.

    Deliberately conservative: fold separators, a trailing slash, a trailing `.git`,
    and case. It does not try to equate ssh:// with https:// forms of the same host,
    because those are genuinely different remotes to git and pretending otherwise
    would be a guess.
    """
    u = url.strip().replace("\\", "/").rstrip("/")
    if u.lower().endswith(".git"):
        u = u[:-4]
    return u.casefold()


def _is_checkout(directory: Path) -> bool:
    # `.git` is a file in a worktree or a submodule, a directory everywhere else.
    return (directory / ".git").exists()


def find_by_origin(origin_url: str, sub_path: str, roots: list[str]) -> str:
    """The local directory of a project found by its repo's git origin, or "".

    For checkouts with no marker: cloned by hand, or before markers existed. A repo
    that holds several projects keeps each one at `sub_path` below its root, and a
    match whose `sub_path` is missing (a sparse or older checkout) is not one.
    Earlier roots win, as in `find_by_id`.
    """
    if not origin_url:
        return ""
    target = normalise_url(origin_url)
    rel = (sub_path or "").strip("/")
    for raw in roots:
        try:
            root = Path(raw).expanduser().resolve()
        except (OSError, ValueError):
            continue
        if not root.is_dir():
            continue
        for candidate in (root, *_iter_candidates(root)):
            if not _is_checkout(candidate):
                continue
            origin = git_origin(str(candidate))
            if not origin or normalise_url(origin) != target:
                continue
            project_dir = candidate / rel if rel else candidate
            if project_dir.is_dir():
                return str(project_dir)
    return ""


def _tracked(project_dir: Path) -> bool:
    """Whether git tracks a `.prism.json` here. Unknown counts as tracked."""
    try:
        result = subprocess.run(
            ["git", "-C", str(project_dir), "ls-files", "--error-unmatch", "--", MARKER_NAME],
            capture_output=True,
            timeout=10,
            check=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.SubprocessError):
        return True
    return result.returncode == 0


def _exclude(project_dir: Path) -> bool:
    """List this marker in the clone's `info/exclude`, once."""
    try:
        result = subprocess.run(
            ["git", "-C", str(project_dir), "rev-parse",
             "--show-prefix", "--git-path", "info/exclude"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.SubprocessError):
        return False
    lines = result.stdout.splitlines()
    if result.returncode != 0 or len(lines) != 2:
        return False
    prefix, exclude_path = lines
    exclude = Path(exclude_path)
    if not exclude.is_absolute():
        exclude = project_dir / exclude
    pattern = "/" + prefix + MARKER_NAME
    try:
        existing = exclude.read_text(encoding="utf-8") if exclude.exists() else ""
        if pattern in existing.splitlines():
            return True
        exclude.parent.mkdir(parents=True, exist_ok=True)
        with exclude.open("a", encoding="utf-8") as handle:
            if existing and not existing.endswith("\n"):
                handle.write("\n")
            handle.write(pattern + "\n")
    except OSError:
        return False
    return True


def stamp_clone(project_dir: str | Path, target_id: str, server: str = "") -> bool:
    """Stamp a local clone so the next lookup is direct, without dirtying it.

    The marker stays on this machine: it is listed in the clone's `info/exclude`, so
    git ignores it and it never ends up in a commit. A `.prism.json` the repo tracks
    is left alone, since adding to it would show as a change to commit; that checkout
    keeps being found by its origin. Never raises.
    """
    directory = Path(project_dir)
    current = project_id(directory)
    if current and current != target_id:
        return False  # names another project, e.g. two projects in one folder
    if _tracked(directory) or not _exclude(directory):
        return False
    return write(directory, target_id, server)


def find_checkout(
    target_id: str,
    roots: list[str],
    origin_url: str = "",
    sub_path: str = "",
    server: str = "",
) -> str:
    """Where this machine keeps a project: by marker, then by git origin.

    A checkout found by its origin is stamped, so it is found by marker next time.
    """
    found = find_by_id(target_id, roots)
    if found or not target_id:
        return found
    found = find_by_origin(origin_url, sub_path, roots)
    if found:
        stamp_clone(found, target_id, server)
    return found
