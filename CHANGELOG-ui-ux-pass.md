# UI/UX pass

Running list of the fixes on this branch. Each entry says what it looked like before and what it does now.

## Project page: cards no longer hide under the properties panel

Before: on the main project page, selecting a project slid the properties panel in from the right, on top of the grid. The rightmost cards ended up behind the panel and you couldn't see or click them without deselecting.

After: when the panel is open, the grid reserves that width on the right, and any cards that no longer fit wrap onto the next row. Cards keep their normal size instead of being squeezed thinner; the grid just shows fewer columns and grows taller. The column count now follows the available width (fixed card width, as many columns as fit) rather than being pinned per screen size, so opening the panel drops a column and reflows the overflow down. Below the `md` breakpoint, where the panel would leave no room, the reflow is skipped and the panel overlays as before.
