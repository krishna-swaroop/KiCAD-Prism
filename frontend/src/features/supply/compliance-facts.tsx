import { Badge } from "@/components/ui/badge";
import type { SupplyFact } from "@/types/supply";
import { formatDateTime } from "./supply-format";
import { VendorName } from "./vendor-name";

/** What each distributor states about the part, as it wrote it: RoHS and REACH wording, tariff codes, last date to buy. */
export function ComplianceFacts({ facts }: { facts: readonly SupplyFact[] }) {
  if (facts.length === 0) return null;
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">What distributors state</caption>
      <tbody className="divide-y border">
        {facts.map((fact) => (
          <tr key={fact.name} className="align-top">
            <th scope="row" className="w-2/5 p-2 text-left text-xs font-medium text-muted-foreground">
              {fact.label}
              {fact.disagree ? <Badge variant="warning" className="ml-2">Sources disagree</Badge> : null}
            </th>
            <td className="p-2">
              <ul className="space-y-0.5">
                {fact.sources.map((source) => (
                  <li key={source.provider}>
                    <span className="break-words">{source.value}</span>
                    <span className="ml-2 text-xs text-muted-foreground" title={`Seen ${formatDateTime(source.observed_at)}`}>
                      <VendorName provider={source.provider} name={source.source} />
                    </span>
                  </li>
                ))}
              </ul>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
