import { useMemo, useState } from "react";
import {
    CircleDot,
    CircuitBoard,
    Crosshair,
    Download,
    FileSpreadsheet,
    FileText,
    Layers3,
    PackageCheck,
    ShieldAlert,
    Workflow,
    type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { StudioTabsList, StudioTabsTrigger } from "@/components/ui/studio-tabs";
import { Tabs } from "@/components/ui/tabs";
import { ReleaseSupplyCheck, ReleaseSupplySummary } from "@/features/supply/release-supply-check";
import { useServerState } from "@/lib/server-state";
import { cn } from "@/lib/utils";
import { FabricationViewer } from "@/components/fabrication-viewer/fabrication-viewer";
import {
    buildSource,
    isFabricationMember,
    isLayerFile,
    memberFileName,
} from "@/components/fabrication-viewer/sources";

import * as api from "../api";
import { shortDigest } from "../flow";
import {
    DocumentSheetPreview,
    MemberViewer,
    orderedSheets,
    type RunFn,
} from "../shared";
import { EvidenceWarnings } from "./outputs/Evidence";
import { ReleaseChecksRail } from "./outputs/ReleaseChecksRail";
import type {
    BuildDetail,
    ReleaseMember,
    VendorProfile,
} from "../types";

const SHEET_ICONS: Record<string, LucideIcon> = {
    cover: FileText,
    fabrication: Layers3,
    assembly: PackageCheck,
    testpoint: Crosshair,
    drill: CircleDot,
    schematic: Workflow,
    bom: FileSpreadsheet,
};

export function InspectOutputsStep({
    projectId,
    detail,
    profiles,
    busy,
    onContinue,
    onRun,
    onRefresh,
}: {
    projectId: string;
    detail: BuildDetail;
    profiles: VendorProfile[];
    busy: string;
    onContinue: () => void;
    onRun: RunFn;
    onRefresh?: () => Promise<unknown> | void;
}) {
    const sheetsRead = useServerState(
        ["release-studio", "sheets", projectId, detail.build.id],
        (signal) => api.listDocumentSheets(projectId, detail.build.id, signal),
    );
    const sheets = useMemo(() => orderedSheets(sheetsRead.data ?? []), [sheetsRead.data]);
    const [sheetKey, setSheetKey] = useState("");
    const [outputView, setOutputView] = useState("documents");
    const [member, setMember] = useState<ReleaseMember | null>(null);
    const [focusFile, setFocusFile] = useState("");

    const selectedSheet = sheets.find((sheet) => sheet.key === sheetKey) ?? sheets[0];
    const membersByDomain = useMemo(() => groupMembers(detail.members), [detail.members]);
    const hasFabrication = detail.members.some((item) => isFabricationMember(item.path));
    const fabricationSource = useMemo(
        () => buildSource(projectId, detail.build.id),
        [projectId, detail.build.id],
    );
    // A layer file opens in the viewer; the job file and everything else stay text.
    const openMember = (item: ReleaseMember) => {
        if (isLayerFile(item.path)) {
            setFocusFile(memberFileName(item.path));
            setOutputView("fabrication");
        } else {
            setMember(item);
        }
    };

    return (
        <div className="flex h-full min-h-0 flex-1">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <details className="shrink-0 border-b px-2 py-1">
                    <summary className="cursor-pointer list-none">
                        <ReleaseSupplySummary projectId={projectId} buildId={detail.build.id} />
                    </summary>
                    <div className="py-2">
                        <ReleaseSupplyCheck projectId={projectId} buildId={detail.build.id} />
                    </div>
                </details>
                <Tabs value={outputView} onValueChange={setOutputView} className="min-w-0 shrink-0 gap-0">
                    <div className="flex h-11 min-w-0 items-center gap-2 border-b bg-card px-2">
                        <StudioTabsList className="min-w-0 overflow-x-auto" aria-label="Output views">
                            <StudioTabsTrigger value="documents" className="gap-1.5">
                                <FileText className="size-3.5" aria-hidden />
                                Documents{sheets.length ? ` (${sheets.length})` : ""}
                            </StudioTabsTrigger>
                            {hasFabrication && (
                                <StudioTabsTrigger value="fabrication" className="gap-1.5">
                                    <CircuitBoard className="size-3.5" aria-hidden />
                                    Gerber
                                </StudioTabsTrigger>
                            )}
                            <StudioTabsTrigger value="members" className="gap-1.5">
                                <Layers3 className="size-3.5" aria-hidden />
                                Members ({detail.members.length})
                            </StudioTabsTrigger>
                            <StudioTabsTrigger value="evidence" className="gap-1.5">
                                <ShieldAlert className="size-3.5" aria-hidden />
                                Evidence ({detail.evidence.length})
                            </StudioTabsTrigger>
                        </StudioTabsList>
                        <div className="ml-auto flex shrink-0 flex-wrap gap-1">
                            <Button
                                size="xs"
                                variant="outline"
                                aria-label="Dossier"
                                title="Download the dossier"
                                onClick={() => void onRun("download-dossier", () => api.downloadFile(api.dossierDownloadUrl(projectId, detail.build.id), `build-${detail.build.id}-dossier.tar.gz`))}
                            >
                                <Download className="h-3 w-3" aria-hidden />
                                <span className="hidden xl:inline">Dossier</span>
                            </Button>
                            <Button
                                size="xs"
                                variant="outline"
                                aria-label="Build evidence"
                                title="Download the build evidence"
                                onClick={() => void onRun("download-build-evidence", () => api.downloadFile(api.buildEvidenceDownloadUrl(projectId, detail.build.id), `build-${detail.build.id}-evidence.tar.gz`))}
                            >
                                <Download className="h-3 w-3" aria-hidden />
                                <span className="hidden xl:inline">Build evidence</span>
                            </Button>
                        </div>
                    </div>
                </Tabs>
                {outputView === "documents" && (
                    sheets.length > 0 ? (
                        <div className="flex min-h-0 flex-1 overflow-hidden">
                            <nav aria-label="Documents" className="w-44 shrink-0 overflow-y-auto border-r p-1.5">
                                <div className="flex h-7 items-center gap-1.5 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    <FileText className="size-3" aria-hidden />
                                    Drawings
                                    <span className="ml-auto font-medium normal-case tracking-normal">{sheets.length}</span>
                                </div>
                                {sheets.map((sheet) => {
                                    const Icon = SHEET_ICONS[sheet.key] ?? FileText;
                                    const active = sheet.key === selectedSheet?.key;
                                    return (
                                        <button
                                            key={sheet.key}
                                            type="button"
                                            aria-current={active ? "true" : undefined}
                                            onClick={() => setSheetKey(sheet.key)}
                                            className={cn(
                                                "flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-sm",
                                                active
                                                    ? "bg-muted shadow-[inset_2px_0_0_hsl(var(--primary))]"
                                                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                                            )}
                                        >
                                            <Icon className="size-3.5 shrink-0" aria-hidden />
                                            <span className="truncate">{sheetLabel(sheet.key)}</span>
                                        </button>
                                    );
                                })}
                            </nav>
                            {selectedSheet ? (
                                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                                    <div className="flex h-9 shrink-0 items-center gap-2 border-b px-2 text-sm">
                                        <span className="shrink-0 font-medium">{sheetLabel(selectedSheet.key)}</span>
                                        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={selectedSheet.pdf?.path}>
                                            {selectedSheet.pdf?.path}
                                        </span>
                                        <span className="flex-1" />
                                        <Button
                                            size="xs"
                                            variant="outline"
                                            className="shrink-0"
                                            onClick={() =>
                                                void api.downloadFile(
                                                    api.downloadUrl(
                                                        projectId,
                                                        `builds/${encodeURIComponent(detail.build.id)}/sheets/${encodeURIComponent(selectedSheet.key)}.pdf`,
                                                    ),
                                                    `${selectedSheet.key}.pdf`,
                                                )
                                            }
                                        >
                                            <Download className="mr-1 h-3 w-3" /> PDF
                                        </Button>
                                    </div>
                                    <DocumentSheetPreview
                                        projectId={projectId}
                                        buildId={detail.build.id}
                                        sheet={selectedSheet}
                                    />
                                </div>
                            ) : null}
                        </div>
                    ) : sheetsRead.error ? (
                        <div className="flex items-center gap-2 p-3 text-sm">
                            <span className="min-w-0 truncate text-destructive" title={sheetsRead.error.message}>
                                Documents not loaded
                            </span>
                            <Button size="xs" variant="outline" className="shrink-0" onClick={() => void sheetsRead.refresh()}>
                                Retry
                            </Button>
                        </div>
                    ) : sheetsRead.loading ? null : (
                        <p className="p-3 text-sm text-muted-foreground">No documents</p>
                    )
                )}
                {outputView === "fabrication" && hasFabrication && (
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        <FabricationViewer
                            key={`${fabricationSource.key}:${focusFile}`}
                            source={fabricationSource}
                            focusFile={focusFile || undefined}
                        />
                    </div>
                )}
                {outputView === "members" && (
                    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
                        <div className="min-h-0 flex-1 overflow-y-auto border">
                            {Object.entries(membersByDomain).map(([domain, members]) => (
                                <div key={domain}>
                                    <h5 className="sticky top-0 bg-background px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        {domain.replace("_", " ")}
                                    </h5>
                                    {members.map((item) => (
                                        <div key={item.path} className="flex items-center border-t hover:bg-muted/40">
                                            <button
                                                type="button"
                                                className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-xs"
                                                onClick={() => openMember(item)}
                                            >
                                                <span className="flex-1 truncate font-mono">{item.path}</span>
                                                <span className="text-muted-foreground">{shortDigest(item.released_digest)}</span>
                                            </button>
                                            {isLayerFile(item.path) && (
                                                <Button
                                                    size="xs"
                                                    variant="ghost"
                                                    className="mr-2 shrink-0"
                                                    aria-label={`View ${item.path} as text`}
                                                    onClick={() => setMember(item)}
                                                >
                                                    Text
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                        {member && (
                            <MemberViewer
                                key={`${detail.build.id}:${member.path}`}
                                projectId={projectId}
                                buildId={detail.build.id}
                                member={member}
                                onClose={() => setMember(null)}
                            />
                        )}
                    </div>
                )}
                {outputView === "evidence" && (
                    <div className="min-h-0 flex-1 overflow-y-auto p-3">
                        <EvidenceWarnings
                            key={detail.build.id}
                            projectId={projectId}
                            buildId={detail.build.id}
                            members={detail.members}
                            warnings={detail.build.warnings}
                            evidence={detail.evidence}
                        />
                    </div>
                )}
            </div>

            <ReleaseChecksRail
                projectId={projectId}
                detail={detail}
                profiles={profiles}
                busy={busy}
                onContinue={onContinue}
                onRun={onRun}
                onRefresh={onRefresh}
            />
        </div>
    );
}



function sheetLabel(key: string): string {
    if (key.toLowerCase() === "bom") return "BOM";
    return key ? key.charAt(0).toUpperCase() + key.slice(1) : key;
}


function groupMembers(members: ReleaseMember[]): Record<string, ReleaseMember[]> {
    const grouped: Record<string, ReleaseMember[]> = {};
    for (const member of members) {
        const domain = member.domains[0] || "other";
        (grouped[domain] ??= []).push(member);
    }
    return grouped;
}
