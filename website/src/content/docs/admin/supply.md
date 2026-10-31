---
title: Connect distributors and inventory
description: Give Prism's supply data its sources, distributor accounts and an InvenTree-compatible inventory, and keep their daily call limits and history in hand.
sidebar:
  order: 8
---

Supply reads stock, prices and lifecycle from distributor accounts you
connect, and stock from your own inventory server. This page sets up both.
What people do with the data is in
[Track supply](/KiCAD-Prism/use/supply/).

Only administrators manage connectors, inventory sources and Supply settings.
Everything here is in **Supply → Sources**.

## Before you start

Set `TRACKER_CREDENTIAL_ROOT_KEY`. Prism encrypts distributor credentials and
inventory tokens with it, and refuses to store them without it. See the
[Configuration reference](/KiCAD-Prism/admin/configuration/#supply).

If distributor calls must go through a proxy, set `SUPPLY_HTTPS_PROXY`. Prism
ignores the environment's proxy variables for these calls.

## Add a distributor

You need an account with the distributor's API programme first: each one
issues its own keys, usually after you register an application in its
developer portal.

1. Open **Supply → Sources** and choose **Add connector**.
2. Choose the **Provider**, and the **Storefront** if it has a choice (below).
   You can add one connector per provider and storefront.
3. Give it a **Name**, the **Currency** you want its prices in (three
   letters, such as `EUR`), its **Daily call budget**, and the share **Held for
   lookups (%)** (10 unless changed, at most 50).
4. Fill in the credentials (below) and choose **Add connector**. Credentials
   are encrypted and never shown again; **Replace credentials** in the
   connector's menu sets new ones.
5. Open the connector's menu and choose **Test connection**. It makes one real
   call and shows the answer and how long it took.

| Provider | Credentials | Storefronts and notes |
| --- | --- | --- |
| **TME** | **Token**, **Application secret** | A storefront per country; prices follow it. |
| **Mouser** | **Search API key** | No storefront. About 1,000 calls a day. |
| **DigiKey** | **Client ID**, **Client secret** | A storefront per country site. One part per call, so it is slow for large lists. 1,000 calls a day; change notices have their own 50 a day and need an administrator's sign-in (below). |
| **Farnell / Newark / element14** | **API key** | The storefront is the regional site. Choose it carefully: `il.farnell.com` is Israel, `it.farnell.com` is Italy. For a store outside the UK, the euro zone, the US, Canada and India, set the currency, or offers show no price. |
| **Avnet** | **Client ID**, **Client secret**, **Scope**, **Subscription key** | From the Avnet API portal once Avnet approves your subscription. Avnet answers by part number only, with one price for the quantity it names (one piece, or its minimum order): Prism prices no larger order from it. |
| **Arrow** | **Login**, **API key**, **Address of this server** | The Pricing & Availability API. The address is the public IP address Arrow sees Prism's calls come from. The storefront picks the regions to keep (**ALL** keeps every region). Prices stay in each region's currency and Prism converts them. Reads 100 parts a call. |
| **LCSC** | none | Offers come from a file you upload (below). Prism makes no calls. |
| **JLCPCB (assembly)** | none | From an uploaded file or the jlcparts catalogue, read only for projects built at JLCPCB. Its stock is for its own assembly and never counts in a total. |
| **CSV import** | none | From an uploaded file, for air-gapped installs and distributors without an API. |

### Upload offers from a file

For LCSC, JLCPCB and CSV connectors, choose **Upload CSV** in the connector's
menu. The file needs `sku`, `mpn`, `manufacturer` and `stock` columns, with
prices in columns named for their quantity (`price_1`, `price_10`,
`price_100`); **Download a template** in the dialog gives a starting file. The
limit is 5 MB. Each upload replaces the previous one, and if any row is wrong
nothing is imported: the dialog lists each problem by line and column.

A script, an ERP export or a scraper can send the same offers itself instead:
choose **Push token** in the connector's menu, then **Create token**, and see
[Push offers and stock](/KiCAD-Prism/automate/supply-push/).

### Read JLCPCB from the jlcparts catalogue

Instead of uploading a file, a JLCPCB connector can read
[jlcparts](https://github.com/yaqwsx/jlcparts), a community copy of JLCPCB's
assembly parts library that is rebuilt three times a day. Turn on **Read the
jlcparts catalogue** in the connector's **Edit settings**.
- Prism reads the catalogue twice a day and keeps only the parts it already
  knows: library parts, followed parts and checked parts.
- Prices are in US dollars. Each part keeps its Basic, Extended or Preferred
  class.
- Each read replaces the offers, just like an upload.
- If a read fails, the connector card shows the error and the last offers
  stay.

jlcparts is not JLCPCB's own service. Check that its use fits your terms with
JLCPCB before you turn it on.
**Remove uploaded data** deletes the offers; stock history already collected
stays.

Connectors on the same credentials are one account at the distributor: they share
one daily call limit, and the budget, the share kept for people and the reset
time set on any of them apply to all.

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

## Manage the daily call limit

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

The currency menu lists the euro and every currency Prism has an exchange rate
for, so a workspace in India can cost in Indian rupees (INR). Every price,
total and cost per board is then shown in rupees, grouped the Indian way
(₹12,82,650.00), whatever the reader's browser language. The element14 India
store (`in.element14.com`) prices in rupees without a currency set on the
connector. DigiKey and Mouser say which currency each price is in, so rupee
prices from their India sites are read as rupees.

## Connect your inventory

Prism reads stock from any server that speaks InvenTree's REST API, including
InvenTree itself. It only reads; it never changes your inventory.

### Prepare the server

1. Create a user for Prism that can read parts, stock, stock locations,
   manufacturer parts and supplier parts. It needs no write access.
2. Create an API token for that user (in InvenTree, under the user's account
   settings). Prism sends it as `Authorization: Token …`.
3. Give each part the numbers Prism matches on: its **IPN** set to the library
   component's Prism id or SAP code, its manufacturer parts (maker and MPN),
   or its supplier parts with the distributor's part number (**SKU**).
5. Mark locations that hold stock outside your premises, such as at a
   contract manufacturer, as **external**.

### Add the source

1. In **Supply → Sources**, under **Local inventory**, choose
   **Add source**.
2. Keep **Kind** at **InvenTree server**. Enter a **Name**, the **Server**
   address (`https://…`, without `/api`), the **API token**, and how often to
   read it in **Read every (hours)** (1 to 168, 24 unless changed). Choose
   **Add**.
3. In **What to read**, which opens next, check that Prism shows your
   server's name and API version. Keep **Whole inventory**, or choose one
   category (its subcategories are included), and choose **Read**.
4. Choose **Read now** on the source's card for the first read. It reports how
   many stock records it read and how many parts matched.

For an inventory Prism cannot read, choose **Push** as the **Kind**, enter a
**Name** and choose **Add**. **Push token** opens next: choose
**Create token** and give the token to whatever sends the stock. See
[Push offers and stock](/KiCAD-Prism/automate/supply-push/).

:::note
The server must be reachable over HTTPS. Prism refuses private and local
addresses, and any port but 443, unless the server's host name is listed in
`SUPPLY_INVENTORY_PRIVATE_HOSTS_STR`, for an inventory on your own network.
A listed server may use its own port, as in `https://inventory.example.internal:8443`. See
the [Configuration reference](/KiCAD-Prism/admin/configuration/#supply).
:::

### How stock is matched and counted

Each part on the server is matched to one library component, first match
wins:

1. a link a person made in **Review**;
2. the part's IPN is a component's Prism id;
3. the part's IPN equals a component's SAP code;
4. one of its manufacturer part numbers is a component's part number;
5. one of its supplier part numbers is a distributor listing Prism found for
   a component's approved parts.

A SAP code, part number or supplier part number that several components share
matches none of them.
Parts with stock that match nothing appear under **Unmatched local stock** in
**Supply → Review**, where a QA reviewer or administrator links them
or adds the component. Stock that will never be a library component
(consumables, tools) can be ignored in bulk; see
[Track supply](/KiCAD-Prism/use/supply/#review-what-prism-could-not-settle).

Only stock with the status OK at your own locations counts as available, less
what is allocated. Other statuses count as held, and stock at an external
location counts as at vendor. A read that fails keeps the last stock, marked
stale on each component. See
[How supply figures are worked out](/KiCAD-Prism/use/supply-figures/#your-own-stores).

## Troubleshooting

| What you see | What to check |
| --- | --- |
| A connector shows **Needs credentials** or **Last call failed** | **Test connection** shows the distributor's answer. Rejected credentials pause the connector: replace them, then **Resume**. |
| **Credentials locked** or **Credential key changed** | `TRACKER_CREDENTIAL_ROOT_KEY` is missing or differs from the key the credentials were saved with. Restore the key, or replace the credentials. |
| **Resting until** a time | The distributor rate-limited Prism. It resumes by itself. |
| **Paused** with a reason | Prism got a web page or a challenge where it expected data, or someone paused it. Check the proxy (`SUPPLY_HTTPS_PROXY`) and the distributor's status, then **Resume**. |
| Farnell or element14 offers have no price | Set the connector's **Currency** to the store's. |
| Calls run out before the day ends | Raise the **Daily call budget** to what the distributor allows, check **Provider's day begins at** and **Time zone** match its reset, or pick one packaging per distributor so fewer listings are read. |
| An inventory source shows **No token** or **No category** | Edit it and set the token, or choose **Category** in its menu. |
| An inventory source shows **Read failed** | The card shows the error. Check the server address (no `/api`), that the token's user can read the category, and that the server is reachable over HTTPS from Prism. |
| Stock is on the server but not on the component | The part is unmatched (see **Review**), its stock is not OK status, it is allocated, or it is at an external location. |

## Look after it

- `GET /api/supply/health` (administrators) lists calls against budget,
  errors, late reads and the oldest read per connector, and when each periodic
  task (exchange rates, inventory reads, retention and the rest) last ran, last
  worked and last failed, with its error.
- Readings older than 60 days are rolled into one row per listing per day.
  Set **Keep raw samples (days)** in a connector's **Edit settings** to change
  that (1 to 365 days). For a provider whose terms limit how long its data may
  be kept, set **Delete all history after (days)**: past it, that connector's
  readings, price breaks, stock-outs and restocks, arrival dates and change
  events are deleted. What still holds today stays: the current prices, a
  stock-out not yet over, an arrival date not yet reached.
- DigiKey, Mouser, Farnell, Arrow and Avnet don't allow their data to be kept
  as a database of your own. For these, Prism keeps prices and stock only for
  parts in use: followed at a tier (a tracked project or a watch) or held in
  stock by an inventory source. Any other part keeps its prices and stock for
  24 hours after it was read. After that they're deleted, but the
  distributor's part numbers stay, so the next read needs no search. If you
  have the distributor's written permission to keep more, turn on **Keep
  prices of parts not in use** in the connector's **Edit settings**.
- Library parts that nothing follows are matched to each distributor in the
  background, using only calls the budget has to spare. Each part is searched
  once, then again after 90 days. Arrow, TME, Avnet and Mouser go first,
  because they look up many numbers in one call. DigiKey and Farnell only
  search the parts none of those carries. Each connector card shows the
  **Library** bar: parts searched, found, not carried, waiting, and the
  days left. Turn the pass off with **Library parts nobody follows** in the
  spare work settings.
- Call counts are kept 90 days.
- Providers Prism doesn't know can be added as plugins through the
  `prism.supply_providers` entry point.
