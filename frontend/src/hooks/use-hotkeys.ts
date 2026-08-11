import { useEffect, useMemo, useRef } from "react";

import { isTypingTarget, matchesShortcut, parseShortcut } from "@/lib/shortcuts";

export interface HotkeyBinding {
  /** "mod+k", "shift+/", "alt+backspace", "1" — see lib/shortcuts. */
  combo: string;
  handler: (event: KeyboardEvent) => void;
  /** Fire even while a text field has focus. Off by default. */
  allowInInputs?: boolean;
  /** Leave the browser's own behaviour alone. Off by default. */
  allowDefault?: boolean;
}

export interface UseHotkeysOptions {
  enabled?: boolean;
  /**
   * Listen during capture so embedded canvases (the ecad-viewer custom element)
   * cannot swallow the key first.
   */
  capture?: boolean;
  /** Ignore keys while any Radix dialog is open. On by default. */
  ignoreWhenDialogOpen?: boolean;
}

function anyDialogOpen(): boolean {
  return Boolean(document.querySelector('[role="dialog"][data-state="open"]'));
}

/**
 * Bind keyboard shortcuts for the lifetime of a component.
 *
 * The handlers are held in a ref so a caller can pass inline closures without
 * tearing the listener down on every render.
 */
export function useHotkeys(bindings: HotkeyBinding[], options: UseHotkeysOptions = {}): void {
  const { enabled = true, capture = false, ignoreWhenDialogOpen = true } = options;
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  // Parsing is cheap but the combos are static, so key the memo on the combo
  // list rather than the handler identities.
  const combos = bindings.map((binding) => binding.combo).join("|");
  const parsed = useMemo(
    () => combos.split("|").filter(Boolean).map(parseShortcut),
    [combos],
  );

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (ignoreWhenDialogOpen && anyDialogOpen()) return;

      const typing = isTypingTarget(event.target);
      for (let index = 0; index < parsed.length; index += 1) {
        const binding = bindingsRef.current[index];
        if (!binding) continue;
        if (typing && !binding.allowInInputs) continue;
        if (!matchesShortcut(event, parsed[index])) continue;
        if (!binding.allowDefault) event.preventDefault();
        binding.handler(event);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown, capture);
    return () => window.removeEventListener("keydown", onKeyDown, capture);
  }, [enabled, capture, ignoreWhenDialogOpen, parsed]);
}
