import type { AssessmentSettings, ComponentRestriction, ReleaseCheckResult, ReleaseCheckUnavailable, ServerCheck, SupplyAlert, SupplyConnector, SupplyNotice, SupplyPartRow, SupplyPartsPage, SyncResult, UnmatchedPart } from "./supply.generated";

export type {
  AlertDetail, AlertRules, AssessmentSettings, AssessmentSettingsView, BudgetCall, BudgetConnector, BudgetLibrary, BudgetNotices, BudgetShare, CheckProgress, CheckStarted, ComponentPart, ComponentParts, ComponentRestriction, CreateSupplyConnectorInput, CrossReference, DecisionState, EndingPart, EndingParts, FillCandidate, FillDetails, FillSearchResult, ForecastChance, ForecastEvent, ForecastInsights, ForecastModelState, InventorySource, IssuedPushToken, JlcClass, JobProgress, LocalStock, LocalStockRow, MarketBehaviour, NoticeAdded, PackagingListing, PackagingOptions, PackagingPicked, PackagingProposal, PackagingProposals, PackagingSeveral, PackagingSimilar, PartAlertRules, PartForecast, PartHistory, PartTracking, PicksMade, ProjectCostPoint, ProjectMoney, ProjectPartsPage, ProjectSupply, ProjectSupplyPart, ProjectSupplyRelease, ProjectTrackingPreview, ProjectTrackingState, PushToken, ReleaseBomKept, ReleaseCheckLine, ReleaseCheckResult, ReleaseCheckUnavailable, ReleaseSnapshot, RestockRecord, RowForecast, RulesRequest, ScheduleSettings, ScorecardRow, StoresState, SubstitutesAsked, SupplyAlert, SupplyAssessment, SupplyBomAlternate, SupplyBomBuy, SupplyBomComment, SupplyBomLineResult, SupplyBomLookup, SupplyBomRollup, SupplyBomWatchResult, SupplyChoice, SupplyChoiceOption, SupplyCompliance, SupplyComplianceState, SupplyComponentStanding, SupplyComponentWatch, SupplyConnector, SupplyConnectorCheck, SupplyCredentialField, SupplyCsvImport, SupplyCsvResult, SupplyDashboard, SupplyDistributorBehaviour, SupplyFact, SupplyFinding, SupplyGroupStats, SupplyHeadlinePrice, SupplyHealth, SupplyInsight, SupplyInsightsPage, SupplyListing, SupplyMakerGroup, SupplyManufacturer, SupplyMarket, SupplyMarketHistory, SupplyMarketMetric, SupplyMarketScope, SupplyMatched, SupplyNotice, SupplyNoticeCheck, SupplyOffer, SupplyOtherNumberGroup, SupplyOutlook, SupplyParameter, SupplyPartDetail, SupplyPartGroup, SupplyPartGroups, SupplyPartRow, SupplyPartsPage, SupplyProvider, SupplyRecentChange, SupplyReviewAlias, SupplyReviewListing, SupplyReviewQueue, SupplyRowOffer, SupplyScorecard, SupplySignin, SupplySubScore, SupplySvhcList, SupplyToApprove, SupplyWaiver, SupplyWatch, SupplyWatchSummary, TrackProgress, TrackRecord, TrackRecordModel, TrackingPreview, TrackingReason, TrackingRoom, TrackingRoomAccount, UpdateSupplyConnectorInput,
} from "./supply.generated";
export type SupplyAlertKind = SupplyAlert["kind"];
export type SupplyAlertState = SupplyAlert["state"];
export type RestrictionLevel = ComponentRestriction["level"];
export type SupplyNoticeKind = SupplyNotice["kind"];
export type AssessmentSeverity = AssessmentSettings["severity"][string];
export type SupplyCredentialStatus = SupplyConnector["credentials_status"];
export type SupplyLifecycle = SupplyPartRow["lifecycle"];
export type SupplyProblem = NonNullable<SupplyPartRow["problem"]>;
export type SupplyTier = NonNullable<SupplyPartRow["tier"]>;
export type PriceKind = NonNullable<SupplyPartRow["price_kind"]>;
export type ForecastState = SupplyPartsPage["forecast_state"][string];

