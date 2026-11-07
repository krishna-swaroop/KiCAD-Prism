/**
 * The component library's client for `/api/catalog`: one function per
 * operation, every request through `lib/api.ts`. Components call these
 * instead of building catalog URLs; tests fake this module, not URLs.
 *
 * Each function keeps the error fallback its call site used, so a failed
 * request reads the same as before. URL builders (`…Url`) are for `<img>`,
 * links and downloads the browser fetches itself.
 *
 * Single-component writes take the revision the editor opened (`revisionId`)
 * and send it as `If-Match` (the component ETag). A stale one answers 412
 * `revision_conflict`; where `revisionId` is optional, omitting it writes
 * unguarded.
 */
import { fetchBlob, fetchChecked, fetchJson, ifMatch } from "@/lib/api";
import type {
  BulkAcceptResult,
  CatalogAssetSummary,
  CatalogAuditEvent,
  CatalogAuditVerification,
  CatalogComponent,
  CatalogComponentUsage,
  CatalogComponentValidationEvidence,
  CatalogHealth,
  CatalogMetadataBatch,
  CatalogMetadataField,
  CatalogMetadataGridPreferences,
  CatalogMetadataGridResponse,
  CatalogReleaseQueueResponse,
  CatalogReleaseRecord,
  CatalogReviewDecision,
  CatalogRevisionDiff,
  CatalogRevisionSummary,
  ImportCompletedResponse,
  LibraryFolderDiscovery,
  PaginatedComponents,
  ProjectComponentImportProposal,
  ProjectComponentImportSession,
  SelectionRequiredResponse,
} from "@/types/catalog";
import type { PrismJobState } from "@/lib/jobs";
import type { MatingPart } from "./library-component-mates";
import type { CatalogModel } from "./library-component-models";
import type { CatalogValidationJobPayload } from "./library-component-validation";

const CATALOG = "/api/catalog";
const id = encodeURIComponent;
const component = (componentId: string) => `${CATALOG}/components/${id(componentId)}`;
const post = (body?: unknown): RequestInit => ({
  method: "POST",
  body: body === undefined ? undefined : JSON.stringify(body),
});
const withSignal = (signal?: AbortSignal): RequestInit | undefined => (signal ? { signal } : undefined);
const guarded = (componentId: string, revisionId: string | undefined, init: RequestInit): RequestInit =>
  (revisionId ? { ...init, headers: ifMatch("component", componentId, revisionId) } : init);

type Items<T> = { items: T[] };
type Categories = { categories: Array<{ name: string; count: number }> };

// ---------------------------------------------------------------- components

export function listComponents(params: URLSearchParams, signal?: AbortSignal) {
  return fetchJson<PaginatedComponents>(`${CATALOG}/components?${params.toString()}`, withSignal(signal));
}

export function getComponent(componentId: string, signal?: AbortSignal) {
  return fetchJson<CatalogComponent>(component(componentId), withSignal(signal));
}

export function createComponent(fields: Record<string, unknown>) {
  return fetchJson<CatalogComponent>(`${CATALOG}/components`, post(fields));
}

export function patchComponent(componentId: string, patch: unknown, revisionId: string) {
  return fetchJson<CatalogComponent>(
    component(componentId),
    guarded(componentId, revisionId, { method: "PATCH", body: JSON.stringify(patch) }),
  );
}

export function listCategories() {
  return fetchJson<Categories>(`${CATALOG}/categories`);
}

export function getComponentRevision(componentId: string, revisionId: string, signal?: AbortSignal) {
  return fetchJson<CatalogComponent>(`${component(componentId)}/revisions/${id(revisionId)}`, withSignal(signal));
}

export function listComponentRevisions(componentId: string, signal?: AbortSignal) {
  return fetchJson<Items<CatalogRevisionSummary>>(`${component(componentId)}/revisions`, withSignal(signal));
}

export function compareComponentRevisions(componentId: string, before: string, after: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ before, after });
  return fetchJson<CatalogRevisionDiff>(`${component(componentId)}/revisions/compare?${params.toString()}`, withSignal(signal));
}

export function listComponentReviews(componentId: string, signal?: AbortSignal) {
  return fetchJson<Items<CatalogReviewDecision>>(`${component(componentId)}/reviews`, withSignal(signal));
}

export function listComponentReleases(componentId: string, signal?: AbortSignal) {
  return fetchJson<Items<CatalogReleaseRecord>>(`${component(componentId)}/releases`, withSignal(signal));
}

export function listComponentUsage(componentId: string, signal?: AbortSignal) {
  return fetchJson<Items<CatalogComponentUsage>>(`${component(componentId)}/usage`, withSignal(signal));
}

