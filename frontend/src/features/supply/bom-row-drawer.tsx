import { ExternalLink, Eye, LibraryBig, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { User } from "@/types/auth";
import type { SupplyBomLineResult } from "@/types/supply";
import { BomForecastLine } from "./bom-forecast-line";
import { BomLineComments } from "./bom-line-comments";
import { untrackedLabel, type BomLineDetail } from "./bom-supply";
import { StatusDot } from "./status-dot";
import { formatLeadTime, formatPrice, formatStock, LIFECYCLE_LABEL, STATUS_LABEL } from "./supply-format";
import { VendorName } from "./vendor-name";
import { StoresCell } from "./stores-cell";

interface BomRowDrawerProps {
  /** The parts on the row that was opened; null keeps the drawer closed. */
  lines: BomLineDetail[] | null;
  results: Record<string, SupplyBomLineResult> | null;
  canWatch: boolean;
  /** The line being watched right now. */
  busyKey: string | null;
  onClose: () => void;
  onWatch: (line: BomLineDetail) => void;
  onOpenPart: (partId: string) => void;
  /** Starts a catalog component for a line no component has; omitted when the user cannot write the catalog. */
  onAddToLibrary?: (line: BomLineDetail) => void;
  /** With a project and a user, each part has its comments. */
  projectId?: string;
  user?: User | null;
}

/** Every part on one BOM row, with what is known about it and what can be done next. */
export function BomRowDrawer({ lines, results, canWatch, busyKey, onClose, onWatch, onOpenPart, onAddToLibrary, projectId = "", user = null }: BomRowDrawerProps) {
  return (
    <Sheet open={lines !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full themed-scrollbar overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{lines && lines.length === 1 ? "Part details" : `${lines?.length ?? 0} parts on this row`}</SheetTitle>
          <SheetDescription>Stock and price are for the build size set above the table.</SheetDescription>
        </SheetHeader>
        <ul className="mt-4 space-y-3">
          {(lines ?? []).map((line) => (
            <PartCard
              key={line.key}
              line={line}
              result={results?.[line.key]}
              canWatch={canWatch}
              busy={busyKey === line.key}
              onWatch={onWatch}
              onOpenPart={onOpenPart}
              onAddToLibrary={onAddToLibrary}
              projectId={projectId}
              user={user}
            />
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

function PartCard({ line, result, canWatch, busy, onWatch, onOpenPart, onAddToLibrary, projectId, user }: {
  projectId: string;
  user: User | null;
  line: BomLineDetail;
  result: SupplyBomLineResult | undefined;
  canWatch: boolean;
  busy: boolean;
  onWatch: (line: BomLineDetail) => void;
  onOpenPart: (partId: string) => void;
  onAddToLibrary?: (line: BomLineDetail) => void;
}) {
  const references = line.references.join(" ");
  const notInLibrary = result?.in_library === false;
  const canWatchThis = canWatch && !!line.manufacturer && !!line.mpn && !notInLibrary;
  return (
    <li className="space-y-2 rounded-lg border p-3 text-sm">
      <div>
        <p className="font-medium">{line.mpn || "No part number"}</p>
        <p className="text-xs text-muted-foreground">{line.manufacturer || "No manufacturer"}</p>
        <p className="mt-1 text-xs text-muted-foreground" title={references}>
          {line.quantity} per board: <span className="font-mono">{references.length > 90 ? `${references.slice(0, 90)}...` : references}</span>
        </p>
      </div>

      {result?.state === "tracked" ? <Tracked result={result} /> : <p className="text-muted-foreground">{reasonFor(result)}</p>}

      <div className="flex flex-wrap gap-2">
        {result?.part_id ? (
          <Button size="sm" variant="outline" onClick={() => onOpenPart(result.part_id as string)}>Open part</Button>
        ) : null}
        {result && (result.state === "unknown" || (result.state === "tracked" && !result.watched)) && canWatchThis ? (
          <Button size="sm" disabled={busy} onClick={() => onWatch(line)}><Eye className="h-4 w-4" />Watch this part</Button>
        ) : null}
        {notInLibrary && onAddToLibrary ? (
          <Button size="sm" onClick={() => onAddToLibrary(line)}><LibraryBig className="h-4 w-4" />Add to Component Database</Button>
        ) : null}
      </div>
      {projectId ? <BomLineComments projectId={projectId} lineKey={line.key} user={user} /> : null}
    </li>
  );
}

function reasonFor(result: SupplyBomLineResult | undefined): string {
  if (!result) return "Looking this up...";
  if (result.in_library === false && result.state !== "tracked") return "Not in the Component Database.";
  if (result.state === "unknown") return "Prism does not know this part yet. Watch it and it is read within a few minutes.";
  if (result.state === "no_mpn") return "This symbol has no part number, so Prism cannot track it.";
  if (result.state === "ambiguous") return "Several makers have this number. Name the maker on the symbol, or choose it in Review.";
  return untrackedLabel(result) || "Not tracked.";
}

function Tracked({ result }: { result: SupplyBomLineResult }) {
  const need = (result.part_need ?? result.need).toLocaleString();
  const buy = result.buy;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusDot status={result.status ?? "unknown"} />
        <span>{STATUS_LABEL[result.status ?? "unknown"]}</span>
        {result.lifecycle && result.lifecycle !== "unknown" ? <Badge variant="outline">{LIFECYCLE_LABEL[result.lifecycle]}</Badge> : null}
        {result.watched ? null : <Badge variant="outline">Not watched</Badge>}
      </div>
      <dl className="flex flex-wrap gap-x-4 gap-y-0.5 tabular-nums">
        <div className="flex gap-1.5"><dt className="text-muted-foreground">Distributors</dt><dd>{result.stock === null || result.stock === undefined ? "Not read" : formatStock(result.stock)}</dd></div>
        <div className="flex gap-1.5"><dt className="text-muted-foreground">Stores</dt><dd><StoresCell stores={result.stores} /></dd></div>
        <div className="flex gap-1.5"><dt className="text-muted-foreground">Need</dt><dd className={result.short ? "text-destructive" : undefined}>{need}</dd></div>
      </dl>
      {result.alternates?.length ? (
        <p className="text-xs text-muted-foreground">
          Alternates counted: {result.alternates.map((alternate) => `${alternate.mpn} (${alternate.stock === null ? "not read" : formatStock(alternate.stock)})`).join(", ")}
        </p>
      ) : null}
      {result.part_need !== undefined && result.part_need !== result.need ? (
        <p className="text-xs text-muted-foreground">This part is on more than one line; the need counts all of them.</p>
      ) : null}
      {result.manufacturer_match === "lcsc" ? (
        <p className="text-xs text-muted-foreground">Found by the LCSC number on the symbol.</p>
      ) : result.manufacturer_match && result.manufacturer_match !== "exact" ? (
        <p className="text-xs text-warning">
          Found by part number alone: {result.manufacturer_match === "missing" ? "this symbol names no manufacturer." : "Prism does not know this manufacturer spelling."}
        </p>
      ) : null}
      {result.lead_time_days !== null && result.lead_time_days !== undefined ? <p className="text-xs text-muted-foreground">Lead time {formatLeadTime(result.lead_time_days)}.</p> : null}
      {result.bought_with ? <p className="text-xs text-muted-foreground">Bought together with another line of this part.</p> : null}
      {result.part_id ? <BomForecastLine partId={result.part_id} need={result.part_need ?? result.need} /> : null}
      {result.preferred ? (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Star className="h-3 w-3 fill-current text-primary" aria-hidden />Preferred:{" "}
          <VendorName provider={result.preferred.provider} name={result.preferred.connector_name} />
          {` holds ${result.preferred.stock.toLocaleString()}`}
          {buy && buy.connector_name !== result.preferred.connector_name ? `, not used for this build${result.preferred.stock < (result.part_need ?? result.need) ? ": not enough stock" : ""}` : ""}.
        </p>
      ) : null}
      {buy ? (
        <p>
          Buy {buy.quantity.toLocaleString()} from <VendorName provider={buy.provider} name={buy.connector_name} />{" "}
          {buy.product_url ? (
            <a href={buy.product_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              {buy.sku}<ExternalLink className="h-3 w-3" />
            </a>
          ) : buy.sku}
          {" "}at {formatPrice(buy.unit_price, buy.currency)}: {formatPrice(buy.extended, buy.currency)}.
          {buy.covers ? "" : " No offer holds enough stock."}
          {buy.waste ? <span className="block text-xs text-muted-foreground">{buy.waste.toLocaleString()} more than the build needs, worth {formatPrice(buy.waste_cost ?? "0", buy.currency)}, because of the smallest order.</span> : null}
          {buy.next_break ? (
            <span className="block text-xs text-muted-foreground">
              At {buy.next_break.quantity.toLocaleString()} pieces the price is {formatPrice(buy.next_break.unit_price, buy.currency)} each:{" "}
              {Number(buy.next_break.extra) < 0
                ? `buying that many costs ${formatPrice(String(-Number(buy.next_break.extra)), buy.currency)} less in total.`
                : `buying that many costs ${formatPrice(buy.next_break.extra, buy.currency)} more in total.`}
            </span>
          ) : null}
        </p>
      ) : result.bought_with ? null : (
        <p className="text-xs text-muted-foreground">No price for this build size.</p>
      )}
    </div>
  );
}
