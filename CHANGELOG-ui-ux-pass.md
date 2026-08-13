# UI/UX pass

Running list of the fixes on this branch. Each entry says what it looked like before and what it does now.

## Project page: cards no longer hide under the properties panel

Before: on the main project page, selecting a project slid the properties panel in from the right, on top of the grid. The rightmost cards ended up behind the panel and you couldn't see or click them without deselecting.

After: when the panel is open, the grid reserves that width on the right and the cards reflow to the left, so every card stays fully visible next to the panel. The shift is animated so cards glide over rather than jump. On narrow screens (below the `md` breakpoint, where the panel would leave no room for cards) the reflow is skipped and the panel overlays as before.
