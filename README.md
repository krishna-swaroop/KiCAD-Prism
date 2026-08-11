# KiCAD Prism

KiCAD Prism is an open-source, self-hosted collaboration and
component-governance platform for teams using KiCad and Git.

KiCad remains the desktop editor. Git remains the source of truth. Prism adds
browser review, visual comparison, generated assets, comments, and governed
component libraries without requiring a proprietary ECAD cloud.

![KiCAD Prism workspace](assets/KiCAD-Prism-New-Workspace.png)

## Capabilities

- Import KiCad projects from SSH or HTTPS Git remotes, including monorepos.
- Browse schematics, PCBs, 3D boards, BOMs, stackups, assembly views, history,
  and generated documentation.
- Cross-probe compatible schematic, PCB, and BOM identities.
- Compare commits with semantic schematic, PCB, BOM, and related change views.
- Create and resolve project or comparison discussions.
- Run supported KiCad jobset flows and browse outputs in the Assets portal.
- Govern component revisions through authoring, QA, approval, and release.
- Validate symbols and footprints with optional KLC release gates.
- Place released components from desktop KiCad through the Remote Symbol
  Provider.
- Self-host with PostgreSQL, OIDC SSO, roles, scoped service clients, and
  separate workers.

## Runtime

| Service | Purpose |
| --- | --- |
| `frontend` | React application and Nginx reverse proxy |
| `backend` | FastAPI, authentication, authorization, and APIs |
| `prism-worker` | project, comparison, visualization, and jobset work |
| `catalog-worker` | catalog import, validation, preview, and release work |
| `postgres` | workspace, comments, catalog, jobs, audit, and session data |

The API and both workers reuse one Prism backend image. Imported repositories
and generated assets live under `data/projects`; Git SSH state lives under
`data/ssh`. PostgreSQL and both directories are required for complete recovery.

See [Architecture](docs/ARCHITECTURE.md).

## Deploy the latest stable release

Normal users should open the
[latest stable GitHub Release](https://github.com/krishna-swaroop/KiCAD-Prism/releases/latest)
and download its Linux AMD64 deployment archive and checksum.

Each generated bundle contains a pull-only Compose file and exact Prism image
digests:

```bash
sha256sum -c kicad-prism-vX.Y.Z-linux-amd64.tar.gz.sha256
tar -xzf kicad-prism-vX.Y.Z-linux-amd64.tar.gz
cd kicad-prism-vX.Y.Z-linux-amd64
sha256sum -c SHA256SUMS
cp .env.example .env
# Configure authentication, domain, database password, and session secret.
docker compose pull
docker compose up -d --wait
```

The supported public deployment target is Linux AMD64. Native ARM64 release
images are not currently published.

Follow [Deployment](docs/DEPLOYMENT.md) for OIDC, TLS, storage, sizing, and
production checks. If a historical release predates deployment bundles, build
that stable tag from source as documented there.

## First-time setup with the guided installer

For a first deployment from a source checkout, the guided installer can render
the environment and proxy configuration for you instead of requiring every
Compose setting to be assembled by hand. It supports Linux, macOS, WSL2, and
Windows PowerShell, and requires Python 3.9 or newer plus Docker Compose v2.

From the repository root, run the launcher for your platform:

```bash
./deploy.sh
```

```powershell
.\deploy.ps1
```

The installer asks which HTTPS/network scheme applies, collects the required
OIDC and deployment settings, runs preflight and network checks, and writes the
generated configuration under `generated/`. The output includes the environment
file, proxy configuration, Compose overlay, a redacted run record, and a
`NEXT_STEPS.md` checklist. Review the generated files before starting the
services, or let the installer start them after all checks pass:

```bash
./deploy.sh --start
```

Useful first-run modes include:

```bash
./deploy.sh --dry-run                         # render without writing files
./deploy.sh --fresh                           # ignore existing generated config
./deploy.sh --answers answers.json --non-interactive
```

Generated configuration contains deployment secrets and is excluded from Git;
back it up with the rest of the Prism deployment state. The installer is a
guided configuration layer, not a replacement for the [Deployment](docs/DEPLOYMENT.md)
and [Operations](docs/OPERATIONS.md) guides. For a stable release archive,
follow the pull-only bundle instructions above and use the installer only when
working from a source checkout that includes `deploy.sh` or `deploy.ps1`.

## Develop from source

All feature development and source testing happen through `dev`:

```bash
git clone --branch dev https://github.com/krishna-swaroop/KiCAD-Prism.git
cd KiCAD-Prism
cp .env.example .env
docker compose up --build -d
```

For a private local evaluation, explicitly set `AUTH_ENABLED=false`. Never use
guest administrator mode on a shared or reachable host.

See [Getting started](docs/GETTING_STARTED.md) and
[Contributing](CONTRIBUTING.md).

## Branch and release model

- Feature, fix, documentation, and refactor branches merge into protected
  `dev` through pull requests.
- `dev` is the integration branch for the next release.
- Tested release scope is merged from `dev` into protected `main`.
- A semantic-version tag on a quality-gated `main` commit builds, smoke-tests,
  and publishes the AMD64 images and deployment bundle.
- Pull requests and ordinary branch pushes never publish container images.

See [Release process](docs/RELEASES.md).

## Documentation

- [Documentation index](docs/README.md)
- [Platform overview](docs/OVERVIEW.md)
- [Getting started](docs/GETTING_STARTED.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Configuration](docs/CONFIGURATION.md)
- [Authentication and access](docs/AUTHENTICATION_AND_ACCESS.md)
- [Project workflows](docs/PROJECT_WORKFLOWS.md)
- [Library Manager](docs/LIBRARY_MANAGER.md)
- [Remote Symbol Provider](docs/REMOTE_SYMBOL_PROVIDER.md)
- [Team adoption](docs/TEAM_ADOPTION.md)
- [Operations](docs/OPERATIONS.md)
- [Release process](docs/RELEASES.md)

## Project status

`main` contains stable release history. `dev` is heading toward the V3.0.0
alpha and may change between releases.

Current boundaries include:

- one role per user rather than composable workspace and catalog permissions;
- project-scoped standard comments;
- no mention notifications or Git-forge webhook/status integration;
- fixed workflow types rather than first-class arbitrary workflows;
- no real-time multi-user ECAD editing;
- no complete in-product approved/changes-requested project state.

See [Platform overview](docs/OVERVIEW.md) before planning a team rollout.

## Contributing and issues

- [Contributing guidelines](CONTRIBUTING.md)
- [Reporting issues](docs/REPORTING_ISSUES.md)
- [Security policy](SECURITY.md)

Changes target protected `dev` through pull requests. The required quality gate
validates frontend, backend, semantic viewer, source Compose, and release
deployment configuration.

## Acknowledgements

Prism builds on work from the KiCad ecosystem, including:

- [ecad-viewer](https://github.com/Huaqiu-Electronics/ecad-viewer)
- [KiCanvas](https://github.com/theacodes/kicanvas)
- [kicad-monkey](https://github.com/wavenumber-eng/kicad_monkey)
- [Interactive HTML BOM](https://github.com/openscopeproject/InteractiveHtmlBom)

## License

KiCAD Prism is licensed under the [Apache License 2.0](LICENSE).
