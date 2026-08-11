import type { LucideIcon } from "lucide-react";

export interface PaletteCommand {
  id: string;
  label: string;
  group: string;
  run: () => void;
  /** Extra text the search should match but the row should not show. */
  keywords?: string;
  /** Right-aligned hint, e.g. a folder name or a shortcut. */
  detail?: string;
  icon?: LucideIcon;
}

/**
 * Commands that only make sense while a particular screen is mounted.
 *
 * The palette lives at the app root so ⌘K works everywhere, but "Import
 * project" needs the workspace's dialog state. Rather than lifting that state
 * or firing untyped window events, screens publish their commands here while
 * they are mounted and withdraw them on unmount. The palette therefore never
 * offers an action that would do nothing.
 */

let registered: PaletteCommand[] = [];
const subscribers = new Set<() => void>();

function emit() {
  subscribers.forEach((notify) => notify());
}

export function registerPaletteCommands(commands: PaletteCommand[]): () => void {
  registered = [...registered, ...commands];
  emit();
  const ids = new Set(commands.map((command) => command.id));
  return () => {
    registered = registered.filter((command) => !ids.has(command.id));
    emit();
  };
}

export function getPaletteCommands(): PaletteCommand[] {
  return registered;
}

export function subscribeToPaletteCommands(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}
