import { useCallback, useState } from "react";
import { ChevronRight, Loader2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SupplyNotice, SupplyNoticeKind } from "@/types/supply";
import { addNotice, checkPartNotices, listPartNotices } from "./supply-api";
import { useConnectorSubmit } from "./use-connector-submit";
import { useLoaded } from "./use-loaded";
import { VendorName } from "./vendor-name";

const KIND_CHOICES: ReadonlyArray<{ value: SupplyNoticeKind; label: string }> = [
  { value: "end_of_life", label: "End of life" },
  { value: "last_time_buy", label: "Last time buy" },
  { value: "nrnd", label: "Not recommended for new designs" },
  { value: "change", label: "Product change" },
];

interface NoticesSectionProps {
  part: { id: string; manufacturer: string; mpn: string };
  canEdit: boolean;
}

/**
 * Product change notices for the part: the ones people entered and the ones a distributor lists. They are a record, and an open
 * one that announces an ending raises an alert. The section folds away and starts closed.
 */
export function NoticesSection({ part, canEdit }: NoticesSectionProps) {
  const fetcher = useCallback((signal: AbortSignal) => listPartNotices(part.id, signal), [part.id]);
  const loaded = useLoaded<SupplyNotice[]>(`parts/${part.id}/notices`, fetcher, "Could not load the notices");
  const { busy, error, run } = useConnectorSubmit();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<SupplyNoticeKind>("end_of_life");
  const [lastBuy, setLastBuy] = useState("");
  const [lastShip, setLastShip] = useState("");
  const [url, setUrl] = useState("");
  const [checking, setChecking] = useState(false);
  const [adding, setAdding] = useState(false);
  const items = loaded.data ?? [];

  const check = async () => {
    setChecking(true);
    try {
      const result = await checkPartNotices(part.id);
      const found = result.connectors === 0 ? "No distributor lists notices for this part."
        : `Read ${result.read} ${result.read === 1 ? "listing" : "listings"}: ${result.new === 0 ? "no new notices" : `${result.new} new ${result.new === 1 ? "notice" : "notices"}`}.`;
      const message = [found, ...result.problems.map((problem) => problem.reason)].join(" ");
      if (result.problems.length > 0) toast.warning(message);
      else toast.success(message);
      await loaded.refresh();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not check the notices");
    } finally {
      setChecking(false);
    }
  };
  if (!canEdit && items.length === 0) return null;

  return (
    <details aria-label="Notices" className="group space-y-2">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
        Product change notices
        {items.length > 0 ? <span className="font-normal normal-case tracking-normal">({items.length})</span> : null}
        {canEdit ? (
          <Button
            type="button" size="sm" variant="outline" className="ml-auto h-7 px-2 text-xs normal-case tracking-normal" disabled={checking}
            title="Ask the distributors for this part's notices now"
            onClick={(event) => { event.preventDefault(); void check(); }}
          >
            {checking ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Check notices
          </Button>
        ) : null}
      </summary>
      {items.length > 0 ? (
        <ul className="divide-y border text-sm">
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-2 p-2">
              <span className="min-w-0 space-y-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant={item.state === "closed" ? "outline" : item.kind === "change" ? "secondary" : "warning"}>{item.kind_label}</Badge>
                  {item.state === "closed" ? <span className="text-xs text-muted-foreground">closed</span> : null}
                  {item.notice_url ? <a href={item.notice_url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">{item.title}</a> : <span className="font-medium">{item.title}</span>}
                </span>
                {item.source && item.source !== "manual" && item.notes ? <span className="block text-xs">{item.notes}</span> : null}
                <span className="block text-xs text-muted-foreground">
                  {item.published_on ? `Released ${item.published_on}. ` : ""}
                  {item.last_time_buy ? `Last time buy ${item.last_time_buy}. ` : ""}
                  {item.last_time_ship ? `Last time to ship ${item.last_time_ship}. ` : ""}
                  {item.parts > 1 ? `Covers ${item.parts} parts. ` : ""}
                  {item.source && item.source !== "manual" ? <>From <VendorName provider={item.source} name={item.source_label} />.</> : `Entered by ${item.created_by}.`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {canEdit && !adding ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" />Add notice</Button>
      ) : null}
      {canEdit && adding ? (
        <form
          className="grid gap-2 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await addNotice({
                title: title.trim(), kind, parts: [{ manufacturer: part.manufacturer, mpn: part.mpn }],
                notice_url: url.trim(), last_time_buy: lastBuy || null, last_time_ship: lastShip || null, notes: "",
              });
              setTitle(""); setLastBuy(""); setLastShip(""); setUrl("");
              setAdding(false);
              await loaded.refresh();
            });
          }}
        >
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="notice-title" className="text-xs">Notice title or number</Label>
            <Input id="notice-title" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="notice-kind" className="text-xs">What it announces</Label>
            <select id="notice-kind" className="h-9 w-full border bg-background px-2 text-sm" value={kind} onChange={(event) => setKind(event.target.value as SupplyNoticeKind)}>
              {KIND_CHOICES.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="notice-url" className="text-xs">Notice address (optional)</Label>
            <Input id="notice-url" inputMode="url" placeholder="https://" value={url} onChange={(event) => setUrl(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="notice-buy" className="text-xs">Last time buy</Label>
            <Input id="notice-buy" type="date" value={lastBuy} onChange={(event) => setLastBuy(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="notice-ship" className="text-xs">Last time to ship</Label>
            <Input id="notice-ship" type="date" value={lastShip} onChange={(event) => setLastShip(event.target.value)} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={busy || title.trim() === ""}>Add notice</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      ) : null}
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </details>
  );
}
