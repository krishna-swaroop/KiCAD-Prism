---
title: Write documentation
description: Where the documentation lives, how to preview it, and the rules every page follows.
sidebar:
  order: 6
---

This site is built from Markdown in the Prism repository, so a documentation
change is an ordinary pull request. This page tells you where pages go, how to
preview them, and the rules they follow.

Every page is for someone using, running or extending Prism. It is never a
record of how something was built: plans, design records, reviews and
hand-offs stay in `docs/` in the repository.

## Where pages live

Pages are Markdown files under `website/src/content/docs/<section>/`. A file's
URL is `/KiCAD-Prism/<section>/<file name>/`, and the sidebar lists each
section's pages in `sidebar.order`.

| Section | Reader | Answers |
| --- | --- | --- |
| `get-started/` | someone deciding whether to use Prism, or trying it | What is it, what does it need, how do I see it working |
| `use/` | an engineer or reviewer in the browser | How do I do this task in Prism |
| `admin/` | whoever installs and runs the server | How do I deploy, configure, secure, upgrade and recover it |
| `automate/` | a developer scripting Prism or connecting an assistant | Which API, token, SDK call, MCP tool or webhook do I use |
| `contribute/` | a developer changing Prism's code | How is it built, tested, reviewed and released |

## Preview your change

The site is an [Astro Starlight](https://starlight.astro.build/) project and
uses the same pinned Node version as the rest of the repository.

1. Go to the site:

   ```bash
   cd website
   ```

2. Install its dependencies:

   ```bash
   npm ci
   ```

3. Start the preview server and open the address it prints:

   ```bash
   npm run dev
   ```

Run a full build before you push. It also checks every internal link:

```bash
npm run build
```

## Page format

Start each page with this front matter:

```md
---
title: Compare two revisions
description: One sentence, shown in search results and link previews.
sidebar:
  order: 3
---
```

- The title is a task or a noun phrase, never "Overview of X".
- Headings are in sentence case. The body starts at `##`; the title is the
  page's only first-level heading.
- Link to other pages with the full path from the site root, for example
  `[Configuration](/KiCAD-Prism/admin/configuration/)`. The build fails on a
  broken link or a missing anchor.

## Rules

1. **Check every claim against the code** on the branch you are writing on:
   the setting's name and default, the menu path, the button label, the
   command. Don't copy a statement from an older page without checking it. If
   the code and an older page disagree, the code wins.
2. **Lead with the task.** A guide opens with one or two sentences on what the
   reader will be able to do, then the steps. Explain a concept only where a
   step needs it.
3. **Second person, present tense, short sentences.** "Open **Settings →
   MCP**", not "The user may navigate to…".
4. **Name the interface exactly as it appears.** Put labels in **bold** and
   menu paths with `→`. Put settings, paths, commands and values in `code`.
5. **No internal vocabulary.** No pull request or issue numbers, work-package
   or decision ids, migration numbers (except in upgrade notes), branch names,
   or code identifiers a user never sees. Link a design record only from
   `contribute/`.
6. **One place per fact.** Every setting is described in
   [Configuration](/KiCAD-Prism/admin/configuration/). Other pages say what to
   set and link there for the details.
7. **Numbered steps for procedures,** one action per step. Put each command in
   its own fenced block, one command per block, with no `$` prompt.
8. **Asides are rare.** Use `:::caution` for data loss or security, and
   `:::note` for a limit the reader would otherwise trip over. Never use them
   for emphasis.
9. **Screenshots show the current UI.** Use the images in
   `website/src/assets/screenshots/` and say in the alt text what the reader
   should look at. Never add a screenshot of an old UI.
10. **Say what Prism does not do** where a reader would expect it to, in one
    plain sentence.

## Screenshots

From a page in `website/src/content/docs/<section>/`, reference a screenshot
with a relative path:

```md
![Design Comparison with the changed parts highlighted on the sheet](../../../assets/screenshots/design-comparison.jpg)
```

The screenshots show real public KiCad projects by other designers. When you
add one, use a design whose licence allows it and credit the author in the
repository README.

## Which pull requests need documentation

A pull request that changes something a user, an administrator or a script can
see (a page, a button, a setting, an API route, an MCP tool, a deployment file)
also changes the matching page here, in the same pull request.

The **Docs** check fails a pull request that touches those areas without
touching `website/src/content/docs`. When a change really has nothing to
document, such as an internal refactor or a test, add the `no-docs` label and
say why in the description.
