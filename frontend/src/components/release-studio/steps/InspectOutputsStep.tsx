import { useEffect, useMemo, useState } from "react";
import {
    CheckCircle2,
    ChevronDown,
    CircleDot,
    Crosshair,
    Download,
    FileCheck2,
    FileSpreadsheet,
    FileText,
    Layers3,
    PackageCheck,
    ShieldAlert,
    Workflow,
    type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import * as api from "../api";
import { shortDigest } from "../flow";
import {
    DocumentSheetPreview,
    MemberViewer,
    VendorPackCard,
    orderedSheets,
    type RunFn,
} from "../shared";
import type {
    ApprovalState,
    BuildDetail,
    DocumentSheet,
    ReleaseEvidence,
    ReleaseMember,
    ReviewSlot,
    VendorProfile,
    VendorReadiness,
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
    const [sheets, setSheets] = useState<DocumentSheet[]>([]);
    const [sheetKey, setSheetKey] = useState("");
    const [outputView, setOutputView] = useState("documents");
    const [member, setMember] = useState<ReleaseMember | null>(null);
    const [vendorId, setVendorId] = useState("");

    useEffect(() => {
        let cancelled = false;
        void api.listDocumentSheets(projectId, detail.build.id).then((next) => {
            if (cancelled) return;
            const ordered = orderedSheets(next);
            setSheets(ordered);
            setSheetKey((current) => current || ordered[0]?.key || "");
        });
        return () => {
            cancelled = true;
        };
    }, [projectId, detail.build.id]);

    const selectedSheet = sheets.find((sheet) => sheet.key === sheetKey) ?? sheets[0];
    const membersByDomain = useMemo(() => groupMembers(detail.members), [detail.members]);
    const selectedProfile = profiles.find((profile) => profile.id === vendorId) ?? profiles[0];
    const selectedReadiness = detail.vendor_readiness?.find(
        (item) => (item.vendor_id || item.profile_id) === selectedProfile?.id,
    );

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <Tabs value={outputView} onValueChange={setOutputView} className="shrink-0 gap-0">
                    <div className="flex items-center gap-2 border-b bg-card px-2">
                        <TabsList variant="line" className="h-10 gap-2" aria-label="Output views">
                            <TabsTrigger value="documents" className="gap-2 px-2 text-sm">
                                <FileText className="h-4 w-4" />
                                Documents{sheets.length ? ` (${sheets.length})` : ""}
                            </TabsTrigger>
                            <TabsTrigger value="members" className="gap-2 px-2 text-sm">
                                <Layers3 className="h-4 w-4" />
                                Members ({detail.members.length})
                            </TabsTrigger>
                            <TabsTrigger value="evidence" className="gap-2 px-2 text-sm">
                                <ShieldAlert className="h-4 w-4" />
                                Evidence ({detail.evidence.length})
                            </TabsTrigger>
                        </TabsList>
                        <div className="ml-auto flex shrink-0 flex-wrap gap-1">
                            <Button
                                size="xs"
                                variant="outline"
                                onClick={() => void onRun("download-dossier", () => api.downloadFile(api.dossierDownloadUrl(projectId, detail.build.id), `build-${detail.build.id}-dossier.tar.gz`))}
                            >
                                <Download className="mr-1 h-3 w-3" /> Dossier
                            </Button>
                            <Button
                                size="xs"
                                variant="outline"
                                onClick={() => void onRun("download-build-evidence", () => api.downloadFile(api.buildEvidenceDownloadUrl(projectId, detail.build.id), `build-${detail.build.id}-evidence.tar.gz`))}
                            >
                                <Download className="mr-1 h-3 w-3" /> Build evidence
                            </Button>
                        </div>
                    </div>
                </Tabs>
                {outputView === "documents" && (
                    sheets.length > 0 ? (
                        <Tabs
                            value={selectedSheet?.key}
                            onValueChange={setSheetKey}
                            className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden"
                        >
                            <div className="flex shrink-0 items-center gap-2 border-b bg-card px-2">
                                <TabsList variant="line" className="h-10 min-w-0 flex-1 gap-2 overflow-x-auto" aria-label="Output documents">
                                    {sheets.map((sheet) => {
                                        const Icon = SHEET_ICONS[sheet.key] ?? FileText;
                                        return (
                                            <TabsTrigger key={sheet.key} value={sheet.key} className="gap-2 px-2 text-sm">
                                                <Icon className="h-4 w-4" />
                                                {sheetLabel(sheet.key)}
                                            </TabsTrigger>
                                        );
                                    })}
                                </TabsList>
                                {selectedSheet && (
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
                                )}
                            </div>
                            {selectedSheet ? (
                                <DocumentSheetPreview
                                    projectId={projectId}
                                    buildId={detail.build.id}
                                    sheet={selectedSheet}
                                />
                            ) : null}
                        </Tabs>
                    ) : (
                        <p className="p-3 text-sm text-muted-foreground">No composed documents for this build.</p>
                    )
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
                                        <button
                                            key={item.path}
                                            type="button"
                                            className="flex w-full items-center gap-2 border-t px-3 py-1.5 text-left text-xs hover:bg-muted/40"
                                            onClick={() => setMember(item)}
                                        >
                                            <span className="flex-1 truncate font-mono">{item.path}</span>
                                            <span className="text-muted-foreground">{shortDigest(item.released_digest)}</span>
                                        </button>
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

            <div className="shrink-0 space-y-2 border-t pt-3">
                <SignOffCards
                    projectId={projectId}
                    buildId={detail.build.id}
                    approvals={detail.approvals}
                    busy={busy}
                    onRun={onRun}
                    onRefresh={onRefresh}
                />
                <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-0 flex-1">
                        <VendorPackCard
                            projectId={projectId}
                            buildId={detail.build.id}
                            profiles={profiles}
                            busy={busy}
                            readiness={detail.vendor_readiness}
                            vendorId={selectedProfile?.id}
                            onVendorChange={setVendorId}
                        >
                            <PackRequirementTiles profile={selectedProfile} readiness={selectedReadiness} />
                        </VendorPackCard>
                    </div>
                    <Button size="sm" className="shrink-0" onClick={onContinue}>Continue</Button>
                </div>
            </div>
        </div>
    );
}

function SignOffCards({
    projectId,
    buildId,
    approvals,
    busy,
    onRun,
    onRefresh,
}: {
    projectId: string;
    buildId: string;
    approvals?: ApprovalState;
    busy: string;
    onRun: RunFn;
    onRefresh?: () => Promise<unknown> | void;
}) {
    const published = Boolean(approvals?.published);
    const electrical = approvals?.electrical_errors ?? [];
    return (
        <div className="space-y-2">
            {electrical.length > 0 && !approvals?.both_approved ? (
                <div className="flex flex-wrap gap-1">
                    {electrical.map((kind) => (
                        <Badge key={kind} variant="destructive">{kind.toUpperCase()}</Badge>
                    ))}
                </div>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
            <SignOffCard
                label="Designer"
                slot="designer"
                decision={approvals?.designer ?? null}
                canApprove={Boolean(approvals?.can_approve_designer)}
                canWithdraw={Boolean(approvals?.can_withdraw && approvals.designer && !published)}
                electrical={electrical}
                published={published}
                busy={busy}
                onRun={onRun}
                onRefresh={onRefresh}
                projectId={projectId}
                buildId={buildId}
            />
            <SignOffCard
                label="QA"
                slot="qa"
                decision={approvals?.qa ?? null}
                canApprove={Boolean(approvals?.can_approve_qa)}
                canWithdraw={Boolean(approvals?.can_withdraw && approvals.qa && !published)}
                electrical={electrical}
                published={published}
                busy={busy}
                onRun={onRun}
                onRefresh={onRefresh}
                projectId={projectId}
                buildId={buildId}
            />
            </div>
            {approvals?.published ? (
                <p className="text-xs text-muted-foreground">
                    Published {approvals.published.tag} by {approvals.published.published_by}
                </p>
            ) : null}
        </div>
    );
}

function SignOffCard({
    label,
    slot,
    decision,
    canApprove,
    canWithdraw,
    electrical,
    published,
    busy,
    projectId,
    buildId,
    onRun,
    onRefresh,
}: {
    label: string;
    slot: ReviewSlot;
    decision: ApprovalState["designer"];
    canApprove: boolean;
    canWithdraw: boolean;
    electrical: string[];
    published: boolean;
    busy: string;
    projectId: string;
    buildId: string;
    onRun: RunFn;
    onRefresh?: () => Promise<unknown> | void;
}) {
    const [note, setNote] = useState("");
    const approved = Boolean(decision);
    const overrideRequired = electrical.length > 0;
    const runDecision = (withdraw: boolean) => {
        void onRun(withdraw ? `withdraw-${slot}` : `approve-${slot}`, async () => {
            if (withdraw) {
                await api.withdrawApproval(projectId, buildId, { slot, note });
            } else {
                await api.approveBuild(projectId, buildId, { slot, note });
            }
            setNote("");
            await onRefresh?.();
        });
    };

    return (
        <div
            className={cn(
                "flex min-w-0 flex-col gap-2 border bg-muted/20 px-3 py-2",
                approved && "border-success/50 bg-success/10",
            )}
        >
            <div className="flex min-w-0 items-center gap-2">
                <span className="text-sm font-medium">{label}</span>
                {approved ? (
                    <>
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
                        <span className="text-sm font-medium text-success">Approved</span>
                        <span className="min-w-0 truncate text-xs text-muted-foreground">{decision?.actor}</span>
                    </>
                ) : (
                    <Badge variant="outline">Pending</Badge>
                )}
            </div>
            {approved && decision?.note ? (
                <p className="truncate text-xs text-muted-foreground">{decision.note}</p>
            ) : null}
            {!published && canApprove && (
                <div className="flex items-center gap-2">
                    <Input
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder={overrideRequired ? "Override note" : "Note"}
                        aria-label={`${label} note`}
                        aria-required={overrideRequired}
                        className="h-7"
                    />
                    <Button
                        size="xs"
                        disabled={Boolean(busy) || (overrideRequired && !note.trim())}
                        aria-label={`Approve ${label}`}
                        onClick={() => runDecision(false)}
                    >
                        Approve
                    </Button>
                </div>
            )}
            {!published && canWithdraw && (
                <div className="flex items-center gap-2">
                    <Input
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Withdrawal note"
                        aria-label={`Withdraw ${label} note`}
                        className="h-7"
                    />
                    <Button
                        size="xs"
                        variant="outline"
                        disabled={Boolean(busy) || !note.trim()}
                        aria-label={`Withdraw ${label}`}
                        onClick={() => runDecision(true)}
                    >
                        Withdraw
                    </Button>
                </div>
            )}
        </div>
    );
}

function PackRequirementTiles({ profile, readiness }: { profile?: VendorProfile; readiness?: VendorReadiness }) {
    const missing = new Set(readiness?.missing_requirements ?? []);
    const requirements = profile?.required_pack_artifacts ?? [];
    if (requirements.length === 0) {
        return <p className="text-sm text-muted-foreground">Pack requirements are not available.</p>;
    }
    return (
        <div className="flex flex-wrap gap-1">
            {requirements.map((requirement) => {
                const state = !readiness ? "unavailable" : missing.has(requirement) ? "missing" : "ready";
                const Icon = requirement.startsWith("bom") ? FileSpreadsheet
                    : requirement.startsWith("cpl") ? PackageCheck
                    : requirement === "drill" ? FileCheck2 : Layers3;
                return (
                    <div key={requirement} className="inline-flex items-center gap-1 border px-1.5 py-0.5 text-xs">
                        <Icon className="h-3 w-3 text-muted-foreground" />
                        <span>{requirement}</span>
                        <Badge variant={state === "ready" ? "secondary" : "outline"} className="h-4 px-1">
                            {state}
                        </Badge>
                    </div>
                );
            })}
        </div>
    );
}

function sheetLabel(key: string): string {
    if (key.toLowerCase() === "bom") return "BOM";
    return key ? key.charAt(0).toUpperCase() + key.slice(1) : key;
}

function EvidenceWarnings({
    projectId,
    buildId,
    members,
    warnings,
    evidence,
}: {
    projectId: string;
    buildId: string;
    members: ReleaseMember[];
    warnings?: string[];
    evidence: ReleaseEvidence[];
}) {
    const groups = groupedWarningLines(warnings ?? []);
    const electrical = evidence.filter((item) => Object.keys(item.counts).length > 0);
    if (electrical.length === 0 && groups.length === 0) {
        return <p className="text-sm text-muted-foreground">No DRC/ERC evidence on this build.</p>;
    }

    return (
        <div className="space-y-2" aria-label="Build warnings">
            {electrical.map((item) => (
                <ElectricalEvidenceCard
                    key={item.kind}
                    projectId={projectId}
                    buildId={buildId}
                    members={members}
                    item={item}
                />
            ))}
            {groups.map((group) => (
                <WarningGroupCard key={group.label} group={group} />
            ))}
        </div>
    );
}

function ElectricalEvidenceCard({
    projectId,
    buildId,
    members,
    item,
}: {
    projectId: string;
    buildId: string;
    members: ReleaseMember[];
    item: ReleaseEvidence;
}) {
    const [open, setOpen] = useState(true);
    const [violations, setViolations] = useState<ElectricalViolation[] | null>(null);
    const [loadError, setLoadError] = useState("");
    const reportPath = evidenceReportPath(members, item.kind);

    useEffect(() => {
        if (!reportPath) {
            setViolations([]);
            setLoadError("");
            return;
        }
        let cancelled = false;
        setViolations(null);
        setLoadError("");
        void api.memberJson(projectId, buildId, reportPath)
            .then((payload) => {
                if (!cancelled) setViolations(collectViolations(payload));
            })
            .catch((cause: unknown) => {
                if (!cancelled) {
                    setViolations([]);
                    setLoadError(cause instanceof Error ? cause.message : String(cause));
                }
            });
        return () => {
            cancelled = true;
        };
    }, [projectId, buildId, reportPath]);

    const grouped = groupedElectrical(violations ?? []);

    return (
        <div className="border">
            <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
                aria-expanded={open}
                aria-label={`${item.kind.toUpperCase()} details`}
                onClick={() => setOpen((current) => !current)}
            >
                <Badge variant="outline">{item.kind.toUpperCase()}</Badge>
                {Object.entries(item.counts).map(([severity, count]) => (
                    <Badge
                        key={severity}
                        variant={severity === "error" && count > 0 ? "destructive" : "secondary"}
                    >
                        {severityLabel(severity)}: {count}
                    </Badge>
                ))}
                <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 text-muted-foreground", open && "rotate-180")} />
            </button>
            {open && (
                <div className="max-h-80 space-y-3 overflow-y-auto border-t px-3 py-2">
                    {violations === null && (
                        <p className="text-sm text-muted-foreground">Loading violations…</p>
                    )}
                    {loadError && <p className="text-sm text-destructive">{loadError}</p>}
                    {violations && grouped.length === 0 && !loadError && (
                        <p className="text-sm text-muted-foreground">No listed violations in this report.</p>
                    )}
                    {grouped.map((group) => (
                        <div key={`${group.severity}-${group.type}`}>
                            <p className="text-xs font-medium">
                                {group.title}
                                <span className="ml-1 text-muted-foreground">
                                    ({group.descriptions.length} {severityLabel(group.severity).toLowerCase()}
                                    {group.descriptions.length === 1 ? "" : "s"})
                                </span>
                            </p>
                            <ul className="mt-1 space-y-0.5 text-sm">
                                {group.descriptions.map((description, index) => (
                                    <li key={`${group.type}-${index}`} className="break-words text-muted-foreground">
                                        {description}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function WarningGroupCard({ group }: { group: { label: string; items: string[] } }) {
    const [open, setOpen] = useState(true);
    const title = humanizeType(group.label);
    return (
        <div className="border">
            <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
                aria-expanded={open}
                aria-label={`${title} details`}
                onClick={() => setOpen((current) => !current)}
            >
                <Badge variant="outline">{title}</Badge>
                <Badge variant="secondary">
                    {group.items.length} warning{group.items.length === 1 ? "" : "s"}
                </Badge>
                <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 text-muted-foreground", open && "rotate-180")} />
            </button>
            {open && (
                <ul className="max-h-80 space-y-1 overflow-y-auto border-t px-3 py-2 text-sm">
                    {group.items.map((item, index) => (
                        <li key={`${group.label}-${index}`} className="break-words text-muted-foreground">
                            {item}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

type ElectricalViolation = {
    type: string;
    severity: string;
    description: string;
};

function evidenceReportPath(members: ReleaseMember[], kind: ReleaseEvidence["kind"]): string | undefined {
    const reportKind = `${kind}_report`;
    return members.find((member) => member.member_kind === reportKind)?.path
        ?? members.find((member) => member.path.endsWith(`evidence/${kind}.json`))?.path;
}

function collectViolations(report: unknown): ElectricalViolation[] {
    if (!report || typeof report !== "object") return [];
    const payload = report as Record<string, unknown>;
    const items: ElectricalViolation[] = [];
    const push = (value: unknown) => {
        if (!value || typeof value !== "object") return;
        const row = value as Record<string, unknown>;
        if (row.excluded || row.ignored || row.waived) return;
        const type = String(row.type || "other");
        items.push({
            type,
            severity: String(row.severity || "unknown").trim().toLowerCase() || "unknown",
            description: String(row.description || type || "Violation"),
        });
    };
    for (const key of ["violations", "unconnected_items", "schematic_parity"]) {
        const list = payload[key];
        if (Array.isArray(list)) list.forEach(push);
    }
    const sheets = payload.sheets;
    if (Array.isArray(sheets)) {
        for (const sheet of sheets) {
            if (sheet && typeof sheet === "object") {
                const list = (sheet as { violations?: unknown }).violations;
                if (Array.isArray(list)) list.forEach(push);
            }
        }
    }
    return items;
}

function groupedElectrical(items: ElectricalViolation[]): {
    severity: string;
    type: string;
    title: string;
    descriptions: string[];
}[] {
    const groups = new Map<string, { severity: string; type: string; title: string; descriptions: string[] }>();
    for (const item of items) {
        const key = `${item.severity}\0${item.type}`;
        const existing = groups.get(key);
        if (existing) existing.descriptions.push(item.description);
        else {
            groups.set(key, {
                severity: item.severity,
                type: item.type,
                title: humanizeType(item.type),
                descriptions: [item.description],
            });
        }
    }
    const rank = ["error", "warning", "exclusion", "unknown"];
    return [...groups.values()].sort((left, right) => {
        const leftRank = rank.indexOf(left.severity);
        const rightRank = rank.indexOf(right.severity);
        if (leftRank !== rightRank) return (leftRank === -1 ? 99 : leftRank) - (rightRank === -1 ? 99 : rightRank);
        return left.title.localeCompare(right.title);
    });
}

function humanizeType(type: string): string {
    const cleaned = type.replace(/[_-]+/g, " ").trim();
    return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "Other";
}

function severityLabel(severity: string): string {
    return severity ? severity.charAt(0).toUpperCase() + severity.slice(1) : severity;
}

const ELECTRICAL_SUMMARY = /^(DRC|ERC):\s*\d+\s+error-severity/i;

function shortenWarning(text: string): string {
    const match = text.match(/(\S+\.(?:step|wrl|stp|iges))\s+resolves outside/i);
    if (match) return `${match[1]} is outside the closure`;
    return text;
}

function groupedWarningLines(warnings: string[]): { label: string; items: string[] }[] {
    const groups = new Map<string, string[]>();
    for (const warning of warnings) {
        if (ELECTRICAL_SUMMARY.test(warning)) continue;
        const colon = warning.indexOf(":");
        const label = colon > 0 ? warning.slice(0, colon).trim() : "warning";
        const rest = colon > 0 ? warning.slice(colon + 1).trim() : warning;
        const key = label.toLowerCase();
        const items = groups.get(key);
        const item = shortenWarning(rest);
        if (items) items.push(item);
        else groups.set(key, [item]);
    }
    return [...groups.entries()].map(([label, items]) => ({ label, items }));
}

function groupMembers(members: ReleaseMember[]): Record<string, ReleaseMember[]> {
    const grouped: Record<string, ReleaseMember[]> = {};
    for (const member of members) {
        const domain = member.domains[0] || "other";
        (grouped[domain] ??= []).push(member);
    }
    return grouped;
}
