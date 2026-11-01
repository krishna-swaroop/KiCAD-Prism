import { useCallback, useState } from "react";
import { toast } from "sonner";

import { CreateComponentDialog } from "@/components/workspace/create-component-dialog";
import { canWriteCatalog } from "@/lib/roles";
import type { SemanticComponent } from "@/types/prism-selection";
import type { User } from "@/types/auth";
import type { BomSkippedLine } from "@/types/supply.generated";
import { BomRowDrawer } from "./bom-row-drawer";
import { rowLines, type BomLineDetail } from "./bom-supply";
import { PartSheet } from "./part-sheet";
import type { BomSupply } from "./use-bom-supply";

const WHY: Record<BomSkippedLine["reason"], string> = {
  no_mpn: "it has no part number",
  needs_choice: "several makers have this number and the line does not say which",
  not_in_library: "it is not in the Component Database",
};

/**
 * The part sheet for one BOM row, or the drawer when the row is several parts or an untracked one. `open` takes the row's components;
 * `element` goes anywhere in the table's tree.
 */
export function useBomRowDetail(supply: BomSupply, user: User | null) {
  const [row, setRow] = useState<BomLineDetail[] | null>(null);
  const [partId, setPartId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [adding, setAdding] = useState<BomLineDetail | null>(null);

  // A row of one tracked part opens its supply sheet straight away; a row of several, or of a part nobody tracks yet (known or not), opens the drawer, which has Watch.
  const results = supply.lookup?.lines ?? null;
  const open = useCallback((components: readonly SemanticComponent[]) => {
    const lines = rowLines(components, supply.lines);
    const result = lines.length === 1 ? results?.[lines[0].key] : undefined;
    const only = result?.watched ? result.part_id : null;
    if (only) setPartId(only);
    else setRow(lines);
  }, [supply.lines, results]);

  const watch = useCallback(async (line: BomLineDetail) => {
    setBusyKey(line.key);
    try {
      const result = await supply.watchLines([line]);
      if (result.skipped.length > 0) toast.error(`Not watched: ${WHY[result.skipped[0].reason]}.`);
      else toast.success(`Watching ${line.mpn}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not watch the part");
    } finally {
      setBusyKey(null);
    }
  }, [supply]);

  const element = (
    <>
      <BomRowDrawer
        lines={partId === null ? row : null}
        results={results}
        canWatch={supply.canWatch}
        busyKey={busyKey}
        onClose={() => setRow(null)}
        onWatch={(line) => void watch(line)}
        onOpenPart={setPartId}
        onAddToLibrary={canWriteCatalog(user?.role) ? setAdding : undefined}
        projectId={supply.projectId}
        user={user}
      />
      {adding ? (
        <CreateComponentDialog
          key={adding.key}
          open
          onOpenChange={(next) => { if (!next) setAdding(null); }}
          initial={{ value: adding.value ?? "", manufacturer: adding.manufacturer, manufacturerPartNumber: adding.mpn }}
          onCreated={() => void supply.refresh()}
        />
      ) : null}
      <PartSheet partId={partId} user={user} onClose={() => setPartId(null)} onWatchChanged={() => void supply.refresh()} />
    </>
  );
  return { open, element };
}
