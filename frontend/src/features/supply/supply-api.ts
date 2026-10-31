/** Typed client for `/api/supply`. Errors are `ApiHttpError` with the server's code. */

import { ApiHttpError, apiErrorFrom, fetchApi, fetchJson, fetchText, readApiError } from "@/lib/api";
import type {
  ForecastInsights,
  PartForecast,
  BomLineInput,
  ConfirmAliasInput,
  CreateSupplyConnectorInput,
  PartsFilter,
  PartsScope,
  SupplyConnector,
  SupplyCsvResult,
  SupplyCsvRowError,
  AssessmentSettings,
  AssessmentSettingsView,
  SupplyAlert,
  SupplyAssessment,
  CrossReference,
  ProjectPartsPage,
  ProjectSupply,
  SupplyBomLookup,
  SupplyBomWatchResult,
  SupplyConnectorCheck,
  SupplyManufacturer,
  SupplyDashboard,
  SupplyInsightsPage,
  SupplyPartGroups,
  PartHistory,
  SupplyPartDetail,
  SupplyPartsPage,
  SupplyProvider,
  SupplyMakerGroup,
  SupplyReviewQueue,
  SupplyCompliance,
  SupplyBomComment,
  SupplyMarketHistory,
  SupplyNotice,
  SupplyNoticeKind,
  SupplySvhcList,
  UpdateSupplyConnectorInput,
} from "@/types/supply";
import type { AliasConfirmed, AliasUndone, Items, ListingsRejected, MakerChosen, NumbersCounted, SettleUndone, SubstitutesAsked, SupplyFxRates, SupplyFxRatesSaved, SupplyNoticeCheck, SupplyNumberEnding, UsageBuild, UsageRefreshed } from "@/types/supply.generated";
import { changesSupply } from "./supply-writes";

const BASE = "/api/supply";

function connectorPath(id: string, ...rest: string[]): string {
  return [BASE, "connectors", encodeURIComponent(id), ...rest].join("/");
}

function post<T>(url: string, body: unknown, fallback: string): Promise<T> {
  return fetchJson<T>(url, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }, fallback);
}

export function listSupplyProviders(signal?: AbortSignal): Promise<SupplyProvider[]> {
  return fetchJson<Items<SupplyProvider>>(`${BASE}/providers`, { signal }, "Could not load providers").then((list) => list.items);
}

export function listSupplyConnectors(signal?: AbortSignal): Promise<SupplyConnector[]> {
  return fetchJson<Items<SupplyConnector>>(`${BASE}/connectors`, { signal }, "Could not load connectors").then((list) => list.items);
}

function createSupplyConnectorRequest(input: CreateSupplyConnectorInput): Promise<SupplyConnector> {
  return post(`${BASE}/connectors`, input, "Could not create the connector");
}

function updateSupplyConnectorRequest(id: string, changes: UpdateSupplyConnectorInput): Promise<SupplyConnector> {
  return fetchJson<SupplyConnector>(
    connectorPath(id),
    { method: "PATCH", body: JSON.stringify(changes) },
    "Could not save the connector",
  );
}

function setSupplyConnectorCredentialsRequest(id: string, credentials: Record<string, string>): Promise<SupplyConnector> {
  return fetchJson<SupplyConnector>(
    connectorPath(id, "credentials"),
    { method: "PUT", body: JSON.stringify({ credentials }) },
    "Could not save the credentials",
  );
}

function pauseSupplyConnectorRequest(id: string, reason: string): Promise<SupplyConnector> {
  return post(connectorPath(id, "pause"), { reason }, "Could not pause the connector");
}

function resumeSupplyConnectorRequest(id: string): Promise<SupplyConnector> {
  return post(connectorPath(id, "resume"), undefined, "Could not resume the connector");
}

export type SupplyUsageRefresh = UsageRefreshed;

/** Read where parts are used from the projects' existing indexes. Cheap: it builds none. */
function refreshSupplyUsageRequest(): Promise<SupplyUsageRefresh> {
  return post(`${BASE}/bom/usage/refresh`, undefined, "Could not read where parts are used");
}

export type SupplyIndexBuild = UsageBuild;