export function listComponentAudit(componentId: string, signal?: AbortSignal) {
  return fetchJson<Items<CatalogAuditEvent>>(`${component(componentId)}/audit`, withSignal(signal));
}

export function verifyComponentAudit(componentId: string, signal?: AbortSignal) {
  return fetchJson<CatalogAuditVerification>(`${component(componentId)}/audit/verify`, withSignal(signal));
}

/** Move a component to a workflow stage (the backend decides whether it may). */
export function releaseComponent(componentId: string, request: Record<string, unknown>, revisionId?: string) {
  return fetchJson<CatalogComponent>(`${component(componentId)}/release`, guarded(componentId, revisionId, post(request)));
}

export function regenerateComponentPreviews(componentId: string) {
  return fetchJson<CatalogComponent>(`${component(componentId)}/previews/regenerate`, post());
}

export function getComponentValidation(componentId: string, signal?: AbortSignal) {
  return fetchJson<CatalogComponentValidationEvidence>(`${component(componentId)}/validation`, withSignal(signal));
}

export function queueComponentValidation(componentId: string, signal?: AbortSignal) {
  return fetchJson<{ job_id: string }>(`${component(componentId)}/validate`, { method: "POST", signal });
}

/** The validation job's own payload, for jobs whose result carries no component. */
export function getValidationJob(jobId: string, signal?: AbortSignal) {
  return fetchJson<CatalogValidationJobPayload>(`${CATALOG}/validation/jobs/${id(jobId)}`, { signal });
}

/** A stored preview render (SVG). */
export function catalogPreviewUrl(previewId: string): string {
  return `${CATALOG}/previews/${id(previewId)}`;
}

// ---------------------------------------------------- assets and representations

/** Attach an uploaded asset; symbols and footprints may ask which entry to import. */
export function importComponentAsset(componentId: string, assetType: string, form: FormData, revisionId?: string) {
  const path = assetType === "symbol"
    ? `${component(componentId)}/symbol-import`
    : assetType === "footprint"
      ? `${component(componentId)}/footprint-import`
      : `${component(componentId)}/assets/${id(assetType)}`;
  return fetchJson<SelectionRequiredResponse | ImportCompletedResponse | { component: CatalogComponent }>(
    path,
    guarded(componentId, revisionId, { method: "POST", body: form }),
  );
}

export function linkComponentAsset(componentId: string, assetType: string, link: Record<string, unknown>, revisionId?: string) {
  return fetchJson(`${component(componentId)}/assets/${id(assetType)}/link`, guarded(componentId, revisionId, post(link)));
}

export function detachComponentAsset(componentId: string, assetId: string, revisionId: string) {
  return fetchJson(`${component(componentId)}/assets/id/${id(assetId)}`, guarded(componentId, revisionId, { method: "DELETE" }));
}

export function searchAssets(assetType: string, query: string, limit: number, signal?: AbortSignal) {
  return fetchJson<Items<CatalogAssetSummary>>(
    `${CATALOG}/assets/search?asset_type=${assetType}&limit=${limit}&q=${id(query)}`,
    { signal },
    "Failed to search catalog assets",
  );
}

export function browseStoredAssets(assetType: string, query: string, limit: number, signal?: AbortSignal) {
  return fetchJson<{ files: string[]; total?: number }>(
    `${CATALOG}/assets/browse?asset_type=${id(assetType)}&limit=${limit}&q=${id(query)}`,
    { signal },
    "Stored assets could not be listed.",
  );
}

export function createRepresentation(componentId: string, representation: Record<string, unknown>, revisionId: string) {
  return fetchJson(`${component(componentId)}/representations`, guarded(componentId, revisionId, post(representation)));
}

export function updateRepresentation(
  componentId: string, representationId: string, representation: Record<string, unknown>, revisionId: string,
) {
  return fetchJson(`${component(componentId)}/representations/${id(representationId)}`, guarded(componentId, revisionId, {
    method: "PATCH",
    body: JSON.stringify(representation),
  }));
}

export function deleteRepresentation(componentId: string, representationId: string, revisionId: string) {
  return fetchJson(
    `${component(componentId)}/representations/${id(representationId)}`,
    guarded(componentId, revisionId, { method: "DELETE" }),
  );
}

// ------------------------------------------------- mates, models, module connectors

export function listMates(componentId: string, signal?: AbortSignal) {
  return fetchJson<Items<MatingPart>>(`${component(componentId)}/mates-with`, withSignal(signal));
}

export function addMate(componentId: string, partnerId: string) {
  return fetchJson<Items<MatingPart>>(`${component(componentId)}/mates-with`, post({ componentId: partnerId }));
}

