import type { BudgetShare } from "@/types/supply";

/** What a change would add to each connector's committed share: parts that fit, parts that would wait, calls a day. */
export function BudgetPreview({ connectors }: { connectors: readonly BudgetShare[] }) {
  return (
    <table className="w-full text-xs" aria-label="Daily call limit">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="py-1 pr-2 font-normal">Distributor</th>
          <th className="px-2 font-normal">Adds a day</th>
          <th className="px-2 font-normal">Read</th>
          <th className="px-2 font-normal">Waits for room</th>
          <th className="pl-2 font-normal">Free after</th>
        </tr>
      </thead>
      <tbody>
        {connectors.map((item) => (
          <tr key={item.connector_id} className="border-t">
            <td className="py-1 pr-2">{item.name}</td>
            <td className="px-2">{item.adds_calls ?? 0} calls</td>
            <td className="px-2">{item.admitted_new ?? 0}</td>
            <td className="px-2">{(item.waiting_new ?? 0) > 0 ? <span className="text-warning">{item.waiting_new}</span> : 0}</td>
            <td className="pl-2">{item.free} of {item.capacity}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
