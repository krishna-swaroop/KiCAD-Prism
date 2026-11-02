# Writing KiCAD Prism docs

The documentation site is built from `website/src/content/docs`. Every page is
for someone using, running or extending Prism, never a record of how it was
built. Engineering records (ADRs, plans, reviews, handoffs) stay in `docs/`.

## Sections and their readers

| Section | Reader | Answers |
| --- | --- | --- |
| `get-started/` | someone deciding whether to use Prism, or trying it | What is it, what does it need, how do I see it working |
| `use/` | an engineer or reviewer in the browser | How do I do this task in Prism |
| `admin/` | whoever installs and runs the server | How do I deploy, configure, secure, upgrade and recover it |
| `automate/` | a developer scripting Prism or connecting an assistant | Which API, token, SDK call, MCP tool or webhook do I use |
| `contribute/` | a developer changing Prism's code | How is it built, tested, reviewed and released |

## Rules

1. **Check every claim against the code** on the branch you are writing on:
   the setting name, its default, the menu path, the button label, the
   command. Don't copy a statement from an older doc without checking it. If
   the code and an old doc disagree, the code wins.
2. **Lead with the task.** A guide opens with one or two sentences on what the
   reader will be able to do, then the steps. Concepts go only where a step
   needs them.
3. **Second person, present tense, short sentences.** "Open **Settings →
   MCP**", not "The user may navigate to…".
4. **Name the interface exactly as it appears.** Labels in **bold**, menu paths
   with `→`, settings, paths, commands and values in `code`.
5. **No internal vocabulary.** No PR or issue numbers, work-package names
   (`OPS-04b`), decision ids (`D23`), migration numbers (except in upgrade
   notes), branch names or code identifiers a user never sees. Link an ADR
   only from `contribute/`.
6. **One place per fact.** Every setting is described in
   `admin/configuration.md`. Other pages say what to set and link there for
   the details.
7. **Numbered steps for procedures,** one action each. Put the command in its
   own fenced block, one command per block, with no `$` prompt.
8. **Asides are rare.** Use `:::caution` for data loss or security, and
   `:::note` for a limit the reader would otherwise trip over. Never use them
   for emphasis.
9. **Screenshots show the current UI.** Use the ones in `src/assets/screenshots`
   and describe what the reader should look at in the alt text. Don't add a
   screenshot of an old UI.
10. **Say what Prism does not do** where a reader would expect it to, in one
    plain sentence.

## Page format

```md
---
title: Compare two revisions
description: One sentence, shown in search results and link previews.
sidebar:
  order: 3
---
```

- The title is a task or a noun phrase, never "Overview of X".
- Headings are sentence case. The body starts at `##`.
- Link to other pages with paths relative to the site root:
  `[Configuration](/KiCAD-Prism/admin/configuration/)`. The link checker
  fails the build on a broken link or a missing anchor.

## Which pull requests need docs

A pull request that changes something a user, an administrator or a script
can see (a page, a button, a setting, an API route, an MCP tool, a deployment
file) also changes the matching page here. The `Docs` check fails a pull
request that touches those areas without touching `website/src/content/docs`.
Add the `no-docs` label when a change really has nothing to document, such as
an internal refactor or a test, and say why in the description.
