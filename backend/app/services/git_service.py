import logging
import hashlib
import os
from pathlib import PurePosixPath
from fastapi import HTTPException
from git import Repo
from git.exc import BadName, GitCommandError
from typing import Dict, Any
import datetime

from app.services.git_read_cache_service import git_read_cache

logger = logging.getLogger(__name__)


def _open_repo(repo_path: str) -> Repo:
    if not os.path.exists(repo_path):
        raise HTTPException(status_code=404, detail=f"Repository not found at {repo_path}")

    try:
        return Repo(repo_path)
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Git error: {str(error)}") from error


def _serialize_commit(commit) -> Dict[str, str]:
    return {
        "hash": commit.hexsha[:7],
        "full_hash": commit.hexsha,
        "author": commit.author.name,
        "email": commit.author.email,
        "date": datetime.datetime.fromtimestamp(commit.committed_date).isoformat(),
        "message": commit.message.strip(),
    }


def _commit_has_path(commit, relative_path: str | None) -> bool:
    if not relative_path:
        return True
    try:
        commit.tree / relative_path
        return True
    except Exception:
        return False


def _resolve_commit(repo: Repo, ref: str | None):
    try:
        return repo.commit(ref or "HEAD")
    except BadName as error:
        raise HTTPException(status_code=404, detail=f"Git ref not found: {ref}") from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Git error: {str(error)}") from error


def _get_commits(
    repo_path: str,
    limit: int,
    relative_path: str = None,
    ref: str = None,
    offset: int = 0,
    include_total: bool = True,
):
    repo = _open_repo(repo_path)
    resolved_ref_sha = _resolve_commit(repo, ref).hexsha
    normalized_limit = max(1, int(limit))
    normalized_offset = max(0, int(offset))
    cache_parameters = {
        "relative_path": relative_path or "",
        "limit": normalized_limit,
        "offset": normalized_offset,
        "include_total": bool(include_total),
    }
    cached = git_read_cache.unwrap(
        git_read_cache.get(
            "commits",
            os.path.realpath(repo_path),
            resolved_ref_sha,
            cache_parameters,
        )
    )
    if isinstance(cached, dict):
        return cached

    iter_kwargs = {
        "max_count": normalized_limit + (0 if include_total else 1),
        "skip": normalized_offset,
        "rev": resolved_ref_sha,
    }
    if relative_path:
        iter_kwargs["paths"] = relative_path

    try:
        commits = [_serialize_commit(commit) for commit in repo.iter_commits(**iter_kwargs)]
        has_more = len(commits) > normalized_limit
        if has_more:
            commits = commits[:normalized_limit]
        total = None
        if include_total:
            count_args = ["rev-list", "--count", resolved_ref_sha]
            if relative_path:
                count_args.extend(["--", relative_path])
            total = int(repo.git.execute(["git", *count_args]))
            has_more = normalized_offset + len(commits) < total
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Git error: {str(error)}") from error

    # Cheap enrichment: per-commit counts of which kinds of KiCad files were
    # touched (without running a full diff per commit). One `git log` call
    # covers the whole page. Best-effort — never blocks the commits list.
    try:
        flags_by_hash = _kicad_change_flags(repo, [c["full_hash"] for c in commits], relative_path)
        for c in commits:
            c["kicad_changes"] = flags_by_hash.get(
                c["full_hash"], {"sch": 0, "pcb": 0, "pro": 0, "other": 0}
            )
    except Exception:
        for c in commits:
            c.setdefault("kicad_changes", {"sch": 0, "pcb": 0, "pro": 0, "other": 0})

    result = {
        "commits": commits,
        "total": total,
        "has_more": has_more,
        "limit": normalized_limit,
        "offset": normalized_offset,
        "resolved_ref_sha": resolved_ref_sha,
    }
    git_read_cache.put(
        "commits",
        os.path.realpath(repo_path),
        resolved_ref_sha,
        cache_parameters,
        result,
    )
    return result


def _kicad_change_flags(
    repo: Repo, full_hashes: list[str], relative_path: str | None
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
    ref: str = None,
    offset: int = 0,
    include_total: bool = True,
):
    """
    Get paginated commits from repository, optionally filtered to a subdirectory.
    For Type-2 projects, relative_path scopes commits to the subproject.
    Returns {commits, total, limit, offset}.
    """
    return _get_commits(
        repo_path,
        limit,
        relative_path,
        ref,
        offset,
        include_total,
    )


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