export function removeMate(componentId: string, partnerId: string) {
  return fetchJson<Items<MatingPart>>(`${component(componentId)}/mates-with/${id(partnerId)}`, { method: "DELETE" });
}

/** The STEP models of the current revision, or of `revisionId` (a revision a system pins). */
export function listModels(componentId: string, signal?: AbortSignal, revisionId?: string) {
  const query = revisionId ? `?revisionId=${id(revisionId)}` : "";
  return fetchJson<Items<CatalogModel>>(`${component(componentId)}/models${query}`, withSignal(signal));
}

/** Queue the GLB conversion of the current revision's STEP models, or of `revisionId`'s. */
export function convertModels(componentId: string, revisionId?: string) {
  const query = revisionId ? `?revisionId=${id(revisionId)}` : "";
  return fetchJson(`${component(componentId)}/models/convert${query}`, post());
}

export function saveModelAlignment(componentId: string, assetId: string, alignment: Record<string, unknown>) {
  return fetchJson<Items<CatalogModel>>(`${component(componentId)}/models/${id(assetId)}/alignment`, {
    method: "PUT",
    body: JSON.stringify(alignment),
  });
}

/** The Geometer render of a model under an unsaved alignment. */
export function modelPreviewUrl(componentId: string, assetId: string, params: URLSearchParams): string {
  return `${component(componentId)}/models/${id(assetId)}/preview.svg?${params.toString()}`;
}

// ------------------------------------------------------------------ metadata

export function listMetadataFields({ includeArchived = false }: { includeArchived?: boolean } = {}) {
  return fetchJson<Items<CatalogMetadataField>>(
    `${CATALOG}/metadata/fields${includeArchived ? "?include_archived=true" : ""}`,
  );
}

export function createMetadataField(field: Record<string, unknown>) {
  return fetchJson(`${CATALOG}/metadata/fields`, post(field));
}

export function updateMetadataField(fieldId: string, field: Record<string, unknown>) {
  return fetchJson(`${CATALOG}/metadata/fields/${fieldId}`, { method: "PATCH", body: JSON.stringify(field) });
}

export function archiveMetadataField(fieldId: string) {
  return fetchJson(`${CATALOG}/metadata/fields/${fieldId}/archive`, post());
}

export function restoreMetadataField(fieldId: string) {
  return fetchJson(`${CATALOG}/metadata/fields/${fieldId}/restore`, post());
}

export function getMetadataGridPreferences() {
  return fetchJson<CatalogMetadataGridPreferences>(`${CATALOG}/metadata/grid-preferences`);
}

export function saveMetadataGridPreferences(preferences: CatalogMetadataGridPreferences) {
  return fetchJson(`${CATALOG}/metadata/grid-preferences`, { method: "PUT", body: JSON.stringify(preferences) });
}

export function getMetadataGrid(params: URLSearchParams, signal?: AbortSignal) {
  return fetchJson<CatalogMetadataGridResponse>(`${CATALOG}/metadata/grid?${params.toString()}`, withSignal(signal));
}

export function createMetadataBatch(batch: Record<string, unknown>) {
  return fetchJson<CatalogMetadataBatch>(`${CATALOG}/metadata/batches`, post(batch));
}

export function previewMetadataCsv(file: File, changeSummary: string) {
  const form = new FormData();
  form.append("file", file);
  form.append("change_summary", changeSummary);
  return fetchJson<CatalogMetadataBatch>(
    `${CATALOG}/metadata/import-csv/preview`,
    { method: "POST", body: form },
    "Failed to preview CSV",
  );
}

export function exportMetadataCsv(fieldKeys: string[]) {
  const params = new URLSearchParams();
  fieldKeys.forEach((key) => params.append("field", key));
  return fetchBlob(`${CATALOG}/metadata/export.csv?${params.toString()}`, undefined, "Failed to export metadata");
}

export function getMetadataBatch(batchId: string) {
  return fetchJson<CatalogMetadataBatch>(`${CATALOG}/metadata/batches/${batchId}`);
}

export function approveMetadataBatchFields(batchId: string) {
  return fetchJson<CatalogMetadataBatch>(`${CATALOG}/metadata/batches/${batchId}/approve-fields`, post());
}

export function applyMetadataBatch(batchId: string, itemIds: string[]) {
  return fetchJson<{ job_id: string }>(`${CATALOG}/metadata/batches/${batchId}/apply`, post({ item_ids: itemIds }));
}

export function getMetadataJob(jobId: string) {
  return fetchJson<{ status: PrismJobState; error_message?: string }>(`${CATALOG}/metadata/jobs/${jobId}`);
}

