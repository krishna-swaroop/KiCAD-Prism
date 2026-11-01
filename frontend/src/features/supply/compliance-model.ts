type Variant = "outline" | "warning" | "destructive";

const BADGES: Record<string, { label: string; variant: Variant }> = {
  compliant: { label: "Compliant", variant: "outline" },
  clear: { label: "Not affected", variant: "outline" },
  not_compliant: { label: "Not compliant", variant: "destructive" },
  not_applicable: { label: "Not applicable", variant: "outline" },
  affected: { label: "Affected", variant: "warning" },
  disputed: { label: "Disputed", variant: "warning" },
  unknown: { label: "Unknown", variant: "outline" },
};

/** The badge for a RoHS or REACH state. An unknown state is shown as unknown, never as clear. */
export function complianceBadge(state: string): { label: string; variant: Variant } {
  return BADGES[state] ?? BADGES.unknown;
}
