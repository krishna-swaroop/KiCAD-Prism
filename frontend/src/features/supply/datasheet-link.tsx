import { FileText } from "lucide-react";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";
import { getPartDatasheet } from "./supply-api";
import { useLoaded } from "./use-loaded";

/** The manufacturer's datasheet as an icon beside the title. It opens the address in the browser; Prism downloads nothing. */
export function DatasheetLink({ partId }: { partId: string }) {
  const fetcher = useCallback((signal: AbortSignal) => getPartDatasheet(partId, signal), [partId]);
  const loaded = useLoaded<{ url: string }>(`parts/${partId}/datasheet`, fetcher, "Could not load the datasheet address");
  const url = loaded.data?.url;
  if (!url) return null;
  return (
    <Button asChild size="icon" variant="outline" className="h-8 w-8 shrink-0">
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open the datasheet" title="Open the datasheet">
        <FileText className="h-4 w-4" />
      </a>
    </Button>
  );
}
