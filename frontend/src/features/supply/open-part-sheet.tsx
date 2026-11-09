import { useSearchParams } from "react-router-dom";

import type { User } from "@/types/auth";
import { PartSheet } from "./part-sheet";

/**
 * The part sheet of the part in the address (`part`), for a tab that opens parts in place: Insights and the Dashboard.
 * Closing it leaves the tab where it was.
 */
export function OpenPartSheet({ user, onChanged }: { user: User | null; onChanged?: () => void }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const partId = searchParams.get("part");
  const close = () => setSearchParams((current) => {
    const updated = new URLSearchParams(current);
    updated.delete("part");
    return updated;
  });
  return <PartSheet partId={partId} user={user} onClose={close} onWatchChanged={() => onChanged?.()} />;
}