/** Queue the BOM reading of projects that have none yet. The worker does them in the background. */
function buildSupplyUsageIndexesRequest(): Promise<SupplyIndexBuild> {
  return post(`${BASE}/bom/usage/build`, undefined, "Could not queue the project BOMs");
}

/**
 * Stock, price and status of a BOM's lines for a build. Left out, the build and spares are the project's usual ones (one board and
 * the workspace's spares without a tracked project); the answer says which it priced for.
 */
export function lookupSupplyBom(
  lines: BomLineInput[],
  options: { signal?: AbortSignal; buildQuantity?: number; attritionPercent?: number | null; projectId?: string } = {},
): Promise<SupplyBomLookup> {
  const body = {
    lines,
    ...(options.projectId ? { project_id: options.projectId } : {}),
    ...(options.buildQuantity === undefined ? {} : { build_quantity: options.buildQuantity }),
    ...(options.attritionPercent === undefined ? {} : { attrition_percent: options.attritionPercent }),
  };
  return fetchJson<SupplyBomLookup>(
    `${BASE}/bom/lookup`,
    { method: "POST", body: JSON.stringify(body), signal: options.signal },
    "Could not look the BOM up",
  );
}

function watchSupplyBomLinesRequest(lines: BomLineInput[]): Promise<SupplyBomWatchResult> {
  return post(`${BASE}/bom/watch`, { lines }, "Could not watch the BOM's parts");
}

function testSupplyConnectorRequest(id: string): Promise<SupplyConnectorCheck> {
  return post(connectorPath(id, "test"), undefined, "Could not test the connector");
}


async function deleteSupplyConnectorRequest(id: string): Promise<void> {
  const response = await fetchApi(connectorPath(id), { method: "DELETE" });
  if (!response.ok) {
    throw new ApiHttpError(response.status, await readApiError(response, "Could not delete the connector"));
  }
}

/** Where to send the browser to sign in at DigiKey. */
export async function startSupplySignin(id: string): Promise<string> {
  return (await post<{ url: string }>(connectorPath(id, "signin"), undefined, "Could not start the sign-in")).url;
}

async function forgetSupplySigninRequest(id: string): Promise<void> {
  const response = await fetchApi(connectorPath(id, "signin"), { method: "DELETE" });
  if (!response.ok) {
    throw new ApiHttpError(response.status, await readApiError(response, "Could not sign out"));
  }
}

export const SUPPLY_CSV_TEMPLATE_URL = `${BASE}/csv-template`;

/** The server refused the file. Nothing was imported; `errors` says where to look. */
export class CsvRejectedError extends ApiHttpError {
  errors: SupplyCsvRowError[];
  errorCount: number;

  constructor(message: string, errors: SupplyCsvRowError[], errorCount: number) {
    super(400, message, "csv_rejected");
    this.name = "CsvRejectedError";
    this.errors = errors;
    this.errorCount = errorCount;
  }
}

async function uploadSupplyCsvRequest(id: string, file: File): Promise<SupplyCsvResult> {
  const query = new URLSearchParams({ filename: file.name });
  const response = await fetchApi(`${connectorPath(id, "csv")}?${query}`, {
    method: "POST",
    headers: { "Content-Type": "text/csv" },
    body: file,
  });
  if (response.ok) return (await response.json()) as SupplyCsvResult;
  if (response.status === 413) throw new ApiHttpError(413, "The file is larger than 5 MB.");
  const error = await apiErrorFrom(response, "Could not upload the file");
  if (error.code === "csv_rejected") {
    const { errors, error_count: errorCount } = error.payload as { errors?: SupplyCsvRowError[]; error_count?: number };
    throw new CsvRejectedError(error.message, errors ?? [], errorCount ?? errors?.length ?? 0);
  }
  throw error;
}

async function clearSupplyCsvRequest(id: string): Promise<void> {
  const response = await fetchApi(connectorPath(id, "csv"), { method: "DELETE" });
  if (!response.ok) {
    throw new ApiHttpError(response.status, await readApiError(response, "Could not remove the data"));
  }
}