export function metadataBatchReportUrl(batchId: string): string {
  return `${CATALOG}/metadata/batches/${batchId}/report.csv`;
}

// ------------------------------------------------------------------- release

export function getReleaseQueue(params: URLSearchParams, signal?: AbortSignal) {
  return fetchJson<CatalogReleaseQueueResponse>(`${CATALOG}/release-queue?${params.toString()}`, withSignal(signal));
}

// -------------------------------------------------------------------- health

/** `checkFiles` stats every released asset file on disk; admins only. */
export function getCatalogHealth({ checkFiles = false }: { checkFiles?: boolean } = {}) {
  return fetchJson<CatalogHealth>(`${CATALOG}/health${checkFiles ? "?check_files=true" : ""}`, undefined, "Failed to check catalog health");
}

// -------------------------------------------------------------------- import

export function listImportSessions(signal?: AbortSignal) {
  return fetchJson<Items<ProjectComponentImportSession>>(`${CATALOG}/import-sessions`, { signal });
}

export function listImportProposals(sessionId: string, signal?: AbortSignal) {
  return fetchJson<Items<ProjectComponentImportProposal>>(`${CATALOG}/import-sessions/${sessionId}/proposals`, { signal });
}

export async function deleteImportSession(sessionId: string) {
  await fetchChecked(`${CATALOG}/import-sessions/${sessionId}`, { method: "DELETE" }, "Import session could not be deleted");
}

export function listFolderImportRoots() {
  return fetchJson<Items<{ name: string; path_hint: string }>>(`${CATALOG}/import-sources/folder-roots`);
}

export function createProjectImportSession(scope: "project" | "all-projects", projectId: string) {
  return fetchJson<ProjectComponentImportSession>(
    `${CATALOG}/import-sessions/projects`,
    post({ scope, project_id: projectId }),
  );
}

export function createFolderSnapshot(displayName: string) {
  return fetchJson<{ id: string }>(`${CATALOG}/import-snapshots/folders`, post({ display_name: displayName }));
}

/** Capture one file into a folder snapshot. A refusal is an `ApiHttpError` (its status decides a retry). */
export function uploadSnapshotFile(snapshotId: string, relativePath: string, file: File, fallbackError: string) {
  const form = new FormData();
  form.append("relative_path", relativePath);
  form.append("file", file, file.name);
  return fetchJson(`${CATALOG}/import-snapshots/folders/${snapshotId}/files`, { method: "POST", body: form }, fallbackError);
}

export function discoverFolderSnapshot(snapshotId: string, request: Record<string, unknown>) {
  return fetchJson<LibraryFolderDiscovery>(`${CATALOG}/import-snapshots/folders/${snapshotId}/discover`, post(request));
}

export function completeFolderSnapshot(snapshotId: string, request: Record<string, unknown>) {
  return fetchJson<ProjectComponentImportSession>(
    `${CATALOG}/import-snapshots/folders/${snapshotId}/complete`,
    post(request),
  );
}

export function importServerFolder(rootName: string, subpath: string) {
  return fetchJson<ProjectComponentImportSession>(
    `${CATALOG}/import-snapshots/folders/server`,
    post({ root_name: rootName, subpath }),
  );
}

export function resolveImportProposal(proposalId: string, action: "accept" | "reject", remediation?: unknown) {
  return fetchJson(`${CATALOG}/import-proposals/${proposalId}/${action}`, {
    method: "POST",
    body: action === "accept" ? JSON.stringify(remediation) : undefined,
  });
}

export function saveProposalDrafts(sessionId: string, drafts: unknown) {
  return fetchJson<{ saved: number }>(
    `${CATALOG}/import-sessions/${sessionId}/proposals/drafts`,
    { method: "PUT", body: JSON.stringify({ drafts }) },
    "Failed to save import edits",
  );
}

export function bulkAcceptProposals(sessionId: string, items: unknown[]) {
  return fetchJson<BulkAcceptResult>(
    `${CATALOG}/import-sessions/${sessionId}/proposals/bulk-accept`,
    post({ items }),
    "Failed to accept import rows",
  );
}

export function importProposalsCsv(sessionId: string, file: File) {
  const form = new FormData();
  form.append("file", file, file.name);
  return fetchJson<{ saved: number; skipped_unknown_rows: number }>(
    `${CATALOG}/import-sessions/${sessionId}/proposals.csv`,
    { method: "POST", body: form },
    "Failed to import CSV",
  );
}

export function importProposalsCsvUrl(sessionId: string): string {
  return `${CATALOG}/import-sessions/${sessionId}/proposals.csv`;
}
