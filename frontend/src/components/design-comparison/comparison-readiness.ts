import type {
    DesignCompareDomain,
    DesignCompareDomainStatus,
    DesignCompareResult,
} from "./types";

export function comparisonDomainStatus(
    result: DesignCompareResult | null,
    domain: DesignCompareDomain,
): DesignCompareDomainStatus {
    return result?.readiness?.domains[domain] ?? "ready";
}
