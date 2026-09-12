/** Revision sent with catalog asset upload/link requests.

Omitted/empty is the backend's legacy skip. Current editors always send one.
A selection_required picker keeps the revision from the first POST so a later
loaded head cannot silently attach. That retained id is the session's open-time
revision; a revision_conflict 409 cannot retry against it and must close so
the next open recaptures the head. Other 409 codes (referenced assets, stale
manifests) are not retryable that way either.
*/
export function assetMutationRevisionId(
  currentRevisionId: string,
  retainedFromSelection?: string,
): string {
  return retainedFromSelection || currentRevisionId;
}

export function isRevisionConflict(status: number | undefined, code?: string): boolean {
  return status === 409 && (!code || code === "revision_conflict");
}

export function releaseRetainedRevisionOnConflict<T extends { expectedRevisionId: string }>(
  selection: T | null,
  status: number | undefined,
  code?: string,
): T | null {
  if (!selection || !isRevisionConflict(status, code)) return selection;
  return { ...selection, expectedRevisionId: "" };
}
