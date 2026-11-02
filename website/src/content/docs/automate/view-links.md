---
title: Links to a view
description: Build a URL that opens Prism's viewer on exact components, nets, a sheet or a board region, and drive the view from page scripts.
sidebar:
  order: 7
---

A project link can open the viewer on exactly one view: chosen components selected, nets highlighted, a schematic sheet, or a board region. Use these links in issues, chat, review checklists or your own tools. Links in MCP results are built the same way.

## Build a link

Start from the project page with the viewer open:

```
https://prism.example.com/project/<project id>?section=visualizers
```

Then add any of these parameters:

| Parameter | Opens with |
| --- | --- |
| `tab=sch`, `tab=pcb` or `tab=3d` | the schematic, PCB or 3D viewer |
| `commit=<sha>` | that commit instead of the latest one |
| `sel=R1,U3` | those components selected (references or element uuids), the first one in view |
| `nets=GND,VBUS` | those board nets highlighted |
| `page=/Power/` | that schematic sheet |
| `bbox=10,20,30,15` | that board region in view: x, y, width and height in mm |
| `insets=1` | the inset panes open |

For example, this opens the PCB at one commit with U3 selected and the ground net highlighted:

```
https://prism.example.com/project/my-board?section=visualizers&tab=pcb&commit=3f1c2a9e0b7d4c6f8a5e2d1b9c0a7f6e5d4c3b2a&sel=U3&nets=GND
```

Pin `commit` in any link you store, so it keeps showing the same design after new commits arrive.

## Names with commas or special characters

Prism decodes `sel` and `nets` once as a query value, splits the result on commas, then decodes each item again. So an item is encoded twice: once on its own, and once more as part of the query string. Plain names such as `R1` or `GND` come out unchanged, so you only need this for names with commas, spaces or other special characters.

The simplest way is to encode each item, join the items with commas, and let a URL library encode the joined value. In JavaScript:

```js
const nets = ["GND", "Net-(R1,Pad2)"];
const params = new URLSearchParams({ section: "visualizers", tab: "pcb" });
params.set("nets", nets.map(encodeURIComponent).join(","));
const url = `https://prism.example.com/project/my-board?${params}`;
```

In Python:

```python
from urllib.parse import quote, urlencode

nets = ["GND", "Net-(R1,Pad2)"]
query = urlencode({
    "section": "visualizers",
    "tab": "pcb",
    "nets": ",".join(quote(name, safe="") for name in nets),
})
url = f"https://prism.example.com/project/my-board?{query}"
```

If you write a URL by hand, encode each item twice: a comma inside a name becomes `%252C`.

If any item can't be decoded, Prism ignores that whole parameter. A `bbox` that isn't four numbers with a positive width and height is ignored too.

## Script the view in the page

While a project page is open, `window.prism` lets a script on that page, such as a browser extension or the console, read and change the view.

| Member | Does |
| --- | --- |
| `version` | `"v1"` |
| `projectId` | the open project's id |
| `getState()` | the current view: `section`, `tab` and `commit` from the URL, and `sel`, `nets` and `insets` from the viewer when it can report them |
| `link(state)` | an absolute link to `state`; with no argument, a link to what is on screen now |
| `open(state)` | navigates to `state`; the browser's Back button returns to the previous view |

`state` uses the same names as the URL parameters, with lists as arrays and `bbox` as `[x, y, width, height]`:

```js
window.prism.getState();
```

```js
window.prism.link({ tab: "pcb", nets: ["GND"] });
```

```js
await window.prism.open({ tab: "pcb", sel: ["U3"], bbox: [10, 20, 30, 15] });
```

`window.prism` exists only while a project page is open.
