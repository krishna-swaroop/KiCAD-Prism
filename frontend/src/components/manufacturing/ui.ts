// Shared styling for the manufacturing UI, kept compact and consistent.

// A native <select> styled to match the app: the browser chevron is removed
// (appearance-none) and replaced with an inline SVG on the right, so the arrow
// looks the same across browsers and never overlaps the text. Pair with a size
// class (h-8 / h-9). `pr-8` leaves room for the chevron.
export const SELECT_CLASS =
    "appearance-none rounded-md border bg-background bg-no-repeat pl-2 pr-8 text-sm " +
    "disabled:cursor-not-allowed disabled:opacity-60 " +
    "bg-[length:1rem] bg-[right_0.4rem_center] " +
    // Inline chevron (uses currentColor via stroke), muted.
    "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22M4 6l4 4 4-4%22/></svg>')]";

// Compact field spacing used throughout the spec form and dialogs.
export const FIELD_GAP = "space-y-1"; // was space-y-1.5
export const GROUP_GRID = "grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3"; // was gap-4
