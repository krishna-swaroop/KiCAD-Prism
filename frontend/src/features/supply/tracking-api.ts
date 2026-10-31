import { fetchJson } from "@/lib/api";
import type { TrackLine } from "./track-lines-step";
import type {
  AlertRules, BudgetConnector, PartAlertRules, RulesRequest, CheckProgress, CheckStarted, JobProgress, SupplyChoice, PartTracking, ProjectTrackingState, ScheduleSettings, SupplyComponentWatch, SupplyWatch,
  TrackProgress, TrackingPreview, TrackingRoom, WatchPackaging,
} from "@/types/supply";
import type { Items, ProjectTrackingPreview } from "@/types/supply.generated";
import { changesSupply } from "./supply-writes";

const BASE = "/api/supply/tracking";
const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
const put = (body: unknown): RequestInit => ({ method: "PUT", body: JSON.stringify(body) });

export interface ProjectChoice {
  variants: string[];
  /** Follow every design the project has, also those it gets later. */
  all_variants?: boolean;
  /** What the project buys for: sets the packaging that is followed. */
  packaging?: "cut_tape" | "custom_reel" | "tape_reel" | "tube_tray" | "smallest";
  /** The distributors the project is bought from; null is all but the assembly-only ones. */
  connector_ids: string[] | null;
  /** The usual build, in boards: the project's cost is worked out for it each day. */
  build_quantity?: number;
  /** What the cost is worked out with: "" the workspace's setting, "auto" by package, else a percent. */
  spares?: string;
}

/** Say which of several parts a BOM line's maker spelling names. */
async function chooseTrackLineRequest(projectId: string, partId: string, manufacturer: string): Promise<void> {
  await fetchJson(
    `${BASE}/projects/${encodeURIComponent(projectId)}/lines/choose`,
    { method: "POST", body: JSON.stringify({ part_id: partId, manufacturer }) },
    "Could not record the choice",
  );
}

/** What the project waits on a person for: parts whose maker is not settled, and lines several makers share. */
export function getProjectOpen(projectId: string, signal?: AbortSignal): Promise<{ choices: SupplyChoice[]; lines: TrackLine[] }> {
  return fetchJson(`${BASE}/projects/${encodeURIComponent(projectId)}/open`, { signal }, "Could not read what is open");
}

export function getTrackProgress(projectId: string, signal?: AbortSignal): Promise<TrackProgress> {
  return fetchJson(`${BASE}/projects/${encodeURIComponent(projectId)}/progress`, { signal }, "Could not read the progress");
}

/** Read the project's BOM now; "running" while its newest revision is still being indexed. */
export function readProjectBom(projectId: string): Promise<JobProgress & { changed?: boolean }> {
  return fetchJson(`${BASE}/projects/${encodeURIComponent(projectId)}/read`, { method: "POST" }, "Could not read the project's BOM");
}

export function getProjectTracking(projectId: string, signal?: AbortSignal): Promise<ProjectTrackingState> {
  return fetchJson(`${BASE}/projects/${encodeURIComponent(projectId)}`, { signal }, "Could not read the project's tracking");
}

export function previewTrackProject(projectId: string, choice: ProjectChoice, signal?: AbortSignal): Promise<ProjectTrackingPreview> {
  return fetchJson(`${BASE}/projects/${encodeURIComponent(projectId)}/preview`, { ...json(choice), signal }, "Could not work out the cost");
}

function trackProjectRequest(projectId: string, choice: ProjectChoice): Promise<ProjectTrackingPreview> {
  return fetchJson(`${BASE}/projects/${encodeURIComponent(projectId)}`, put(choice), "Could not track the project");
}

/** Keep a build size as the tracked project's usual build. */
function keepUsualBuildRequest(projectId: string, buildQuantity: number): Promise<{ project_id: string; build_quantity: number }> {
  return fetchJson(`${BASE}/projects/${encodeURIComponent(projectId)}/build`, put({ build_quantity: buildQuantity }), "Could not keep the usual build");
}