def _is_ancestor(repo: Repo, ancestor: str, descendant: str) -> bool:
    try:
        repo.git.merge_base("--is-ancestor", ancestor, descendant)
        return True
    except GitCommandError:
        return False


def _get_releases(
    repo_path: str,
    relative_path: str = None,
    ref: str = None,
    limit: int | None = None,
    offset: int = 0,
    include_total: bool = True,
):
    repo = _open_repo(repo_path)
    resolved_ref_sha = _resolve_commit(repo, ref).hexsha
    try:
        tag_state = repo.git.for_each_ref(
            "--format=%(refname):%(objectname)",
            "refs/tags",
        )
    except GitCommandError:
        tag_state = ""
    tag_fingerprint = hashlib.sha256(tag_state.encode("utf-8")).hexdigest()
    cache_parameters = {
        "relative_path": relative_path or "",
        "filter_to_ref": bool(ref),
        "tag_fingerprint": tag_fingerprint,
    }
    cached = git_read_cache.unwrap(
        git_read_cache.get(
            "releases",
            os.path.realpath(repo_path),
            resolved_ref_sha,
            cache_parameters,
        )
    )
    releases = list(cached) if isinstance(cached, list) else []
    try:
        if not isinstance(cached, list):
            for tag in repo.tags:
                commit = tag.commit
                if ref and not _is_ancestor(repo, commit.hexsha, resolved_ref_sha):
                    continue
                if relative_path and not _commit_touches_path(repo, commit, relative_path):
                    continue
                release = {
                    "tag": tag.name,
                    "commit_hash": commit.hexsha[:7],
                    "full_hash": commit.hexsha,
                    "date": datetime.datetime.fromtimestamp(commit.committed_date).isoformat(),
                    "message": commit.message.strip(),
                }
                if relative_path:
                    release["subproject_files_changed"] = _count_tree_entries(commit, relative_path)
                releases.append(release)

            releases.sort(key=lambda item: item["date"], reverse=True)
            git_read_cache.put(
                "releases",
                os.path.realpath(repo_path),
                resolved_ref_sha,
                cache_parameters,
                releases,
            )
        total = len(releases)
        start = max(0, offset)
        if limit is None:
            return releases if start == 0 else releases[start:]
        normalized_limit = max(0, int(limit))
        page = releases[start : start + normalized_limit]
        return {
            "releases": page,
            "total": total if include_total else None,
            "has_more": start + len(page) < total,
            "limit": normalized_limit,
            "offset": start,
            "resolved_ref_sha": resolved_ref_sha,
        }
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Git error: {str(error)}") from error


def get_releases_filtered(
    repo_path: str,
    relative_path: str = None,
    ref: str = None,
    limit: int | None = None,
    offset: int = 0,
    include_total: bool = True,
):
    """
    Get Git tags/releases from repository.
    For Type-2 projects, shows file count under relative_path for each tag.
    When limit is set, returns {releases, total, limit, offset}; otherwise a list.
    """
    return _get_releases(
        repo_path,
        relative_path,
        ref,
        limit,
        offset,
        include_total,
    )


def get_file_from_commit_with_prefix(repo_path: str, commit_hash: str, file_path: str, relative_prefix: str = None) -> str:
    """
    Get file content from a specific commit.
    For Type-2 projects, relative_prefix is prepended to file_path.
    """
    try:
        repo = Repo(repo_path)
        commit = repo.commit(commit_hash)
        
        # Prepend relative_prefix for Type-2 projects
        full_path = file_path
        if relative_prefix:
            full_path = os.path.join(relative_prefix, file_path)
        
        try:
            blob = commit.tree / full_path
            content = blob.data_stream.read()
            return content.decode('utf-8')
        except KeyError:
            raise HTTPException(status_code=404, detail=f"File {file_path} not found in commit")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="Binary file cannot be decoded")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Git error: {str(e)}")


def file_exists_in_commit_with_prefix(repo_path: str, commit_hash: str, file_path: str, relative_prefix: str = None) -> bool:
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
    except:
        return False

