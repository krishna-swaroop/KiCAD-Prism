import datetime
import logging
import os
from typing import Any

from fastapi import HTTPException
from git import Repo
from git.exc import BadName, GitCommandError

logger = logging.getLogger(__name__)


def _open_repo(repo_path: str) -> Repo:
    if not os.path.exists(repo_path):
        raise HTTPException(
            status_code=404, detail=f"Repository not found at {repo_path}"
        )

    try:
        return Repo(repo_path)
    except Exception as error:
        raise HTTPException(
            status_code=500, detail=f"Git error: {str(error)}"
        ) from error


def _serialize_commit(commit) -> dict[str, Any]:
    return {
        "hash": commit.hexsha[:7],
        "full_hash": commit.hexsha,
        "author": commit.author.name,
        "email": commit.author.email,
        "date": datetime.datetime.fromtimestamp(commit.committed_date).isoformat(),
        "message": commit.message.strip(),
        "parents": [p.hexsha for p in commit.parents],
    }


def _get_commits(
    repo_path: str,
    limit: int,
    relative_path: str = None,
    branch: str = None,
    skip: int = 0,
):
    repo = _open_repo(repo_path)
    iter_kwargs = {"max_count": limit}
    if skip:
        iter_kwargs["skip"] = skip
    if relative_path:
        iter_kwargs["paths"] = relative_path

    rev = branch if branch else "HEAD"
    try:
        commits = [
            _serialize_commit(commit)
            for commit in repo.iter_commits(rev, **iter_kwargs)
        ]
    except Exception as error:
        raise HTTPException(
            status_code=500, detail=f"Git error: {str(error)}"
        ) from error

    # Cheap enrichment: per-commit flags signalling which kinds of KiCad files
    # were touched (without running a full diff). One `git log` call covers all.
    try:
        flags_by_hash = _kicad_change_flags(
            repo, [c["full_hash"] for c in commits], relative_path
        )
        for c in commits:
            c["kicad_changes"] = flags_by_hash.get(
                c["full_hash"],
                {
                    "sch": 0,
                    "pcb": 0,
                    "pro": 0,
                    "other": 0,
                },
            )
    except Exception:
        # Best-effort — never block the commits list on this enrichment.
        for c in commits:
            c.setdefault("kicad_changes", {"sch": 0, "pcb": 0, "pro": 0, "other": 0})

    return commits


def _kicad_change_flags(
    repo, full_hashes: list[str], relative_path: str | None
) -> dict[str, dict[str, int]]:
    """
    Return {full_hash: {sch, pcb, pro, other}} where each value is the count of
    files of that kind changed in the commit (vs its first parent).

    Uses a single `git log --name-only` call that walks the requested commits.
    """
    if not full_hashes:
        return {}

    args = [
        "log",
        "--no-renames",
        "--name-only",
        "--format=PRISMHASH:%H",
        "--no-walk",
    ] + full_hashes
    if relative_path:
        args.extend(["--", relative_path])

    raw = repo.git.execute(["git", *args])
    out: dict[str, dict[str, int]] = {}
    current = None
    for line in raw.splitlines():
        if line.startswith("PRISMHASH:"):
            current = line[len("PRISMHASH:") :]
            out[current] = {"sch": 0, "pcb": 0, "pro": 0, "other": 0}
            continue
        if not current or not line.strip():
            continue
        if line.endswith(".kicad_sch"):
            out[current]["sch"] += 1
        elif line.endswith(".kicad_pcb"):
            out[current]["pcb"] += 1
        elif line.endswith(".kicad_pro"):
            out[current]["pro"] += 1
        else:
            out[current]["other"] += 1
    return out


def get_commits_list_filtered(
    repo_path: str,
    relative_path: str = None,
    limit: int = 50,
    branch: str = None,
    skip: int = 0,
):
    """
    Get list of commits from repository, optionally filtered to a subdirectory
    and/or to a specific branch (or any other rev). Defaults to HEAD.
    `skip` offsets into the history for pagination.
    """
    return _get_commits(repo_path, limit, relative_path, branch, skip=skip)


