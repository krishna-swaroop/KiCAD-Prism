# Team adoption

Prism works best when introduced as a layer around an existing KiCad and Git
process, not as a replacement for both at once.

## Phase 1: read-only evaluation

Start with one representative public or non-sensitive project.

- Deploy Prism privately with OIDC.
- Give most participants `viewer`.
- Import and synchronize the project.
- Verify schematic, PCB, BOM, 3D, and history behavior.
- Measure generation time and disk growth.
- Practice backup and restore.

Success means engineers can find and review a known design without changing how
they edit it.

## Phase 2: project review

Select one team and establish:

- the Git branch and pull-request process;
- how a review commit is identified;
- which Prism comparisons and assets are required;
- where the final approval is recorded;
- who may import, synchronize, comment, and run workflows.

Give project maintainers `designer`; keep broad stakeholders as `viewer`.
Remember that Prism does not yet own the final approved/changes-requested state.

## Phase 3: generated outputs

Standardize a KiCad jobset and project paths. Decide which artifacts are:

- committed to Git;
- generated on demand and retained by Prism;
- released to manufacturing or another controlled store.

Avoid silently treating a generated Prism asset as an approved fabrication
release. The team's release procedure should bind outputs to a specific Git
commit.

## Phase 4: component governance

Import a small, high-value library rather than the entire historical estate.

Suggested responsibilities:

| Responsibility | Prism role |
| --- | --- |
| catalog authoring and remediation | `component_designer` |
| independent QA and release | `component_qa` |
| policy, access, exceptional overrides | `admin` |
| project import and job execution | `designer` |

The current one-role model means a person cannot independently hold `designer`
and `component_designer`. Use a small number of administrators where combined
duties are unavoidable, and document why.

Define:

- required metadata and approved categories;
- symbol, footprint, model, and datasheet evidence;
- KLC gate mode;
- two-person review expectations;
- release and withdrawal procedure;
- ownership of duplicate and obsolete parts.

## Phase 5: desktop placement

Only after the catalog lifecycle is understood:

1. deploy HTTPS trusted by all KiCad workstations;
2. verify provider metadata and OAuth;
3. distribute the datasource package;
4. place a released test component into a disposable project;
5. confirm the generated `RemoteLibrary` behavior;
6. document support ownership.

## Suggested team conventions

- Keep KiCad edits in normal Git working copies.
- Use immutable commit links for design reviews.
- Keep approval in the existing Git or change-management system until Prism has
  a first-class review state.
- Use Prism comments for technical discussion, not as the only audit record.
- Require released catalog components for new designs, with an explicit
  exception path.
- Back up and restore-test before catalog adoption.
- Assign at least two administrators.
- Review access and service clients regularly.

## Rollout exit criteria

A team-wide rollout is ready when:

- OIDC, roles, TLS, and private Git access are tested;
- the largest representative project completes generation within acceptable
  resource limits;
- the review checklist is written and used on a real change;
- component roles and release policy are assigned;
- desktop placement works on supported workstations;
- operations staff can restore PostgreSQL, project storage, and SSH state;
- known V3 alpha boundaries have explicit process workarounds.
