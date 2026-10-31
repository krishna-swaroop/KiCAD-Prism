import { useState } from "react";
import { FileSearch, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { indexBuildSummary } from "./index-build-summary";
import { buildSupplyUsageIndexes } from "./supply-api";

/** Ask the worker to read the BOMs of projects nobody has opened, so Parts in use can see them. */
export function ReadProjectBomsButton() {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      toast.success(indexBuildSummary(await buildSupplyUsageIndexes()));
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not queue the project BOMs");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={() => void run()}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
      Read project BOMs
    </Button>
  );
}
