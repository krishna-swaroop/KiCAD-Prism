# Library Manager

Library Manager governs reusable KiCad components independently from project
repositories. PostgreSQL stores metadata, workflow, and audit records; persistent
project storage contains immutable asset objects, revisions, previews, validation
evidence, and exports.

## Roles

- `component_designer`: create, import, edit, and submit components.
- `component_qa`: review, return, approve, and release according to the workflow.
- `admin`: all catalog actions and exceptional administration.
- `designer`: catalog read access but not catalog authoring.

Users currently have one role. See
[Authentication and access](AUTHENTICATION_AND_ACCESS.md).

## Component lifecycle

The supported stages are:

```text
open -> in_progress -> qa_review -> done -> released
```

Items can return from QA to authoring with a review note or move to `archived`
where allowed. Starting new work from a released component creates a new draft
revision instead of mutating the released revision.

Release requires:

- a place-ready current revision;
- required symbol and footprint assets;
- approval evidence for that exact revision;
- a different approver from the revision author;
- passing KLC evidence when the release gate is `block`.

The released revision remains stable while later drafts are edited.

## Create or import components

### Manual creation

Create the identity and metadata, attach the symbol and footprint, add optional
3D or SPICE assets, inspect previews, and move the draft into the review flow.

### Folder import

Configure server-side read-only roots:

```env
CATALOG_IMPORT_ROOTS=team=/mnt/team-library,vendor=/mnt/vendor-library
```

Use Import Center to discover candidates, review remediation findings, and
accept selected proposals into drafts. Import limits in `.env` protect the
server from unexpectedly large trees.

### Project harvest

Components can be proposed from imported project data or a selected schematic or
PCB identity. Review every proposal before acceptance; project-local symbols and
footprints are not automatically approved library assets.

### Existing packed symbol libraries

The scripts directory contains migration helpers for splitting packed KiCad
symbols and importing library assets. Use a backup, run against a sample first,
and perform the final acceptance through Import Center rather than writing
directly to catalog storage.

## Revisions and assets

A component revision records metadata and references immutable assets. Do not
manually edit files inside `.kicad-prism`; doing so can break hashes, audit
evidence, previews, and placement.

Use a new revision for any released-part change, including metadata that affects
selection or manufacturing.

## KLC validation

Enable:

```env
CATALOG_KLC_ENABLED=true
CATALOG_KLC_UTILS_PATH=/opt/kicad-library-utils
CATALOG_KLC_RELEASE_GATE=warn
```

Gate modes:

- `off`: reports do not affect release;
- `warn`: show findings but allow release;
- `block`: require current symbol and footprint checks to pass.

Prism stores normalized findings and durable report artifacts. Validation is
read-only; Prism does not run KLC auto-fix modes.

Choose `block` only after the imported library has been remediated enough that
the rule does not force routine administrator overrides.

## Release Queue

QA users should work from Release Queue, verify the exact revision and attached
evidence, record a review note where appropriate, and release only after the
item reaches `done`.

Two-person approval prevents a revision author from approving or releasing the
same revision.

## Placeability

A component is exposed to the Remote Symbol Provider only when it is:

- active;
- at the `released` stage;
- backed by the released revision;
- complete enough for placement.

Unreleased drafts, archived components, and incomplete components are not part
of the released provider projection.

## KiCad DBL export

Prism can generate a KiCad database-library bundle from released place-ready
components. The export contains a generated SQLite database and KiCad DBL files.
That SQLite file is a delivery artifact; Prism itself continues to use
PostgreSQL.

Generate through the catalog administration API or supported Library Manager
action, then distribute the complete export directory. Do not copy only the
database file because symbol and footprint trees are also required.

## Governance checklist

Define before production use:

1. naming and category rules;
2. mandatory metadata;
3. asset and preview requirements;
4. KLC gate mode;
5. author and independent approver responsibilities;
6. duplicate and obsolete-part handling;
7. release labels and evidence retention;
8. backup and restore ownership;
9. a process for emergency withdrawal or replacement.

Continue with [Remote Symbol Provider](REMOTE_SYMBOL_PROVIDER.md).
