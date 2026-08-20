# Remote Symbol Provider

KiCAD Prism exposes released Library Manager components to supported desktop
KiCad installations. The provider includes discovery metadata, a browser panel,
OAuth2 login, catalog search, previews, and placement bundles with signed asset
URLs.

## Prerequisites

- Prism is reachable from each KiCad workstation.
- Shared deployments use HTTPS with a certificate trusted by the workstation
  operating system.
- `PUBLIC_BASE_URL` is the exact external origin.
- the identity provider allows the provider callback, or password login is enabled;
- at least one component is released and place-ready.

## Verify server metadata

From a workstation:

```bash
curl -fsS https://prism.example.com/.well-known/kicad-remote-provider
curl -fsS https://prism.example.com/oauth/.well-known/oauth-authorization-server
curl -fsSI https://prism.example.com/remote-provider/panel
```

Do not use `-k`. A command that works only when certificate validation is
disabled will also fail for normal KiCad users.

Every advertised absolute URL must use the public HTTPS origin. If metadata
shows `http://`, a container hostname, or the backend port:

1. set `PUBLIC_BASE_URL`;
2. preserve `Host` at the reverse proxy;
3. set `X-Forwarded-Proto: https`;
4. restart and verify again.

## OIDC setup

Register:

```text
https://prism.example.com/oauth/oidc/callback
```

Prism's provider OAuth server accepts authorization code with PKCE and issues
tokens scoped to `remote_symbols.read`. Those tokens cannot modify Prism
projects or Library Manager state.

If the workstation already has a Prism browser session, authorize-and-done
continues. Otherwise KiCad is sent to the same Prism login page
(`/?next=/oauth/authorize…`) used by the web app, then returned to complete
the provider grant. Password-only deployments do not need a separate KiCad
password form.

## Build a datasource package

From the repository:

```bash
python3 scripts/build_datasource_package.py \
  --base-url https://prism.example.com
```

The script writes a package under `dist/`. Build it against the final public
origin; do not reuse a localhost package for production.

## Install in KiCad

Depending on the supported KiCad build:

1. install the generated datasource package through Plugin and Content Manager,
   or add the Prism provider URL manually;
2. open a schematic and the Remote Symbols panel;
3. complete SSO in the system browser when prompted;
4. search by part name, manufacturer part number, or category;
5. open a component and inspect its symbol and footprint;
6. place it into a disposable project;
7. verify the project-local remote library files were created.

Default placement settings are:

```text
library prefix: remote
destination: ${KIPRJMOD}/RemoteLibrary
```

If KiCad uses different values, configure matching
`REMOTE_PROVIDER_LIBRARY_PREFIX` and `REMOTE_PROVIDER_DESTINATION_DIR` values in
Prism.

## What users can see

The provider reads the released catalog projection. Components are absent when
they are:

- still being authored or reviewed;
- archived or inactive;
- missing a required symbol or footprint;
- not the current released revision.

A blank provider can therefore indicate catalog state rather than an
authentication failure.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| provider cannot be added | URL, DNS, VPN, TLS trust, discovery metadata |
| login repeats | provider callback URI and advertised HTTPS origin |
| catalog is empty | released place-ready components and token scope |
| preview is missing | preview-generation job and catalog worker logs |
| Place is disabled | release status and required assets |
| model path is wrong | provider prefix and destination configuration |
| works in browser but not KiCad | OS certificate trust and proxy interception |

Inspect:

```bash
docker compose logs --tail=200 backend
docker compose logs --tail=200 catalog-worker
```

## Security notes

- Treat signed asset URLs as short-lived bearer capabilities.
- Do not expose provider tokens to browser extensions or logs.
- Use an internal VPN or access boundary when the catalog is confidential.
- Rotate the Prism session secret only during a planned sign-out event.
- Remove provider access by withdrawing the user's Prism role or identity
  provider access.

For the catalog lifecycle, see [Library Manager](LIBRARY_MANAGER.md).