def count_commits(repo_path: str, relative_path: str = None, branch: str = None) -> int:
    """Total number of commits reachable from HEAD (optionally path-filtered),
    for pagination. Uses `git rev-list --count` — a single cheap call."""
    repo = _open_repo(repo_path)
    rev = branch if branch else "HEAD"
    try:
        args = ["--count", rev]
        if relative_path:
            args += ["--", relative_path]
        return int(repo.git.rev_list(*args).strip() or "0")
    except Exception:
        return 0


def _count_tree_entries(commit, relative_path: str) -> int | None:
    try:
        target = commit.tree / relative_path
        if target.type == "tree":
            return len(list(target.traverse()))
    except Exception:
        return None
    return None


def _commit_touches_path(repo: Repo, commit, relative_path: str) -> bool:
    try:
        args = ["--no-commit-id", "--name-only", "-r", "-m"]
        if not commit.parents:
            args.append("--root")
        output = repo.git.diff_tree(*args, commit.hexsha, "--", relative_path)
        return bool(output.strip())
    except GitCommandError:
        return False


def _get_releases(repo_path: str, relative_path: str = None):
    repo = _open_repo(repo_path)
    releases = []
    try:
        for tag in repo.tags:
            commit = tag.commit
            if relative_path and not _commit_touches_path(repo, commit, relative_path):
                continue
            release = {
                "tag": tag.name,
                "commit_hash": commit.hexsha[:7],
                "date": datetime.datetime.fromtimestamp(
                    commit.committed_date
                ).isoformat(),
                "message": commit.message.strip(),
            }
            if relative_path:
                release["subproject_files_changed"] = _count_tree_entries(
                    commit, relative_path
                )
            releases.append(release)

        releases.sort(key=lambda item: item["date"], reverse=True)
        return releases
    except Exception as error:
        raise HTTPException(
            status_code=500, detail=f"Git error: {str(error)}"
        ) from error


def get_releases_filtered(repo_path: str, relative_path: str = None):
    """
    Get list of Git tags/releases from repository.
    For Type-2 projects, shows file count under relative_path for each tag.
    """
    return _get_releases(repo_path, relative_path)


def get_file_from_commit_with_prefix(
    repo_path: str, commit_hash: str, file_path: str, relative_prefix: str = None
) -> str:
    """
    Get file content from a specific commit.
    For Type-2 projects, relative_prefix is prepended to file_path.
    """
    try:
        repo = Repo(repo_path)
        commit = repo.commit(commit_hash)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Git error: {str(e)}") from e

    full_path = file_path
    if relative_prefix:
        full_path = os.path.join(relative_prefix, file_path)

    try:
        blob = commit.tree / full_path
        content = blob.data_stream.read()
        return content.decode("utf-8")
    except KeyError:
        raise HTTPException(
            status_code=404, detail=f"File {file_path} not found in commit"
        ) from None
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400, detail="Binary file cannot be decoded"
        ) from None
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Git error: {str(e)}") from e


def file_exists_in_commit_with_prefix(
    repo_path: str, commit_hash: str, file_path: str, relative_prefix: str = None
) -> bool:
    """
    Check if a file exists in a specific commit.
    For Type-2 projects, relative_prefix is prepended to file_path.
    """
    try:
        repo = Repo(repo_path)
        commit = repo.commit(commit_hash)

        full_path = file_path
        if relative_prefix:
            full_path = os.path.join(relative_prefix, file_path)

        try:
            _ = commit.tree / full_path
            return True
        except KeyError:
            return False
    except Exception:
        return False


def get_releases(repo_path: str):
    """
    Get list of Git tags/releases from repository.
    """
    return _get_releases(repo_path)


def get_commits_list(
    repo_path: str, limit: int = 50, branch: str = None, skip: int = 0
):
    """
    Get list of commits from repository, optionally for a specific branch.
    `skip` offsets into the history for pagination.
    """
    return _get_commits(repo_path, limit, branch=branch, skip=skip)


def commit_index(
    repo_path: str, commit_hash: str, relative_path: str = None, branch: str = None
) -> int | None:
    """0-based position of `commit_hash` in the HEAD history (how many commits
    are newer than it), or None if it isn't reachable / not on the path filter.
    Lets the client compute which page a commit lives on for pagination.

    NOTE: when a relative_path filter is active the numeric page-index only lines
    up with the (path-filtered) commit list if the commit itself touches that
    path. `git rev-list --count HEAD ^<c> -- <path>` counts path-touching commits
    newer than it, which is exactly the filtered-list index."""
    repo = _open_repo(repo_path)
    rev = branch if branch else "HEAD"
    try:
        args = ["--count", rev, f"^{commit_hash}"]
        if relative_path:
            args += ["--", relative_path]
        return int(repo.git.rev_list(*args).strip() or "0")
    except Exception:
        return None


