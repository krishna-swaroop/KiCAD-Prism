import { useState } from "react";
import { CopyPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { CatalogComponent } from "@/types/catalog";
import { getComponentRevision } from "./catalog-client";
import { CreateComponentDialog } from "./create-component-dialog";
import { createFromForm } from "./library-component-create-from-fields";

/**
 * "Create from": a new component that links this component's released assets. The form is filled
 * from the released revision, not from the draft on screen, because the server copies that revision.
 */
export function CreateFromButton({
  component,
  onCreated,
}: {
  component: CatalogComponent;
  onCreated: (component: CatalogComponent) => void;
}) {
  const [source, setSource] = useState<CatalogComponent | null>(null);
  const [loading, setLoading] = useState(false);
  const releasedRevisionId = component.released_revision_id ?? "";

  const open = async () => {
    setLoading(true);
    try {
      setSource(await getComponentRevision(component.id, releasedRevisionId));
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7"
        disabled={!releasedRevisionId || loading}
        title={releasedRevisionId ? "New component with the assets of the released revision" : "Needs a released revision"}
        onClick={() => void open()}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CopyPlus className="h-3.5 w-3.5" />}
        Create from
      </Button>
      {source ? (
        <CreateComponentDialog
          key={source.revision_id}
          open
          onOpenChange={(next) => { if (!next) setSource(null); }}
          initial={createFromForm(source)}
          source={source}
          onCreated={onCreated}
        />
      ) : null}
    </>
  );
}
