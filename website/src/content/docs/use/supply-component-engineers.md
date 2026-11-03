---
title: Supply for component engineers
description: Bring a board's parts into the Component Database, track the projects that use them, and keep the library clear of parts that are ending or hard to buy.
sidebar:
  order: 9.1
---

This guide is for the person who owns the parts: who decides what goes into the
Component Database, which alternates are allowed, and what happens when a part
starts to disappear. It walks through the work in the order you meet it.
[Track supply](/KiCAD-Prism/use/supply/) is the reference for each screen, and
[How supply figures are worked out](/KiCAD-Prism/use/supply-figures/) explains
the numbers.

You need the **Designer**, **QA** or **Admin** role. Designers and QA track
projects, parts and components. Designers import components and propose
alternates; QA and administrators approve alternates, waivers and dismissals
and decide what happens to ending parts. The full list is in
[Who can do what](/KiCAD-Prism/use/supply/#who-can-do-what). An administrator
must first connect at least one distributor (see
[Connect distributors and inventory](/KiCAD-Prism/admin/supply/)).

## 1. Get the parts into the Component Database

Supply follows only parts that a library component names. A BOM line whose part
is not in the Component Database shows **Not in library** and is never read
on a schedule. So the first job on a new board is importing its components,
which needs the **Designer** or **Admin** role.

1. Open **Library Manager → Import Center**.
2. Choose the board in **Project** and choose **Scan**. **All projects** scans
   every project at once.
3. When the scan finishes, open the session. Each row is one part, however
   many times the board places it. Rows that can be imported as they are carry
   a check mark; the others list what is missing.

A project import keeps the fields that describe the part and leaves out those
that describe one placement on the board (reference, sheet, DNP and BOM
flags). A part number kept as **MPN** or **Part Number** on the symbol is moved
into **Manufacturer Part Number**, and a maker kept as **MFR** into
**Manufacturer**.

### Fill what is missing, in bulk

A component needs a value, manufacturer, manufacturer part number, description
and a datasheet link starting with `http://` or `https://`. Boards drawn without
that discipline miss some of it on many rows. Fix them together:

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
person, so you review what it filled before anything enters the library.

## 2. Track the projects that matter

Tracking a project reads every part of its BOM every day and keeps the history.

1. Open the project and choose **Supply**.
2. Choose **Track this project**.
3. Choose the designs to follow, the distributors you buy from (**Bought
   from**), the **Packaging** you prefer, the **Usual build, in boards** and the
   **Spares**.
4. Check **Daily call limit**. Each distributor's bar shows what tracking adds
   to its day. Parts that don't fit are **Queued for calls**: they are read with
   calls nothing else needs and join the schedule when room frees up.
5. Choose **Track (N)**. If some lines name a part number that several makers
   use, **Next** first asks you to pick the maker for each.

Prism then searches each distributor for the parts. A new BOM revision is
picked up within 15 minutes; parts it adds are tracked, and parts it removes
stop being tracked unless something else keeps them.

A project whose BOM Prism has not read shows **Not read**. Choose **Read now**;
the first read of a large board can take a few minutes while its design index
is built.
A project with a board and no schematic shows **No schematic** instead:
Prism reads the BOM from the schematic, so there is nothing to read.

## 3. Watch parts that aren't on a tracked project

Some parts matter before any board uses them: a new standard part, a single
source you're worried about.

- On a library component's **Supply** tab, choose **Watch component**. Choose
  whether to count every packaging or only one in **Count stock of**. A
  component whose part Prism doesn't read yet offers **Watch this part**.
- In **Supply → Tracking**, choose **Track a part**, enter the part number
  (and the maker if you know it), optionally **Warn when stock is at or
  below** a threshold, and choose **Watch part**. The number must belong to a
  library component.
- In **Library Manager → Catalog**, narrow the list with **Tracked**, **At
  risk** or **In local stock** and choose **Track these** (or ctrl-click rows
  and **Track N picked**) to track many at once, **Weekly**, **Monthly** or
  **Daily**.

A part is read at tier 1 (daily) or tier 2 (weekly or monthly). The clock on a
part's sheet shows its tier and why, and lets you change it.

## 4. Start the day on the Dashboard

**Supply → Dashboard** shows what needs a person, top to bottom:

- The tiles: **Tracked**, **At risk**, **Out of stock**, **End of life**,
  **Open alerts**, **Queued for calls**, and **Likely out in 4 weeks** once the
  forecast has a record. Each opens the list of exactly those parts.
- **N library components' parts are ending** (folded): the components whose
  part is not recommended for new designs, at last time buy, obsolete, dropped
  by every distributor, or whose outlook is **Ended** or **Ending**. Only
  components nobody has decided about yet are listed. See step 6.
- **Risk Distribution**: lifecycle against how many distributors hold stock
  (**2+ distributors**, **One**, **Out**, **Not read**). The cells that matter
  most are ending parts held by one distributor or none.
- **Deadlines**: last-time-buy and last-ship dates in the next year.
- **Projected stock**: parts by how soon they run out at the recent rate.
- **Tracked projects**: each project's parts at risk, how many boards the
  stock covers and its cost per board.
- **Alerts** (folded), then **Recent changes** of the last two weeks: new BOM
  revisions, alerts opened and cleared, listings dropped and lifecycle
  changes.

## 5. Look into a part

Any part row opens the part's sheet. Read it top to bottom:

- **In stock**: total distributor stock, its history per distributor and the
  trend. **Read now** asks every distributor again (once every 15 minutes per
  part; designers, QA and administrators).
- **Price**: the price at the part's price quantity, its history, and the
  pencil to change the quantity it is priced at.
- **Forecast** (folded), once the part has one.
- **Outlook**: whether the part is heading for its end (**Ended**,
  **Ending**, **Warning signs**, **No signs of an end**, **Not enough to
  say**), with every signal and date behind it, and the health score with each
  finding.
- **Product change notices**, **Listings** (each distributor's products for
  the part), **Alternatives**, **Compliance** (RoHS, REACH, export control).

The bell sets the part's alert rules: which alerts it raises, its stock
threshold, the price rise and the chance of running out that count, and a
target price. Switching an alert off is for QA and administrators; a
designer's request waits in **Supply → Review → To approve**.

### Waive a finding

When a finding is acceptable, such as a single source you've agreed to live
with, choose **Waive** beside it under **Outlook** and give the reason. A QA
reviewer's or administrator's waiver stands at once. For a designer the form's
button reads **Ask QA**: the waiver waits in **To approve**, and you can
**Withdraw** it until it is decided. QA and administrators can **Revoke** any waiver.
A waiver tied to an earlier condition no longer holds; choose **Waive again**.

## 6. Act on ending parts

When a library component's part is ending, the Dashboard lists it with the
reasons, the last buy date, its stock and the projects that use it. When the
ending part is one of the component's approved alternates, the row says
**Alternate**, and it says how many of the component's other parts are
healthy. A QA reviewer or administrator decides:

- **Not for new designs**: the component stays released and keeps working
  where it is placed, but it is marked on its **Supply** tab and in the
  catalog so nobody picks it for a new design. **Clear mark** on the
  **Supply** tab removes it.
- **Retire**: the component is archived and leaves the KiCad library.
  Symbols already placed stop resolving. Offered only when none of the
  component's other approved parts is healthy, and only where the catalog
  workflow lets your role archive the component from its stage: QA cannot
  archive a released component, so an administrator retires those.
- **Dismiss**: hide it until its part gains a new reason. A designer sees
  **Ask QA to dismiss** instead; the request waits in
  **Supply → Review → To approve**.

Before retiring, give designers a way forward: propose an alternate (below) or
a replacement component.

When the decision needs work first, open a work item from the clipboard
button on the ending row (QA and administrators) or on the part's sheet
(anyone in Supply): give it a **Title** and an **Action**, name the **Owner**,
add the **Evidence** (the notice, the distributor's answer) and set **Recheck
on**. **Supply → Review → Work items** lists them as **Open**, **Mine**,
**Due**, **Done** and **Rejected**; QA and administrators **Accept** or
**Reject** them. See [Work items](/KiCAD-Prism/use/supply/#work-items).

## 7. Approve alternates

An alternate is another manufacturer part a component may be built with. Its
stock and offers count wherever the main part's do, but only once QA approves
it.

1. On the component's **Supply** tab, under **Parts**, enter the
   **Manufacturer** and **Part number** and choose **Propose alternate**.
2. A QA reviewer or administrator approves or rejects it on the same row, or
   in **Supply → Review → To approve**, which lists everything waiting.

Approval is for the component's main part at the time. When the component's
part number changes in the library, its approved alternates go back to
waiting. **To approve** then shows the alternate against the new main part and
the part it was last reviewed against (**was vs**), so QA checks it again. A
decision made on a screen from before the main part changed is refused. When
BOM lines naming two components resolve to the same part, only alternates both
components approved count for it.

Under **Alternatives** on a part's sheet, **Find alternatives** lists
candidates with the same value from the parts Prism already holds, graded by
what distributors list:

- **Ratings met**: every rating the part lists is listed for the candidate and
  is the same or better, in the same package.
- **Similar · N ratings unknown**: the candidate doesn't list some of the
  part's ratings, so they can't be judged.
- **Same value, other package**: the board would have to change.
- **Fails a rating**: a rating is worse, such as a lower voltage. Listed last.

With a DigiKey connector on, **Ask DigiKey for substitutes** adds DigiKey's
own suggestions.

No grade says two parts are interchangeable. Prism doesn't compare footprints,
pins or operating conditions: check those before you propose one.

## 8. Clear the review queue

**Supply → Review** collects what Prism could not settle alone. Work through
it weekly; an unsettled spelling or listing means a part's stock isn't counted.

- **Needs a choice**: parts several makers sell under one number. Anyone in
  Supply picks the maker.
- **To approve**: alternates, waivers, dismissals and alerts to switch off.
- **Pinned under another number**, **Manufacturer spellings** and **Listings
  waiting**: distributor listings and maker names to confirm. QA and
  administrators decide.
- **Several listings at a distributor**: pick the packaging Prism reads.
- **Matched by Prism**: what Prism settled by itself. QA keeps each match
  with **Accept**, or all of them with **Accept all**, and undoes a wrong one.
- **Work items**, then **Unmatched local stock**: inventory parts that match
  no library component, for QA and administrators to link or set aside.