async function untrackProjectRequest(projectId: string): Promise<void> {
  await fetchJson(`${BASE}/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" }, "Could not stop tracking the project");
}

export function getPartTracking(partId: string, signal?: AbortSignal): Promise<{ tier: PartTracking | null; waiting_at: string[]; watch: SupplyWatch | null }> {
  return fetchJson(`${BASE}/parts/${encodeURIComponent(partId)}`, { signal }, "Could not read the part's tracking");
}

export interface TierChoice {
  tier: 1 | 2;
  rate: "weekly" | "monthly";
}

/** How a part is followed. Leave a field out to keep it; a null threshold clears it. */
export interface FollowChanges {
  tier?: 1 | 2;
  rate?: "weekly" | "monthly";
  threshold?: number | null;
  pinned?: boolean;
  packaging?: WatchPackaging;
}

export function previewFollow(partId: string, changes: FollowChanges, signal?: AbortSignal): Promise<TrackingPreview> {
  return fetchJson(`${BASE}/parts/${encodeURIComponent(partId)}/preview`, { ...json(changes), signal }, "Could not work out the cost");
}

/** Follow a part, or change how. The one way a part is followed. */
function followPartRequest(partId: string, changes: FollowChanges): Promise<TrackingPreview & { tier: PartTracking | null; watch: SupplyWatch | null }> {
  return fetchJson(`${BASE}/parts/${encodeURIComponent(partId)}`, put(changes), "Could not follow the part");
}

/** Follow a library part by its manufacturer (may be blank) and number, when Prism has no part for it yet. */
async function followNumberRequest(input: { manufacturer: string; mpn: string } & FollowChanges): Promise<SupplyWatch> {
  return (await fetchJson<{ watch: SupplyWatch }>(`${BASE}/parts`, json(input), "Could not track the part")).watch;
}

async function stopTrackingPartRequest(partId: string): Promise<void> {
  await fetchJson(`${BASE}/parts/${encodeURIComponent(partId)}`, { method: "DELETE" }, "Could not stop tracking the part");
}

/** A library component's follow: Prism follows whichever part is its main part. Null when it is not followed. */
export async function getComponentFollow(componentId: string, signal?: AbortSignal): Promise<SupplyComponentWatch | null> {
  return (await fetchJson<{ watch: SupplyComponentWatch | null }>(`${BASE}/components/${encodeURIComponent(componentId)}`, { signal }, "Could not load the component watch")).watch;
}

async function followComponentRequest(componentId: string, packaging: WatchPackaging): Promise<SupplyComponentWatch> {
  return (await fetchJson<{ watch: SupplyComponentWatch }>(`${BASE}/components/${encodeURIComponent(componentId)}`, put({ packaging }), "Could not watch the component")).watch;
}

async function stopFollowingComponentRequest(componentId: string): Promise<void> {
  await fetchJson(`${BASE}/components/${encodeURIComponent(componentId)}`, { method: "DELETE" }, "Could not stop watching the component");
}

export function getBudget(signal?: AbortSignal): Promise<BudgetConnector[]> {
  return fetchJson<Items<BudgetConnector>>("/api/supply/budget", { signal }, "Could not load the call budget").then((list) => list.items);
}

export function getTrackingRoom(signal?: AbortSignal): Promise<TrackingRoom> {
  return fetchJson("/api/supply/room", { signal }, "Could not work out the room for tracking");
}

export function startCheck(
  kind: "bom" | "component", projectId: string, lines: ReadonlyArray<{ manufacturer: string; mpn: string }>,
): Promise<CheckStarted> {
  return fetchJson("/api/supply/checks", { method: "POST", body: JSON.stringify({ kind, project_id: projectId, lines }) }, "Could not start the check");
}

export function getCheck(id: string, signal?: AbortSignal): Promise<CheckProgress> {
  return fetchJson(`/api/supply/checks/${encodeURIComponent(id)}`, { signal }, "Could not read the check");
}

export function getSchedule(signal?: AbortSignal): Promise<ScheduleSettings> {
  return fetchJson("/api/supply/schedule", { signal }, "Could not load the schedule");
}

function saveScheduleRequest(settings: ScheduleSettings): Promise<ScheduleSettings> {
  return fetchJson("/api/supply/schedule", put(settings), "Could not save the schedule");
}

export function getAlertRules(partId: string, signal?: AbortSignal): Promise<PartAlertRules> {
  return fetchJson(`/api/supply/parts/${encodeURIComponent(partId)}/alert-rules`, { signal }, "Could not load the alert rules");
}

/** QA accepts or rejects switching an alert off. */
async function decideMuteRequest(id: string, approve: boolean): Promise<void> {
  await fetchJson(`/api/supply/mutes/${encodeURIComponent(id)}/${approve ? "approve" : "reject"}`, { method: "POST" }, "Could not save the decision");
}

function saveAlertRulesRequest(partId: string, rules: Required<RulesRequest>): Promise<AlertRules> {
  const { muted, price_rise_percent, likely_out_percent, target_price, target_currency } = rules;
  return fetchJson(`/api/supply/parts/${encodeURIComponent(partId)}/alert-rules`, put({ muted, price_rise_percent, likely_out_percent: likely_out_percent ?? null, target_price, target_currency }), "Could not save the alert rules");
}

export const chooseTrackLine = changesSupply(chooseTrackLineRequest);
export const untrackProject = changesSupply(untrackProjectRequest);
export const stopTrackingPart = changesSupply(stopTrackingPartRequest);
export const trackProject = changesSupply(trackProjectRequest);
export const keepUsualBuild = changesSupply(keepUsualBuildRequest);
export const followPart = changesSupply(followPartRequest);
export const followNumber = changesSupply(followNumberRequest);
export const followComponent = changesSupply(followComponentRequest);
export const stopFollowingComponent = changesSupply(stopFollowingComponentRequest);
export const saveSchedule = changesSupply(saveScheduleRequest);
export const saveAlertRules = changesSupply(saveAlertRulesRequest);
export const decideMute = changesSupply(decideMuteRequest);