export function getSupplyReviewQueue(signal?: AbortSignal): Promise<SupplyReviewQueue> {
  return fetchJson<SupplyReviewQueue>(`${BASE}/review`, { signal }, "Could not load the review queue");
}

function confirmSupplyAliasRequest(input: ConfirmAliasInput): Promise<AliasConfirmed> {
  return post(`${BASE}/review/aliases/confirm`, input, "Could not map the spelling");
}

async function decide(listingId: string, decision: "pin" | "reject", fallback: string): Promise<void> {
  const response = await fetchApi(`${BASE}/review/listings/${encodeURIComponent(listingId)}/${decision}`, { method: "POST" });
  if (!response.ok) {
    throw new ApiHttpError(response.status, await readApiError(response, fallback));
  }
}

async function pinSupplyListingRequest(listingId: string, addNumber = false): Promise<void> {
  const response = await fetchApi(`${BASE}/review/listings/${encodeURIComponent(listingId)}/pin`, {
    method: "POST",
    body: JSON.stringify({ add_number: addNumber }),
  });
  if (!response.ok) throw new ApiHttpError(response.status, await readApiError(response, "Could not confirm the listing"));
}

function rejectSupplyListingRequest(listingId: string): Promise<void> {
  return decide(listingId, "reject", "Could not reject the listing");
}

function markPartNumbersRequest(partId: string, keys: string[]): Promise<NumbersCounted> {
  return post(`${BASE}/review/choices/${encodeURIComponent(partId)}/numbers`, { keys }, "Could not record the numbers");
}

function chooseSupplyMakerRequest(partId: string, key: string): Promise<MakerChosen> {
  return post(`${BASE}/review/choices/${encodeURIComponent(partId)}/choose`, { key }, "Could not record the choice");
}

function otherSupplyMakerRequest(partId: string, key: string): Promise<ListingsRejected> {
  return post(`${BASE}/review/choices/${encodeURIComponent(partId)}/other`, { key }, "Could not record the choice");
}

export type { SupplyFxRates, SupplyFxRatesSaved, SupplyNoticeCheck, SupplyNumberEnding };

export function getFxRates(signal?: AbortSignal): Promise<SupplyFxRates> {
  return fetchJson(`${BASE}/fx`, { signal }, "Could not load the exchange rates");
}

function refreshFxRatesRequest(): Promise<SupplyFxRatesSaved> {
  return post(`${BASE}/fx/refresh`, undefined, "Could not fetch the exchange rates");
}

function enterFxRatesRequest(day: string, rates: Record<string, number>): Promise<SupplyFxRatesSaved> {
  return post(`${BASE}/fx/rates`, { day, rates }, "Could not save the exchange rates");
}

export function listNumberEndings(signal?: AbortSignal): Promise<SupplyNumberEnding[]> {
  return fetchJson<Items<SupplyNumberEnding>>(`${BASE}/settings/number-endings`, { signal }, "Could not load the endings").then((list) => list.items);
}

function addNumberEndingRequest(ending: string, kind: SupplyNumberEnding["kind"]): Promise<SupplyNumberEnding[]> {
  return post<Items<SupplyNumberEnding>>(`${BASE}/settings/number-endings`, { ending, kind }, "Could not add the ending").then((list) => list.items);
}

function removeNumberEndingRequest(key: string): Promise<void> {
  return send(`${BASE}/settings/number-endings/${encodeURIComponent(key)}`, "DELETE", undefined, "Could not remove the ending");
}

export function listMakerSpellings(signal?: AbortSignal): Promise<SupplyMakerGroup[]> {
  return fetchJson<Items<SupplyMakerGroup>>(`${BASE}/settings/makers`, { signal }, "Could not load the spellings").then((list) => list.items);
}

function addMakerSpellingRequest(spelling: string, groupKey: string | null): Promise<SupplyMakerGroup[]> {
  return post<Items<SupplyMakerGroup>>(`${BASE}/settings/makers`, { spelling, group_key: groupKey }, "Could not add the spelling").then((list) => list.items);
}

function removeMakerSpellingRequest(key: string): Promise<void> {
  return send(`${BASE}/settings/makers/${encodeURIComponent(key)}`, "DELETE", undefined, "Could not remove the spelling");
}