def get_releases(
    repo_path: str,
    ref: str = None,
    limit: int | None = None,
    offset: int = 0,
    include_total: bool = True,
):
    """
    Get list of Git tags/releases from repository.
    When limit is set, returns {releases, total, limit, offset}; otherwise a list.
    """
    return _get_releases(
        repo_path,
        ref=ref,
        limit=limit,
        offset=offset,
        include_total=include_total,
    )

def get_commits_list(
    repo_path: str,
    limit: int = 50,
    ref: str = None,
    offset: int = 0,
    include_total: bool = True,
):
    """
    Get paginated commits from repository.
    Returns {commits, total, limit, offset}.
    """
    return _get_commits(
        repo_path,
        limit,
        ref=ref,
        offset=offset,
        include_total=include_total,
    )


def get_commit_distance(repo_path: str, commit_hash: str, relative_path: str = None, ref: str = None) -> int:
    """
    Count commits between the requested commit and HEAD.
    When relative_path is provided, only count commits that affect that path.
    """
    try:
        repo = _open_repo(repo_path)
        commit_sha = repo.commit(commit_hash).hexsha
        target_sha = repo.commit(ref or "HEAD").hexsha
        cache_parameters = {
            "commit_sha": commit_sha,
            "relative_path": relative_path or "",
        }
        cached = git_read_cache.unwrap(
            git_read_cache.get(
                "commit_distance",
                os.path.realpath(repo_path),
                target_sha,
                cache_parameters,
            )
        )
        if isinstance(cached, int):
            return cached

        rev_list_args = ["--count", f"{commit_sha}..{target_sha}"]
        if relative_path:
            rev_list_args.extend(["--", relative_path])

        result = int(repo.git.rev_list(*rev_list_args).strip() or "0")
        git_read_cache.put(
            "commit_distance",
            os.path.realpath(repo_path),
            target_sha,
            cache_parameters,
            result,
        )
        return result
    except BadName as error:
        raise HTTPException(status_code=404, detail=f"Commit not found: {commit_hash}") from error
    except GitCommandError as error:
        message = str(error).lower()
        if "bad revision" in message or "unknown revision" in message:
            raise HTTPException(status_code=404, detail=f"Commit not found: {commit_hash}") from error
        raise HTTPException(status_code=500, detail=f"Git error: {str(error)}") from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Git error: {str(error)}") from error


def get_branches(repo_path: str, relative_path: str = None) -> dict[str, Any]:
    """
    Return local and remote branch refs without changing the working tree.
    For Type-2 projects, branches that do not contain the subproject path are omitted.
    """
    repo = _open_repo(repo_path)
    branches: list[dict[str, Any]] = []
    seen_refs: set[str] = set()

    try:
        active_branch = repo.active_branch.name if not repo.head.is_detached else None
    except (TypeError, ValueError):
        active_branch = None

    def add_branch(*, name: str, ref: str, source: str, is_current: bool = False) -> None:
        if ref in seen_refs:
            return
        commit = _resolve_commit(repo, ref)
        if not _commit_has_path(commit, relative_path):
            return
        seen_refs.add(ref)
        branches.append(
            {
                "name": name,
                "ref": ref,
                "source": source,
                "is_current": is_current,
                "hash": commit.hexsha[:7],
                "commit": commit.hexsha,
                "author": commit.author.name,
                "email": commit.author.email,
                "date": datetime.datetime.fromtimestamp(commit.committed_date).isoformat(),
                "message": commit.message.strip(),
            }
        )

    # A local branch and its remote-tracking counterpart share a name
    # (master / origin/master). When they point at the same commit the remote
    # is redundant, so record each local branch's commit and drop a same-named
    # remote that matches it. A diverged remote (ahead/behind) is kept so its
    # distinct state can still be viewed.
    local_commit_by_name: dict[str, str] = {}
    for branch in repo.heads:
        try:
            local_commit_by_name[branch.name] = repo.commit(branch.name).hexsha
        except Exception:
            pass
        add_branch(
            name=branch.name,
            ref=branch.name,
            source="local",
            is_current=branch.name == active_branch,
        )

    for remote in repo.remotes:
        for remote_ref in remote.refs:
            if remote_ref.remote_head == "HEAD":
                continue
            local_commit = local_commit_by_name.get(remote_ref.remote_head)
            if local_commit is not None and local_commit == _resolve_commit(repo, remote_ref.name).hexsha:
                continue
            add_branch(
                name=remote_ref.remote_head,
                ref=remote_ref.name,
                source="remote",
            )

    branches.sort(
        key=lambda item: (
            0 if item["is_current"] else 1,
            0 if item["source"] == "local" else 1,
            item["name"].casefold(),
            item["ref"].casefold(),
        )
    )
    default_branch = next((item for item in branches if item["is_current"]), None) or (branches[0] if branches else None)
    return {
        "branches": branches,
        "current_branch": active_branch,
        "default_ref": default_branch["ref"] if default_branch else None,
    }

