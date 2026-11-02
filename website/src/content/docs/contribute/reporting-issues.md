---
title: Report a problem
description: How to report a bug, ask for a feature, flag a documentation error or disclose a vulnerability.
sidebar:
  order: 3
---

This page tells you where each kind of report goes and what to put in it so a
maintainer can act on it the first time.

| You have | Go to |
| --- | --- |
| a bug you can reproduce | a [bug report](https://github.com/krishna-swaroop/KiCAD-Prism/issues/new/choose) |
| an idea for Prism | a feature request, or a discussion for a large change |
| a question about setup or a workflow | [GitHub Discussions](https://github.com/krishna-swaroop/KiCAD-Prism/discussions) |
| a suspected vulnerability | a [private security advisory](https://github.com/krishna-swaroop/KiCAD-Prism/security/advisories/new), never an issue |

Search open and closed issues before you file a new one.

## Report a bug

The quickest route starts inside Prism:

1. Select the **Help** button (**?**) in the header.
2. Select **Report a bug…**.
3. Check the details the dialog shows and select **Open on GitHub**. The bug
   form opens with **Prism version** and **Diagnostics** already filled in.
   Nothing is sent until you submit it on GitHub.

When the details are too long for a link, the dialog says so: select **Copy
version info** and paste them into the **Diagnostics** field yourself.

If you can't use that dialog, open **Help → About KiCAD Prism**, select **Copy
version info** and paste the result into the form's **Diagnostics** field. It
lists the build revisions, the viewer and KiCad CLI versions, the sign-in
method, your browser and the kind of page you were on, but no project, user or
host names. Read it before you paste it anyway.

Then fill in:

- **Affected area**: the part of Prism, such as Design Comparison or Release
  Studio.
- **Environment**: how Prism was installed (release bundle, the guided
  installer from source, or a dev server), the host OS and architecture,
  Docker and Compose versions, and any proxy in front of it.
- **Reproduction steps**: numbered, from a known starting point.
- **Expected behavior** and **Actual behavior**.
- **Sanitized logs or screenshots**. Job ids help: they let a maintainer find
  the exact log lines you mean.

Say whether the problem happens on a small public project. A public
reproducer is the fastest way to a fix.

:::caution
Never attach proprietary KiCad projects, credentials, tokens, private Git URLs,
database dumps or SSH keys to a public issue. If the problem only shows on
private design data, describe it without the data and wait for a maintainer to
suggest a secure way to share it.
:::

## Ask for a feature

Describe the engineering workflow, not the implementation:

- who is involved and what decision Prism should make easier;
- how you work around it today;
- what would tell you it is done.

For a large change, start a discussion first. A maintainer can turn an agreed
proposal into issues.

## Flag a documentation problem

Open a bug and choose **Documentation** as the affected area. Name the page,
quote what is wrong or missing, and say what you saw Prism do. Corrections are
welcome as pull requests. See
[Write documentation](/KiCAD-Prism/contribute/writing-docs/).

## Report a vulnerability

Don't open a public issue or discussion. Use GitHub's
[private vulnerability report](https://github.com/krishna-swaroop/KiCAD-Prism/security/advisories/new)
and include:

- the affected release or commit;
- how Prism is deployed and how users sign in;
- what an attacker needs and the path they take;
- the smallest steps or proof of concept that show it;
- the security boundary you expected and what happened instead;
- the impact, any mitigation you suggest, and whether it is disclosed
  anywhere else.

Only test against an installation you own or have permission to assess. Don't
include production credentials, private keys, proprietary designs or personal
data unless a maintainer arranges a secure way to send them.

Fixes are assessed against the latest release and the current `dev` branch. If
you run something older, first check whether the problem still exists in one
of those. Maintainers confirm the scope, affected versions and severity, then
coordinate public disclosure through the advisory so users have time to
update. Timelines depend on impact.

## What maintainers may ask for

- a reproduction on current `dev`;
- a smaller test project;
- the full stack trace, with secrets removed;
- your Compose configuration, with secrets removed;
- the host architecture and image details;
- confirmation that you followed the documented deployment or upgrade steps.

An issue that can't be reproduced, and for which the requested evidence
doesn't arrive, may be closed. It can be reopened when new evidence turns up.
