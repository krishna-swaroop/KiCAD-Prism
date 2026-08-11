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

Branch and commit query parameters can pin the design source being viewed.
Share commit-pinned links when a review must refer to an immutable revision.

## Cross-probe

When semantic identities are available, selecting a schematic symbol, PCB
footprint, or BOM row highlights the corresponding object in compatible views.
Identity generation may finish after the first schematic or PCB render.

Treat cross-probe as navigation assistance, not an electrical-rule or
manufacturing approval.

## Comments

The schematic and PCB viewers support object and area comments. Designers and
administrators can create, reply, resolve, and delete; viewers can read and
navigate discussions.

Comments support class, severity, and stored mentions. Mention storage does not
currently send email or an in-product notification.

Important persistence behavior:

- comments are stored in PostgreSQL;
- comment markers are viewer overlays and do not modify KiCad source files;
- ordinary viewer comments are project-scoped, not automatically pinned to the
  currently displayed commit;
- comparison comments record the base and compare commit SHAs;
- exporting `.comments/comments.json` into a project is an explicit action and
  does not push a Git commit.

For an immutable review, use Design Comparison discussions or record the commit
SHA in the comment/process until standard comment revision pinning is added.

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
