/**
 * Keyboard shortcut plumbing shared by the command palette, the library grids,
 * and the project visualizer.
 *
 * Two rules hold everywhere:
 *
 *  - "mod" is Command on Apple platforms and Control elsewhere, so a binding is
 *    written once and reads correctly on both.
 *  - modifiers must match exactly. A binding for "1" must not fire for Cmd+1,
 *    which the browser owns for tab switching.
 */

export const IS_APPLE_PLATFORM =
  typeof navigator !== "undefined" && /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);

export interface ParsedShortcut {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

export function parseShortcut(combo: string): ParsedShortcut {
  const parts = combo.toLowerCase().split("+").map((part) => part.trim()).filter(Boolean);
  const parsed: ParsedShortcut = { key: "", mod: false, shift: false, alt: false };
  for (const part of parts) {
    if (part === "mod") parsed.mod = true;
    else if (part === "shift") parsed.shift = true;
    else if (part === "alt" || part === "option") parsed.alt = true;
    else parsed.key = part;
  }
  return parsed;
}

/**
 * `event.key` is layout- and modifier-sensitive: Alt+Backspace reports
 * "Backspace" but Shift+/ reports "?" rather than "/". Normalising both the
 * printed key and the physical code lets a binding match either spelling.
 */
function eventKeyAliases(event: KeyboardEvent): string[] {
  const aliases = new Set<string>();
  if (event.key) aliases.add(event.key.toLowerCase());
  if (event.code?.startsWith("Digit")) aliases.add(event.code.slice(5));
  if (event.code?.startsWith("Key")) aliases.add(event.code.slice(3).toLowerCase());
  if (event.code === "Slash") aliases.add("/");
  if (event.code === "Backslash") aliases.add("\\");
  return [...aliases];
}

export function matchesShortcut(event: KeyboardEvent, shortcut: ParsedShortcut): boolean {
  const mod = IS_APPLE_PLATFORM ? event.metaKey : event.ctrlKey;
  const otherMod = IS_APPLE_PLATFORM ? event.ctrlKey : event.metaKey;
  if (mod !== shortcut.mod) return false;
  if (otherMod) return false;
  if (event.shiftKey !== shortcut.shift) return false;
  if (event.altKey !== shortcut.alt) return false;
  return eventKeyAliases(event).includes(shortcut.key);
}

/** True when the event target is a field the user is typing into. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  // Checkboxes and radios are "inputs" but typing into them is not a thing, so
  // single-key shortcuts should still work while one has focus.
  const type = (target as HTMLInputElement).type;
  return type !== "checkbox" && type !== "radio" && type !== "button" && type !== "submit";
}

const SYMBOLS: Record<string, string> = {
  mod: IS_APPLE_PLATFORM ? "⌘" : "Ctrl",
  shift: "⇧",
  alt: IS_APPLE_PLATFORM ? "⌥" : "Alt",
  escape: "Esc",
  enter: "↵",
  backspace: "⌫",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
};

/** Render "mod+shift+z" as the key caps a user would look for on their keyboard. */
export function shortcutKeys(combo: string): string[] {
  return combo
    .toLowerCase()
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => SYMBOLS[part] ?? (part.length === 1 ? part.toUpperCase() : part));
}

export interface ShortcutDoc {
  combo?: string;
  keys?: string[];
  description: string;
}

export interface ShortcutGroupDoc {
  title: string;
  hint?: string;
  shortcuts: ShortcutDoc[];
}

/**
 * The canonical list rendered by the "?" sheet. Every entry here is wired up
 * somewhere in the app — the sheet is documentation, not a wish list.
 */
export const SHORTCUT_REFERENCE: ShortcutGroupDoc[] = [
  {
    title: "Anywhere",
    shortcuts: [
      { combo: "mod+k", description: "Open the command palette" },
      { combo: "/", description: "Jump to the search box on this screen" },
      { combo: "shift+/", description: "Show this shortcut reference" },
      { combo: "escape", description: "Close the open panel, dialog, or selection" },
    ],
  },
  {
    title: "Library grids",
    hint: "Import Centre remediation and the catalog table",
    shortcuts: [
      { combo: "mod+s", description: "Save pending edits" },
      { combo: "mod+z", description: "Undo the last edit" },
      { combo: "mod+shift+z", description: "Redo" },
    ],
  },
  {
    title: "Project viewer",
    shortcuts: [
      { keys: ["1", "–", "6"], description: "Switch between Schematic, PCB, 3D, BOM, Stackup, Assembly" },
      { keys: ["/", "–", ...shortcutKeys("mod+f")], description: "Find component or net" },
      { combo: "c", description: "Comment on the current selection" },
      { keys: ["[", "]"], description: "Previous / next schematic page" },
      { combo: "alt+backspace", description: "Go up to the parent sheet" },
      { combo: "escape", description: "Clear selection, comment mode, and side panels" },
    ],
  },
  {
    title: "Dialogs",
    shortcuts: [
      { combo: "mod+enter", description: "Submit a create, rename, move, or import dialog" },
      { description: "Delete and Archive commit only after a press-and-hold — a click alone does nothing", keys: ["Hold"] },
    ],
  },
];
