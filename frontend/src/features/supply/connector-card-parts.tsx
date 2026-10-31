import { ChevronRight, FileSpreadsheet } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { BudgetConnector, BudgetLibrary, BudgetNotices, SupplyConnector } from "@/types/supply";
import { DayBar } from "./call-day-bar";
import { budgetUsedPercent } from "./connector-status";
import { formatDateTime } from "./supply-format";

/** One line about how a provider is called, where it matters. */
export function providerNote(provider: string, catalogue = false): string {
  if (catalogue) return "Offers come from the jlcparts catalogue, twice a day.";
  if (provider === "lcsc" || provider === "jlcpcb") return "Offers come from an uploaded CSV file: no calls, no credentials.";
  if (provider === "arrow") return "Reads 100 parts a call.";
  return "";
}

/** The change-notice quota some providers keep apart from their product calls, with how the tracked parts use it. */
export function NoticeBar({ notices }: { notices: BudgetNotices }) {
  const used = notices.limit > 0 ? Math.min(100, Math.round((notices.used / notices.limit) * 100)) : 0;
  const pace = notices.parts > 0
    ? `${notices.parts.toLocaleString()} parts, ${notices.interval_days === 1 ? "daily" : notices.interval_days === 7 ? "weekly" : `every ${notices.interval_days} days`}, about ${notices.per_day.toLocaleString()} a day`
    : "No parts to read notices for";
  return (
    <div className="space-y-1 pt-2">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium uppercase tracking-wider text-muted-foreground">Change notices today</span>
        <span className="tabular-nums">{notices.used.toLocaleString()} / {notices.limit.toLocaleString()}</span>
      </div>
      <div role="progressbar" aria-label="Share of today's change notice calls spent" aria-valuemin={0} aria-valuemax={100} aria-valuenow={used} className="h-1.5 overflow-hidden bg-muted">
        <div className={used >= 90 ? "h-full bg-destructive" : "h-full bg-primary"} style={{ width: `${used}%` }} />
      </div>
      <p className="text-[11px] text-muted-foreground">{pace}</p>
    </div>
  );
}

/** How much of the library this distributor has been searched for, and how long the rest should take. */
export function LibraryBar({ library }: { library: BudgetLibrary }) {
  const done = library.found + library.not_found;
  const share = library.total > 0 ? Math.min(100, Math.round((done / library.total) * 100)) : 0;
  const left = library.waiting === 0 ? "" : library.days_left === null ? "—" : `${library.days_left.toLocaleString()} d`;
  return (
    <div className="space-y-1 pt-2">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium uppercase tracking-wider text-muted-foreground">Library</span>
        <span className="tabular-nums">{done.toLocaleString()} / {library.total.toLocaleString()}</span>
      </div>
      <div role="progressbar" aria-label="Share of the library searched here" aria-valuemin={0} aria-valuemax={100} aria-valuenow={share} className="h-1.5 overflow-hidden bg-muted">
        <div className="h-full bg-primary" style={{ width: `${share}%` }} />
      </div>
      <dl className="flex flex-wrap gap-x-3 text-[11px] tabular-nums text-muted-foreground">
        <div className="flex gap-1"><dt>Found</dt><dd className="text-foreground">{library.found.toLocaleString()}</dd></div>
        <div className="flex gap-1"><dt>Not carried</dt><dd className="text-foreground">{library.not_found.toLocaleString()}</dd></div>
        <div className="flex gap-1"><dt>Waiting</dt><dd className="text-foreground">{library.waiting.toLocaleString()}</dd></div>
        {left ? <div className="flex gap-1"><dt>Left</dt><dd className="text-foreground">{left}</dd></div> : null}
      </dl>
    </div>
  );
}

/** Today's calls against the daily budget. */
export function CallBudget({ connector, budget, detail }: { connector: SupplyConnector; budget?: BudgetConnector; detail?: ReactNode }) {
  const used = budgetUsedPercent(connector);
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        {detail ? (
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex items-center gap-1 font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground">
            <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />Calls today
          </button>
        ) : <span className="font-medium uppercase tracking-wider text-muted-foreground">Calls today</span>}
        <span className="tabular-nums">
          {connector.usage_today.spent.toLocaleString()} / {connector.daily_budget.toLocaleString()}
        </span>
      </div>
      {budget ? (
        <DayBar item={budget} />
      ) : (
        <div
          role="progressbar"
          aria-label="Share of today's call budget spent"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={used}
          className="h-1.5 overflow-hidden bg-muted"
        >
          <div className={used >= 90 ? "h-full bg-destructive" : "h-full bg-primary"} style={{ width: `${used}%` }} />
        </div>
      )}
      {detail && open ? <div className="pt-2">{detail}</div> : null}
    </div>
  );
}

/** When the provider's day seems to reset, or is known to. */
export function ReportedLimits({ connector, isAdmin, onApply }: { connector: SupplyConnector; isAdmin: boolean; onApply: () => void }) {
  const guess = connector.reset_suggestion;
  if (!guess && !connector.reset_from_provider) return null;
  return connector.reset_from_provider ? (
    <div className="flex gap-1.5">
      <dt className="text-muted-foreground">Day resets</dt>
      <dd>{connector.reset_time} {connector.reset_tz}, from the provider's readings</dd>
    </div>
  ) : guess ? (
    <div className="flex flex-wrap items-center gap-1.5">
      <dt className="text-muted-foreground">Day seems to reset</dt>
      <dd>between {guess.from} and {guess.to} {guess.tz} ({guess.windows} readings)</dd>
      {isAdmin ? <Button variant="outline" size="xs" onClick={onApply}>Use {guess.suggested}</Button> : null}
    </div>
  ) : null;
}

/** The uploaded file behind a CSV connector, and how old it is. */
export function OffersFile({ connector }: { connector: SupplyConnector }) {
  const upload = connector.csv_import;
  return (
    <div className="mt-3 flex items-start gap-2 text-xs">
      <FileSpreadsheet className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      {upload ? (
        <p>
          <span className="font-medium">{upload.filename || "Uploaded file"}</span>
          <span className="text-muted-foreground">
            {" "}· {upload.row_count.toLocaleString()} rows · uploaded {formatDateTime(upload.imported_at)} by {upload.imported_by}
          </span>
        </p>
      ) : (
        <p className="text-muted-foreground">No file uploaded. Local data, no call budget.</p>
      )}
    </div>
  );
}
