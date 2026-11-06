---
title: Supply workflows
description: The work of a component engineer and of a supply chain team in Supply, step by step, from importing parts and tracking projects to checking a build and deciding what to buy first.
sidebar:
  order: 9.2
---

This page has two guides. Pick the one that matches your job:

- [As a component engineer](#as-a-component-engineer): you own the parts. You
  decide what goes into the Component Database, which alternates are allowed,
  and what happens when a part starts to disappear.
- [As a supply chain team](#as-a-supply-chain-team): you plan builds and buy
  parts. You want to know whether a build can go ahead, what it costs and what
  to buy first.

You need the **Designer**, **QA** or **Admin** role to open Supply. Designers and QA track
projects, parts and components, and choose packaging. Designers import
components and propose alternates; QA and administrators approve alternates,
waivers and dismissals and decide what happens to ending parts (see
[Supply Roles](/KiCAD-Prism/use/supply/#supply-roles) for the full list). An
administrator has to connect at least one distributor first, as described in
[Connect distributors and inventory](/KiCAD-Prism/admin/supply/). Prism never
buys anything: there are no carts and no orders.

The screens themselves are described in [Track supply](/KiCAD-Prism/use/supply/)
and [Supply for a part](/KiCAD-Prism/use/supply-components/), and the numbers in
[How supply figures are worked out](/KiCAD-Prism/use/supply-figures/).

## As a component engineer

The steps follow the order you'll meet them in.

### 1. Get the parts into the Component Database

Supply only follows parts that a library component names. A BOM line whose part
isn't in the Component Database shows **Not in library** and is never read on a
schedule. So the first job on a new board is importing its components, which
needs the **Designer** or **Admin** role.

1. Open **Library Manager → Import Center**.
2. Under **Project**, choose the board, or **All projects** to scan every
   project at once.
3. Choose **Scan**.
4. When the scan finishes, open the session. Each row is one part, however
   many times the board places it. Rows that can be imported as they are have
   a check mark; the others list what is missing.

A project import keeps the fields that describe the part and leaves out the
ones that describe a single placement (reference, sheet, **DNP** and BOM flags). A
part number kept as MPN or **Part Number** on the symbol moves into **Manufacturer
Part Number**, and a maker kept as **MFR** into **Manufacturer**.

Next, fill in what's missing in bulk. A component needs a value, manufacturer,
manufacturer part number, description and a datasheet link starting with
`http://` or `https://`. Boards drawn without that discipline miss some of it
on many rows, so fix them together:

1. Turn on **Only rows that need attention**.
2. Either edit in the grid (select rows, type a value and use **Fill this value
   down into selected rows**), or choose **Export CSV**, fill the columns in a
   spreadsheet and bring the file back with **Import CSV**.
3. Choose **Save edits** (`⌘S`). The fixes are kept with the session, so a long
   import survives a reload.
4. Accept with **Selected** (the rows you picked) or **All ready**. Each
   accepted row becomes a draft component.

An assistant connected over [MCP](/KiCAD-Prism/automate/mcp/) can do step 2 for
you: it reads the session and saves its fixes as drafts. Accepting stays with a
person, so you review what it filled in before anything enters the library.

### 2. Track the projects that matter

Tracking a project reads every part of its BOM every day and keeps the history.

1. Open the project and choose **Supply**.
2. Choose **Track this project**.
3. Pick the designs to follow, the distributors you buy from (**Bought from**), the
   packaging you prefer, the **Usual build, in boards** and the spares.
4. Check the daily call limit. Each distributor's bar shows what tracking adds
   to its day. Parts that don't fit are **Queued for calls**: they're read with
   calls nothing else needs, and join the schedule when room frees up.
5. Choose **Track (N)**. If some lines name a part number that several makers
   use, **Next** first asks you to pick the maker for each.

Prism then searches each distributor for the parts. A new BOM revision is
picked up within 15 minutes; parts it adds are tracked, and parts it removes
stop being tracked unless something else keeps them.

A project whose BOM Prism hasn't read yet shows **Not read**. Choose **Read now**.
The first read of a large board can take a few minutes while its design index
is built. A project with a board and no schematic shows **No schematic**
instead: Prism reads the BOM from the schematic, so there is nothing to read.

### 3. Watch parts that aren't on a tracked project

Some parts matter before any board uses them, like a new standard part or a
single source you're worried about.

- On a library component's **Supply** tab, choose **Watch component**, and under
  **Count stock of** choose whether to count every packaging or just one. A
  component whose part Prism doesn't read yet offers **Watch this part**.
- In **Supply → Tracking**, choose **Track a part**, enter the part number
  (and the maker if you know it), optionally a level under **Warn when stock is
  at or below**, and choose **Watch part**. The number has to belong to a library component.
- In **Library Manager → Catalog**, track many components at once with
  **Track these** (see
  [Find components by supply in the catalog](/KiCAD-Prism/use/supply-components/#find-components-by-supply-in-the-catalog)).

The
<svg xmlns="http://www.w3.org/2000/svg" width="1.1em" height="1.1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="How often this part is read" style="display:inline;margin:0;vertical-align:-0.2em"><path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="10"/></svg> on its sheet shows the tier and why, and
lets you change it (see
[Read schedule](/KiCAD-Prism/use/supply-components/#read-schedule)).

### 4. Start the day on the Dashboard

Open **Supply → Dashboard** and work down it. Start with the ending components
(step 6). In **Risk Distribution**, the cells that matter most are ending parts
held by one distributor or none. Then check **Deadlines**, **Projected stock** and the
open alerts. The [Dashboard](/KiCAD-Prism/use/supply/#dashboard) section
explains each part of it.

### 5. Look into a part

Any part row opens the part's sheet. Read it top to bottom:

- **In stock**: the total distributor stock, its history per distributor and the
  trend. **Read now** asks every distributor again, once every 15 minutes per
  part.
- **Price**: the price at the part's price quantity and its history. Use the
  <svg xmlns="http://www.w3.org/2000/svg" width="1.1em" height="1.1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Change the price quantity" style="display:inline;margin:0;vertical-align:-0.2em"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg> to change the quantity it's priced at.
- Then **Forecast**, **Outlook**, **Product change notices**, **Listings**,
  **Alternatives** and **Compliance**, all described in
  [The part's sections](/KiCAD-Prism/use/supply-components/#the-parts-sections).

The <svg xmlns="http://www.w3.org/2000/svg" width="1.1em" height="1.1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Alert rules for this part" style="display:inline;margin:0;vertical-align:-0.2em"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></svg> sets the part's
[alert rules](/KiCAD-Prism/use/supply-components/#alert-rules). If a finding is
acceptable, such as a single source you've agreed to live with,
[waive it](/KiCAD-Prism/use/supply-components/#waive-a-finding).

### 6. Act on ending parts

When a component's part is ending, decide what happens to the component: **Not
for new designs**, **Retire** or **Dismiss**. What each choice does, and who can make it,
is covered in [Ending components](/KiCAD-Prism/use/supply/#ending-components).
If the decision needs work first, open a
[work item](/KiCAD-Prism/use/supply/#work-items) with the <svg xmlns="http://www.w3.org/2000/svg" width="1.1em" height="1.1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Work item" style="display:inline;margin:0;vertical-align:-0.2em"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg> on
the ending row (QA and administrators) or on the part's sheet (anyone in
Supply).

### 7. Approve alternates

An alternate is another manufacturer part a component may be built with. Its
stock and offers count wherever the main part's do, but only once QA approves
it. Propose one under **Parts** on the component's **Supply** tab; a QA reviewer or
administrator approves or rejects it on the same row, or in **Supply → Review →
To approve**. When the component's part number changes, approved alternates go
back to waiting. See
[Parts and alternates](/KiCAD-Prism/use/supply-components/#parts-and-alternates),
and [Alternatives](/KiCAD-Prism/use/supply-components/#alternatives) for how
candidates are graded.

### 8. Clear the review queue

Work through **Supply → Review** every week. The [Review](/KiCAD-Prism/use/supply/#review)
section lists what each queue holds and who decides.

## As a supply chain team

Everything here, including tracking a project and choosing a packaging, is open
to designers, QA and administrators. The decisions that need QA or an
administrator are listed in [Supply Roles](/KiCAD-Prism/use/supply/#supply-roles).

### Can this build go ahead, and what does it cost?

Open the project and choose **Supply**. The tiles answer for the build size
shown: how many boards the stock covers and the line that limits it, what the
build and one board cost, the health score and the stock coverage. To check
another build size, use the <svg xmlns="http://www.w3.org/2000/svg" width="1.1em" height="1.1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Change the number of boards" style="display:inline;margin:0;vertical-align:-0.2em"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg> on **Build**. The
[project's Supply tab](/KiCAD-Prism/use/supply/#check-whether-a-project-can-be-built)
section covers the usual build, costing, charts and releases, and the rules are
in [Can the project be built](/KiCAD-Prism/use/supply-figures/#can-the-project-be-built)
and [What it costs](/KiCAD-Prism/use/supply-figures/#what-it-costs).

**Costing** on the project's **Supply** tab downloads the per-distributor files for
purchasing. **Supply → Projects** lists every project with its cost per board
and the boards it can build.

To check a BOM file that isn't a project, such as a customer's BOM or a quote,
use **Supply → Tracking → Upload BOM**; it saves nothing (see
[Check a BOM file that isn't a project](/KiCAD-Prism/use/supply/#check-a-bom-file-that-isnt-a-project)).
**Check once** on a project's **BOM** tab, and in the release supply check, reads
the parts nobody reads yet a single time, without tracking them (see
[Supply columns in the BOM](/KiCAD-Prism/use/supply/#supply-columns-in-the-bom)).

### What should we buy first?

- **Dashboard → Deadlines**: last-time-buy and last-ship dates in the next
  year, in red within 90 days.
- **Dashboard → Projected stock**: parts that are out, or run out within two
  weeks at the recent rate.
- **Insights → Stock risk → Stock left against lead time**: each dot is a part,
  and a dot above the line runs out before an order placed today would arrive.
- **Tracking**, sorted by **Runs out first**.

**Insights → Export** downloads every tracked part with its risk figures
(status, lifecycle, outlook, stock, distributors holding it, days to zero, lead
time, chance it is out in four weeks, price change and findings) as a CSV, for
planning outside Prism.

### Watch lead times, prices and distributors

Open **Supply → Insights** once a week. **Sourcing** shows how many parts depend on
one distributor, **Lead times and prices** the biggest moves of the last 30 days,
and **Market** whether a maker or a category is getting harder to buy. Each section
is described under [Insights](/KiCAD-Prism/use/supply/#insights).

To compare a release with today, see
[Supply in Release Studio](/KiCAD-Prism/use/supply/#supply-in-release-studio);
to be warned when things change, see
[Alerts](/KiCAD-Prism/use/supply/#alerts).

### Distributor call limits

When **Queued for calls** on the Dashboard is above zero, tracking is asking for
more calls than the distributors allow in a day. Pick one packaging per
distributor so fewer listings are read, or ask an administrator to raise a
connector's budget (see
[How often a part is read](/KiCAD-Prism/use/supply/#how-often-a-part-is-read)).
