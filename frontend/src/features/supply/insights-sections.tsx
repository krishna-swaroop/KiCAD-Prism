import { cn } from "@/lib/utils";
import type { PartsFilter, SupplyInsightsPage } from "@/types/supply";
import { BarList } from "./bar-list";
import { ChartCard } from "./chart-card";
import { DistributorsSection } from "./distributors-section";
import { HoldersCard } from "./holders-card";
import type { InsightsPanels } from "./insights-shown";
import { vendorColor } from "./vendor-colors";

type OpenParts = (filter: PartsFilter) => void;

const GREY = "bg-muted-foreground/40";
const COVERAGE = [
  { key: "listed", label: "Lists" },
  { key: "in_stock", label: "Has in stock" },
  { key: "cheapest", label: "Cheapest for" },
] as const;
const COVERAGE_FILTER = { listed: "listed", in_stock: "stocked", cheapest: "cheapest" } as const;

/** Which distributors carry the BOM: how many tracked parts each lists, holds in stock, and is cheapest for. */
export function SourcingSection({ page, panels, onOpen }: { page: SupplyInsightsPage; panels: InsightsPanels; onOpen: OpenParts }) {
  const { coverage, resilience } = page.sourcing;
  const behaviour = page.distributors.repricing.length + page.distributors.leaders.length + page.distributors.restock_first.length > 0 || page.distributors.arrivals !== null;
  const largest = Math.max(1, ...coverage.flatMap((item) => [item.listed, item.in_stock, item.cheapest]));
  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        {panels.coverage ? <ChartCard
          title="Distributor coverage"
          info="Of the parts you track: how many each distributor lists, how many it holds in stock, and how many it is the cheapest for at 100 pieces."
          answer={`${coverage[0].name} lists ${coverage[0].listed.toLocaleString()} of ${coverage[0].tracked.toLocaleString()} parts`}
        >
          <div className="space-y-1.5 text-xs">
            <div className="grid grid-cols-[6rem_repeat(3,1fr)] gap-2 text-muted-foreground">
              <span aria-hidden />
              {COVERAGE.map((column) => <span key={column.key}>{column.label}</span>)}
            </div>
            {coverage.map((item) => (
              <div key={item.connector_id} className="grid grid-cols-[6rem_repeat(3,1fr)] items-center gap-2">
                <p className="flex min-w-0 items-center gap-1.5 font-medium">
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: vendorColor(item.provider) ?? "#6b7280" }} /><span className="truncate">{item.name}</span>
                </p>
                {COVERAGE.map((column) => (
                  <button
                    key={column.key} type="button" className="grid grid-cols-[1fr_2.5rem] items-center gap-1.5 text-left hover:bg-muted/30"
                    aria-label={`${item.name} ${column.label.toLowerCase()}: ${item[column.key]}`} onClick={() => onOpen(`${COVERAGE_FILTER[column.key]}:${item.name}`)}
                  >
                    <span className="h-3.5 bg-muted/30"><span className={cn("block h-full", item[column.key] === 0 ? "bg-muted" : "bg-primary")} style={{ width: `${Math.max((item[column.key] / largest) * 100, item[column.key] === 0 ? 2 : 0)}%` }} /></span>
                    <span className="text-right tabular-nums">{item[column.key].toLocaleString()}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </ChartCard> : null}
        <HoldersCard
          holders={resilience}
          onOpen={(key) => onOpen(key === "none" ? "out_of_stock" : key === "one" ? "one_distributor" : key === "unknown" ? "few_readings" : "")}
        />
      </div>
      {behaviour ? <DistributorsSection distributors={page.distributors} onOpen={onOpen} /> : null}
    </div>
  );
}

const LIFECYCLE: Array<{ key: keyof SupplyInsightsPage["lifecycle"]["mix"]; label: string; tone: string }> = [
  { key: "active", label: "Active", tone: "bg-success" },
  { key: "nrnd", label: "Not recommended for new designs", tone: "bg-warning" },
  { key: "last_time_buy", label: "Last time buy", tone: "bg-destructive/70" },
  { key: "obsolete", label: "Obsolete", tone: "bg-destructive" },
  { key: "unknown", label: "Unknown", tone: GREY },
];
const OUTLOOK: Array<{ key: keyof SupplyInsightsPage["lifecycle"]["outlook"]; label: string; tone: string }> = [
  { key: "ended", label: "Ended", tone: "bg-destructive" },
  { key: "ending", label: "Ending", tone: "bg-destructive/70" },
  { key: "warning_signs", label: "Warning signs", tone: "bg-warning" },
  { key: "no_signs", label: "No signs of an end", tone: "bg-success" },
  { key: "unknown", label: "Not enough to say", tone: GREY },
];

/** How old the BOM is, when parts will end, and whether it can ship (RoHS and REACH). Unknown stays its own bar. */
export function LifecycleSection({ page, panels, onOpen }: { page: SupplyInsightsPage; panels: InsightsPanels; onOpen: OpenParts }) {
  const { mix, outlook, compliance } = page.lifecycle;
  const ending = mix.nrnd + mix.last_time_buy + mix.obsolete;
  const bad = compliance.rohs.not_compliant + compliance.reach.affected;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <ChartCard
        title="Lifecycle"
        answer={ending === 0 ? "No tracked part is ending" : `${ending.toLocaleString()} ${ending === 1 ? "part is" : "parts are"} not recommended for new designs, in last-time-buy or obsolete`}
      >
        <BarList rows={LIFECYCLE.map((item) => ({ key: item.key, label: item.label, value: mix[item.key], tone: item.tone, onClick: () => onOpen(`lifecycle_${item.key}`) }))} labelWidth="11rem" />
      </ChartCard>
      <ChartCard
        title="When parts will end"
        info="From each part's lifecycle, open notices, last dates to buy and distributors dropping it. Rule-based; parts without data are unknown."
      >
        <BarList rows={OUTLOOK.map((item) => ({ key: item.key, label: item.label, value: outlook[item.key], tone: item.tone, onClick: () => onOpen(`outlook_${item.key}`) }))} labelWidth="11rem" />
      </ChartCard>
      {panels.compliance ? <ChartCard
        title="Compliance"
        answer={bad === 0 ? "No distributor reports a RoHS or REACH problem" : `${bad.toLocaleString()} ${bad === 1 ? "report" : "reports"} of a RoHS or REACH problem`}
        className="lg:col-span-2"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">RoHS</p>
            <BarList rows={[
              { key: "ok", label: "Compliant", value: compliance.rohs.compliant, tone: "bg-success", onClick: () => onOpen("rohs_compliant") },
              { key: "bad", label: "Not compliant", value: compliance.rohs.not_compliant, tone: "bg-destructive", onClick: () => onOpen("rohs_not_compliant") },
              { key: "disputed", label: "Disputed", value: compliance.rohs.disputed, tone: "bg-warning", onClick: () => onOpen("rohs_disputed") },
              { key: "na", label: "Not applicable", value: compliance.rohs.not_applicable, tone: GREY, onClick: () => onOpen("rohs_not_applicable") },
              { key: "unknown", label: "Unknown", value: compliance.rohs.unknown, tone: GREY, onClick: () => onOpen("rohs_unknown") },
            ]} />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">REACH</p>
            <BarList rows={[
              { key: "ok", label: "Unaffected", value: compliance.reach.compliant, tone: "bg-success", onClick: () => onOpen("reach_compliant") },
              { key: "bad", label: "Affected", value: compliance.reach.affected, tone: "bg-destructive", onClick: () => onOpen("reach_affected") },
              { key: "na", label: "Not applicable", value: compliance.reach.not_applicable, tone: GREY, onClick: () => onOpen("reach_not_applicable") },
              { key: "unknown", label: "Unknown", value: compliance.reach.unknown, tone: GREY, onClick: () => onOpen("reach_unknown") },
            ]} />
          </div>
        </div>
      </ChartCard> : null}
    </div>
  );
}

const BUCKETS: Record<SupplyInsightsPage["lead_times"][number]["bucket"], string> = {
  under_2w: "Under 2 weeks", "2_to_8w": "2 to 8 weeks", "8_to_16w": "8 to 16 weeks", "16_to_26w": "16 to 26 weeks", over_26w: "Over 26 weeks", none: "None quoted",
};

/** How long waiting takes, and what got dearer or cheaper. */
export function LeadAndPricesSection({ page, panels, onOpenPart, onOpen }: { page: SupplyInsightsPage; panels: InsightsPanels; onOpenPart: (partId: string) => void; onOpen: OpenParts }) {
  const long = page.lead_times.filter((item) => item.bucket === "16_to_26w" || item.bucket === "over_26w").reduce((sum, item) => sum + item.parts, 0);
  const movers = (title: string, rows: SupplyInsightsPage["price_movers"]["up"]) => (
    <ChartCard title={title}>
      <ul className="max-h-64 divide-y themed-scrollbar overflow-y-auto text-sm">
          {rows.map((row) => (
            <li key={row.part_id} className="flex items-baseline justify-between gap-3 py-1">
              <button type="button" className="font-medium hover:underline" onClick={() => onOpenPart(row.part_id)}>{row.mpn}</button>
              <span className="truncate text-xs text-muted-foreground">{row.manufacturer}</span>
              <span className={`text-xs tabular-nums ${row.percent > 0 ? "text-warning" : "text-success"}`}>{row.percent > 0 ? "+" : ""}{row.percent}%</span>
            </li>
          ))}
      </ul>
    </ChartCard>
  );
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {panels.leadTimes ? <ChartCard
        title="Lead times"
        info="The shortest lead time any distributor quotes for each part."
        answer={long === 0 ? "No part is quoted over 16 weeks" : `${long.toLocaleString()} ${long === 1 ? "part is" : "parts are"} quoted over 16 weeks`}
      >
        <BarList rows={page.lead_times.map((item) => ({ key: item.bucket, label: BUCKETS[item.bucket], value: item.parts, tone: item.bucket === "none" ? GREY : undefined, onClick: () => onOpen(`lead_${item.bucket}`) }))} labelWidth="8rem" />
      </ChartCard> : null}
      {panels.pricesUp ? movers("Prices up, 30 days", page.price_movers.up) : null}
      {panels.pricesDown ? movers("Prices down, 30 days", page.price_movers.down) : null}
    </div>
  );
}

/** Where the tracked parts come from and which are export controlled. */
export function TradeSection({ page, panels, onOpenPart, onOpen }: { page: SupplyInsightsPage; panels: InsightsPanels; onOpenPart: (partId: string) => void; onOpen: OpenParts }) {
  const { origins, other_origins: other, control, controlled } = page.trade;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {panels.origins ? <ChartCard
        title="Country of origin"
        info="What distributors state. A part with several answers is counted as Several."
      >
        <BarList labelWidth="8rem" rows={[
          ...origins.map((item) => ({ key: item.country, label: item.country, value: item.parts, tone: item.country === "Unknown" || item.country === "Several" ? GREY : undefined, onClick: () => onOpen(`origin:${item.country}`) })),
          ...(other > 0 ? [{ key: "other", label: "Other countries", value: other }] : []),
        ]} />
      </ChartCard> : null}
      {panels.control ? <ChartCard
        title="Export control"
        info="The ECCN distributors give; EAR99 is no control. A mark set on a part's sheet wins."
      >
        <BarList labelWidth="9rem" rows={[
          { key: "controlled", label: "Controlled", value: control.controlled, tone: "bg-destructive/70", onClick: () => onOpen("control_controlled") },
          { key: "disputed", label: "Disputed", value: control.disputed, tone: "bg-warning", onClick: () => onOpen("control_disputed") },
          { key: "none", label: "Not controlled", value: control.none, tone: "bg-success", onClick: () => onOpen("control_none") },
          { key: "unknown", label: "No class given", value: control.unknown, tone: GREY, onClick: () => onOpen("control_unknown") },
        ]} />
        {controlled.length > 0 ? (
          <ul className="mt-2 max-h-64 divide-y themed-scrollbar overflow-y-auto border-t text-sm">
            {controlled.map((item) => (
              <li key={item.part_id} className="flex items-baseline gap-3 py-1">
                <button type="button" className="font-medium hover:underline" onClick={() => onOpenPart(item.part_id)}>{item.mpn}</button>
                <span className="flex-1 truncate text-xs text-muted-foreground">{item.manufacturer}</span>
                <span className="text-xs tabular-nums">{item.state === "disputed" ? `Disputed: ${item.eccn}` : item.eccn}{item.by_person ? " (set by a person)" : ""}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </ChartCard> : null}
    </div>
  );
}