function undoSettledPartRequest(partId: string): Promise<SettleUndone> {
  return post(`${BASE}/review/parts/${encodeURIComponent(partId)}/undo`, {}, "Could not take the maker back");
}

function undoLearnedAliasRequest(key: string): Promise<AliasUndone> {
  return post(`${BASE}/review/aliases/${encodeURIComponent(key)}/undo`, {}, "Could not undo the spelling");
}

function rejectSupplyListingsRequest(listingIds: string[]): Promise<ListingsRejected> {
  return post(`${BASE}/review/listings/reject-many`, { listing_ids: listingIds }, "Could not take the listings off");
}

export function listSupplyPartGroups(scope: PartsScope, query: string, signal?: AbortSignal, only: PartsFilter = "", vendor = ""): Promise<SupplyPartGroups> {
  const params = new URLSearchParams({ scope });
  if (vendor) params.set("vendor", vendor);
  if (only) params.set("only", only);
  if (query.trim()) params.set("q", query.trim());
  return fetchJson<SupplyPartGroups>(`${BASE}/part-groups?${params}`, { signal }, "Could not load the parts");
}

export function listSupplyParts(scope: PartsScope, query: string, signal?: AbortSignal, only: PartsFilter = "", offset = 0, limit = 0, projectId = "", vendor = "", sort = ""): Promise<SupplyPartsPage> {
  const params = new URLSearchParams({ scope });
  if (sort) params.set("sort", sort);
  if (vendor) params.set("vendor", vendor);
  if (projectId) params.set("project_id", projectId);
  if (offset > 0) params.set("offset", String(offset));
  if (limit > 0) params.set("limit", String(limit));
  if (only) params.set("only", only);
  if (query.trim()) params.set("q", query.trim());
  return fetchJson<SupplyPartsPage>(`${BASE}/parts?${params}`, { signal }, "Could not load parts");
}

/** The catalog component that has a part, or null data when the library has none. */
export function getLibraryComponentOf(partId: string, signal?: AbortSignal): Promise<{ component_id: string | null }> {
  return fetchJson<{ component_id: string | null }>(`${BASE}/parts/${encodeURIComponent(partId)}/library-component`, { signal }, "Could not look the component up");
}

export function getSupplyDashboard(signal?: AbortSignal): Promise<SupplyDashboard> {
  return fetchJson<SupplyDashboard>(`${BASE}/dashboard`, { signal }, "Could not load the dashboard");
}

/** A part's forecast at a quantity (its own price quantity by default). Nothing is saved. */
export function getPartForecast(partId: string, quantity: number | null, signal?: AbortSignal): Promise<PartForecast> {
  const query = quantity ? `?quantity=${quantity}` : "";
  return fetchJson<PartForecast>(`${BASE}/parts/${encodeURIComponent(partId)}/forecast${query}`, { signal }, "Could not load the forecast");
}

export function getForecastInsights(signal?: AbortSignal): Promise<ForecastInsights> {
  return fetchJson<ForecastInsights>(`${BASE}/forecasts/insights`, { signal }, "Could not load the forecasts");
}

export function getSupplyInsights(signal?: AbortSignal): Promise<SupplyInsightsPage> {
  return fetchJson<SupplyInsightsPage>(`${BASE}/insights`, { signal }, "Could not load the insights");
}

/** Every tracked part with its risk figures, as CSV. */
export function getRiskCsv(): Promise<string> {
  return fetchText(`${BASE}/insights/risk.csv`, undefined, "Could not export the risk by part");
}


export function listSupplyAlerts(includeResolved: boolean, signal?: AbortSignal): Promise<{ items: SupplyAlert[] }> {
  const query = includeResolved ? "?include_resolved=true" : "";
  return fetchJson<{ items: SupplyAlert[] }>(`${BASE}/alerts${query}`, { signal }, "Could not load alerts");
}

async function alertAction(alertId: number, action: string, body: unknown, fallback: string): Promise<void> {
  const response = await fetchApi(`${BASE}/alerts/${alertId}/${action}`, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ApiHttpError(response.status, await readApiError(response, fallback));
  }
}