def list_branches(repo_path: str) -> list[dict[str, Any]]:
    """
    Return all branches (local and remote-tracking) in display-friendly form.

    Each entry:
        {
            name: "main",
            full_name: "refs/heads/main",
            type: "local" | "remote",
            current: bool,
            head_hash: "<short>",
            full_head_hash: "<full>",
            upstream: "origin/main" | None,
        }
    """
    repo = _open_repo(repo_path)
    out: list[dict[str, Any]] = []

    try:
        active = repo.active_branch.name if not repo.head.is_detached else None
    except Exception:
        active = None

    seen_names = set()
    try:
        for h in repo.heads:
            commit = h.commit
            upstream = None
            try:
                tracking = h.tracking_branch()
                if tracking:
                    upstream = tracking.name
            except Exception:
                upstream = None
            out.append(
                {
                    "name": h.name,
                    "full_name": h.path,
                    "type": "local",
                    "current": h.name == active,
                    "head_hash": commit.hexsha[:7],
                    "full_head_hash": commit.hexsha,
                    "upstream": upstream,
                }
            )
            seen_names.add(h.name)
    except Exception as error:
        raise HTTPException(
            status_code=500, detail=f"Git error listing branches: {error}"
        ) from error

    # Remote-tracking branches that don't have a local equivalent.
    try:
        for remote in repo.remotes:
            for r in remote.refs:
                # r.name is "origin/main"; r.remote_head is "main"
                short = (
                    r.remote_head
                    if hasattr(r, "remote_head")
                    else r.name.split("/", 1)[-1]
                )
                if short in seen_names or short == "HEAD":
                    continue
                commit = r.commit
                out.append(
                    {
                        "name": r.name,  # "origin/main"
                        "full_name": r.path,
                        "type": "remote",
                        "current": False,
                        "head_hash": commit.hexsha[:7],
                        "full_head_hash": commit.hexsha,
                        "upstream": None,
                    }
                )
    except Exception as error:
        # Remote enumeration is best-effort — never block the response.
        logger.debug("Remote branch enumeration failed for %s: %s", repo_path, error)

    # Stable order: current first, then locals, then remotes, alphabetised within group.
    out.sort(
        key=lambda b: (
            0 if b["current"] else (1 if b["type"] == "local" else 2),
            b["name"].lower(),
        )
    )
    return out


def get_current_branch(repo_path: str) -> str | None:
    """Return the current branch name, or None if HEAD is detached."""
    repo = _open_repo(repo_path)
    try:
        if repo.head.is_detached:
            return None
        return repo.active_branch.name
    except Exception:
        return None


def get_commit_distance(
    repo_path: str, commit_hash: str, relative_path: str = None
) -> int:
    """
    Count commits between the requested commit and HEAD.
    When relative_path is provided, only count commits that affect that path.
    """
    try:
        repo = _open_repo(repo_path)
        repo.commit(commit_hash)

        rev_list_args = ["--count", f"{commit_hash}..HEAD"]
        if relative_path:
            rev_list_args.extend(["--", relative_path])

        return int(repo.git.rev_list(*rev_list_args).strip() or "0")
    except BadName as error:
        raise HTTPException(
            status_code=404, detail=f"Commit not found: {commit_hash}"
        ) from error
    except GitCommandError as error:
        message = str(error).lower()
        if "bad revision" in message or "unknown revision" in message:
            raise HTTPException(
                status_code=404, detail=f"Commit not found: {commit_hash}"
            ) from error
        raise HTTPException(
            status_code=500, detail=f"Git error: {str(error)}"
        ) from error
    except Exception as error:
        raise HTTPException(
            status_code=500, detail=f"Git error: {str(error)}"
        ) from error


