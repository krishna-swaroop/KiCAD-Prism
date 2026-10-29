---
title: Add an extension
description: Connect independently hosted tools to Prism with project actions and sandboxed panels.
sidebar:
  order: 8
---

Add an external tool to a project's **Extensions** section without rebuilding
Prism. An extension supplies a manifest and its own web app or bridge service.
Prism supplies project and revision context when you open an action.

Use extensions for quick integrations and workflows maintained outside Prism.
An extension can offer a link to another app, or display its UI in a sandboxed
panel. It cannot load Python or JavaScript into Prism's backend or host page.

## Try the context bridge

1. Start the example from a repository checkout:

   ```bash
   python -m http.server 8765 --bind 127.0.0.1 --directory examples/extensions
   ```

2. Set `PRISM_EXTENSIONS_FILE` in the backend environment to the absolute path
   of `examples/extensions/registry.json`. See
   [Extensions configuration](/KiCAD-Prism/admin/configuration/#extensions).
3. Restart the backend so it reads the new setting.
4. Open **Settings → Extensions** to inspect the installed extensions.
5. Open a project and select **Extensions**.
6. Click **Inspect context** to display the example panel.

The example shows the Prism origin, project id, commit and branch. It makes no
design-data requests. **Open context bridge** opens the same app in another
tab. The loopback address refers to the computer running your browser, so run
the example on that computer. If Prism itself uses `127.0.0.1`, open Prism on
`localhost` instead so the example has a separate hostname.

## Try Quick PI Lite

The same example server and registry include **Quick PI Lite**, a manual DC
path screen inspired by WayriCAD Quick PI.

1. Open **Project → Extensions → Open DC path screen**.
2. Enter the source voltage, constant load current, copper resistivity at your
   operating temperature, and voltage-drop budget.
3. Add trace, via-group or resistor stages, including the return path. Via
   diameter means the finished hole diameter. Parallel paths must be identical.
4. Click **Calculate** to inspect path resistance, drop, load voltage, I²R loss
   and per-stage average current density.
5. Expand **Study report JSON** and select the text to copy the inputs, units,
   assumptions, results and current project/revision identifiers.

Editing an input hides the old result until you calculate again. Copy the
report before leaving: reloading the extension or changing revision resets
the study. All geometry is entered manually; the project/revision identifies
the study context and does not establish that the geometry came from that board.

This extension uses fixed resistivity, an ideal voltage source and one constant
current load. It does not extract copper, mesh a PCB, solve temperature rise,
or perform AC/transient analysis. A voltage-drop budget result and average
current density do not qualify board current capacity or thermal safety.

## Write a manifest

The registry is a JSON file with this shape:

```json
{
  "schema_version": 1,
  "extensions": [
    {
      "id": "analysis-bridge",
      "name": "Analysis bridge",
      "version": "1.0.0",
      "description": "Open a revision in your independent analysis service.",
      "actions": [
        {
          "id": "open",
          "label": "Open analysis bridge",
          "url": "https://analysis.example.com/prism",
          "kind": "link"
        },
        {
          "id": "inspect",
          "label": "Inspect analysis",
          "url": "https://analysis.example.com/prism/panel",
          "kind": "panel"
        }
      ]
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `schema_version` | Manifest contract version. Use `1`. |
| `extensions` | Installed extensions, in display order. |
| `id` | Stable lowercase slug starting with a letter, with hyphens between letter/digit groups; 1 to 64 characters. Unique across the registry. Action ids are unique within their extension. |
| `name`, `description` | Text displayed by Prism. Names are 1 to 80 characters; descriptions are at most 1,000 characters. HTML is not interpreted. |
| `version` | Your extension's release version, 1 to 64 characters, displayed in Prism. It does not change the manifest contract. |
| `actions` | The extension's project actions, in display order. |
| `label` | Action text displayed in Prism, 1 to 80 characters. |
| `url` | Absolute URL of your independent app, at most 2,048 characters. Existing query parameters are retained except those beginning with the reserved `prism_` prefix. |
| `kind` | `link` opens a separate tab; `panel` opens a sandboxed frame. |

Use HTTPS. HTTP is accepted only for `localhost`, `127.0.0.1` or `::1` during
local development. URLs cannot contain credentials or fragments. Serve the app
from a hostname different from Prism's own hostname. A different port alone
does not isolate cookies, so Prism refuses actions on its own hostname.

The registry accepts at most 32 extensions, each with one to eight actions,
and is limited to 256 KiB. Unknown fields, duplicate ids, unsupported contract
versions and invalid URLs are refused. An invalid or unreadable registry makes
extension reads fail; Prism does not retain an older successful registry.

## Install, update or remove an extension

1. Deploy the extension app separately from Prism.
2. Add its entry to your registry file.
3. Write a complete replacement file, then rename it over the registry
   atomically. Keep the old file until you have checked the replacement.
4. Click **Refresh** in **Settings → Extensions** or the project's **Extensions** section.

Prism reads the file on each extension-list request. Updating the file does not
need a Prism build or restart. Changing the environment setting does need a
backend restart. Remove an entry to uninstall it; existing external tabs stay
open until their users close them.

Authenticated clients can discover the registry at `GET /api/v1/extensions`.
`GET /api/v1/projects/{project_id}/extensions` also checks that the caller can
view the project. Both return the same validated manifest.

For Docker, mount the registry directory read-only into the backend with a
local Compose override. Mount the directory so atomic file replacements remain
visible inside the container:

```yaml
services:
  backend:
    environment:
      PRISM_EXTENSIONS_FILE: /etc/prism/extensions/registry.json
    volumes:
      - ./extensions:/etc/prism/extensions:ro
```

Place the registry in `extensions/registry.json` beside that override. The
extension app is reached by the browser; Prism does not proxy it or fetch its
URL. The API and worker images do not need the app's dependencies.

## Read project context

Prism adds these reserved query parameters when you open a project action:

| Parameter | Value |
| --- | --- |
| `prism_origin` | The Prism browser origin. |
| `prism_project_id` | The current project's id. |
| `prism_commit` | The selected commit, when available. |
| `prism_branch` | The selected branch, when available. |

Prism removes existing parameters beginning with `prism_` before adding the
current context. Reserve that prefix for the host.

An omitted commit or branch is unavailable, not an instruction to assume a
revision. Resolve a revision explicitly before starting work that needs
reproducible design data. An open panel is recreated when its project or
revision context changes, and removed when you leave **Extensions**.

The context contains no token, session cookie, user identity, repository path
or design files. Project ids and branch names still reveal project information
to the extension service, its logs and browser history. Prism sends them only
after you select an action.

Treat query parameters as untrusted input in your app. A caller can edit them.
Allowlist the Prism origin in your bridge's configuration, authorize every
project read, and never send a token to an arbitrary supplied origin.

## Connect to design data and other software

Run your bridge as an independent service and call Prism's
[HTTP API](/KiCAD-Prism/automate/api-and-tokens/) or
[Python SDK](/KiCAD-Prism/automate/sdk-and-cli/). Configure a token separately
on that service, grant only its required scopes, and pin reads to the supplied
commit. The same role and folder checks apply as in the browser.

For example, a SPIKE bridge could read the pinned design through Prism's API,
translate the data into a format SPIKE accepts, and show progress in its own
UI. You must implement and validate that translation against the target
software. The bundled context bridge does not implement a SPIKE integration.

Use [Webhooks](/KiCAD-Prism/automate/webhooks/) when an external service needs
to react to changes while nobody has its panel open. Long-running integration
work belongs to that service's job system. Core workflows remain available
independently of installed extensions.

## Panel limits

Panels run in an iframe with only `allow-scripts`. They have an opaque origin
and cannot access Prism's DOM, cookies or browser storage. Forms, popups,
downloads and top-level navigation are blocked. There is no host API proxy or
`postMessage` command bridge. Never place credentials in manifest URLs.

Use a `link` action for login or a full app that needs its own browser storage.
The new tab has no opener and receives no referrer. Panel apps must allow
embedding through their own `Content-Security-Policy` and `X-Frame-Options`
headers. Browser mixed-content and local-network rules still apply; a blocked
panel can be opened with a separate `link` action instead.
