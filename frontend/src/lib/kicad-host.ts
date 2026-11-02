/**
 * Whether this page runs inside KiCad's Remote Symbols webview.
 *
 * KiCad keeps every navigation in that webview (it handles external links
 * itself and loads a new-window link in place) and offers no command to open
 * the system browser. So the panel must not link anywhere outside itself, and
 * the web app must not run there. KiCad registers a script message handler
 * named "kicad"; the other two are how wxWidgets exposes handlers on Edge and
 * on older hosts.
 */
export function insideKiCad(win: Window = window): boolean {
  const w = win as unknown as Record<string, unknown>;
  const webkit = w.webkit as { messageHandlers?: Record<string, unknown> } | undefined;
  if (webkit?.messageHandlers?.kicad) return true;
  const chrome = w.chrome as { webview?: { postMessage?: unknown } } | undefined;
  if (typeof chrome?.webview?.postMessage === "function") return true;
  const external = w.external as { invoke?: unknown } | undefined;
  return typeof external?.invoke === "function";
}

/** The Remote Symbols panel, where the web app sends KiCad's webview back to. */
export const PANEL_PATH = "/remote-provider/panel";

/** Copies text, falling back to a hidden field where the async clipboard is refused (older webviews). */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Fall through to the selection copy below.
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Copy failed");
}
