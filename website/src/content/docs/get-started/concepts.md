---
title: Concepts
description: Projects, revisions, design data, jobs, roles and folders, and where Prism keeps each.
sidebar:
  order: 3
---

This page explains the handful of ideas the rest of the documentation relies
on. Read it once before you plan a rollout or start an administration task.

## Projects and repositories

A **repository** is a Git remote Prism has cloned. A **project** is one KiCad
project inside it, identified by its folder in the repository. One repository
can hold several projects, and you choose which ones to register when you
import it.

Prism keeps its own clone of each repository on the server. That clone is
Prism's to manage: engineers keep editing in their own working copies, push to
the Git host as usual, and Prism fetches from there.

- **Import** clones the repository, finds its KiCad projects and registers the
  ones you select.
- **Sync** fetches from the remote and moves Prism's clone forward when that is
  safe. Prism also fetches in the background, every five minutes by default,
  and an open project page picks up a new branch tip on its own.

Project settings, such as a display name, description or the paths to outputs,
can be stored in Prism or committed to the repository as `.prism.json`.
Settings stored in Prism win.

See [Projects](/KiCAD-Prism/use/projects/).

## Revisions

A **revision** is one commit of a project. You reach it through a branch, a
tag or the commit itself, and every view in Prism shows one revision at a time.

- A link that names a **branch** follows that branch: after the next fetch it
  shows the new tip.
- A link that names a **commit** always shows the same design. Share commit
  links when a review must refer to something that cannot change underneath it.

Comments remember the commit they were written on, and Design Comparison works
on a pair of revisions.

## Design data

Before Prism can show a revision, it reads the KiCad files once, in a
background job, with its own KiCad parser and KiCad's command-line tools. The
result is that revision's **design data**: everything the viewers, 3D, BOM,
variants, Design Comparison and Release Studio need.

- Prism prepares the newest commits of each branch and every tagged commit
  ahead of time, so they open at once.
- A commit that does not touch the design files reuses the design data of the
  commit before it.
- Opening a revision that has no design data yet shows **Preparing design
  data…** until the build finishes. A large board takes a few minutes the first
  time.

Design data is a cache. Prism can always rebuild it from Git, so losing it
costs time, not information. See [Design data](/KiCAD-Prism/use/design-data/).

## Jobs

Anything that takes more than a moment runs as a **job** on a background
worker: imports, syncs, design data builds, comparisons, KiCad jobsets, release
builds, catalog imports and checks. The page that started a job shows its
progress and log, and you can cancel it from there.

Jobs are recorded in the database, so they survive a restart of the browser
or the API server. Workers limit how many heavy jobs run at once, and a job
that would not fit in the worker's memory waits instead of failing. When a
screen says it is queued, another job is ahead of it.

## Roles

Every user has exactly one role:

| Role | Projects | Component catalog | Releases |
| --- | --- | --- | --- |
| `viewer` | browse, review and comment | browse | inspect |
| `designer` | everything a viewer can, plus import, sync, run jobs and organize | create and edit drafts; release a part after QA | start builds, designer sign-off, publish after both sign-offs |
| `qa` | browse, review and comment | QA review | QA sign-off, publish after both sign-offs |
| `admin` | everything | everything | either sign-off with a written override, publish |

Everyone can comment, reply, and edit or delete their own comments. Resolving
and reopening a thread needs `designer` or `admin`.

Roles do not combine. A person who needs to author parts and check other
people's parts needs two accounts, or `admin`. Plan for this before you assign
catalog duties; see [Roll it out to a team](/KiCAD-Prism/get-started/team-adoption/).

Scripts and AI assistants act with the role of the person whose token or
sign-in they use, and can never perform a sign-off. See
[Automation overview](/KiCAD-Prism/automate/overview/).

## Folders

The workspace groups projects into **folders**. A folder can be limited to
chosen roles, and its projects are then hidden from everyone else in the
workspace, in search and through the API. `qa` sees everything `viewer` sees.

Folders organize and hide; they do not grant extra rights. What a user can do
inside a project still comes from their role.

## Where Prism keeps things

| What | Where | Back it up? |
| --- | --- | --- |
| Design files and their history | your Git host | already in Git |
| Users, roles, folders, comments, catalog, jobs, releases | PostgreSQL | yes |
| Prism's clones, generated outputs, catalog files, comment attachments | the projects directory (`data/projects`) | yes |
| Prism's Git SSH key and known hosts | the SSH directory (`data/ssh`) | yes |
| Design data | inside the projects directory | optional: rebuilt from Git |

Git holds the design, but not the review. Restoring Prism needs the database
and both directories. See [Operations](/KiCAD-Prism/admin/operations/).

## How the services fit together

| Service | Does |
| --- | --- |
| `frontend` | serves the web app and forwards API requests to the backend |
| `backend` | the API, sign-in, permissions and the MCP server |
| `prism-worker` | imports, syncs, design data, comparisons, jobsets, release builds |
| `catalog-worker` | catalog imports, checks, previews and releases |
| `postgres` | the database |

The API server and both workers use the same image, which includes KiCad's
command-line tools. Only the frontend needs to be reachable by users. See
[Architecture](/KiCAD-Prism/contribute/architecture/) for more.
