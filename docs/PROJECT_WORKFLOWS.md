# Project workflows

This guide describes the normal team workflow from Git import through browser
review and generated outputs.

## Recommended repository layout

Prism does not require one exact structure, but a predictable layout improves
auto-detection:

```text
project/
├── board.kicad_pro
├── board.kicad_sch
├── board.kicad_pcb
├── Outputs.kicad_jobset
├── README.md
├── docs/
├── assets/
└── .prism.json
```

Keep generated manufacturing data out of the design source directory when
possible. Point `.prism.json` at the team's established output paths rather than
renaming the repository to fit Prism.

Repositories containing multiple KiCad projects are supported. Import analysis
lets a designer select which discovered project paths to register.

## Import

Designers and administrators can:

1. select **Import Project**;
2. provide an SSH or HTTPS Git URL;
3. wait for the queued analysis job;
4. choose the branch and discovered projects;
5. start the queued import job;
6. inspect the registered projects in the workspace.

For private Git, configure the Prism SSH public key as a read-only deploy key or
use the supported GitHub HTTPS token. The server must be able to resolve and
reach the Git host.

Prism rejects local filesystem URLs, credentials embedded in URLs, and dangerous
remote-helper protocols.

## Synchronize

Synchronization is a queued worker job. It fetches the configured remote and
updates the server-managed checkout when the operation is safe. Monitor the job
rather than treating the HTTP request as the completed synchronization.

The branch selector shows each fetched branch from the configured remote once.
The viewer reads that branch's fetched commit, even if a local checkout cannot
fast-forward. Prism fetches remote refs in the background about every five
minutes without modifying the checkout. An open project page checks for a newer
fetched branch tip and refreshes its view. The manual **Sync** button remains
available for an immediate fetch and safe checkout fast-forward. Set
`PRISM_AUTO_SYNC_INTERVAL_SECONDS=0` to disable background fetching.

Prism is not where engineers author or push board changes. Use normal developer
clones and Git review practices, then synchronize Prism.

## Review a project

Project sections include:

| Section | Use |
| --- | --- |
| Overview | README and project summary |
| History | commits, tags, and comparison entry points |

| Visualizers | schematic, PCB, 3D, BOM, stackup, and assembly views |
| Workflows | fixed KiCad design, manufacturing, and render jobs |
| Assets | generated output browser |
| Documentation | Markdown and supported documents from the project repository |


From an expanded commit's file list:

- schematic, board, project, and library files (`.kicad_sch`, `.kicad_pcb`, `.kicad_pro`, `.kicad_sym`, `.kicad_mod`) open in the visualizer;
- PDF, CSV, `.txt`, and Markdown open in a new browser tab, served from that commit with the file's real content type;
- gerbers and other non-CAD files do nothing — they are listed, not visualized.

A commit-file endpoint is confined to the project's own subtree so one subproject cannot read a sibling's files.
Branch and commit query parameters can pin the design source being viewed.
Share commit-pinned links when a review must refer to an immutable revision.

## Cross-probe

When semantic identities are available, selecting a schematic symbol, PCB
footprint, or BOM row highlights the corresponding object in compatible views.
Identity generation may finish after the first schematic or PCB render.

On Schematic and PCB, `/` or `⌘F` / `Ctrl+F` searches components and nets from
the Visualizer header. `⌘K` / `Ctrl+K` remains the global command palette.
Selecting a net or global label opens the inspector with Instances expanded so
you can jump between occurrences, including labels that share a sheet.

Treat cross-probe as navigation assistance, not an electrical-rule or
manufacturing approval.

## PCB labels and net review

Use **Objects & filters** to toggle pad numbers and net names on pads, tracks,
and vias. Labels remain readable while highlighting; zooming does not discard
the selected nets. Filled-zone interior net labels are not currently shipped.

Shift-click accumulates or toggles highlighted nets across compatible views.
The selection panel lists the highlighted set, and 3D emphasizes that set.
The PCB inspector also shows per-net routing statistics. Treat these as review
measurements from the parsed board, not a replacement for KiCad DRC or routing
sign-off.

## Design variants

A KiCad design can carry named assembly variants (for example a `Lite` and a
`Pro` population). When the revision declares them, the Visualizer toolbar
offers a `Variant` selector; the default assembly is the base design.

- `?variant=<name>` in the URL is the selection. Choosing a variant rewrites
  only that parameter with `replace`, so the commit pin and the open tab
  survive, and links keep their meaning when shared. Deep links, reloads and
  back/forward all resolve the same way.