def get_file_from_commit(repo_path: str, commit_hash: str, file_path: str) -> str:
    """
    Get file content from a specific commit.
    Returns file content as string.
    """
    try:
        repo = Repo(repo_path)
        commit = repo.commit(commit_hash)
        
        try:
            blob = commit.tree / file_path
            content = blob.data_stream.read()
            return content.decode('utf-8')
        except KeyError:
            raise HTTPException(status_code=404, detail=f"File {file_path} not found in commit")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="Binary file cannot be decoded")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Git error: {str(e)}")

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
    except:
        return False


_EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"


def _path_is_within(path: str, relative_path: str | None) -> bool:
    """Match a repository path to a Type-2 project on component boundaries."""
    if not relative_path:
        return True
    candidate = PurePosixPath(path)
    root = PurePosixPath(relative_path.strip("/"))
    try:
        candidate.relative_to(root)
        return True
    except ValueError:
        return False


def _diff_line_stats_map(
    repo: Repo,
    old_sha: str,
    new_sha: str,
) -> dict[str, tuple[int | None, int | None]]:
    """Return every changed path's line statistics with one Git invocation."""
    stats: dict[str, tuple[int | None, int | None]] = {}
    try:
        output = repo.git.diff("--numstat", "--no-renames", old_sha, new_sha)
    except GitCommandError as error:
        logger.debug(
            "Could not calculate line stats for %s..%s: %s",
            old_sha,
            new_sha,
            error,
        )
        return stats

    for line in output.splitlines():
        columns = line.split("\t", 2)
        if len(columns) < 3:
            continue
        additions, deletions, path = columns
        if additions == "-" or deletions == "-":
            stats[path] = (None, None)
            continue
        try:
            stats[path] = (int(additions), int(deletions))
        except ValueError:
            continue
    return stats


def get_commit_file_summary(
    repo_path: str, commit_hash: str, relative_path: str = None
) -> dict[str, Any]:
    """
    Return a commit's changed files with explicit first-parent context.

    Merge commits intentionally compare against their first parent, matching
    the file list and GitHub's default commit view. Root commits compare with
    Git's empty tree.
    """
    try:
        repo = _open_repo(repo_path)
        commit = repo.commit(commit_hash)
        parent = commit.parents[0] if commit.parents else None
        base_sha = parent.hexsha if parent else _EMPTY_TREE_SHA

        diffs = (
            parent.diff(commit)
            if parent
            else repo.tree(_EMPTY_TREE_SHA).diff(commit)
        )
        line_stats = _diff_line_stats_map(repo, base_sha, commit.hexsha)

        result = []
        for d in diffs:
            path = d.b_path or d.a_path
            if not path or not _path_is_within(path, relative_path):
                continue
            if d.change_type == "A":
                status = "added"
            elif d.change_type == "D":
                status = "removed"
            elif d.change_type == "R":
                status = "renamed"
            else:
                status = "modified"

            additions, deletions = line_stats.get(
                d.b_path or "",
                line_stats.get(d.a_path or "", (None, None)),
            )

            filename = path.split("/")[-1]
            entry: dict[str, Any] = {
                "path": path,
                "filename": filename,
                "status": status,
                "additions": additions,
                "deletions": deletions,
            }

            result.append(entry)

        result.sort(key=lambda x: x["path"])
        return {
            "files": result,
            "base_commit": parent.hexsha if parent else None,
            "compare_commit": commit.hexsha,
            "parent_count": len(commit.parents),
            "comparison_basis": "first-parent" if parent else "root",
        }
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Git error: {str(error)}") from error
