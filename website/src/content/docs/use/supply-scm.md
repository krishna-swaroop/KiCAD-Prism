---
title: Supply for supply chain teams
description: Answer whether a build can go ahead, what it costs and what to buy first, and keep an eye on lead times, prices and distributors across every tracked part.
sidebar:
  order: 9.2
---

This guide is for the people who plan builds and buy parts. It shows where Prism
answers "can we build it", "what will it cost" and "what should we buy first",
and how to get that out of Prism and into your purchasing tools. Prism never
buys anything: there are no carts and no orders.

You need the **Designer**, **QA** or **Admin** role to open Supply. The
reference for each screen is [Track supply](/KiCAD-Prism/use/supply/); the
rules behind each figure are in
[How supply figures are worked out](/KiCAD-Prism/use/supply-figures/).

## Can this build go ahead?

Open the project and choose **Supply**. The four tiles answer for the build
size shown:

- **Build**: how many boards the stock covers and the line that limits it.
  **Unconfirmed · N unchecked** means some lines can't be checked (no part
  number, or a part not in the library); the answer is not complete until they
  are fixed.
- **Cost**: the cost of the build and of one board.
- **Health**: the parts by status.
- **Stock coverage**: the share of BOM lines in stock for the build.

To check another build size, use the pencil on **Build** and type the number
of **Boards**. **Keep N as the usual build** saves it for a tracked project, so
its card, the Dashboard and the daily cost history use it.

Stock that counts toward the build is distributor stock plus what your own
inventory holds as available. Stock on hold, in quarantine or at a vendor's
location is shown but not counted.

Narrow the parts with the chips: **Short for this build**, **Limiting the
build**, **Out of stock**, **Not priced**, **End of life**, **Unchecked**,
**Open alerts**. Sort with **Runs out first**.

The **Projects** page in Supply lists every tracked project with the same
answer.

## What does it cost?

Prism prices each line at the quantity the build needs (with spares), choosing
the cheapest offer that has the stock. Minimum orders and order multiples are
applied, and what they force you to buy beyond the need is shown as left over.

- **Cost per board by build size** shows how the cost falls from 1 to 10,000
  boards.
- **Cost allocation** shows which lines the money goes to.
- **Cost over time** shows the daily cost of the usual build.

Prices are list prices without VAT or shipping, converted to the workspace
currency with the European Central Bank's daily rates. An administrator sets
the currency, the spares and the preferred distributors in **Supply settings**.

### Take the costing to purchasing

**Costing** on the project's Supply tab downloads a zip for the build size
shown:

- the whole costing, with the distributor and its part number for each line;
- the costing split by distributor;
- a draft RoHS and REACH declaration;
- the trade classification (export control and tariff codes distributors
  state).

Each is a CSV. Use the distributor files to fill a quote request or a cart at
the distributor yourself.

### Check a BOM file that isn't a project

**Supply → Tracking → Upload BOM** checks an Excel or CSV BOM (a customer's,
a quote) without saving anything. Map the part number column (or an LCSC
number column) and the quantity, set **Boards to build**, and choose **Check
N distinct parts**. The check uses the figures Prism already holds and makes
no distributor calls, so a part Prism doesn't read yet comes back without stock
or price.

**Check once** on a project's BOM tab reads the parts nobody reads yet, once,
without tracking them.

## What should we buy first?

- **Dashboard → Deadlines**: last-time-buy and last-ship dates in the next
  year. Red within 90 days.
- **Dashboard → Projected stock**: parts that are out or run out within two
  weeks at the recent rate.
- **Insights → Stock risk → Stock left against lead time**: each dot is a part;
  a dot above the line runs out before an order placed today would arrive.
- **Tracking**, sorted by **Runs out first**.

**Insights → Export** downloads every tracked part with its risk figures
(status, lifecycle, when it may end, stock, distributors holding it, days to
zero, lead time, price change and findings) as a CSV, for planning outside
Prism.

## Watch lead times, prices and distributors

**Supply → Insights** looks across every tracked part. A section shows only
once it has data:

- **Sourcing**: which distributors list, stock and are cheapest for your parts,
  and how many parts depend on one distributor. With enough history, how each
  distributor behaves: how often it reprices, who moves price first, who
  restocks first and whether quoted arrivals are kept.
- **Lead times and prices**: parts by quoted lead time, and the biggest price
  moves of the last 30 days.
- **Market**: your parts as a group, by maker and by category: share out of
  stock, share ending, share dropped by distributors, median lead time and a
  price index, over time.
- **Forecasts**: lead times by family three months ahead, early warnings and
  prices ahead, shown only once each forecast has a good record.
- **Trade** and **Compliance**: country of origin, export control, lifecycle
  and RoHS/REACH.

Every bar and count opens the parts behind it.

## Get warned

Alerts appear on the Dashboard; Prism sends no email or chat messages. The
bell on a watched part's sheet sets what it raises, including a **Price
rises** threshold and a **Target price**. The workspace defaults are in
**Supply settings → Alerts**.

## Distributor call limits

Distributors limit how many calls Prism may make a day. Prism spends the day
on tracked parts first and keeps a share for people's lookups. When tracking
asks for more than fits, the extra parts wait as **Queued for calls**: the
Dashboard tile counts them. An administrator can raise a connector's budget, or
you can pick one packaging per distributor (**Pick a packaging**) so fewer
listings are read.
