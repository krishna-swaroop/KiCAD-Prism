# Platform overview

KiCAD Prism is a self-hosted collaboration and component-governance platform for
teams that use KiCad and Git. KiCad remains the desktop design editor. Git
remains the source of truth for design files and revisions. Prism adds browser
review, generated artifacts, and a governed component catalog around that
workflow.

## What Prism provides

### Git-backed project workspaces

Prism imports KiCad projects from SSH or HTTPS Git remotes, including repositories
that contain multiple boards. Teams can organize imported projects, synchronize
them with their remotes, browse history, and pin a project view to a branch or
commit.

Private GitHub repositories can use a deployment-level token. SSH deploy keys are
the recommended general solution for GitLab and self-hosted Git services. Import
policy can restrict allowed hosts and rejects local paths, embedded credentials,
and dangerous Git remote-helper transports.

### Browser review

Project views include:

- schematic and PCB viewers, with component and net search in the Visualizer header;
- cross-probing between compatible schematic, PCB, and BOM identities;
- WebGPU 3D board views;
- engineering BOM, stackup, assembly, and Interactive HTML BOM outputs when
  available;
- commit history, release tags, and semantic design comparison;
- comments, replies, severity, resolution, and area or object markers;
- generated design, manufacturing, and render assets.

Prism is a review surface, not an in-browser ECAD editor. Design changes continue
to be made in KiCad and committed to Git.

### Component governance

Library Manager provides:

- manual component creation and bulk editing;
- import from existing library folders or imported projects;
- immutable revisions and reusable symbol, footprint, model, and SPICE assets;
- optional KiCad Library Convention validation;
- submit, QA, and release transitions;
- released-part delivery through the Remote Symbol Provider or generated KiCad
  database-library bundles.

Only released, place-ready components with the required symbol and footprint
assets are exposed to desktop placement.

### Authentication and integration

Prism supports OIDC single sign-on, server-side sessions, workspace roles,
OAuth2 for the KiCad Remote Symbol Provider, and scoped service credentials for
read-only PLM or automation integrations.

## Sources of truth

Prism deliberately uses more than one persistence system:

| Data | Authoritative store |
| --- | --- |
| KiCad projects and revision history | Imported Git repositories |
| Workspace, access, sessions, comments, catalog, jobs | PostgreSQL |
| Generated artifacts and catalog files | Persistent project storage |
| Git SSH identity and known hosts | Persistent SSH storage |

Do not describe the whole platform as storing everything in Git. Git is
authoritative for design source and history; PostgreSQL and persistent storage
are required to recover the collaboration and governance state.

## Current boundaries

- Prism is a single-workspace deployment, not a multi-tenant SaaS.
- A user currently has one Prism role. Workspace and catalog permissions are not
  independently composable.
- Standard project comments are project-scoped. Comparison comments are pinned
  to the compared commit SHAs.
- Mentions are stored but do not yet produce email or inbox notifications.
- GitHub/GitLab webhooks, pull-request status integration, and built-in PLM
  connectors are not shipped.
- The Workflows page exposes the current fixed design, manufacturing, and render
  jobset paths; arbitrary workflows are not first-class yet.
- Prism does not provide real-time multi-user design editing.

These boundaries are important when planning a rollout or describing Prism to a
team.

## Next steps

- Try a local instance with [Getting started](GETTING_STARTED.md).
- Plan a shared installation with [Deployment](DEPLOYMENT.md).
- Map Prism onto your engineering process with [Team adoption](TEAM_ADOPTION.md).