def get_file_from_commit(repo_path: str, commit_hash: str, file_path: str) -> str:
    """
    Get file content from a specific commit.
    Returns file content as string.
    """
    try:
        repo = Repo(repo_path)
        commit = repo.commit(commit_hash)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Git error: {str(e)}") from e

    try:
        blob = commit.tree / file_path
        content = blob.data_stream.read()
        return content.decode("utf-8")
    except KeyError:
        raise HTTPException(
            status_code=404, detail=f"File {file_path} not found in commit"
        ) from None
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400, detail="Binary file cannot be decoded"
        ) from None
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Git error: {str(e)}") from e


def file_exists_in_commit(repo_path: str, commit_hash: str, file_path: str) -> bool:
    """
    Check if a file exists in a specific commit.
    """
    try:
        repo = Repo(repo_path)
        commit = repo.commit(commit_hash)
        try:
            _ = commit.tree / file_path
            return True
        except KeyError:
            return False
    except Exception:
        return False


def get_commit_file_summary(
    repo_path: str, commit_hash: str, relative_path: str = None
) -> list:
    """
    Return the list of files changed in a commit vs its parent.
    Each entry: { path, status, additions, deletions }
    Optionally filtered to files under relative_path.
    """
    try:
        repo = _open_repo(repo_path)
        commit = repo.commit(commit_hash)
        parent = commit.parents[0] if commit.parents else None

        diffs = parent.diff(commit) if parent else commit.diff(None)

        result = []
        for d in diffs:
            path = d.b_path or d.a_path
            if relative_path and not path.startswith(relative_path):
                continue
            if d.change_type == "A":
                status = "added"
            elif d.change_type == "D":
                status = "removed"
            elif d.change_type == "R":
                status = "renamed"
            else:
                status = "modified"

            # Count added/deleted lines for text files
            additions, deletions = None, None
            try:
                if (
                    not d.a_blob
                    or not d.b_blob
                    or not (d.a_blob.mime_type or "").startswith("text")
                    or d.a_blob.size > 500_000
                ):
                    pass
                else:
                    old_lines = set(
                        d.a_blob.data_stream.read()
                        .decode("utf-8", errors="replace")
                        .splitlines()
                    )
                    new_lines = set(
                        d.b_blob.data_stream.read()
                        .decode("utf-8", errors="replace")
                        .splitlines()
                    )
                    additions = len(new_lines - old_lines)
                    deletions = len(old_lines - new_lines)
            except Exception as error:
                logger.debug("Could not count line changes for %s: %s", path, error)

            result.append(
                {
                    "path": path,
                    "filename": path.split("/")[-1],
                    "status": status,
                    "additions": additions,
                    "deletions": deletions,
                }
            )

        result.sort(key=lambda x: x["path"])
        return result
    except Exception as error:
        raise HTTPException(
            status_code=500, detail=f"Git error: {str(error)}"
        ) from error


def sync_with_remote(repo_path: str) -> dict[str, Any]:
    """
    Sync local repository with remote by performing a git pull.

    This fetches and merges the latest changes from the remote tracking branch.

    Returns:
        Dict with sync status information including:
        - success: bool
        - previous_commit: str
        - current_commit: str
        - commits_pulled: int
        - message: str
    """
    if not os.path.exists(repo_path):
        raise HTTPException(
            status_code=404, detail=f"Repository not found at {repo_path}"
        )

    try:
        repo = Repo(repo_path)

        # Get current HEAD before sync
        previous_commit = repo.head.commit.hexsha

        # Perform git pull
        origin = repo.remotes.origin

        env = os.environ.copy()
        env["GIT_TERMINAL_PROMPT"] = "0"
        # Trust On First Use (TOFU) for SSH
        env["GIT_SSH_COMMAND"] = "ssh -o StrictHostKeyChecking=accept-new"

        origin.pull(env=env)

        # Get new HEAD after sync
        current_commit = repo.head.commit.hexsha

        # Count how many commits were pulled
        commits_pulled = 0
        if previous_commit != current_commit:
            try:
                commits_pulled = len(
                    list(repo.iter_commits(f"{previous_commit}..{current_commit}"))
                )
            except Exception:
                commits_pulled = 1  # At least one if heads differ

        return {
            "success": True,
            "previous_commit": previous_commit[:7],
            "current_commit": current_commit[:7],
            "commits_pulled": commits_pulled,
            "message": f"Successfully pulled {commits_pulled} commit(s) from remote.",
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}") from e