function acknowledgeSupplyAlertRequest(alertId: number): Promise<void> {
  return alertAction(alertId, "acknowledge", undefined, "Could not acknowledge the alert");
}

function snoozeSupplyAlertRequest(alertId: number, hours: number): Promise<void> {
  return alertAction(alertId, "snooze", { hours }, "Could not snooze the alert");
}

export function listSupplyManufacturers(signal?: AbortSignal): Promise<{ items: SupplyManufacturer[] }> {
  return fetchJson<{ items: SupplyManufacturer[] }>(`${BASE}/manufacturers`, { signal }, "Could not load manufacturers");
}

export function getSupplyPart(partId: string, signal?: AbortSignal): Promise<SupplyPartDetail> {
  return fetchJson<SupplyPartDetail>(`${BASE}/parts/${encodeURIComponent(partId)}`, { signal }, "Could not load the part");
}

/** Make one distributor the part's preferred one: shown first. */
async function setPreferredDistributorRequest(partId: string, connectorId: string): Promise<void> {
  await fetchJson(`${BASE}/parts/${encodeURIComponent(partId)}/preferred`, { method: "PUT", body: JSON.stringify({ connector_id: connectorId }) }, "Could not set the preferred distributor");
}

async function clearPreferredDistributorRequest(partId: string): Promise<void> {
  await fetchJson(`${BASE}/parts/${encodeURIComponent(partId)}/preferred`, { method: "DELETE" }, "Could not clear the preferred distributor");
}

/** Price a part at its own quantity in lists and its price history; null goes back to the workspace default. */
async function setPriceQuantityRequest(partId: string, quantity: number | null): Promise<void> {
  await fetchJson(`${BASE}/parts/${encodeURIComponent(partId)}/price-quantity`, { method: "PUT", body: JSON.stringify({ quantity }) }, "Could not set the price quantity");
}

/** Mark a part export controlled (with its class) or not; it wins over what distributors state. */
async function setTradeMarkRequest(partId: string, control: "controlled" | "none", eccn: string): Promise<void> {
  await fetchJson(`${BASE}/parts/${encodeURIComponent(partId)}/trade-mark`, { method: "PUT", body: JSON.stringify({ control, eccn }) }, "Could not set the export control");
}

async function clearTradeMarkRequest(partId: string): Promise<void> {
  await fetchJson(`${BASE}/parts/${encodeURIComponent(partId)}/trade-mark`, { method: "DELETE" }, "Could not clear the export control");
}

/** A part's stock and price per distributor over the last `days` days. */
export function getPartHistory(partId: string, days: number, signal?: AbortSignal): Promise<PartHistory> {
  return fetchJson<PartHistory>(`${BASE}/parts/${encodeURIComponent(partId)}/history?days=${days}`, { signal }, "Could not load the history");
}

/** The part Prism knows for a manufacturer (may be blank) and number, with whether it is followed, or null. Creates nothing. */
export async function lookupSupplyPart(manufacturer: string, mpn: string, signal?: AbortSignal): Promise<{ partId: string; followed: boolean } | null> {
  const query = new URLSearchParams({ manufacturer, mpn });
  const found = await fetchJson<{ part_id: string | null; followed?: boolean }>(`${BASE}/part-lookup?${query}`, { signal }, "Could not look the part up");
  return found.part_id ? { partId: found.part_id, followed: found.followed ?? true } : null;
}

/** The part Prism tracks for a manufacturer and number, or null. Creates nothing. */
export async function findSupplyPart(manufacturer: string, mpn: string, signal?: AbortSignal): Promise<string | null> {
  return (await lookupSupplyPart(manufacturer, mpn, signal))?.partId ?? null;
}

/** Ask DigiKey for parts it offers in place of this one. One call, from the interactive reserve; once an hour for a part. */
export async function askSubstitutes(partId: string): Promise<SubstitutesAsked> {
  return post(`${BASE}/parts/${encodeURIComponent(partId)}/ask-substitutes`, {}, "Could not ask for substitutes");
}