export interface SupplyCsvRowError {
  line: number;
  column: string;
  message: string;
}

/** One distinct part on a BOM: what goes into a lookup. `quantity` is fitted parts per board. */
export interface BomLineInput {
  key: string;
  manufacturer: string;
  mpn: string;
  quantity: number;
  /** The catalog component placed on the symbol; when the catalog knows it, its manufacturer and number win. */
  prism_id?: string;
  /** The LCSC number on the symbol, such as C7950. */
  lcsc?: string;
  /** The symbol's value (10k) and the footprint's name, checked against the distributor's value and package. */
  value?: string;
  footprint?: string;
}

/** Map a spelling to an existing manufacturer, or name a new one. Exactly one. */
export type ConfirmAliasInput =
  | { alias_key: string; manufacturer_id: string }
  | { alias_key: string; new_manufacturer_name: string };

export type SupplyStatus = "ok" | "warning" | "error" | "fatal" | "unknown";
export type PartsScope = "followed" | "watched" | "tier1" | "tier2" | "in_use" | "waiting" | "pick" | "all";
/** One group of parts the Overview counts; empty is no narrowing. */
export type PartsFilter =
  | "" | "at_risk" | "out_of_stock" | "lifecycle"
  | "runs_out_2w" | "runs_out_8w" | "runs_out_later" | "steady" | "few_readings" | "draining" | "restock_late" | "often_out"
  | "one_distributor" | "lead_up" | "unusual_drop" | "price_moving" | "likely_out_4w" | "likely_out_8w"
  | "lifecycle_active" | "lifecycle_nrnd" | "lifecycle_last_time_buy" | "lifecycle_obsolete" | "lifecycle_unknown"
  | "outlook_ended" | "outlook_ending" | "outlook_warning_signs" | "outlook_no_signs" | "outlook_unknown"
  | "lead_under_2w" | "lead_2_to_8w" | "lead_8_to_16w" | "lead_16_to_26w" | "lead_over_26w" | "lead_none"
  | "rohs_compliant" | "rohs_not_compliant" | "rohs_disputed" | "rohs_not_applicable" | "rohs_unknown"
  | "reach_compliant" | "reach_affected" | "reach_not_applicable" | "reach_unknown"
  | "control_controlled" | "control_disputed" | "control_none" | "control_unknown"
  | `${"origin" | "listed" | "stocked" | "cheapest" | "repricing" | "leader" | "restock_first" | "risk"}:${string}`;
/** Which listings a watch counts: all, or only one packaging. */
export type WatchPackaging = "any" | "cut_tape" | "custom_reel" | "tape_reel" | "tray" | "tube" | "bulk";

/** A range of dates (10% to 90%) with the most likely in the middle. */
export interface ForecastDates {
  low: string;
  median: string;
  high: string;
}

export type FindingSeverity = "warning" | "error" | "fatal" | "ok";

/** The supply check on a BOM before release. `available` is false when that revision's BOM has not been read. */
export type ReleaseCheck = ReleaseCheckResult | ReleaseCheckUnavailable;

export interface InventorySourceInput {
  kind?: "inventree" | "push";
  display_name?: string;
  base_url?: string;
  /** Empty removes the token; left out keeps it. */
  token?: string;
  category_id?: number | null;
  interval_hours?: number;
  enabled?: boolean;
}

/** What can be pushed to: a file-fed connector (offers) or a push inventory source (stock levels). */
export type PushTarget = "connector" | "inventory_source";

export type InventoryServerCheck = ServerCheck;

export type InventorySyncResult = SyncResult;

export type InventoryUnmatchedPart = UnmatchedPart;

