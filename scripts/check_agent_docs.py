#!/usr/bin/env python3
"""Fail when agent guidance names a repository path that no longer exists.

The navigation maps and task skills trace features across files. A rename can
silently turn a trace into a lie, so this check catches that decay mode
mechanically.

It verifies paths and model-specific discovery shims. It cannot tell whether a
trace is still semantically correct -- that stays a human judgement.

Usage:
    python3 scripts/check_agent_docs.py
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# Backtick spans and markdown link targets that look like repository paths.
CODE_SPAN = re.compile(r"`([^`\n]+)`")
LINK_TARGET = re.compile(r"\[[^\]]*\]\(([^)#\s]+)")

# A path we should check: contains a slash or a known source extension, and no
# spaces or glob characters.
SOURCE_SUFFIXES = {".py", ".ts", ".tsx", ".md", ".yml", ".yaml", ".json", ".conf", ".sh"}
SKIP_PREFIXES = ("http://", "https://", "mailto:", "#")
CANONICAL_SKILLS = REPO / ".agents" / "skills"
CLAUDE_SKILLS = REPO / ".claude" / "skills"
TASK_SKILLS_HEADING = "## Task skills"
SKILL_REFERENCE = re.compile(r"`?\.agents/skills/([^/`\s]+)/SKILL\.md`?")


def agent_guidance() -> list[Path]:
    out = subprocess.run(
        [
            "git",
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
            "*AGENTS.md",
            "*CLAUDE.md",
            "*SKILL.md",
        ],
        cwd=REPO,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split("\0")
    return [REPO / p for p in out if p]


def candidates(text: str) -> set[str]:
    found: set[str] = set()
    for match in CODE_SPAN.finditer(text):
        found.add(match.group(1))
    for match in LINK_TARGET.finditer(text):
        found.add(match.group(1))
    return found


def is_path_like(token: str) -> bool:
    if not token or token.startswith(SKIP_PREFIXES):
        return False
    if any(ch in token for ch in " \t*?<>|"):
        return False
    # Strip a trailing :line suffix and a method/symbol suffix in parentheses.
    bare = token.split(":", 1)[0]
    if not bare:
        return False
    suffix = Path(bare).suffix
    if suffix in SOURCE_SUFFIXES:
        return True
    # Directory reference, e.g. backend/app/release_studio/
    return bare.endswith("/") and "/" in bare


def resolve(doc: Path, token: str) -> Path | None:
    """Resolve a token relative to the doc, then to the repo root."""
    bare = token.split(":", 1)[0]
    for base in (doc.parent, REPO):
        candidate = (base / bare).resolve()
        try:
            candidate.relative_to(REPO)
        except ValueError:
            continue
        if candidate.exists():
            return candidate
    return None


def skill_metadata(path: Path) -> dict[str, str]:
    """Read the simple single-line fields used by repository skill frontmatter."""
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0] != "---":
        return {}
    metadata: dict[str, str] = {}
    for line in lines[1:]:
        if line == "---":
            break
        key, separator, value = line.partition(":")
        if separator and key in {"name", "description"}:
            metadata[key] = value.strip()
    return metadata


def skill_body(path: Path) -> str:
    """Return normalized Markdown after a skill's frontmatter."""
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0] != "---":
        return ""
    try:
        end = lines.index("---", 1)
    except ValueError:
        return ""
    return "\n".join(lines[end + 1 :]).strip()


def canonical_skill_table_references(text: str) -> set[str]:
    """Return canonical skill names listed in the root task-skill table only."""

    lines = text.splitlines()
    try:
        start = next(index for index, line in enumerate(lines) if line.strip() == TASK_SKILLS_HEADING)
    except StopIteration:
        return set()
    end = len(lines)
    for index in range(start + 1, len(lines)):
        if re.match(r"^#{1,6}\s+", lines[index]):
            end = index
            break
    return {
        match.group(1)
        for match in SKILL_REFERENCE.finditer("\n".join(lines[start + 1 : end]))
    }


def canonical_skill_table_failures(
    text: str,
    canonical_skill_names: set[str] | frozenset[str],
) -> list[str]:
    """Require every canonical skill directory in the root task-skill table."""

    listed = canonical_skill_table_references(text)
    return [
        f"Root AGENTS.md task-skill table omits canonical skill -> {skill_name}"
        for skill_name in sorted(set(canonical_skill_names) - listed)
    ]


def canonical_skill_navigation_failures(
    repo: Path = REPO,
) -> list[str]:
    """Check that root AGENTS.md links every canonical skill playbook."""

    guidance_path = repo / "AGENTS.md"
    if not guidance_path.is_file():
        return ["Root AGENTS.md is missing; canonical task-skill table cannot be checked"]
    canonical_root = repo / ".agents" / "skills"
    canonical_skill_names = {
        path.parent.name
        for path in canonical_root.glob("*/SKILL.md")
        if path.is_file()
    }
    return canonical_skill_table_failures(
        guidance_path.read_text(encoding="utf-8"), canonical_skill_names
    )


def skill_shim_failures() -> tuple[list[str], int]:
    """Keep Claude discovery shims aligned with model-neutral canonical skills."""
    canonical = {
        path.parent.name: path
        for path in CANONICAL_SKILLS.glob("*/SKILL.md")
    }
    shims = {
        path.parent.name: path
        for path in CLAUDE_SKILLS.glob("*/SKILL.md")
    }
    failures: list[str] = []
    for skill_name in sorted(set(canonical) | set(shims)):
        canonical_path = canonical.get(skill_name)
        shim_path = shims.get(skill_name)
        if canonical_path is None:
            failures.append(f"Claude skill has no canonical playbook -> {skill_name}")
            continue
        if shim_path is None:
            failures.append(f"Canonical skill has no Claude discovery shim -> {skill_name}")
            continue
        canonical_meta = skill_metadata(canonical_path)
        shim_meta = skill_metadata(shim_path)
        for field in ("name", "description"):
            if canonical_meta.get(field) != shim_meta.get(field):
                failures.append(
                    f"Claude skill {field} differs from canonical playbook -> {skill_name}"
                )
        expected_target = f".agents/skills/{skill_name}/SKILL.md"
        expected_body = (
            "# Claude discovery shim\n\n"
            "Follow the canonical model-neutral playbook at the repository-root-relative\n"
            f"path `{expected_target}`."
        )
        if skill_body(shim_path) != expected_body:
            failures.append(
                f"Claude skill body is not the canonical discovery shim -> {skill_name}"
            )
    return failures, len(canonical)


def main() -> int:
    failures: list[str] = []
    checked = 0

    for doc in agent_guidance():
        text = doc.read_text(encoding="utf-8")
        rel_doc = doc.relative_to(REPO)
        for token in sorted(candidates(text)):
            if not is_path_like(token):
                continue
            checked += 1
            if resolve(doc, token) is None:
                failures.append(f"{rel_doc}: path does not exist -> {token}")

    shim_failures, shim_count = skill_shim_failures()
    failures.extend(shim_failures)
    failures.extend(canonical_skill_navigation_failures())

    if failures:
        print(f"Stale agent guidance ({len(failures)} issue(s)):\n")
        for failure in failures:
            print(f"  {failure}")
        print(
            "\nUpdate the path, metadata, or discovery shim named above. "
            "Agent guidance must not carry stale or model-specific forks."
        )
        return 1

    print(
        f"Agent guidance OK ({checked} paths, {shim_count} model-neutral skill shims)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