async function send(url: string, method: string, body: unknown, fallback: string): Promise<void> {
  const response = await fetchApi(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new ApiHttpError(response.status, await readApiError(response, fallback));
}

function commentsPath(projectId: string): string {
  return `${BASE}/projects/${encodeURIComponent(projectId)}/bom-comments`;
}

export async function listBomComments(projectId: string, signal?: AbortSignal): Promise<SupplyBomComment[]> {
  return (await fetchJson<{ items: SupplyBomComment[] }>(commentsPath(projectId), { signal }, "Could not load the comments")).items;
}

function addBomCommentRequest(projectId: string, lineKey: string, body: string): Promise<SupplyBomComment> {
  return post(commentsPath(projectId), { line_key: lineKey, body }, "Could not add the comment");
}

function removeBomCommentRequest(projectId: string, commentId: string): Promise<void> {
  return send(`${commentsPath(projectId)}/${encodeURIComponent(commentId)}`, "DELETE", undefined, "Could not remove the comment");
}

export function getCrossReference(partId: string, signal?: AbortSignal): Promise<CrossReference> {
  return fetchJson(`${BASE}/parts/${encodeURIComponent(partId)}/cross-reference`, { signal }, "Could not look for alternatives");
}


export function getSupplyAssessment(partId: string, quantity?: number, signal?: AbortSignal): Promise<SupplyAssessment> {
  const query = quantity ? `?quantity=${quantity}` : "";
  return fetchJson<SupplyAssessment>(`${BASE}/parts/${encodeURIComponent(partId)}/assessment${query}`, { signal }, "Could not load the assessment");
}

function proposeWaiverRequest(partId: string, check: string, reason: string): Promise<{ id: string; state: string }> {
  return post(`${BASE}/parts/${encodeURIComponent(partId)}/waivers`, { check, reason }, "Could not propose the waiver");
}

function decideWaiverRequest(id: string, approve: boolean): Promise<void> {
  return send(`${BASE}/waivers/${encodeURIComponent(id)}/${approve ? "approve" : "reject"}`, "POST", undefined, "Could not save the decision");
}

function revokeWaiverRequest(id: string): Promise<void> {
  return send(`${BASE}/waivers/${encodeURIComponent(id)}`, "DELETE", undefined, "Could not revoke the waiver");
}

export function getAssessmentSettings(signal?: AbortSignal): Promise<AssessmentSettingsView> {
  return fetchJson<AssessmentSettingsView>(`${BASE}/settings/assessment`, { signal }, "Could not load the settings");
}

function saveAssessmentSettingsRequest(settings: AssessmentSettings): Promise<AssessmentSettingsView> {
  return fetchJson<AssessmentSettingsView>(
    `${BASE}/settings/assessment`,
    { method: "PUT", body: JSON.stringify(settings) },
    "Could not save the settings",
  );
}

/** A project's BOM rolled up from the lines stored when it was read. `available` is false until it has been. */
export interface ProjectPartsQuery {
  variant?: string;
  boards?: number;
  chip?: string;
  q?: string;
  only?: string;
  vendor?: string;
  sort?: string;
  offset?: number;
  limit?: number;
}

export function getProjectParts(projectId: string, asked: ProjectPartsQuery, signal?: AbortSignal): Promise<ProjectPartsPage> {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries({ ...asked, build_quantity: asked.boards, boards: undefined })) {
    if (value !== undefined && value !== "") query.set(name, String(value));
  }
  return fetchJson(`${BASE}/projects/${encodeURIComponent(projectId)}/parts?${query.toString()}`, { signal }, "Could not load the parts");
}

export function getProjectSupply(projectId: string, variant = "", boards?: number, spares = "", signal?: AbortSignal): Promise<ProjectSupply> {
  const query = new URLSearchParams();
  if (boards !== undefined) query.set("build_quantity", String(boards));
  if (variant) query.set("variant", variant);
  if (spares) query.set("spares", spares);
  return fetchJson(`${BASE}/projects/${encodeURIComponent(projectId)}/supply?${query.toString()}`, { signal }, "Could not load the project's supply");
}

export function getPartDatasheet(partId: string, signal?: AbortSignal): Promise<{ url: string }> {
  return fetchJson(`${BASE}/parts/${encodeURIComponent(partId)}/datasheet`, { signal }, "Could not load the datasheet address");
}

