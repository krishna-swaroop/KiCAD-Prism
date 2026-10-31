---
title: How supply figures are worked out
description: The rules behind every supply figure in Prism, from a part's status and stock to boards buildable, cost per board, trends, forecasts and alerts.
sidebar:
  order: 9.3
---

This page explains where each supply figure comes from, so you can tell what a
number means and when to trust it. Every screen, the KiCad panel and the
exports use the same rules. The screens themselves are described in
[Track supply](/KiCAD-Prism/use/supply/).

## A part's status

A part shows one of five statuses. The first rule that applies wins:

1. **Unknown**: nothing has been read yet. If Prism searched and no
   distributor carries the number, or every listing has disappeared, the part
   is **Error** instead.
2. **Fatal**: the part is obsolete.
3. **Error**: no distributor has stock.
4. **Warning**: stock is at or below the part's own alert threshold, or the
   part is not recommended for new designs (NRND) or at last time buy.
5. **OK**: none of the above.

**At risk** on the Dashboard and in a project counts Error and Fatal parts. A
Warning only needs a look. When distributors disagree about the lifecycle,
the part takes the worst one they state.

### Health checks and the health score

A BOM line and a part sheet also list findings from the health checks. Each
check has a severity an administrator can change in **Supply settings →
Health checks**; the line takes the worst finding nobody has waived.

| Check | Raised when | Default |
| --- | --- | --- |
| Obsolete | a distributor says obsolete | Critical |
| Not found, no stock, not enough stock, not RoHS compliant | as named | Error |
| Lead time | the shortest quoted lead time is over **Longest lead time (days)** (84) | Warning |
| Read is late | a reading the stock figures rest on is older than the part's reading interval plus **Read is late after (hours)** (48) | Warning |
| Single source | only one distributor (one account) has stock, and you have more than one connected | Warning |
| RoHS disputed | distributors disagree on whether the part is RoHS compliant; the finding names who says what | Warning |
| Last time buy | the part is at last time buy; an Error within **Last buy date is an error within (days)** (180) of the last date to buy | Warning |
| Price outlier | one of at least three quotes is more than twice, or less than half, the median | Note |

The others (NRND, distributor dropped it, maker missing, not in library,
REACH substance, parameter or package mismatch, lifecycle disagreement, and a
notice or last date to buy saying the part is ending) are Warnings by default.

The health score runs from 0 to 10 and sits inside its status's band: OK is
7 to 10, Warning 4 to 6.9, Error 0.1 to 3.9 and Fatal 0. Each finding after
the first lowers it within the band.

## Stock

Only listings Prism has matched to the part, or a person has confirmed,
count. Marketplace offers (third-party sellers on a distributor's site) never
count.

- **Across distributors**, stock adds up. Connectors on one account (the same
  credentials, such as two storefronts of one distributor) are one stock: a
  product both list counts once, and they count as one holder.
- **Within one distributor**, cut tape, custom reels (such as Digi-Reel) and
  listings of unknown packaging usually draw on one pile, so only the largest
  of them counts. Full reels, trays, tubes and bulk are separate piles and add.
  Where a distributor says all its packagings share one pile, only the largest
  figure counts.
- A watch set to count one packaging counts only that packaging.
- A disabled connector's offers don't count.

A total is as old as the oldest reading it rests on: when one distributor has
stock read months ago and another reads zero today, the part shows the old
date, and the **Read is late** check can fire.

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

1. Each BOM line is matched to a part: by manufacturer and part number first;
   by part number alone if only one part has it; through a linked LCSC number
   as a last resort. A line that can't be matched is **unchecked**.
2. For each part, the usable stock is distributor stock plus available stores
   stock, plus the stock of the component's approved alternates.
3. Each part covers usable stock ÷ (quantity per board × (1 + spares)) boards,
   rounded down. Two lines using the same part are checked together.
4. **Boards** is the smallest of these, and the line that gives it is the
   **limiting line**.

A part is **Short** when its usable stock is less than the build needs. While
any line is unchecked, the answer reads **Unconfirmed**.

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
Bank's daily reference rates, read once a day. Rates more than seven days old
are marked **Out of date**; an administrator can refresh them or enter rates
by hand in **Supply settings → Reference data**. Prism never guesses a rate:
when one is missing, a total is shown in the offers' own currency if they all
share one, and otherwise not at all.

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
- **Often out of stock.** Out of stock on at least 20% of the days on record.
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
days, and the chance of an end-of-life change within a year. Each kind of forecast earns its place:

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
similar parts (same maker and category) when its own history is short. Chances
are worded **Almost certain** (90% and over), **Likely** (70%), **Uncertain**
(40%), **Unlikely** (10%) and **Very unlikely**.

## Market figures

**Insights → Market** describes your tracked parts as a group, by maker and by
category (a group needs at least three parts):

- **Out of stock**: the share of parts with no stock.
- **Dropped**: the share every distributor lists as discontinued.
- **Ending**: the share that is NRND, at last time buy or obsolete.
- **Median lead time**: of each part's shortest quoted lead time.
- **Price index**: 100 on the group's first day, then moved each day by the
  median price change of its parts. Each listing is compared with its own
  earlier price, so currencies never mix.

It is snapshotted once a day and compared with a month earlier. A group is
flagged when its out-of-stock share rose 20 points, or its median lead time
rose by at least 14 days and 25%.

## Alerts

Alerts are raised for tracked parts and shown on the Dashboard; Prism sends no
email or chat messages.

| Alert | Raised when |
| --- | --- |
| Part lost | no distributor carries it any more, or every listing disappeared |
| Out of stock | stock is zero |
| Below threshold | stock is at or below the part's threshold |
| Runs out soon | stock runs out within eight weeks, with at least medium confidence, and no regular restock is due first |
| Likely out | the out-of-stock forecast is shown, the part is read daily, and its last two forecasts both reached **Likely to run out alert (% chance)** (70%) |
| Price up | the 30-day price change reached **Price rise alert (%)** (20%) |
| Change notice | an open product change notice; an error within 90 days of the last time buy |
| Lifecycle | obsolete (critical), or NRND, last time buy or dropped by every distributor |
| Over target price | the unit price is above the part's target price |
| Health worse | the part's status is worse than its best since the alert was last acknowledged |

A new alert opens only when it is seen on two reads at least 30 minutes
apart, so one odd reading raises nothing; part lost and change notices open
at once. An alert resolves by itself when its condition stops holding. A part
sheet's bell can mute most kinds and set its own thresholds.

## How often parts are read

A part on a tracked project, or watched at **Tier 1**, is read daily. **Tier
2** parts are read weekly or monthly. A listing that hasn't changed for seven
reads, and isn't near its threshold, running out or ending, is read half as
often until it changes. Other parts are read when someone opens them and
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
