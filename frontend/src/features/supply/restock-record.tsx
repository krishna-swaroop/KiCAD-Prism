import { Clock } from "lucide-react";

import type { RestockRecord } from "@/types/supply";
import { restockItems } from "./restock-items";
import { formatLeadTime } from "./supply-format";
import { VendorName } from "./vendor-name";

function promise(item: NonNullable<RestockRecord["open"]>): string {
  const said = item.kind === "dated"
    ? `${item.quantity?.toLocaleString() ?? ""} due ${item.expected}`.trim()
    : `back by ${item.expected}${item.quoted_lead_days ? ` (quoted ${formatLeadTime(item.quoted_lead_days)})` : ""}`;
  return item.late ? `${said}, past that day` : said;
}

/** What each distributor said about the part's return, and how often it kept its word on this part. It opens from the info icon beside the stock. */
export function RestockRecordDetails({ record }: { record: RestockRecord[] }) {
  const shown = restockItems(record);
  if (shown.length === 0) return null;
  return (
    <div aria-label="Restock promises" className="space-y-1">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Restock promises</h3>
      <ul className="space-y-0.5 text-sm">
        {shown.map((item) => (
          <li key={item.connector_id} className="flex flex-wrap items-center gap-x-2">
            <VendorName provider={item.provider} name={item.name} />
            {item.open ? (
              <span className={item.open.late ? "inline-flex items-center gap-1 text-warning" : "inline-flex items-center gap-1"}>
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />{promise(item.open)}
              </span>
            ) : <span className="text-muted-foreground">no open promise</span>}
            <span className="text-xs text-muted-foreground">
              {item.resolved > 0 ? `kept ${item.kept} of ${item.resolved} here` : `${item.stock_outs} ${item.stock_outs === 1 ? "stock-out" : "stock-outs"} seen`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
