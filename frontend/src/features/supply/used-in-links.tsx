import { useState } from "react";
import { Link } from "react-router-dom";

import type { SupplyPartDetail } from "@/types/supply";

const SHOWN = 3;

/** The projects that use the part, as plain links under its title: a few, then "+N" to see the rest. */
export function UsedInLinks({ uses }: { uses: SupplyPartDetail["used_in"] }) {
  const [all, setAll] = useState(false);
  if (uses.length === 0) return null;
  const shown = all ? uses : uses.slice(0, SHOWN);
  return (
    <p aria-label="Projects using this part" className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
      {shown.map((use, index) => (
        <span key={use.project_id}>
          <Link
            to={`/project/${encodeURIComponent(use.project_id)}`} className="hover:text-foreground hover:underline"
            title={`${use.quantity} per board${use.only_in_variants?.length ? `, only in ${use.only_in_variants.join(", ")}` : ""}${use.references ? ` (${use.references})` : ""}`}
          >
            {use.project_name}
          </Link>
          {index < shown.length - 1 ? "," : ""}
        </span>
      ))}
      {uses.length > SHOWN ? (
        <button type="button" aria-expanded={all} className="hover:text-foreground hover:underline" onClick={() => setAll((current) => !current)}>
          {all ? "show fewer" : `+${uses.length - SHOWN} more`}
        </button>
      ) : null}
    </p>
  );
}
