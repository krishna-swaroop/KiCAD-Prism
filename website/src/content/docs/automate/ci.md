---
title: Design review in CI
description: Sync, compare and export the BOM for every KiCad pull or merge request with the GitHub Actions and GitLab CI templates.
sidebar:
  order: 8
---

The CI templates run a Prism design review on every pull request (GitHub) or merge request (GitLab). Each run syncs the project, compares the base and head commits, exports the head's BOM, and keeps `comparison.json` and `bom.csv` as build artifacts.

## Before you start

- The KiCad repository is registered as a project in Prism. Note the project id Prism shows for it.
- Prism is reachable from your CI runners.
- You have a [personal access token](/KiCAD-Prism/automate/api-and-tokens/#create-a-personal-access-token) with `api:read` and `design:write`. Add `comments:write` if your job will also post comments. Create it for an account whose role can sync the project (designer or admin).

:::caution
Store the token as a secret or masked variable, never in the workflow file.
:::

## GitHub Actions

1. Copy `examples/ci/github-actions/prism-design-review.yml` from the Prism repository to `.github/workflows/prism-design-review.yml` in your KiCad repository.
2. In the repository's **Settings → Secrets and variables → Actions**, add the variable `PRISM_URL` with your Prism address, for example `https://prism.example.com`.
3. Add the variable `PRISM_PROJECT` with the project id.
4. Add the secret `PRISM_TOKEN` with the token.
5. In the workflow, set `PRISM_SDK_REF` to a Prism release tag or a full commit sha. The template uses `main`, which can change between runs.
6. Open a pull request. The **Prism design review** workflow runs and uploads the `prism-design-review` artifact.

The workflow checks out the repository with `fetch-depth: 0`, because the comparison needs both the base and the head commit.

## GitLab CI

1. Copy `examples/ci/gitlab/prism-design-review.gitlab-ci.yml` from the Prism repository into your KiCad repository, and include it from `.gitlab-ci.yml` or use it as your `.gitlab-ci.yml`.
2. Under **Settings → CI/CD → Variables**, add `PRISM_URL` and `PRISM_PROJECT`.
3. Add `PRISM_TOKEN` as a masked variable.
4. Set `PRISM_SDK_REF` in the file to a Prism release tag or a full commit sha.
5. Open a merge request. The `prism-design-review` job runs in the `design-review` stage and keeps the artifacts even when it fails.

The job runs only for merge request pipelines. It compares `CI_MERGE_REQUEST_DIFF_BASE_SHA` with `CI_COMMIT_SHA`.

## What each step does

Both templates install the [Python SDK and CLI](/KiCAD-Prism/automate/sdk-and-cli/) and run three commands:

```bash
prism sync "$PRISM_PROJECT" --wait
```

```bash
prism compare "$PRISM_PROJECT" "$BASE_SHA" "$HEAD_SHA" --wait --json > comparison.json
```

```bash
prism bom "$PRISM_PROJECT" --revision "$HEAD_SHA" --csv > bom.csv
```

- `prism sync --wait` fetches the new commits into Prism and fails the job if the sync fails.
- `prism compare --wait --json` waits for the comparison and writes `{"jobId": ..., "reviews": {"schematic": ..., "pcb": ...}}`. Each review lists its `groups`, each with a `kind`, `impact`, `title`, `summary` and the `references` it touches. The step fails if the comparison fails.
- `prism bom --csv` writes the head's engineering BOM.

The templates don't post anything to the pull request and don't block a merge on their own.

## Example: fail on electrical changes

To make a reviewer look at every electrical change, add a step after the comparison that fails when one is present:

```bash
python - <<'EOF'
import json
import sys

reviews = json.load(open("comparison.json"))["reviews"]
groups = [
    (domain, group["title"])
    for domain, review in reviews.items()
    for group in review.get("groups", [])
    if group["impact"] == "electrical"
]
for domain, title in groups:
    print(f"{domain}: {title}")
sys.exit(1 if groups else 0)
EOF
```

The impacts are `mechanical`, `fabrication`, `electrical`, `assembly`, `constraints` and `documentation`.

## Example: comment on changed parts

With `comments:write` on the token, a step can leave a review comment in Prism on each changed component, so reviewers find them in the viewer. See [Example: comment on every changed part](/KiCAD-Prism/automate/sdk-and-cli/#example-comment-on-every-changed-part).

## Get notified instead of polling

To start other work when a comparison finishes, without a CI job waiting on it, subscribe to `comparison.done` with a [webhook](/KiCAD-Prism/automate/webhooks/).
