import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { readNowSummary } from "./read-now-summary";
import { readSupplyPartNow } from "./supply-api";

/** Read this part from its distributors now, instead of waiting for its turn. */
export function ReadNowButton({ partId, onRead }: { partId: string; onRead: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const result = await readSupplyPartNow(partId);
      const message = readNowSummary(result);
      if (result.problems.length > 0) toast.warning(message);
      else toast.success(message);
      await onRead();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not read the part");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="default" variant="outline" disabled={busy} onClick={() => void run()} title="Ask the distributors for this part's stock and price now">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      Read now
    </Button>
  );
}
