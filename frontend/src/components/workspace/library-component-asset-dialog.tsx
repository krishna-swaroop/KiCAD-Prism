import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Link2, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiHttpError, fetchJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  CatalogAsset,
  CatalogComponent,
  ImportCompletedResponse,
  SelectionRequiredResponse,
} from "@/types/catalog";

import { AsyncSearchPicker } from "./async-search-picker";
import { formatBytes } from "./library-component-chrome";
import { assetMutationRevisionId, releaseRetainedRevisionOnConflict } from "./library-asset-mutation";

export type AssetType = CatalogAsset["asset_type"];
type AssetAttachMode = "upload" | "link";

type AssetImportSelection = {
  file: File;
  targetLibrary: string;
  options: string[];
  selected: string;
  expectedRevisionId: string;
};

export type AssetAttachSession = {
  openedAt: string;
  componentId: string;
  expectedRevisionId: string;
  componentName: string;
  libraryName: string;
  assetType: AssetType;
  counterpartAssets: CatalogAsset[];
  defaultCounterpartId: string;
};

export const ASSET_LABELS: Record<AssetType, string> = {
  symbol: "Symbol",
  footprint: "Footprint",
  "3dmodel": "3D model",
  spice: "SPICE model",
};

const ASSET_ACCEPT: Record<AssetType, string> = {
  symbol: ".kicad_sym",
  footprint: ".kicad_mod,.zip",
  "3dmodel": ".step,.stp,.wrl",
  spice: ".sp,.cir,.spice,.lib",
};

const ASSET_SOURCE_TABS: Array<{ id: AssetAttachMode; label: string; icon: typeof Upload }> = [
  { id: "upload", label: "Upload file", icon: Upload },
  { id: "link", label: "Link existing", icon: Link2 },
];

const STORED_FILE_RESULT_LIMIT = 50;

let nextAttachSession = 0;

export function assetAttachSessionFrom(component: CatalogComponent, assetType: AssetType): AssetAttachSession {
  nextAttachSession += 1;
  const defaultRepresentation = component.representations.find((item) => item.is_default);
  return {
    openedAt: `attach-${nextAttachSession}`,
    componentId: component.id,
    expectedRevisionId: component.revision_id,
    componentName: component.name,
    libraryName: component.library_name || component.name,
    assetType,
    counterpartAssets: component.assets.filter((asset) => (
      assetType === "symbol" ? asset.asset_type === "footprint"
        : assetType === "footprint" ? asset.asset_type === "symbol"
          : false
    )),
    defaultCounterpartId:
      assetType === "symbol"
        ? defaultRepresentation?.footprint?.id || ""
        : assetType === "footprint"
          ? defaultRepresentation?.symbol?.id || ""
          : "",
  };
}

