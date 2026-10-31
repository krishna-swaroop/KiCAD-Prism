---
title: Track supply for components and projects
description: See stock, price and lifecycle for your library components and their approved alternates, judge whether a project can be built, and get warned before a part runs out.
sidebar:
  order: 9
---

Prism reads stock, prices and lifecycle of your components' manufacturer parts
from distributors and from your own inventory, keeps the history, and uses it
to warn you before a part runs out and to tell you whether a project's BOM can
be built. Prism never buys anything: there are no carts and no order lists.

Supply follows the components in your
[Component Database](/KiCAD-Prism/use/library-manager/). A part number that no
library component has can be looked up, but it is never tracked or watched. To
follow it, add it to the library first.

Two guides walk through Supply by role:
[Supply for component engineers](/KiCAD-Prism/use/supply-component-engineers/)
and [Supply for supply chain teams](/KiCAD-Prism/use/supply-scm/). The rules
behind every figure are in
[How supply figures are worked out](/KiCAD-Prism/use/supply-figures/).

## Who can do what

| Role | In Supply |
| --- | --- |
| Viewer | Nothing. Supply is hidden. |
| QA | Read everything, track projects, parts and components, approve alternates, manufacturer spellings and waivers, and mark components whose part is ending. |
| Designer | Read everything, track projects, parts and components, read a part now, and propose alternates. |
| Admin | Everything above, plus distributor connectors, inventory sources and Supply settings. |

## Where supply shows

| Place | What it answers |
| --- | --- |
| **Supply → Dashboard** | What needs a person: parts at risk, out of stock or ending, open alerts, the tracked projects, and the library components whose part is ending. |
| **Supply → Tracking** | Every part Prism follows, by tier, with the tools to track a part or check a BOM file. |
| **Supply → Projects** | The parts of each project, a project at a time. |
| **Supply → Insights** | Runway, sourcing, lifecycle, lead times, prices, market and trade, across all your parts. A panel shows once it has data. **Export** downloads every tracked part with its risk figures as a CSV. |
| **Supply → Review** | What Prism could not settle alone: alternates and matches to approve, work items, and inventory stock that matches no component. |
| **Supply → Sources** | The distributor accounts and local inventory servers Prism reads. Everyone who opens Supply sees them; only administrators change them. |
| A component's **Supply** tab | How one component stands: its parts, your local stock and each distributor. |
| **Library Manager → Catalog** | A **Supply** column and filters for every component. |
| A project's **Supply** tab | Whether a project can be built, what it costs and what stops it. |
| The Visualizer's **BOM** tab | Supply columns for each line of the BOM. |
| **Release Studio** | Whether what ships can be sourced, recorded with the release. |
| The header search and `⌘K` | A part by its number. A part row opens the library component; **Open supply sheet** beside it opens the part's supply sheet. |

## A component's parts and alternates

A component's **main part** is the manufacturer and part number in its
metadata. You can add **alternates**: other manufacturer parts the component
may be built with. An alternate counts only after QA approves it. Once
approved, its stock and offers count wherever the main part does: on the
project page, in the BOM columns and in the release check.

1. Open the component in **Library Manager** and choose its **Supply** tab.
2. Under **Parts**, enter the **Manufacturer** and **Part number** of the
   alternate and choose **Propose alternate**. It shows as **Waiting for QA**.
3. A QA reviewer approves or rejects it with the buttons on its row. An
   approved alternate shows as **Approved**.

Changing the component's part number in its metadata changes its main part.
An approved alternate that the metadata now names becomes the main part.

## A component's Supply tab

The **Supply** tab shows, top to bottom:

- **Parts**: the main part and its alternates, with their approval.
- **Stores**: what your own inventory holds, when an administrator has
  connected an [inventory source](/KiCAD-Prism/admin/supply/#connect-your-inventory).
  With nothing held it shows one of **None**, **Not connected** or
  **Feed down** with the time of the last good read.
  **Available** is usable stock at your locations, less what is allocated.
  **Held** is stock at your locations on hold, quarantined or otherwise not
  usable. **At vendor** is stock at an external location, shown but never
  counted as on hand. Each record shows its location, status, quantity,
  allocation, batch and source; a **Stale** record is one whose last read
  failed.
- **Distributors**: the main part's status, stock, price and lifecycle at each
  distributor, with the history. **Open in Supply Tracking** opens its full
  part sheet.

To have Prism read the part on a schedule, choose **Watch component**. A
component whose part Prism does not know yet offers **Watch this part**
instead.

## Find components by supply in the catalog

The catalog's **Supply** column shows each component's status, distributor
stock and unit price, and its **Stores** figure. Use the filters
**Tracked**, **At risk** and **In local stock** to narrow the list. To track
many components at once, choose **Track these**, or ctrl-click rows (cmd-click
on a Mac) and choose **Track N picked**. The dialog shows what tracking would
cost in distributor calls before it starts.

## How often a part is read

Prism follows a part at one of two tiers. **Tier 1** is read every day,
**tier 2** every week or month. A listing whose price and stock haven't
changed for seven reads, and that isn't near its threshold, running out or
ending, is read half as often until something changes. Any other part is read
when someone opens it and its prices are more than a day old, or when someone
asks.
A part is in the highest tier any reason gives it, and its part sheet says why:
a tracked project, someone's choice, or a watched component.

- **Track a project:** on the project's **Supply** tab, choose **Track this
  project**. Choose the designs, the distributors you buy from and the
  packaging you prefer. Each distributor's daily call limit shows as a bar.
  Parts that don't fit the limit are queued for calls.
- **Read now:** the refresh on a part sheet asks the distributors for fresh
  figures. You can do this once every 15 minutes per part.
- **New revisions:** a tracked project's BOM is read again every 15 minutes.
  Parts a revision adds are tracked at tier 1; parts it removes stop being
  tracked unless something else keeps them.
- **Watched components:** a watched component follows its current part. When
  the component's maker or part number changes, the new part is followed and
  the old one is not. Stopping the watch drops the part to the tier of
  whatever else follows it.

## Check whether a project can be built

Open a project and choose **Supply**. The tiles at the top answer the main
questions:

- **Build**: how many boards the stock covers, and which line limits it. Use
  the pencil to change the number of boards; a tracked project can keep it as
  its usual build. While any line can't be checked (no part number, or a part
  Prism doesn't know), it reads **Unconfirmed** with how many lines are
  unchecked.
- **Cost**: what the boards cost and what one board costs.
- **Health**: the parts by status.
- **Stock coverage**: the share of all BOM lines in stock for the build. An
  unchecked line counts as not covered.

Below them are the cost by build size, the cost over time, the releases, line
notes and the parts. Use the chips **Unchecked**, **Out of stock**, **Short for this build**,
**Limiting the build**, **Not priced**, **End of life** and **Open alerts** to
narrow the parts; each counts over the whole project. The list shows **Per
board**, **Need**, **In stock**, **Price** and **Line cost** in both layouts,
a hundred parts a page.

Available stores stock counts toward the build; held and at-vendor stock does
not. Each line shows its **Stores** figure under its references, and the BOM
tab has a **Stores** column.

A line counts its component's approved alternates: their stock adds up, and
the cheapest offer that covers the build may be an alternate's. Such a line
shows **+N alt**; hover it to see each alternate's stock. A line that no
library component has shows **Not in library**, with **Add to Component
Database** for people who can edit the catalog. A fitted part with no part
number shows **No MPN**.

**Costing** downloads a zip: the costing with the distributor and its part
number for each line, the costing split by distributor, a draft RoHS and REACH
declaration and the trade classification, each as a CSV. Prices are list
prices without VAT or shipping.

The page reads the BOM Prism stored for the project's default branch, never a
checked-out commit.

## Supply columns in the BOM

The Visualizer's **BOM** tab adds **Supply**, **Stock**, **Stores**, **Unit price**,
**Extended**, **Distributor** and **Lead time** columns, at the latest revision
only. Prices are for the project's usual build when it is tracked, otherwise
for one board, and each unit price shows the quantity it is for
(**€0.93 @ 100**). **Distributor** is where that price and stock come from,
not the BOM's own **Vendor** field. **Supply columns** above the table keeps
just Reference, part number, Qty and the supply columns, so they fit without
scrolling sideways; your browser remembers the choice. A line
whose symbol has a **Prism ID** takes its component's part; other lines are
matched by manufacturer and part number. Choose **Show part details** on a row
for the full picture, **Watch this part**, or **Add to Component Database**
for a line the library doesn't have.

## Supply in Release Studio

From the outputs stage, Release Studio shows the supply health of the BOM the
release build exported, with the parts to look at. It checks the parts the
build shipped with, as the exported BOM names them, even if a library component
has since moved to another part; a component's approved alternates count only
while the shipped part is still that component's part. It informs the release
and never blocks it. At publish you can choose **Attach the compliance draft (RoHS
and REACH, a working document) to the release**. Prism records what supply
said at publish with the release; that record never changes.

## Act on ending parts

When a library component's part is ending (last time buy, obsolete, or dropped
by every distributor), the Dashboard lists it with the reasons, the last buy
date, the stock and the projects that use it. A QA reviewer or administrator
decides:

- **Not for new designs**: the component is marked, and designers see the mark
  on its **Supply** tab and in the catalog.
- **Retire**: the component is archived in the catalog, so KiCad users can no
  longer place it.
- **Dismiss**: the component is hidden until its part gets a new reason.
  A designer can choose **Ask QA to dismiss**; it waits in **To approve**.

A QA reviewer or administrator can remove a mark with **Clear mark** on the
component's **Supply** tab.

## Work items

A work item records a decision about a component or a part before anyone acts
on it: what is proposed (investigate, find an alternate, not for new designs,
retire, replace, last time buy), who owns it, the evidence, and when to look
again. Open one with the clipboard button on an ending component or on a
part's sheet. Prism keeps the projects that used the part when the item was
opened, so the record still names them after the BOMs change.

**Supply → Review → Work items** lists them: **Open**, **Mine**,
**Due** (the recheck date has come), **Done** and **Rejected**. Designers, QA
and administrators open items and add notes; QA and administrators accept,
reject or reopen them; the owner, whoever opened it or QA marks one done. An
item's sheet shows its evidence and its history. A work item changes nothing
by itself: retiring or marking the component still happens where it always
does. **Review → Work items** lists the ones due a recheck and the ones you
own.

## Alerts

A watched part raises an alert on the Dashboard when it runs out, falls to its
threshold, may run out within eight weeks at the recent rate, rises 20% or more
in price over 30 days, changes lifecycle, gets a new datasheet, has a change
notice announcing its end, or is dropped by every distributor. A condition
must hold on two reads at least 30 minutes apart. Acknowledge or snooze an
alert; it clears by itself once the condition ends. Prism sends no email or
chat messages.

The bell on a watched part opens its alert rules: which alerts it raises, its
stock threshold (typed beside **At or below the threshold**), the price rise
that counts and a target price. Switching an alert off is for QA and
administrators; a designer's request waits in **To approve** and the alert
still rises until it is approved. The Dashboard lists the open alerts, the ones the **Open alerts**
tile counts; **Show cleared** adds the acknowledged, snoozed and resolved ones.

Ending components and the alert list sit below the tiles, folded. While the
stores feed or a distributor connector can't be read, the figures may be out
of date until it reads again; **Supply → Sources** shows which.

Prices and stock from the Simulated market, a made-up distributor for demos
and testing, carry a **Test data** chip wherever they show. **Ask DigiKey for
substitutes** appears only while a DigiKey connector is on.

Every Dashboard count opens a list with exactly that many parts: a cell of the
risk grid opens the parts with that lifecycle and that many distributors. A
tracked project's row shows the boards and the cost per board its own page
shows, for its usual build, and reads **Unconfirmed** while a BOM line is
unchecked.

## Review what Prism could not settle

**Supply → Review** lists what needs a person:

- **Work items**: decisions people opened about components and parts.
- **To approve**: alternates, waivers, dismissals and alerts to switch off,
  waiting for QA.
- **Manufacturer spellings**: maker names the distributors don't settle.
- **Listings waiting**: distributor listings filed under another number.
- **Unmatched local stock**: inventory parts with stock that match no library
  component. **Link** ties one to a component after showing both side by side;
  when neither the MPN nor the SAP code agrees, the button reads **Link
  anyway**. A linked part stays listed under **Linked** until the next read
  brings its stock to the component. **Add** creates the component.

  The chips sort the list: **Waiting** (and each reason it waits:
  **No component**, **SAP code on several components**, **MPN on several
  components**), **Linked** and **Ignored**, each with its count across
  every source. Search finds parts by IPN, MPN, maker or name, 50 at a time.
  To set aside stock that will never be a library component, such as
  consumables, tick the rows (or every row shown) and choose **Ignore**; Prism
  asks before it changes anything. Ignored parts stay aside across reads and
  don't count as waiting. Bring them back from **Ignored** with **Restore**.

## Ask an assistant

An assistant connected over [MCP](/KiCAD-Prism/automate/mcp/) can read a
project's or a component's supply, look for alternatives, watch a component
and ask for one fresh read. Proposing and approving alternates, waivers and
connectors stay with people.