- Selecting a variant updates the schematic and PCB viewers, the 3D workspace,
  the BOM, the BOM assembly filter, the selection inspector and header search.
- The PCB 3D workspace hides parts whose effective footprint state is DNP; the
  local `Show DNP` toggle reveals them without changing the variant.
- A name that is not in the viewed revision renders the default assembly and
  says so; the URL is left unchanged so the link still works on a revision that
  has the variant. An empty catalog, a load failure and a revision without
  variant data each show their own state.
- The BOM keeps every component; the `Assembly` filter hides parts excluded
  from the BOM or marked DNP (`!excludeFromBom && !dnp`) and `All components`
  shows them with their effective flags.
- Release Studio's Source step offers the same catalog with an explicit
  `Default` choice first; the design variant selected there is part of the
  release's technical identity.
- Assembly Assistant artifacts are generated for the reference assembly and do
  not follow the selected variant; the tab says so when a variant is selected.
- Known limitations: DNP flags set on KiCad rule areas are reported as a
  diagnostic and are not applied to component state (no containment engine);
  component- and sheet-level overrides are honoured. A reference with alternate
  footprints stays visible in 3D with its DNP state unresolved, and the
  workspace names the references in a notice.

## Comments

The schematic and PCB viewers support object and area comments. Designers and
administrators can create, reply, resolve, and delete; viewers can read and
navigate discussions.

With nothing selected, `C` toggles commenting mode (the same as the toolbar
button). With a selection, `C` opens the comment form for that element. Escape
also leaves commenting mode.

Comments support class, severity, and stored mentions. Mention storage does not
currently send email or an in-product notification.

Comments are stored in PostgreSQL; overlays do not modify KiCad source files.
New canvas threads retain their creation commit and revision-aware anchor history.
A missing object remains in the comment rail for review instead of acquiring a
misleading marker. Reviewers can reattach an unresolved anchor on a revision;
legacy threads without provenance remain visibly unpinned. Comparison comments
retain the base and compare SHAs.

Threads and replies update live across viewers. After a disconnection, the
client replays changes or refreshes the HTTP snapshot; HTTP polling provides a
fallback when the socket is unavailable. See the
[live comment contract](architecture/live-comments.md) for anchor behavior and
operator rollback.

With a code host and project destination configured, authorized users can
publish a thread as a GitHub or GitLab issue. The rail shows the linked issue
and synchronization/retry state; local discussion remains available during a
forge outage. Configure this through [GitHub setup](GITHUB_APP_SETUP.md),
[GitLab setup](GITLAB_SETUP.md), and [tracker operations](TRACKER_INTEGRATION.md).
Exporting `.comments/comments.json` is explicit and does not push a Git commit.

## Design Comparison

From History, select two revisions and open Design Comparison. Prism prepares
schematic, PCB, BOM, and other supported domain changes in a queued job.

Comparison provides side-by-side and synchronized presentation, change groups,
cross-probe where supported, and commit-pinned discussions. Large boards can
take time to prepare; repeated comparisons may reuse generated caches.

The default `Auto` presentation follows the selected change: Composite for
simple schematic additions/removals, Side-by-side for connectivity, geometry,
and fabrication changes, and Old/New for clean content or constraint review.
A manual presentation choice applies to the selected change. Selecting another
change hands the decision back to `Auto`; an explicit URL choice can still seed
the presentation for the change it names. See the
[reviewer presentation policy](design-comparison/reviewer-presentation-policy.md)
for the complete schematic and PCB map.

The current Design Comparison is the supported V3 path. Do not build new team
processes around the older raster-diff API.

## Workflows and assets

The current Workflows section provides fixed job types for design outputs,
manufacturing outputs, and renders based on the configured KiCad jobset. Logs and
state come from the PostgreSQL-backed job system. Completed artifacts appear in
Assets.

Arbitrary user-defined `.prism.json` workflows are not first-class in V3 alpha.
Use the supported fixed cards and a predictable jobset until the workflow model
is expanded.

## Suggested review checklist

1. Identify and share the commit under review.
2. Inspect changed schematic sheets.
3. Cross-probe affected references into PCB and BOM.
4. Review Design Comparison against the previous accepted revision.
5. Resolve or disposition major and critical discussions.
6. Run the required jobset.
7. inspect generated assets and job logs;
8. record the approval in the team's Git pull request or change-management
   system.

Prism does not yet implement a complete changes-requested/approved project state,
so the final decision should remain in the team's existing system of record.

## Project metadata

Designers can override a discovered display name, description, paths, thumbnail,
README, and jobset through project properties and `.prism.json`. See
[Configuration](CONFIGURATION.md).