/** Pick a file already sitting in Prism storage, including ones never registered as an asset. */
function StoredFilePicker({
  id,
  assetType,
  value,
  onChange,
}: {
  id: string;
  assetType: AssetType;
  value: string;
  onChange: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const kind = ASSET_LABELS[assetType].toLowerCase();

  return (
    <AsyncSearchPicker<string>
      id={id}
      open={open}
      onOpenChange={setOpen}
      // Portalled out of the attach dialog, so it needs its own modal layer.
      modal
      contentClassName="w-[var(--radix-popover-trigger-width)]"
      fetchKey={assetType}
      trigger={
        <button
          type="button"
          id={id}
          aria-expanded={open}
          className="border-input dark:bg-input/30 dark:hover:bg-input/50 flex h-9 w-full min-w-0 items-center justify-between gap-1.5 border px-3 py-2 text-left text-xs leading-none transition-colors outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-1"
        >
          <span className={cn("min-w-0 truncate", value ? "text-foreground" : "text-muted-foreground")}>{value || "Select a stored file"}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      }
      fetchPage={(query, signal) =>
        fetchJson<{ files: string[]; total?: number }>(
          `/api/catalog/assets/browse?asset_type=${encodeURIComponent(assetType)}&limit=${STORED_FILE_RESULT_LIMIT}&q=${encodeURIComponent(query)}`,
          { signal },
          "Stored assets could not be listed.",
        ).then((response) => ({ items: response.files, total: response.total }))
      }
      getKey={(path) => path}
      isSelected={(path) => path === value}
      onSelect={onChange}
      searchPlaceholder={`Search stored ${kind} files`}
      listLabel={`Stored ${kind} files`}
      emptyMessage={`No stored ${kind} files match.`}
      renderItem={(path) => (
        <>
          <Check className={cn("h-3.5 w-3.5 shrink-0", path === value ? "text-primary" : "invisible")} />
          <span className="min-w-0 flex-1 truncate">{path}</span>
        </>
      )}
      renderFooter={({ shown, total }) =>
        total > shown ? (
          <p className="border-t px-2.5 py-1.5 text-[11px] text-muted-foreground">Showing {shown} of {total} stored files — refine the search to narrow.</p>
        ) : null
      }
    />
  );
}

export function AssetAttachDialog({
  session,
  onClose,
  onSuccess,
}: {
  session: AssetAttachSession;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [mode, setMode] = useState<AssetAttachMode>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [targetLibrary, setTargetLibrary] = useState(session.libraryName);
  const [targetName, setTargetName] = useState("");
  const [counterpartAssetId, setCounterpartAssetId] = useState(session.defaultCounterpartId);
  const [selectedLink, setSelectedLink] = useState("");
  const [importSelection, setImportSelection] = useState<AssetImportSelection | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const label = ASSET_LABELS[session.assetType];

  const handleUpload = async () => {
    const sourceFile = importSelection?.file || file;
    if (!sourceFile) return;
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("file", sourceFile);
      form.append("target_library", importSelection?.targetLibrary || targetLibrary || session.componentName);
      form.append("expected_revision_id", assetMutationRevisionId(session.expectedRevisionId, importSelection?.expectedRevisionId));
      if (counterpartAssetId) form.append("counterpart_asset_id", counterpartAssetId);
      if (importSelection?.selected) {
        form.append(session.assetType === "symbol" ? "selected_symbol" : "selected_footprint", importSelection.selected);
      }
      const endpoint = session.assetType === "symbol"
        ? `/api/catalog/components/${encodeURIComponent(session.componentId)}/symbol-import`
        : session.assetType === "footprint"
          ? `/api/catalog/components/${encodeURIComponent(session.componentId)}/footprint-import`
          : `/api/catalog/components/${encodeURIComponent(session.componentId)}/assets/${encodeURIComponent(session.assetType)}`;
      const response = await fetchJson<SelectionRequiredResponse | ImportCompletedResponse | { component: CatalogComponent }>(endpoint, { method: "POST", body: form });
      if (!aliveRef.current) return;
      if ("mode" in response && response.mode === "selection_required") {
        const options = response.discovered_symbols || response.discovered_footprints || [];
        setImportSelection({
          file: sourceFile,
          targetLibrary: targetLibrary || session.componentName,
          options,
          selected: options[0] || "",
          expectedRevisionId: assetMutationRevisionId(session.expectedRevisionId, importSelection?.expectedRevisionId),
        });
        return;
      }
      toast.success(`${label} attached as a new revision.`);
      onSuccess();
    } catch (reason) {
      if (!aliveRef.current) return;
      toast.error(reason instanceof Error ? reason.message : String(reason));
      const status = reason instanceof ApiHttpError ? reason.status : undefined;
      const code = reason instanceof ApiHttpError ? reason.code : undefined;
      setImportSelection((current) => releaseRetainedRevisionOnConflict(current, status, code));
    } finally {
      if (aliveRef.current) setSubmitting(false);
    }
  };

  const handleLink = async () => {
    if (!selectedLink) return;
    setSubmitting(true);
    try {
      await fetchJson(`/api/catalog/components/${encodeURIComponent(session.componentId)}/assets/${encodeURIComponent(session.assetType)}/link`, {
        method: "POST",
        body: JSON.stringify({
          file_path: selectedLink,
          target_library: targetLibrary.trim() || session.componentName,
          target_name: targetName.trim(),
          counterpart_asset_id: counterpartAssetId,
          expected_revision_id: session.expectedRevisionId,
        }),
      });
      if (!aliveRef.current) return;
      toast.success(`${label} linked as a new revision.`);
      onSuccess();
    } catch (reason) {
      if (!aliveRef.current) return;
      toast.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (aliveRef.current) setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !submitting) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add {label.toLowerCase()}</DialogTitle>
          <DialogDescription>Upload a file or link one already present in Prism storage. Attaching it creates a new immutable component revision.</DialogDescription>
        </DialogHeader>
        {importSelection ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Select the {session.assetType === "symbol" ? "symbol" : "footprint"} to import</Label>
              <div className="max-h-64 space-y-1 overflow-y-auto border p-2">
                {importSelection.options.map((option) => (
                  <button key={option} type="button" className={cn("w-full border px-3 py-2 text-left text-sm hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", importSelection.selected === option && "border-primary bg-primary/5")} onClick={() => setImportSelection((current) => current ? { ...current, selected: option } : current)}>{option}</button>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" disabled={submitting} onClick={onClose}>Cancel</Button>
              <Button disabled={submitting || !importSelection.selected} onClick={() => void handleUpload()}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Import selected</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="inline-flex items-center gap-1 border bg-muted/30 p-1" role="tablist" aria-label="Asset source">
              {ASSET_SOURCE_TABS.map(({ id, label: tabLabel, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={mode === id}
                  disabled={submitting}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 border border-transparent px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    mode === id
                      ? "border-border bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setMode(id)}
                >
                  <Icon className="h-3.5 w-3.5" />{tabLabel}
                </button>
              ))}
            </div>
            <div className="space-y-4">
              {mode === "upload" ? (
                <div className="space-y-2">
                  <Label htmlFor="component-asset-file">{label} file</Label>
                  <FileInput
                    id="component-asset-file"
                    accept={ASSET_ACCEPT[session.assetType]}
                    value={file}
                    onValueChange={setFile}
                    disabled={submitting}
                  />
                  {file ? <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p> : null}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="component-existing-asset">Existing file</Label>
                  <StoredFilePicker
                    id="component-existing-asset"
                    assetType={session.assetType}
                    value={selectedLink}
                    onChange={setSelectedLink}
                  />
                </div>
              )}
              <div className={cn("grid gap-4", mode === "link" && "sm:grid-cols-2")}>
                <div className="space-y-2"><Label htmlFor="component-asset-library">Target library</Label><Input id="component-asset-library" value={targetLibrary} onChange={(event) => setTargetLibrary(event.target.value)} placeholder="Prism library" /></div>
                {mode === "link" ? <div className="space-y-2"><Label htmlFor="component-asset-name">Target item name</Label><Input id="component-asset-name" value={targetName} onChange={(event) => setTargetName(event.target.value)} placeholder="Auto-detect" /></div> : null}
              </div>
              {(session.assetType === "symbol" || session.assetType === "footprint") && session.counterpartAssets.length ? (
                <div className="space-y-2">
                  <Label htmlFor="component-counterpart-asset">Pair with {session.assetType === "symbol" ? "footprint" : "symbol"}</Label>
                  <Select value={counterpartAssetId} onValueChange={setCounterpartAssetId}>
                    <SelectTrigger id="component-counterpart-asset" className="w-full"><SelectValue placeholder="Select the counterpart asset" /></SelectTrigger>
                    <SelectContent>{session.counterpartAssets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.target_library ? `${asset.target_library}:` : ""}{asset.target_name}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">The current default counterpart is preselected. You can edit the resulting pair in Representations.</p>
                </div>
              ) : null}
            </div>
            <DialogFooter>
              <Button variant="outline" disabled={submitting} onClick={onClose}>Cancel</Button>
              <Button disabled={submitting || (mode === "upload" ? !file : !selectedLink)} onClick={mode === "upload" ? () => void handleUpload() : () => void handleLink()}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "upload" ? <Upload className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}{mode === "upload" ? "Attach file" : "Link asset"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
