/**
 * Bounded transfer-log buffer for the KiCad panel. The cap is small on
 * purpose: the terminal is a short diagnostic strip, not an archive.
 */
export const PANEL_LOG_LIMIT = 100;
const PANEL_LOG_ENTRY_MAX = 2_000;

export interface PanelLogBuffer {
  entries: string[];
  dropped: number;
}

export function emptyPanelLog(): PanelLogBuffer {
  return { entries: [], dropped: 0 };
}

export function redactPanelLogMessage(message: string): string {
  const redacted = message
    .replace(
      /"(token|access_token|api_token|authorization|data)"\s*:\s*"(?:\\.|[^"\\])*"/gi,
      (_match, key: string) => `"${key}":"[redacted]"`,
    )
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  if (redacted.length <= PANEL_LOG_ENTRY_MAX) return redacted;
  return `${redacted.slice(0, PANEL_LOG_ENTRY_MAX)}…`;
}

export function appendPanelLog(
  buffer: PanelLogBuffer,
  message: string,
  limit = PANEL_LOG_LIMIT,
): PanelLogBuffer {
  const entry = redactPanelLogMessage(message);
  if (buffer.entries.length < limit) {
    return { entries: [...buffer.entries, entry], dropped: buffer.dropped };
  }
  return {
    entries: [...buffer.entries.slice(1), entry],
    dropped: buffer.dropped + 1,
  };
}
