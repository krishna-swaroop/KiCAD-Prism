# Release Studio testing

Run tests from `KiCAD-Prism/backend` unless a command says otherwise. Focused
tests exercise source discovery, IPC payloads, configuration synthesis,
canonicalization, dossier, documents, API, vendor, closure, forge publish, and
UI contracts.

```sh
cd backend
python -m unittest tests.test_release_studio_inputs -v
python -m unittest tests.test_release_studio_config -v
python -m unittest tests.test_release_studio_canonicalization -v
python -m unittest tests.test_release_studio_closure -v
python -m unittest tests.test_release_studio_dossier -v
python -m unittest tests.test_release_studio_documents -v
python -m unittest tests.test_release_studio_api -v
python -m unittest tests.test_release_studio_approvals -v
python -m unittest tests.test_release_studio_gerber_set -v
python -m unittest tests.test_release_studio_vendors -v
python -m unittest tests.test_forge_publish_service -v
```

Unit tests cover:

- **source discovery** — KiCad file, variant, and BOM preset discovery at a
  commit;
- **IPC payload** — manufacturing and assembly option lists returned with source;
- **synthesize_configuration** — mapping assembly from identity, manufacturing,
  and discovered paths;
- **forge helpers** — `list_releases` and `tag_exists`, including degradation
  when the token is missing or the API fails.

```sh
cd frontend
npm test -- --run src/components/release-studio/
```

Frontend tests cover the six-stage rail (Source, Identity, Manufacturing,
Build, Outputs, Publish), stage state transitions, and the source → identity →
manufacturing → build flow.

Schema, retention, and persistence tests require a disposable PostgreSQL
database. Set `TEST_POSTGRES_URL` to that isolated database and leave
`PRISM_DATABASE_URL` unset; tests must never target the application database.

```sh
cd backend
TEST_POSTGRES_URL=postgresql://.../release_studio_test \
PRISM_DATABASE_URL= \
python -m unittest tests.test_release_studio_schema_migration tests.test_release_studio_retention -v
```

The live executor suite additionally proves the baked executor identity, KiCad
`10.0.4`, release fixtures, and generated canonicalization semantics. It is
strict: zero tests, a skip, failure, or error fails the run. CI runs that
image rebuild on PRs and pushes to `dev`/`main`, on a nightly schedule, and
on `workflow_dispatch` — not on every `feature/release-studio` commit.

```sh
cd backend
python -m tests.release_studio_live_runner
```

## Fixture provenance

`fixtures/release-studio/synthetic` is repository-authored. `usb-pd` is
vendored from USB-PD-Trigger-Board commit
`3ec8f9cc79c874c433551f96889fce49c4eaac94` under MIT; `cynthion` is vendored
from cynthion-hardware tag `r1.4.0`, commit
`13aa71c2fb0be3837cd2ec580ee5d2c25fc1c678`, under CERN-OHL-P-2.0. Their
licenses remain with the fixtures. Generated outputs are made in temporary
directories; fixture roots contain source and recorded CLI behaviour, not
handwritten manufacturing outputs.

The synthetic fixture has the explicit `default`, `dnp-led`, and
`assembly-reduced` variants. Its manifest's `entrypoints` mapping is the
authority for each fixture's project, board, schematic, and jobset paths.

## Manual acceptance matrix

| Area | Acceptance check |
| --- | --- |
| Source | Default revision is branch tip; older commits selectable. Confirm discovery returns board, schematic, variants, and BOM presets. APIs receive only the full immutable SHA. |
| Identity | Enter tag, Document Name, date, and notes. Confirm an existing forge tag blocks here. Confirm API outage allows progress. |
| Manufacturing | Set IPC classes, colours, via treatment, vendor packs. Upload optional stackup PDF and impedance CSV. **Continue** enqueues only when prior stages are complete. |
| Build and history | Observe live job logs during the run; confirm they do not replay on a finished attempt. Fail one build and cancel another; confirm both retained attempts cannot be published. |
| Inspect | Preview document PDFs, inspect members/evidence/digests, and download dossier/evidence/member material. Confirm DRC/ERC errors block designer/QA sign-off unless an admin overrides with a note. |
| Sign-off | Designer then QA (or admin override with a note). Withdraw before publish. Decisions bind to the dossier digest. |
| Publish | Confirm-only; disabled until both slots, clear errors, and ready selected packs. Release name equals tag. Dossier zip plus vendor packs attach. History refreshes the URL by tag. |