export function getPartCompliance(partId: string, signal?: AbortSignal): Promise<SupplyCompliance> {
  return fetchJson(`${BASE}/parts/${encodeURIComponent(partId)}/compliance`, { signal }, "Could not load the compliance");
}

function declareSubstanceRequest(partId: string, cas: string, note: string): Promise<void> {
  return send(`${BASE}/parts/${encodeURIComponent(partId)}/substances`, "POST", { cas, note }, "Could not declare the substance");
}

function addRohsExemptionRequest(partId: string, code: string, note: string): Promise<void> {
  return send(`${BASE}/parts/${encodeURIComponent(partId)}/exemptions`, "POST", { code, note }, "Could not record the exemption");
}

function removeRohsExemptionRequest(partId: string, code: string): Promise<void> {
  return send(`${BASE}/parts/${encodeURIComponent(partId)}/exemptions/${encodeURIComponent(code)}`, "DELETE", undefined, "Could not remove the exemption");
}

function undeclareSubstanceRequest(partId: string, cas: string): Promise<void> {
  return send(`${BASE}/parts/${encodeURIComponent(partId)}/substances/${encodeURIComponent(cas)}`, "DELETE", undefined, "Could not remove the substance");
}

export function getSvhcList(signal?: AbortSignal): Promise<SupplySvhcList> {
  return fetchJson(`${BASE}/compliance/svhc`, { signal }, "Could not load the Candidate List");
}

function loadSvhcListRequest(csv: string, sourceName: string): Promise<SupplySvhcList> {
  return post(`${BASE}/compliance/svhc`, { csv, source_name: sourceName }, "Could not load the Candidate List");
}

/** The same list as an Excel file, sent as base64. */
function loadSvhcListXlsxRequest(xlsxBase64: string, sourceName: string): Promise<SupplySvhcList> {
  return post(`${BASE}/compliance/svhc`, { xlsx_base64: xlsxBase64, source_name: sourceName }, "Could not load the Candidate List");
}

/** The first sheet of an Excel BOM as rows of text, read by the server. */
export async function readBomSheet(xlsxBase64: string): Promise<string[][]> {
  const sheet = await post<{ rows: string[][] }>(`${BASE}/bom/sheet`, { xlsx_base64: xlsxBase64 }, "Could not read the spreadsheet");
  return sheet.rows;
}

export function getSupplyMarketHistory(metric: string, signal?: AbortSignal): Promise<SupplyMarketHistory> {
  return fetchJson(`${BASE}/market/history?metric=${encodeURIComponent(metric)}`, { signal }, "Could not load the market history");
}

export async function listPartNotices(partId: string, signal?: AbortSignal): Promise<SupplyNotice[]> {
  const url = `${BASE}/parts/${encodeURIComponent(partId)}/notices`;
  return (await fetchJson<{ items: SupplyNotice[] }>(url, { signal }, "Could not load the notices")).items;
}

function addNoticeRequest(notice: {
  title: string;
  kind: SupplyNoticeKind;
  parts: Array<{ manufacturer: string; mpn: string }>;
  notice_url: string;
  last_time_buy: string | null;
  last_time_ship: string | null;
  notes: string;
}): Promise<{ id: string }> {
  return post(`${BASE}/notices`, notice, "Could not add the notice");
}

export interface SupplyReadNow {
  read: number;
  connectors: number;
  problems: Array<{ connector: string; reason: string }>;
}

/** Read one part from its distributors now. Spends the interactive reserve; once per 15 minutes per person and part. */
/** What reading a part's notices now found. */
/** Read this part's change notices from the distributors that list them, now. Once an hour per person and part. */
function checkPartNoticesRequest(partId: string): Promise<SupplyNoticeCheck> {
  return post(`${BASE}/parts/${encodeURIComponent(partId)}/check-notices`, undefined, "Could not check the notices");
}

/** Read a part someone opened when nothing follows it and its prices are older than the read window; the server decides. */
export function readSupplyPartOnView(partId: string): Promise<{ read: number }> {
  return post(`${BASE}/parts/${encodeURIComponent(partId)}/view-read`, undefined, "Could not read the part");
}

