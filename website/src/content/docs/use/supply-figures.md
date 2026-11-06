---
title: How supply figures are worked out
description: The rules behind every supply figure in Prism, from a part's status and stock to boards buildable, cost per board, trends, forecasts and alerts.
sidebar:
  order: 9.3
---

This page explains where each supply figure comes from, so you can tell what a
number means and when to trust it. Every screen, the KiCad panel and the
exports use the same rules. The screens themselves are described in
[Track supply](/KiCAD-Prism/use/supply/) and
[Supply for a part](/KiCAD-Prism/use/supply-components/).

## A part's status

A part's status is the worst of its [health check](#health-checks-and-the-health-score)
findings that nobody has waived:

| Status | When |
| --- | --- |
| **Critical** | a Critical finding, such as an obsolete part |
| **At risk** | an Error finding, such as no stock or not enough for the build |
| **Needs attention** | a Warning finding |
| **OK** | no finding, or only notes |
| **No data** | nothing has been read and nothing was found |

**At risk** on the Dashboard and in a project counts Critical and **At risk**
parts. **Needs attention** only needs a look. When distributors disagree about
the lifecycle, the part takes the worst one they state.

### Health checks and the health score

A BOM line and a part sheet also list findings from the health checks. Each
check has a severity (Critical, Error, Warning or Note) that an
administrator can change in
[**Supply settings → Health checks**](/KiCAD-Prism/admin/supply/#supply-settings);
the line takes the worst finding nobody has waived. Anyone who can propose
supply decisions can choose **Waive** on a finding and give a reason; it
holds once QA or an administrator approves it.

| Check | Raised when | Default |
| --- | --- | --- |
| **Manufacturer lists it as obsolete** | a distributor says obsolete | Critical |
| **No distributor carries the part number**, **No distributor has it in stock**, **Stock does not cover the build**, **Not RoHS compliant** | as named | Error |
| **Lead time over the limit** | the shortest quoted lead time is over **Longest lead time (days)** (84) | Warning |
| **A read is late** | a reading the stock figures rest on is older than the part's reading interval plus **Read is late after (hours)** (48) | Warning |
| **Only one distributor has it in stock** | only one distributor (one account) has stock, and you have more than one connected | Warning |
| **Distributors disagree on RoHS** | distributors disagree on whether the part is RoHS compliant; the finding names who says what | Warning |
| **Last time buy announced** | the part is at last time buy; an Error within **Last buy date is an error within (days)** (180) of the last date to buy, and once that date has passed, Critical when no distributor has stock | Warning |
| **A distributor's price is far from the others'** | one of at least three quotes is more than twice, or less than half, the median | Note |

The others are Warnings by default: NRND, every distributor dropped it, stock
at or below the watch's threshold, could run out soon, likely to run out
everywhere, price rise, over the target price, an open change notice (an
Error when its last time buy is close), maker missing, not in library, REACH
substance, parameter or package mismatch, lifecycle disagreement, and a
notice or last date to buy saying the part is ending.

The health score runs from 0 to 10 and sits inside its status's band: OK is
7 to 10, **Needs attention** 4 to 6.9, **At risk** 0.1 to 3.9 and Critical 0. Within
the band it is lower the worse the part scores on lifecycle, sourcing,
inventory, market and compliance, and the more findings it has after the
first. A project's score is the parts' scores weighted by quantity, capped at
the top of its worst part's band.

## Stock

Only listings Prism has matched to the part, or a person has confirmed,
count. **Marketplace** offers (third-party sellers on a distributor's site) never
count.

- **Across distributors**, stock adds up. Connectors on one account (the same
  credentials, such as two storefronts of one distributor) are one stock: a
  product both list counts once, and they count as one holder.
- **Within one distributor**, cut tape, custom reels (such as Digi-Reel) and
  listings of unknown packaging usually draw on one pile, so only the largest
  of them counts. Full reels, trays, tubes and bulk are separate piles and add.
  Where a distributor says all its packagings share one pile, only the largest
  figure counts.
- A watch set to count one packaging counts only that packaging. When a
  part's own watch counts any packaging, the packaging its component's watch
  sets is counted.
- A disabled connector's offers don't count.
- A part no distributor has been read for shows **Not read**, never zero.

A total is as old as the oldest reading it rests on: when one distributor has
stock read months ago and another reads zero today, the part shows the old
date, and the **A read is late** check can fire.

Stock history uses the same rules day by day, carrying each listing's last
reading forward. A listing that disappeared stops counting after its last
reading.

### Your own stores

Stock from your inventory server is split three ways:

- **Available**: stock at your own locations with the status OK, less what is
  allocated. This counts toward a build.
- **Held**: stock at your own locations in any other status (on hold,
  quarantined, damaged). Shown, never counted.
- **At vendor**: stock at a location marked external. Shown, never counted.

If a part's stock is kept in mixed units, Prism gives no totals for it.

## Can the project be built

**Boards** is the number of complete boards the stock covers:

1. Lines marked not fitted are left out: a **DNP**, **Do Not Place** or
   **Exclude from BOM** column that is set, or **In BOM** set to no, however
   the column and value are written.
2. Each line is matched to a part. A line whose symbol has a Prism ID first
   takes its component's manufacturer and part number. Then: by manufacturer
   and part number; by part number alone if only one part has it; through a
   linked LCSC number as a last resort.
3. A line is **unchecked** when it has no tracked part (no part number, a part
   Prism doesn't know or can't tell apart, or one it doesn't track) or its part
   has no stock figure.
4. For each part, the usable stock is distributor stock plus available stores
   stock, plus the stock of the component's approved alternates.
5. Each part covers usable stock ÷ (quantity per board × (1 + spares)) boards,
   rounded down. Two lines using the same part are checked together, and so
   are parts that share an approved alternate, so its stock is never counted
   twice.
6. **Boards** is the smallest of these, and the line that gives it is the
   limiting line.

A part is **Short** when its usable stock is less than the build needs. When
two lines lean on one alternate that can't cover both, both are short. A short
line makes the build short; otherwise, while any line is **unchecked**, the answer
reads **Unconfirmed**.

### Spares

Spares are added to what a build needs, rounded up to whole parts. In
**Supply settings → Costing → Spares** an administrator chooses either **Same
for every part** (default 0%) or **By part type**: **Small passives (01005 to
0603)** default to 2% and **Other parts** to 0%. A part is a small passive when
its footprint name starts like a resistor, capacitor, inductor, ferrite, LED
or diode and names one of those sizes. A tracked project can set its own
spares.

## What it costs

For each part, Prism prices the whole quantity the build needs (with spares):

1. The order quantity is the need raised to the offer's minimum order, then
   to a whole number of its order multiple.
2. The unit price is the price break at or below the order quantity.
3. An offer whose distributor quoted a single quantity (Avnet names one) has
   no price for a larger order: Prism doesn't stretch a quote.
4. Offers that have enough stock win over cheaper offers that don't. Among
   those, the cheapest wins, unless **Use a preferred distributor when it has
   the stock** is on: then a part's own preferred distributor, then the
   workspace's order, wins when it has the stock.

What the minimum order or multiple forces you to buy beyond the need is shown
as **left over**. **Cost per board** leaves it out; the cost of the build
includes it.

Prices are distributors' list prices, without VAT or shipping. A part shows
one price in lists and on its sheet: the cheapest offer whose stock covers
its minimum order, at the part's **Price quantity** (100 unless changed).
When no offer is orderable, it shows the cheapest backorder with its lead
time, then the price when it was last in stock. A range across distributors
shows only when at least two sell the part.

### Currency

Every price is converted to the workspace currency with the European Central
Bank's daily reference rates, read once a day unless the server is set not to
fetch them (`SUPPLY_FETCH_EXCHANGE_RATES`, see
[Configuration](/KiCAD-Prism/admin/configuration/#supply)). Rates more than
seven days old are marked **Out of date**; an administrator can refresh them
or enter rates by hand in **Supply settings → Reference data**. Prism never
guesses a rate: when one is missing, a total is shown in the offers' own
currency if they all share one, and otherwise not at all. A total that covers
only some lines says **x of y lines priced**.

## Trends

Prism reads each tracked part's history every day and keeps what it finds. No
distributor call is made for this.

- **Restocks.** A rise of at least 20% (or any rise from zero) is a restock.
  Trends are measured since the last restock, and are reset when the number of
  listings behind the figure changes, so a new listing isn't read as stock
  arriving.
- **Stock falling or steady.** The slope is the median of the slopes between
  every pair of readings since the last restock, so one odd reading can't
  swing it. It needs at least four readings over at least three days.
- **Runs out in.** Stock divided by the daily decrease, while stock is
  falling. A part that won't run out within a year, and isn't ending, shows
  as steady instead.
- **Confidence.** Low under four readings or a week; medium under fifteen
  readings or a month; high beyond. Warnings about running out need at least
  medium confidence.
- **Restock expected.** With two or more restocks, the median gap between
  them; a restock overdue on that gap is **Restock late**.
- **Often out of stock.** **Out of stock** on at least 20% of the days on record.
- **Unusual drop.** A drop of at least 70% from at least 50 pieces within
  three days, with the same listings.
- **Price change.** The cheapest price now against 30 days ago, from readings
  at least a week apart, the latest no more than three days old. A change of
  5% or more is **Price moving**.
- **Lead time rising.** The median quoted lead time over the last two weeks
  against the first two weeks of the last 90 days, when it rose at least seven
  days.

## When a part may end

The part sheet's **Outlook** sorts each part into a band from the signals Prism
holds, and lists each signal with where it came from and any date it gives,
such as a last date to buy. The bands describe evidence, not time: Prism does
not predict how many years a part has left.

| Band | When |
| --- | --- |
| **Ended** | a distributor says obsolete |
| **Ending** | last time buy, every distributor dropped it, an open end-of-life or last-time-buy notice, or a stated last date to buy |
| **Warning signs** | NRND or an NRND notice, or two of: some distributors dropped it, out of stock for the last 30 days, cheapest price up 20% or more |
| **No signs of an end** | none of the above |
| **Not enough to say** | nothing is known about the part's lifecycle yet |

**Library components' parts are ending** on the Dashboard lists the
components whose part is NRND, at last time buy, obsolete, dropped by every
distributor, or in the Ended or Ending band.

## Forecasts

Forecasts estimate what happens next: when stock runs out, the chance it is out
everywhere on any day of the next four or eight weeks (even if restocked after),
whether a part can be bought in four or eight weeks, its price in 30 and 90
days, and the chance of an end-of-life change within a year. Each kind of
forecast earns its place:

- **Learning** until it has enough checked forecasts (30 to 60, by kind).
  Shown greyed and never used for alerts.
- **Shown** once its record holds: 72% to 88% of outcomes fell inside its 80%
  ranges, or its chances were within 10 points of what happened, over its
  latest 200 checks.
- **Paused** when a shown forecast stops holding over its last 30 checks. It
  returns once its record holds again.

A forecast is checked when its day arrives, and left out of the record when
readings don't reach that day. Stock forecasts simulate 2,000 futures per
distributor from the part's own drain, stock-outs and restocks, borrowing from
similar parts (same maker and category) when its own history is short.
Connectors on one account are simulated as one stock. A distributor's
back-in-stock range comes from its own past stock-outs, from every
distributor's when it has too few, or else from the lead time it quotes
(shown as **quoted**). Chances
are worded **Almost certain** (90% and over), **Likely** (70%), **Uncertain**
(40%), **Unlikely** (10%) and **Very unlikely**.

## Market figures

**Supply → Insights → Market** describes your tracked parts as a group, by maker and by
category (a group needs at least three parts):

- **Out of stock**: the share of parts with no stock.
- **Dropped**: the share every distributor lists as discontinued.
- Ending: the share that is NRND, at last time buy or obsolete, among the
  parts whose lifecycle a distributor states.
- **Median lead time**: of each part's shortest quoted lead time.
- **Price index**: 100 on the group's first day, then moved each day by the
  median price change of its parts. Each listing is compared with its own
  earlier price, so currencies never mix.

It is snapshotted once a day and compared with a month earlier. A group is
flagged when its out-of-stock share rose 20 points, or its median lead time
rose by at least 14 days and 25%.

## Alerts

Alerts are raised for watched parts and shown on the Dashboard; Prism sends
no email or chat messages. Each alert comes from a health check finding, at
the severity set for that check, and a waived finding raises none.

| Alert | Raised when |
| --- | --- |
| **Part lost** | no distributor carries it any more, or every listing disappeared |
| **Out of stock** | stock is zero |
| **Below threshold** | stock is at or below the part's threshold |
| **Running out** | stock runs out within eight weeks, with at least medium confidence, and no regular restock is due first |
| **Likely out** | the out-of-stock forecast is shown, the part is read daily, and its last two forecasts both reached **Likely to run out alert (% chance)** (70%) |
| **Price up** | the 30-day price change reached **Price rise alert (%)** (20%) |
| **Change notice** | an open product change notice; an error within 90 days of the last time buy |
| **End of life** | obsolete, NRND, last time buy or dropped by every distributor |
| **Target price missed** | the unit price is above the part's target price |
| **Assessment worse** | the part's status is worse than its best since the alert was last acknowledged |

A new alert opens only when it is seen on two reads at least 30 minutes
apart, so one odd reading raises nothing; part lost and change notices open
at once. An alert resolves by itself when its condition stops holding, and a
worse severity wakes an acknowledged or snoozed one. The <svg xmlns="http://www.w3.org/2000/svg" width="1.1em" height="1.1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Alert rules for this part" style="display:inline;margin:0;vertical-align:-0.2em"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></svg> on a part's sheet can
switch off most kinds and set its own thresholds.

## How often parts are read

A part on a tracked project, or watched at tier 1, is read daily. Tier 2
parts are read weekly or monthly. A listing that hasn't changed for seven
reads, and isn't near its threshold, running out or ending, is read half as
often until it changes. **Other parts** are read when someone opens them and
their prices are more than a day old, or when someone asks.

When a day's calls can't cover every part due, Prism reads first the parts
that are out of stock, at or below their threshold, or running out within two
weeks; then those near their threshold, running out within eight weeks,
ending, or changed in the last day; then the rest. Failed reads are retried
after five minutes, then at growing intervals up to a day.

Each connector keeps part of its day (10% unless changed) for people's
lookups; tracking may use at most 90%. A part that doesn't fit the rest is
**Queued for calls** and read with calls nothing else needs until room frees
up.
