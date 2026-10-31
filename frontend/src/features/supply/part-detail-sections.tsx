import { canReviewSupply } from "@/lib/roles";

import type { UserRole } from "@/types/auth";
import type { SupplyPartDetail } from "@/types/supply";
import { CrossReferenceSection } from "./cross-reference-section";
import { ReadNowButton } from "./read-now-button";
import { HoverDetails } from "./hover-details";
import { InsightDetails } from "./insight-panel";
import { insightLines } from "./insight-text";
import { behaviourLines } from "./market-behaviour-text";
import { RestockRecordDetails } from "./restock-record";
import { restockItems } from "./restock-items";
import { FoldSection } from "./fold-section";
import { EndOfLifeLine, ForecastSection } from "./forecast-section";
import { TryQuantity } from "./price-quantity";
import { usePartForecast } from "./use-part-forecast";
import { ComplianceSection } from "./compliance-section";
import { ListingGroups } from "./listing-groups";
import { PartHistoryPanel } from "./part-history";
import { useReadOnView } from "./use-read-on-view";
import { NoticesSection } from "./notices-section";
import { OutlookSection } from "./outlook-section";
import { PriceTrend } from "./price-trend";
import { formatStock } from "./supply-format";

/** What is known about one part: stock and history, its watch, where it is used and every listing. */
interface PartDetailSectionsProps {
  detail: SupplyPartDetail;
  canEdit: boolean;
  role: UserRole | null | undefined;
  onChanged: () => Promise<void>;
  /** Room for two columns: stock beside price, and the listings side by side. */
  wide?: boolean;
}

export function PartDetailSections({ detail, canEdit, role, onChanged, wide = false }: PartDetailSectionsProps) {
  // The forecast is made at the part's price quantity.
  const forecast = usePartForecast(detail.part.id, null, detail.price.quantity);
  const history = detail.distributor_history ?? null;
  useReadOnView(detail.part.id, onChanged);
  const trend = insightLines(detail.insight).length > 0;
  const restock = restockItems(detail.restock_record ?? []).length > 0;
  const compared = behaviourLines(detail.market_behaviour);
  return (
    <div className="space-y-6">

      <div className={wide ? "grid items-start gap-6 md:grid-cols-2" : "space-y-6"}>
      <section aria-label="Stock" className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">In stock</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex h-8 items-center gap-1.5 text-2xl font-semibold leading-none tabular-nums">
            {formatStock(detail.stock)}
            {trend || restock ? (
              <HoverDetails label="Show the stock trend and restock promises">
                <div className="space-y-3">
                  {trend ? <InsightDetails insight={detail.insight} /> : null}
                  <RestockRecordDetails record={detail.restock_record ?? []} />
                </div>
              </HoverDetails>
            ) : null}
          </div>
          {canEdit ? <ReadNowButton partId={detail.part.id} onRead={onChanged} /> : null}
        </div>
        {detail.problem_text ? <p role="alert" className="text-sm text-destructive">{detail.problem_text}</p> : null}
        <PartHistoryPanel kind="stock" partId={detail.part.id} history={history} threshold={detail.watch?.threshold ?? null} forecast={forecast.data} />
      </section>

      <PriceTrend
        price={detail.price} partId={detail.part.id} canEdit={canEdit} onChanged={onChanged}
        details={compared.length > 0 ? <ul aria-label="Distributors compared" className="space-y-1 text-sm">{compared.map((line) => <li key={line}>{line}</li>)}</ul> : null}
      >
        <PartHistoryPanel kind="price" partId={detail.part.id} history={history} forecast={forecast.data} />
      </PriceTrend>
      </div>

      {forecast.data ? (
        <FoldSection title="Forecast">
          <ForecastSection titled={false} forecast={forecast.data} currency={detail.price.currency} />
        </FoldSection>
      ) : null}

      <OutlookSection outlook={detail.outlook} partId={detail.part.id} role={role} below={<EndOfLifeLine forecast={forecast.data} />} />

      <NoticesSection part={{ id: detail.part.id, manufacturer: detail.part.manufacturer, mpn: detail.part.mpn }} canEdit={canEdit} />

      <FoldSection
        title={`Listings (${detail.listings.length})`} startOpen
        actions={detail.listings.length > 0 ? <TryQuantity listings={detail.listings} /> : null}
      >
        <ListingGroups wide={wide} detail={detail} canDecide={canReviewSupply(role)} canTrack={canEdit} onChanged={onChanged} />
      </FoldSection>

      <CrossReferenceSection partId={detail.part.id} canEdit={canEdit} />

      <ComplianceSection partId={detail.part.id} canEdit={canEdit} trade={detail.trade} onChanged={onChanged} />

    </div>
  );
}
