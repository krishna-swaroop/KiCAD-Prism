import type { EcadSchematicPageState } from "@/types/ecad-viewer";

export type ComparisonSchematicPage = EcadSchematicPageState & {
  navigatorKey: string;
  parentNavigatorKey?: string;
  reference?: EcadSchematicPageState;
  comparison?: EcadSchematicPageState;
  referenceSheetPath?: string;
  comparisonSheetPath?: string;
  statusLabel?: "Base only" | "Compare only";
};

function normalizedIdentity(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

function preferredKey(page: EcadSchematicPageState): string {
  return page.sheetPath
    ? `sheet:${normalizedIdentity(page.sheetPath)}`
    : `project:${normalizedIdentity(page.projectPath)}`;
}

function findMatchingPage(
  page: EcadSchematicPageState,
  candidates: EcadSchematicPageState[],
  consumed: Set<string>,
): EcadSchematicPageState | undefined {
  const available = candidates.filter(
    (candidate) => !consumed.has(candidate.projectPath),
  );
  const projectPath = normalizedIdentity(page.projectPath);
  return (
    available.find(
      (candidate) => normalizedIdentity(candidate.projectPath) === projectPath,
    ) ??
    (page.sheetPath
      ? available.find(
          (candidate) =>
            normalizedIdentity(candidate.sheetPath) ===
            normalizedIdentity(page.sheetPath),
        )
      : undefined)
  );
}

function unionPage(
  reference: EcadSchematicPageState | undefined,
  comparison: EcadSchematicPageState | undefined,
): ComparisonSchematicPage {
  const representative = comparison ?? reference!;
  const navigatorKey = preferredKey(representative);
  return {
    ...representative,
    projectPath: navigatorKey,
    active: false,
    navigatorKey,
    reference,
    comparison,
    referenceSheetPath: reference?.projectPath,
    comparisonSheetPath: comparison?.projectPath,
    statusLabel:
      reference && comparison
        ? undefined
        : reference
          ? "Base only"
          : "Compare only",
  };
}

/**
 * Merge the two revision catalogs by stable sheet-instance identity while
 * retaining the exact activation path from each revision.
 */
export function buildComparisonSchematicPages(
  referencePages: EcadSchematicPageState[],
  comparisonPages: EcadSchematicPageState[],
): ComparisonSchematicPage[] {
  const consumedComparisonPaths = new Set<string>();
  const pages = referencePages.map((reference) => {
    const comparison = findMatchingPage(
      reference,
      comparisonPages,
      consumedComparisonPaths,
    );
    if (comparison) consumedComparisonPaths.add(comparison.projectPath);
    return unionPage(reference, comparison);
  });
  for (const comparison of comparisonPages) {
    if (!consumedComparisonPaths.has(comparison.projectPath)) {
      pages.push(unionPage(undefined, comparison));
    }
  }

  const byReferencePath = new Map(
    pages.flatMap((page) =>
      page.reference
        ? [[page.reference.projectPath, page.navigatorKey] as const]
        : [],
    ),
  );
  const byComparisonPath = new Map(
    pages.flatMap((page) =>
      page.comparison
        ? [[page.comparison.projectPath, page.navigatorKey] as const]
        : [],
    ),
  );
  return pages.map((page) => ({
    ...page,
    parentNavigatorKey:
      (page.reference?.parentProjectPath
        ? byReferencePath.get(page.reference.parentProjectPath)
        : undefined) ??
      (page.comparison?.parentProjectPath
        ? byComparisonPath.get(page.comparison.parentProjectPath)
        : undefined),
  }));
}

export function comparisonPageDocumentPath(
  page: ComparisonSchematicPage,
  documentPaths: readonly string[],
): string {
  const candidates = [
    page.comparison?.filename,
    page.reference?.filename,
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    const normalized = normalizedIdentity(candidate);
    const matchingDocument = documentPaths.find((path) => {
      const document = normalizedIdentity(path);
      return (
        document === normalized ||
        document.endsWith(`/${normalized}`) ||
        normalized.endsWith(`/${document}`)
      );
    });
    if (matchingDocument) return matchingDocument;
  }
  return candidates[0] ?? page.filename;
}
