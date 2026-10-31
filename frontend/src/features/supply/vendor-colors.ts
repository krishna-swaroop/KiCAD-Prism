/**
 * One colour per distributor, so they can be told apart at a glance. Keyed by provider key (the connector's
 * provider, not its display name). A provider without a colour gets none.
 */
export const VENDOR_COLORS: Readonly<Record<string, string>> = {
  digikey: "#ff2100",
  mouser: "#0070bb",
  farnell: "#4eb661",
  lcsc: "#1166dd",
  tme: "#183884",
  avnet: "#f59e0b",
  arrow: "#e11d48",
  // Chosen, not JLCPCB's own: its blue is close to LCSC's.
  jlcpcb: "#7c3aed",
};

export function vendorColor(provider: string | null | undefined): string | null {
  return provider ? VENDOR_COLORS[provider.toLowerCase()] ?? null : null;
}
