---
title: Python SDK and CLI
description: Install the kicad-prism package, script Prism from Python, and use the prism command in a terminal or CI.
sidebar:
  order: 3
---

The `kicad-prism` package gives you a Python client for every `/api/v1` operation and a `prism` command for the common tasks. It needs Python 3.10 or newer and nothing beyond the standard library.

## Install

The package isn't on PyPI. Install it from a checkout of the Prism repository:

```bash
pip install ./sdk/python
```

Or straight from GitHub, pinned to a release tag or commit:

```bash
pip install "kicad-prism @ git+https://github.com/krishna-swaroop/KiCAD-Prism@<tag-or-sha>#subdirectory=sdk/python"
```

## Configure

The client and the CLI read two environment variables.

1. Set the address of your Prism server:

   ```bash
   export PRISM_URL=https://prism.example.com
   ```

2. Set a [personal access token](/KiCAD-Prism/automate/api-and-tokens/#create-a-personal-access-token):

   ```bash
   export PRISM_TOKEN=prism_pat_...
   ```

In Python, `Client(base_url, token=...)` takes both explicitly; an argument wins over the environment. A base URL ending in `/api/v1` is accepted too.

## Use the library

Every API operation is a method on `Client`, named after its `operationId` in `/api/v1/openapi.json`. Path parameters are positional, query parameters are keyword-only, and an operation with a JSON body takes `body=`.

```python
from prism import Client, PrismError

prism = Client()  # PRISM_URL and PRISM_TOKEN from the environment

projects = prism.list_projects()
component = prism.get_design_component("my-board", "U3", revision="main")
net = prism.get_design_net("my-board", "/USB_D+")

try:
    prism.get_project_detail("missing")
except PrismError as error:
    print(error.status, error.code, error.detail)
```

The client adds three things the generated methods don't:

- Every write carries a fresh `Idempotency-Key`, so a write is safe to retry. See [Retry a write safely](/KiCAD-Prism/automate/api-and-tokens/#retry-a-write-safely).
- `wait_for_job(job_id, timeout=600, poll=2)` polls a job until it is `completed`, `failed` or `cancelled`, and raises `PrismError` with the code `timeout` if it takes longer than `timeout` seconds.
- `iter_events(after=0)` yields the event log from a cursor, following `next` until the end.

A refused request raises `PrismError` with Prism's `status`, `code` and `detail`.

## Example: export a BOM

This script writes the engineering BOM of one commit to a CSV file. It pins the commit Prism read, so the file always matches one revision.

```python
import csv
import sys

from prism import Client

project_id = sys.argv[1]
revision = sys.argv[2] if len(sys.argv) > 2 else None

prism = Client()
bom = prism.get_project_bom(project_id, commit=revision, assembly="assembly")

with open(f"bom-{bom['commit'][:12]}.csv", "w", newline="") as handle:
    writer = csv.writer(handle)
    writer.writerow(["References", "Quantity", *bom["columns"]])
    for line in bom["lines"]:
        writer.writerow(
            [
                ", ".join(line["references"]),
                line["quantity"],
                *(line["fields"].get(column, "") for column in bom["columns"]),
            ]
        )

print(f"Wrote {len(bom['lines'])} lines at {bom['commit']}")
```

Run it with a project id and, optionally, a commit, branch or tag:

```bash
python export_bom.py my-board v1.2.0
```

`assembly="assembly"` keeps only parts placed in the assembly; `"all"` keeps every line. The CLI's `prism bom --csv` does the same in one command.

## Example: comment on every changed part

This script compares two revisions and leaves one comment on each component a changed review group names. It needs a token with `comments:write`.

```python
import sys

from prism import Client

project_id, base, head = sys.argv[1:4]
prism = Client()

job_id = prism.start_design_compare(project_id, body={"base": base, "head": head})["job_id"]
job = prism.wait_for_job(job_id)
if job["status"] != "completed":
    sys.exit(f"comparison {job['status']}")

review = prism.get_comparison_review(project_id, job_id, domain="sch")
for group in review["groups"]:
    if group["kind"] != "changed":
        continue
    for reference in group["references"]:
        prism.create_anchored_comment(
            project_id,
            body={
                "component": reference,
                "commit": head,
                "content": f"Changed since {base}: {group['title']}. Please check.",
                "commentClass": "question",
            },
        )
```

## Use the CLI

Tables are the default output. Add `--json` to print the API's response instead.

| Command | Does |
| --- | --- |
| `prism projects list` | lists projects |
| `prism project <id>` | shows one project |
| `prism bom <project> [--revision R] [--assembly all\|assembly] [--csv]` | prints the engineering BOM, or CSV with `--csv` |
| `prism design search <project> <query> [--revision R]` | finds components and nets |
| `prism design component <project> <ref> [--revision R]` | shows a component and its pins |
| `prism design net <project> <name> [--revision R]` | shows a net and its pins |
| `prism comment add <project> (--component REF \| --net NAME \| --sheet PATH) [--commit SHA] [--severity S] [--class C] <text>` | adds a comment anchored to a component, net or sheet |
| `prism comment reply <project> <comment_id> <text>` | replies to a thread |
| `prism comment list <project>` | lists comment threads |
| `prism sync <project> [--wait]` | queues a sync with the remote |
| `prism release build <project> --commit SHA [--config KEY] [--variant V] [--wait]` | queues a Release Studio build of a full 40-character commit |
| `prism compare <project> <base> <head> [--wait]` | compares two revisions; with `--wait`, prints the schematic and PCB review groups |
| `prism supply push-offers <connector> <file> [--replace]` | pushes offers from a JSON file (or `-` for stdin) to a CSV, LCSC or JLCPCB connector; see [Push offers and stock](/KiCAD-Prism/automate/supply-push/) |
| `prism supply push-levels <source> <file>` | pushes the whole stock of a push inventory source from a JSON file |
| `prism events [--after N] [--follow]` | prints the event log; `--follow` keeps polling |
| `prism job <id> [--wait]` | shows a job |

Some examples:

```bash
prism bom my-board --revision v1.2.0 --assembly assembly --csv > bom.csv
```

```bash
prism comment add my-board --component U3 --severity major "Check the decoupling on this regulator."
```

```bash
git log -1 --format=%B | prism comment add my-board --sheet /Power/ -
```

```bash
prism compare my-board v1.1.0 v1.2.0 --wait --json > comparison.json
```

Behaviour to know:

- A text argument of `-` reads the text from standard input.
- `--severity` is one of `info`, `minor`, `major` or `critical`. `--class` is one of `general`, `observation`, `question` or `task`.
- `prism sync`, `prism release build` and `prism compare` with `--wait` follow the job and exit with status 1 if it fails or is cancelled. `prism job --wait` waits but doesn't change its exit status.
- A refused request exits with status 1 and prints `code: detail` on standard error. A missing `PRISM_URL` exits with status 2.

The write commands need a token with `comments:write` (`comment add`, `comment reply`) or `design:write` (`sync`, `release build`). `compare` only needs `api:read`.