function readSupplyPartNowRequest(partId: string): Promise<SupplyReadNow> {
  return post(`${BASE}/parts/${encodeURIComponent(partId)}/refresh`, undefined, "Could not read the part");
}

export const createSupplyConnector = changesSupply(createSupplyConnectorRequest);
export const updateSupplyConnector = changesSupply(updateSupplyConnectorRequest);
export const setSupplyConnectorCredentials = changesSupply(setSupplyConnectorCredentialsRequest);
export const pauseSupplyConnector = changesSupply(pauseSupplyConnectorRequest);
export const resumeSupplyConnector = changesSupply(resumeSupplyConnectorRequest);
export const refreshSupplyUsage = changesSupply(refreshSupplyUsageRequest);
export const buildSupplyUsageIndexes = changesSupply(buildSupplyUsageIndexesRequest);
export const watchSupplyBomLines = changesSupply(watchSupplyBomLinesRequest);
export const testSupplyConnector = changesSupply(testSupplyConnectorRequest);
export const deleteSupplyConnector = changesSupply(deleteSupplyConnectorRequest);
export const forgetSupplySignin = changesSupply(forgetSupplySigninRequest);
export const uploadSupplyCsv = changesSupply(uploadSupplyCsvRequest);
export const clearSupplyCsv = changesSupply(clearSupplyCsvRequest);
export const confirmSupplyAlias = changesSupply(confirmSupplyAliasRequest);
export const pinSupplyListing = changesSupply(pinSupplyListingRequest);
export const rejectSupplyListing = changesSupply(rejectSupplyListingRequest);
export const markPartNumbers = changesSupply(markPartNumbersRequest);
export const chooseSupplyMaker = changesSupply(chooseSupplyMakerRequest);
export const otherSupplyMaker = changesSupply(otherSupplyMakerRequest);
export const refreshFxRates = changesSupply(refreshFxRatesRequest);
export const enterFxRates = changesSupply(enterFxRatesRequest);
export const addNumberEnding = changesSupply(addNumberEndingRequest);
export const removeNumberEnding = changesSupply(removeNumberEndingRequest);
export const addMakerSpelling = changesSupply(addMakerSpellingRequest);
export const removeMakerSpelling = changesSupply(removeMakerSpellingRequest);
export const undoSettledPart = changesSupply(undoSettledPartRequest);
export const undoLearnedAlias = changesSupply(undoLearnedAliasRequest);
export const rejectSupplyListings = changesSupply(rejectSupplyListingsRequest);
export const acknowledgeSupplyAlert = changesSupply(acknowledgeSupplyAlertRequest);
export const snoozeSupplyAlert = changesSupply(snoozeSupplyAlertRequest);
export const setPreferredDistributor = changesSupply(setPreferredDistributorRequest);
export const clearPreferredDistributor = changesSupply(clearPreferredDistributorRequest);
export const setPriceQuantity = changesSupply(setPriceQuantityRequest);
export const setTradeMark = changesSupply(setTradeMarkRequest);
export const clearTradeMark = changesSupply(clearTradeMarkRequest);
export const addBomComment = changesSupply(addBomCommentRequest);
export const removeBomComment = changesSupply(removeBomCommentRequest);
export const proposeWaiver = changesSupply(proposeWaiverRequest);
export const decideWaiver = changesSupply(decideWaiverRequest);
export const revokeWaiver = changesSupply(revokeWaiverRequest);
export const saveAssessmentSettings = changesSupply(saveAssessmentSettingsRequest);
export const declareSubstance = changesSupply(declareSubstanceRequest);
export const addRohsExemption = changesSupply(addRohsExemptionRequest);
export const removeRohsExemption = changesSupply(removeRohsExemptionRequest);
export const undeclareSubstance = changesSupply(undeclareSubstanceRequest);
export const loadSvhcList = changesSupply(loadSvhcListRequest);
export const loadSvhcListXlsx = changesSupply(loadSvhcListXlsxRequest);
export const addNotice = changesSupply(addNoticeRequest);
export const checkPartNotices = changesSupply(checkPartNoticesRequest);
export const readSupplyPartNow = changesSupply(readSupplyPartNowRequest);
