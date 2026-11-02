import { Cpu, PackageSearch } from "lucide-react";

import type { PaletteCommand } from "@/lib/command-registry";
import type { PartSearchRow } from "@/components/use-part-search";
import { canEditSupply, canOpenSupply } from "@/lib/roles";
import type { UserRole } from "@/types/auth";

const SUPPLY_VIEWS = [
  { view: "dashboard", label: "Dashboard" },
  { view: "tracking", label: "Tracking" },
  { view: "review", label: "Review" },
  { view: "insights", label: "Insights" },
  { view: "sources", label: "Sources" },
] as const;

/** What people type to find a group of parts, and the Parts view that shows it. */
const FINDINGS = [
  { label: "parts out of stock", params: "partsOnly=out_of_stock", keywords: "empty zero none stock" },
  { label: "parts at risk", params: "partsOnly=at_risk", keywords: "problem error critical" },
  { label: "obsolete and ending parts", params: "partsOnly=lifecycle", keywords: "obsolete nrnd last time buy end of life eol" },
  { label: "parts that run out soon", params: "partsOnly=runs_out_2w", keywords: "runs out running out depleting" },
  { label: "parts likely out within 4 weeks", params: "partsOnly=likely_out_4w", keywords: "likely forecast expected running out soon" },
  { label: "parts only one distributor has", params: "partsOnly=one_distributor", keywords: "single source sole" },
  { label: "parts waiting for room", params: "partsScope=waiting", keywords: "queue budget waiting" },
] as const;

/** Go-to entries for the Supply section, for roles that may open it: its views, the groups of parts people look for, the BOM file tool. */
export function supplyCommands(role: UserRole | null | undefined, goToWorkspace: (params: string) => () => void): PaletteCommand[] {
  if (!canOpenSupply(role)) return [];
  const views = SUPPLY_VIEWS.map((entry) => ({
    id: `go:supply:${entry.view}`,
    label: `Supply: ${entry.label}`,
    group: "Go to",
    icon: PackageSearch,
    keywords: `stock distributors availability alerts watch ${entry.label}`,
    run: goToWorkspace(`?section=supply&supplyView=${entry.view}`),
  }));
  const findings = FINDINGS.map((entry) => ({
    id: `go:supply:${entry.params}`,
    label: `Supply: ${entry.label}`,
    group: "Go to",
    icon: PackageSearch,
    keywords: entry.keywords,
    run: goToWorkspace(`?section=supply&supplyView=tracking&${entry.params}`),
  }));
  const tool = { id: "go:supply:bom-file", label: "Supply: Check a BOM file", group: "Go to", icon: PackageSearch, keywords: "csv spreadsheet upload bom price stock", run: goToWorkspace("?section=supply&supplyView=tracking&tool=bom-file") };
  return [...views, ...findings, tool];
}

/** The path of a supply part's sheet. */
export function supplyPartPath(partId: string): string {
  return `/?${new URLSearchParams({ section: "supply", supplyView: "parts", part: partId }).toString()}`;
}

/** The Supply tab of a project, as a palette entry. */
export function projectSupplyCommand(project: { id: string; name: string }, role: UserRole | null | undefined, open: (path: string) => void): PaletteCommand[] {
  if (!canOpenSupply(role)) return [];
  return [{
    id: `project-supply:${project.id}`, label: `${project.name}: Supply`, group: "Projects", icon: PackageSearch,
    keywords: "stock distributors bom cost", run: () => open(`/project/${encodeURIComponent(project.id)}?section=supply`),
  }];
}

/** "Track a part: LM358DR" for a number nothing found, so a person does not leave the palette to add it. */
export function trackCommand(
  query: string, role: UserRole | null | undefined, rows: readonly PartSearchRow[], track: (mpn: string) => void,
): PaletteCommand[] {
  const mpn = query.trim();
  if (!canEditSupply(role) || mpn.length < 3 || /\s/.test(mpn)) return [];
  const wanted = mpn.toLowerCase();
  if (rows.some((row) => row.supply && row.label.toLowerCase() === wanted)) return [];
  return [{ id: "supply:track", label: `Track a part: ${mpn}`, group: "Parts", icon: PackageSearch, run: () => track(mpn) }];
}

const STAGE_TEXT: Record<string, string> = { released: "released", done: "released", open: "draft", in_progress: "draft", qa_review: "in review", archived: "retired" };

function detailOf(row: PartSearchRow): string {
  const parts = [row.manufacturer];
  if (row.library) parts.push(STAGE_TEXT[row.library.stage] ?? row.library.stage);
  if (row.supply) parts.push(row.supply.stock == null ? "not read yet" : row.supply.stock === 0 ? "out of stock" : `${row.supply.stock.toLocaleString()} in stock`);
  return parts.filter(Boolean).join(" · ");
}

interface PartCommandOptions {
  canLibrary: boolean;
  libraryPath: (componentId: string) => string;
  open: (path: string) => void;
}

/**
 * One palette row for a part. Enter opens the library component for people who use the library manager and the supply sheet
 * for the others; the other place is a second action, run with Ctrl or Command and Enter.
 */
export function partCommand(row: PartSearchRow, options: PartCommandOptions): PaletteCommand {
  const toLibrary = row.library ? () => options.open(options.libraryPath(row.library!.component_id)) : null;
  const toSupply = row.supply ? () => options.open(supplyPartPath(row.supply!.part_id)) : null;
  const first = options.canLibrary ? toLibrary ?? toSupply : toSupply ?? toLibrary;
  const second = first === toLibrary ? toSupply : toLibrary;
  return {
    id: `part:${row.key}`,
    label: row.label,
    group: "Parts",
    icon: Cpu,
    detail: detailOf(row) || undefined,
    run: first ?? (() => undefined),
    alt: second ? { label: second === toSupply ? "Open supply sheet" : "Open in library", run: second } : undefined,
  };
}
