import type { SemanticComponent } from "@/types/prism-selection";
import type { BomLineInput, SupplyBomLineResult, SupplyStatus } from "@/types/supply";

/**
 * Field names KiCad projects use for the manufacturer and the manufacturer part number, best
 * first, compared ignoring case. When a part carries several, the earliest in the list wins, so an
 * explicit "Manufacturer Part Number" beats a looser "PartNumber". Plan 6.4 moves this list to one
 * backend contract; until then the supply columns read their fields through here.
 *
 * Found in real projects: satnogs-comms uses "Mnf." and "PartNumber"; others use "MPN" or "Mfr. No.".
 * "Vendor Part Number" is a distributor's number, not the manufacturer's, and is deliberately absent.
 */
const MANUFACTURER_FIELDS: readonly string[] = [
  "manufacturer", "manufacturer name", "manufacturer_name", "mfr", "mfr.", "mfg", "mnf", "mnf.", "make", "brand",
];
const MPN_FIELDS: readonly string[] = [
  "manufacturer part number", "manufacturer_part_number", "mpn", "mfr. no.", "mfr no", "mfr part number",
  "mfg part number", "manufacturer pn", "mfr pn", "mnf part number", "partnumber", "part number", "part_number",
];
/** Fields that carry an LCSC number. "Supplier Part" counts when "Supplier" says LCSC, as EasyEDA writes it. */
const LCSC_FIELDS: readonly string[] = [
  "lcsc", "lcsc part", "lcsc part #", "lcsc part number", "lcsc part no.", "lcsc pn", "lcsc#", "lcsc #", "lcsc_part",
  "lcsc number", "lcsc no.",
];
const SUPPLIER_FIELDS: ReadonlyArray<readonly [string, string]> = [["supplier", "supplier part"], ["vendor", "vendor part number"]];
const LCSC_NUMBER = /^C\d{1,12}$/;

/** The columns the supply data adds to the BOM table, in the order they appear. */
export const BOM_SUPPLY_COLUMNS = ["Supply", "Stock", "Stores", "Unit price", "Extended", "Distributor", "Lead time"] as const;

export function isSupplyColumn(column: string): boolean {
  return (BOM_SUPPLY_COLUMNS as readonly string[]).includes(column);
}

const SEPARATOR = " | ";

function fieldText(component: SemanticComponent, names: readonly string[]): string {
  const byName = new Map<string, string>();
  for (const [key, raw] of Object.entries(component.fields ?? {})) {
    const text = raw === null || raw === undefined ? "" : String(raw).trim();
    const name = key.trim().toLowerCase();
    if (text && !byName.has(name)) byName.set(name, text);
  }
  for (const name of names) {
    const found = byName.get(name);
    if (found) return found;
  }
  return "";
}

export interface PartIdentity {
  manufacturer: string;
  mpn: string;
}

export function identityOf(component: SemanticComponent): PartIdentity {
  return { manufacturer: fieldText(component, MANUFACTURER_FIELDS), mpn: fieldText(component, MPN_FIELDS) };
}

/** The LCSC number a symbol carries, upper-cased, or "" when it has none that looks like one. */
export function lcscOf(component: SemanticComponent): string {
  let found = fieldText(component, LCSC_FIELDS);
  if (!found) {
    const supplier = SUPPLIER_FIELDS.find(([name]) => fieldText(component, [name]).toLowerCase() === "lcsc");
    if (supplier) found = fieldText(component, [supplier[1]]);
  }
  const number = found.trim().toUpperCase();
  return LCSC_NUMBER.test(number) ? number : "";
}

/** A key that is the same for the same manufacturer and part number, however it is cased or spaced. */
export function lineKey(identity: PartIdentity): string {
  return `${identity.manufacturer.toLowerCase()}${SEPARATOR}${identity.mpn.toLowerCase().replace(/[\s_-]+/g, "")}`;
}

export interface BomLineDetail extends BomLineInput {
  references: string[];
}

/** What a line sends to the server: its identity and count, without the references. */
export function lineInput({ key, manufacturer, mpn, quantity, prism_id, lcsc, value, footprint }: BomLineInput): BomLineInput {
  return {
    key, manufacturer, mpn, quantity,
    ...(prism_id ? { prism_id } : {}), ...(lcsc ? { lcsc } : {}), ...(value ? { value } : {}), ...(footprint ? { footprint } : {}),
  };
}

/** The distinct parts among the fitted components, with how many go on one board. */
export function buildLines(fitted: readonly SemanticComponent[]): BomLineDetail[] {
  const lines = new Map<string, BomLineDetail>();
  for (const component of fitted) {
    const identity = identityOf(component);
    const key = lineKey(identity);
    const line = lines.get(key);
    const lcsc = lcscOf(component);
    if (line) {
      line.quantity += 1;
      line.references.push(component.reference);
      // The first symbol of a part that carries an LCSC number gives it.
      if (lcsc && !line.lcsc) line.lcsc = lcsc;
    } else {
      const prismId = fieldText(component, ["prism id"]);
      const value = (component.value ?? "").trim().slice(0, 60);
      const footprint = (component.footprint ?? "").trim().slice(0, 200);
      lines.set(key, {
        key, ...identity, quantity: 1, references: [component.reference], ...(prismId ? { prism_id: prismId } : {}), ...(lcsc ? { lcsc } : {}),
        ...(value ? { value } : {}), ...(footprint ? { footprint } : {}),
      });
    }
  }
  return [...lines.values()];
}

/** The distinct parts among a row's components, in the BOM's line order. */
export function rowLines(rowComponents: readonly SemanticComponent[], lines: readonly BomLineDetail[]): BomLineDetail[] {
  const keys = new Set(rowComponents.map((component) => lineKey(identityOf(component))));
  return lines.filter((line) => keys.has(line.key));
}

const SEVERITY: SupplyStatus[] = ["fatal", "error", "warning", "unknown", "ok"];

/** What a table row shows: one part's figures, or a summary when the row holds several. */
export type RowSupply =
  | { kind: "line"; key: string; result: SupplyBomLineResult }
  | { kind: "mixed"; count: number; worst: SupplyStatus | null }
  | { kind: "none" };

export function rowSupply(
  rowComponents: readonly SemanticComponent[],
  results: Record<string, SupplyBomLineResult> | null,
  fittedKeys: ReadonlySet<string>,
): RowSupply {
  if (!results) return { kind: "none" };
  const keys = [...new Set(rowComponents.map((component) => lineKey(identityOf(component))))].filter((key) => fittedKeys.has(key));
  if (keys.length === 0) return { kind: "none" };
  if (keys.length === 1) {
    const result = results[keys[0]];
    return result ? { kind: "line", key: keys[0], result } : { kind: "none" };
  }
  const statuses = keys.map((key) => results[key]?.status).filter((status): status is SupplyStatus => status !== undefined);
  const worst = statuses.length ? SEVERITY.find((status) => statuses.includes(status)) ?? null : null;
  return { kind: "mixed", count: keys.length, worst };
}

/** Why a line has no figures, in words for a cell. */
export function untrackedLabel(result: SupplyBomLineResult): string {
  switch (result.state) {
    case "no_mpn":
      return "No part number";
    case "ambiguous":
      return "Several parts match";
    case "unknown":
      return result.in_library === false ? "Not in library" : "Not watched yet";
    default:
      return "";
  }
}
