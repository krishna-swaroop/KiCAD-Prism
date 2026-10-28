---
title: Connect distributors and inventory
description: Give Prism's supply data its sources, distributor accounts and an InvenTree-compatible inventory, and keep their call budgets and history in hand.
sidebar:
  order: 8
---

Supply reads stock, prices and lifecycle from distributor accounts you
connect, and stock from your own inventory server. This page sets up both.
What people do with the data is in
[Track supply](/KiCAD-Prism/use/supply/).

Only administrators manage connectors, inventory sources and Supply settings.
Everything here is in **Library Manager → Connectors**.

## Before you start

Set `TRACKER_CREDENTIAL_ROOT_KEY`. Prism encrypts distributor credentials and
inventory tokens with it, and refuses to store them without it. See the
[Configuration reference](/KiCAD-Prism/admin/configuration/#supply).

If distributor calls must go through a proxy, set `SUPPLY_HTTPS_PROXY`. Prism
ignores the environment's proxy variables for these calls.

## Add a distributor

1. Open **Library Manager → Connectors** and choose **Add connector**.
2. Choose the provider and enter what it needs (below). Credentials are
   encrypted and never shown again.
3. Open the connector's menu and choose **Test connection**. It makes one real
   call.

| Provider | Needs | Notes |
| --- | --- | --- |
| TME | API token and secret | Prices follow the account's country. |
| Mouser | API key | About 1,000 calls a day. |
| DigiKey | Client ID and secret | One part per call, so it is slow for large lists. 1,000 calls a day; change notices have their own 50 a day and need an administrator's sign-in (below). |
| Farnell, Newark, element14 | API key, store, currency | Choose the store carefully: `il.farnell.com` is Israel, `it.farnell.com` is Italy. For a store outside the UK, the euro zone, the US and Canada, set the currency, or offers show no price. |
| Avnet | Client ID, client secret, scope, subscription key | From the Avnet API portal once Avnet approves your subscription. Avnet answers by part number only. |
| Arrow | Login, API key | Pricing & Availability API. Choose the regions to keep. Prices stay in each region's currency and Prism converts them. |
| LCSC | A file you upload | **Upload CSV** on the connector. Prism makes no calls. |
| JLCPCB (assembly) | A file you upload | Read only for projects built at JLCPCB. Its stock is for its own assembly and never counts in a total. |
| CSV | A file you upload | For air-gapped installs and distributors without an API. Each upload replaces the previous file. |

Connectors on the same credentials share one call budget.

### DigiKey change notices

DigiKey gives change notices only to a signed-in person.

1. In the DigiKey app's settings at DigiKey, add the callback address:
   `PUBLIC_BASE_URL` followed by `/api/supply/oauth/digikey/callback`. It must
   be HTTPS. If the app is registered with another address, set
   `SUPPLY_OAUTH_BASE_URL` to it.
2. On the DigiKey connector card, choose **Sign in at DigiKey** and sign in.

The sign-in lasts about 90 days. The card shows who signed in and until when,
and asks for a new sign-in when it runs out. Stock and prices don't depend on
it.

## Manage the call budget

Each connector's day is split into a share for scheduled reads (at most 90%)
and a pool for people's reads, first searches and one-off checks. The
connector card shows today's spending, what waits for room and how many more
parts fit. Choose **Edit settings** on a connector to set its daily budget, the
share kept for people, and the hour and time zone its day starts; set these to
the provider's.

A connector that hits a rate limit slows down for the day. One that answers
with a web page or a challenge where data was expected is paused for 12 hours;
the card says why, and **Resume** restarts it.

## Supply settings

The gear (**Supply settings**) on the Connectors page opens the workspace's
supply settings: **Costing** (currency, price quantity, spares, preferred
distributors), **Health checks**, **Alerts**, **Reading**, **Matching** and
**Reference data** (exchange rates and the REACH Candidate List). Everyone who
reads supply can see them; only administrators change them.

## Connect your inventory

Prism reads stock from any server that speaks InvenTree's REST API, including
InvenTree itself. It only reads; it never changes your inventory.

1. On the server, create an API token for a user who can read parts, stock and
   locations.
2. In **Library Manager → Connectors**, under **Local inventory**, choose
   **Add source**.
3. Enter a **Name**, the **Server** address (`https://…`, without `/api`), the
   **API token**, and how often to read it in **Read every (hours)** (1 to
   168). Choose **Add**.
4. In **Category to follow**, choose the part category whose stock Prism
   reads, and choose **Follow**.
5. Choose **Read now** on the source's card for the first read.

:::note
The server must be reachable over HTTPS. Prism refuses private and local
addresses unless the server's host name is listed in
`SUPPLY_INVENTORY_PRIVATE_HOSTS_STR`, for an inventory on your own network. See
the [Configuration reference](/KiCAD-Prism/admin/configuration/#supply).
:::

Each part on the server is matched to one library component, first match
wins:

1. a link a person made in **Review**;
2. the part's IPN equals a component's SAP code;
3. one of its manufacturer part numbers is a component's part number.

Parts with stock that match nothing appear under **Unmatched local stock** in
**Library Manager → Review**, where a QA reviewer or administrator links them
or adds the component.

Only stock with the status OK at your own locations counts as available, less
what is allocated. Other statuses count as held, and stock at an external
location counts as at vendor. A read that fails keeps the last stock, marked
stale on each component.

## Look after it

- `GET /api/supply/health` (administrators) lists calls against budget,
  errors, late reads and the oldest read per connector.
- Readings older than 60 days are rolled into one row per listing per day.
  Set **Keep raw samples (days)** in a connector's **Edit settings** to change
  that (1 to 365 days). For a provider whose terms limit how long its data may
  be kept, set **Delete all history after (days)**.
- Providers Prism doesn't know can be added as plugins through the
  `prism.supply_providers` entry point.
