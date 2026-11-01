---
title: Automate Prism
description: Pick the right way to script Prism, connect an AI assistant or notify another system, and what each one may do.
sidebar:
  order: 1
---

You can drive Prism from scripts, CI, AI assistants and other services. This page tells you which one to use, and what none of them can do.

## Pick a tool

| You want to | Use | Page |
| --- | --- | --- |
| Call Prism from any language | the HTTP API at `/api/v1` with a personal access token | [API and tokens](/KiCAD-Prism/automate/api-and-tokens/) |
| Write a Python script or run a terminal command | the `kicad-prism` package and its `prism` command | [Python SDK and CLI](/KiCAD-Prism/automate/sdk-and-cli/) |
| Let an AI assistant read designs and leave review comments | the MCP server at `/mcp` | [AI assistants (MCP)](/KiCAD-Prism/automate/mcp/) |
| Let an admin's assistant look into a slow or stuck server | the ops tools and `/api/v1/ops` | [Ops diagnostics](/KiCAD-Prism/automate/ops-diagnostics/) |
| Tell another system when something happens in Prism | outbound webhooks | [Webhooks](/KiCAD-Prism/automate/webhooks/) |
| Link to one exact view of a design | view-state URL parameters and `window.prism` | [Links to a view](/KiCAD-Prism/automate/view-links/) |
| Review every pull or merge request | the GitHub Actions and GitLab CI templates | [Design review in CI](/KiCAD-Prism/automate/ci/) |

## What every tool shares

The API, the SDK, the CLI and the MCP server all run through the same API routes as the web app. They apply the same role checks and the same folder visibility. A script or an assistant can never see a project, or make a change, that its owner couldn't in the browser.

A token or an assistant always acts as a person. It uses that person's role as it is now, so when the person is demoted or removed, the token loses that access at once.

## What tokens can't do

An AI assistant connected over MCP never signs anything off. Prism refuses these to an MCP client whatever it was granted:

- approving or publishing a release;
- catalog QA (accepting or rejecting a component);
- supply approvals: approving a waiver, accepting or rejecting a work item, adding a manufacturer Prism doesn't know yet;
- admin changes;
- resolving or reopening a comment.

For those steps, the assistant hands you a link and you finish the step in Prism.

No token of any kind resolves or reopens a comment thread. Only a person signed in to Prism can.

A personal access token can carry the `release:approve`, `catalog:qa` and `admin` scopes, so a script can approve or publish a release, perform catalog QA or make admin changes for its owner. Grant those scopes only to a token that needs them. See [Scopes](/KiCAD-Prism/automate/api-and-tokens/#scopes).

Prism does not run your scripts for you. There is no scheduler or hosted runner; run scripts from your own machine, CI or server.

## Settings

The MCP server, ops diagnostics, event retention, token lifetime and webhook targets are set by an administrator. Each setting is described in [Configuration](/KiCAD-Prism/admin/configuration/#automation-and-mcp).
