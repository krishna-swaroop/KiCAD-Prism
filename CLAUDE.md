# CLAUDE.md

All project context lives in [AGENTS.md](AGENTS.md). Read it first — it is the
canonical, tool-agnostic file. This file carries only Claude-specific notes.

## Skills

The canonical repo-specific skills are in `.agents/skills/` and are listed in
`AGENTS.md`. `.claude/skills/` contains discovery shims that point to the same
model-neutral playbooks; do not fork their instructions into Claude-only
versions.

`scripts/check_agent_docs.py` guards paths named in agent maps and skills. Run
it after changing agent guidance or moving referenced files.
