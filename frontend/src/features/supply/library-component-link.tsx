import { ExternalLink } from "lucide-react";
import { useCallback } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { getLibraryComponentOf } from "./supply-api";
import { useLoaded } from "./use-loaded";

/** The usual icon button that opens the library component that has this part, on its sourcing tab. Nothing when the library has none. */
export function LibraryComponentLink({ partId }: { partId: string }) {
  const fetcher = useCallback(async (signal: AbortSignal) => (await getLibraryComponentOf(partId, signal)).component_id, [partId]);
  const { data } = useLoaded<string | null>(`parts/${partId}/library-component`, fetcher, "Could not look the component up");
  if (!data) return null;
  return (
    <Button asChild size="icon" variant="outline" className="h-8 w-8 shrink-0">
      <Link
        to={`/?section=library-manager&libraryView=catalog&component=${encodeURIComponent(data)}&componentTab=sourcing`}
        aria-label="Open in the component library" title="Open in the component library"
      >
        <ExternalLink className="h-4 w-4" />
      </Link>
    </Button>
  );
}
