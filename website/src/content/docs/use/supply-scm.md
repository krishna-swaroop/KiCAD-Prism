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

You need the **Designer**, **QA** or **Admin** role to open Supply. Everything
on this page, including tracking a project and choosing a packaging, is open to
all three; see [Who can do what](/KiCAD-Prism/use/supply/#who-can-do-what) for
the decisions that need QA or an administrator. The reference for each screen
is [Track supply](/KiCAD-Prism/use/supply/); the rules behind each figure are
in [How supply figures are worked out](/KiCAD-Prism/use/supply-figures/).

## Can this build go ahead?

Open the project and choose **Supply**. The four tiles answer for the build
size shown:

- **Build**: how many boards the stock covers and the line that limits it. A
  line short of stock makes the answer final. Otherwise, while some lines
  can't be checked (no part number, a part Prism doesn't know or can't tell
  apart, or no stock figure), the tile reads **Unconfirmed** with how many
  lines are unchecked.
- **Cost**: the cost of the build and of one board. When some lines have no
  price it says how many of the lines are priced.
- **Health**: the health score and the parts by status.
- **Stock coverage**: the share of BOM lines in stock for the build. A line
  counts only when its part is tracked and has a stock figure.

To check another build size, use the pencil on **Build** and type the number
of **Boards**. On a tracked project, **Keep N as the usual build** saves it, so
its card, the Dashboard, the daily cost history and the next release snapshot
use it. A project with no usual build is shown for 100 boards.

Stock that counts toward the build is distributor stock, the stock of the
component's approved alternates, and what your own inventory holds as
available. Stock on hold, in quarantine or at a vendor's location is shown but
not counted.

Narrow the parts with the chips: **Unchecked**, **Out of stock**, **Short for
this build**, **Limiting the build**, **Not priced**, **End of life**, **Open
alerts**. Sort with **Runs out first**.

**Supply → Projects** lists every project, tracked ones first, with its cost
per board, the boards it can build and its open alerts.

When a figure on screen comes from an earlier read because the latest one
failed, an **Out of date** button shows in the Supply header and on the
project's Supply tab. Choose it to read everything again.

## What does it cost?

Prism prices each line at the quantity the build needs (with spares), choosing
the cheapest offer that has the stock. Minimum orders and order multiples are
applied, and what they force you to buy beyond the need is shown as left over.

- **Cost per board by build size** shows how the cost falls from 1 to 10,000
  boards.
- **Cost allocation** shows which lines the money goes to. It is left out when
  the prices are in several currencies and there is no rate to add them up.
- **Cost over time** shows the daily cost of the usual build.

Prices are list prices without VAT or shipping, converted to the workspace
currency with the European Central Bank's daily rates or rates an
administrator enters (see
[Currency](/KiCAD-Prism/use/supply-figures/#currency)). An administrator sets
the currency, the price quantity, the spares and the preferred distributors in
[Supply settings](/KiCAD-Prism/admin/supply/#supply-settings); a tracked
project can set its own spares.

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

**Supply → Tracking → Upload BOM** checks an XLSX or CSV BOM (a customer's,
a quote) of up to 2 MB without saving anything. Map the **Manufacturer part
number** or **LCSC number** column and the **Quantity per board**, set
**Boards to build**, and choose **Check N distinct parts**. The check uses the
figures Prism already holds and makes no distributor calls, so a part Prism
doesn't read yet comes back without stock or price.

**Check once** on a project's BOM tab, and in the release supply check, reads
the parts nobody reads yet, once, without tracking them. Lines that need a
maker or a part number first are counted as **to settle first** and left out.

## What should we buy first?

- **Dashboard → Deadlines**: last-time-buy and last-ship dates in the next
  year. Red within 90 days.
- **Dashboard → Projected stock**: parts that are out or run out within two
  weeks at the recent rate.
- **Insights → Stock risk → Stock left against lead time**: each dot is a part;
  a dot above the line runs out before an order placed today would arrive.
- **Tracking**, sorted by **Runs out first**.

**Insights → Export** downloads every tracked part with its risk figures
(status, lifecycle, outlook, stock, distributors holding it, days to zero, lead
time, chance it is out in four weeks, price change and findings) as a CSV, for
planning outside Prism.

## Watch lead times, prices and distributors

**Supply → Insights** looks across every tracked part. A section shows only
once it has data:

- **Sourcing**: which distributors list, stock and are cheapest for your parts,
  and how many parts depend on one distributor. With enough history, how each
  distributor behaves: how often it reprices, who moves price first, who
  restocks first and whether quoted arrivals are kept.
- **Lead times and prices**: parts by quoted lead time, and the biggest price
  moves of the last 30 days.
- **Stock risk**: stock left against lead time, and the parts behind each
  finding.
- **Market**: your parts as a group, by maker and by category: share out of
  stock, share ending, share dropped by distributors, median lead time and a
  price index, over time.
- **Forecasts**: lead times ahead, early warnings and prices ahead, shown
  only once each forecast has a good record.
- **Trade** and **Compliance**: country of origin, export control, lifecycle
  and RoHS/REACH.

Every bar and count opens the parts behind it.

## Compare with what was released

When a release is published, Prism records the supply of the BOM it shipped,
for the project's usual build and spares. The project's Supply tab lists them
under **Releases** with their health, the parts that needed a look and a
**Compliance CSV**. **Since then** names the parts that were fine at release
and are not now; it is shown only for a release recorded at the build size the
tab shows. Publishing is described in
[Release Studio](/KiCAD-Prism/use/release-studio/).

## Get warned

Alerts appear on the Dashboard; Prism sends no email or chat messages. The
bell on a watched part's sheet sets what it raises: its stock threshold, the
price rise that counts, the chance of running out that counts and a **Target
price**. Switching an alert off is for QA and administrators; anyone else's
request waits in **Supply → Review → To approve**. The workspace defaults are
in **Supply settings → Alerts**.

## Distributor call limits

Distributors limit how many calls Prism may make a day. Prism spends the day
on tracked parts first and keeps a share for people's lookups. When tracking
asks for more than fits, the extra parts wait as **Queued for calls**: the
Dashboard tile counts them. An administrator can raise a connector's budget.
You can also pick one packaging per distributor so fewer listings are read:
choose **Pick** on a part's read schedule (the clock on its sheet), or
**Choose** under **Supply → Review → Several listings at a distributor**.
