import { useEffect, useState, type ReactNode } from "react";
import { Download } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import * as api from "./api";
import { DOCUMENT_ORDER, shortDigest } from "./flow";
import type { DocumentSheet, ReleaseMember, VendorProfile, VendorReadiness } from "./types";

function revokeObjectUrl(url: string) {
    if (url && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(url);
    }
}

export type RunFn = (label: string, action: () => Promise<unknown>, success?: string) => Promise<void>;

export function orderedSheets(sheets: DocumentSheet[]): DocumentSheet[] {
    return [...sheets].sort((left, right) => {
        const leftIndex = DOCUMENT_ORDER.indexOf(left.key as (typeof DOCUMENT_ORDER)[number]);
        const rightIndex = DOCUMENT_ORDER.indexOf(right.key as (typeof DOCUMENT_ORDER)[number]);
        const leftRank = leftIndex === -1 ? DOCUMENT_ORDER.length : leftIndex;
        const rightRank = rightIndex === -1 ? DOCUMENT_ORDER.length : rightIndex;
        if (leftRank !== rightRank) return leftRank - rightRank;
        return left.key.localeCompare(right.key);
    });
}

export function DocumentSheetPreview({
    projectId,
    buildId,
    sheet,
}: {
    projectId: string;
    buildId: string;
    sheet: DocumentSheet;
}) {
    const [url, setUrl] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        let revoked = false;
        let created = "";
        setUrl("");
        setError("");
        void Promise.resolve(api.sheetObjectUrl(projectId, buildId, sheet.key))
            .then((objectUrl) => {
                if (!objectUrl) return;
                if (revoked) {
                    revokeObjectUrl(objectUrl);
                    return;
                }
                created = objectUrl;
                setUrl(objectUrl);
            })
            .catch((cause: unknown) => {
                if (!revoked) setError(cause instanceof Error ? cause.message : String(cause));
            });
        return () => {
            revoked = true;
            revokeObjectUrl(created);
        };
    }, [projectId, buildId, sheet.key]);

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            {error && <p className="shrink-0 text-sm text-destructive">{error}</p>}
            <div className="relative min-h-0 flex-1 overflow-hidden border bg-preview-surface">
                {url && (
                    // react-doctor-disable-next-line react-doctor/iframe-missing-sandbox
                    <iframe
                        title={sheet.key}
                        src={url}
                        className="absolute inset-0 h-full w-full border-0 bg-preview-surface"
                    />
                )}
            </div>
        </div>
    );
}

function previewKind(mediaType: string, path: string): "pdf" | "image" | "text" | "none" {
    const type = (mediaType || "").toLowerCase();
    if (type === "application/pdf") return "pdf";
    if (type.startsWith("image/")) return "image";
    if (
        type.startsWith("text/")
        || type === "application/json"
        || type === "application/vnd.gerber"
        || /\.(gbr|g[a-z0-9]{2}|drl|csv|json|txt)$/i.test(path)
    ) {
        return "text";
    }
    return "none";
}

export function MemberViewer({
    projectId,
    buildId,
    member,
    onClose,
}: {
    projectId: string;
    buildId: string;
    member: ReleaseMember;
    onClose: () => void;
}) {
    const [objectUrl, setObjectUrl] = useState("");
    const [text, setText] = useState("");
    const [failure, setFailure] = useState("");
    const kind = previewKind(member.media_type, member.path);

    // Keyed on the build member by InspectOutputsStep, so a different artifact
    // is a different viewer and starts blank without being blanked.
    //
    // The fetch stays here. react-doctor wants a data-fetching layer, and the
    // project has none: this is one request for one blob, owned by the view
    // that shows it and revoked when that view goes away.
    // react-doctor-disable-next-line react-doctor/no-fetch-in-effect
    useEffect(() => {
        let revoked = false;
        let created = "";
        if (kind === "none") return undefined;
        void api
            .memberObjectUrl(projectId, buildId, member.path)
            .then(async ({ url }) => {
                if (revoked) {
                    revokeObjectUrl(url);
                    return;
                }
                created = url;
                if (kind === "text") {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error(`Preview unavailable (${response.status})`);
                    const body = await response.text();
                    if (!revoked) setText(body);
                } else {
                    setObjectUrl(url);
                }
            })
            .catch((cause: unknown) => {
                if (!revoked) setFailure(cause instanceof Error ? cause.message : String(cause));
            });
        return () => {
            revoked = true;
            revokeObjectUrl(created);
        };
    }, [projectId, buildId, member.path, kind]);

    return (
        <div className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">{member.path}</span>
                <Badge variant="outline">{member.media_type || "unknown"}</Badge>
                <span className="font-mono text-xs text-muted-foreground">
                    {shortDigest(member.released_digest)}
                </span>
                <div className="ml-auto flex gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                            void api.downloadFile(
                                api.downloadUrl(
                                    projectId,
                                    `builds/${encodeURIComponent(buildId)}/members/`
                                        + `${member.path.split("/").map(encodeURIComponent).join("/")}`
                                        + "?disposition=attachment",
                                ),
                                member.path.split("/").pop() ?? "member",
                            )
                        }
                    >
                        Download
                    </Button>
                    <Button size="sm" variant="ghost" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </div>
            {failure && <p className="text-sm text-destructive">{failure}</p>}
            {!failure && kind === "none" && (
                <p className="text-sm text-muted-foreground">No preview. Download to inspect.</p>
            )}
            {!failure && kind === "pdf" && objectUrl && (
                // react-doctor-disable-next-line react-doctor/iframe-missing-sandbox
                <iframe title={member.path} src={objectUrl} className="h-[70vh] w-full border" />
            )}
            {!failure && kind === "image" && objectUrl && (
                <img alt={member.path} src={objectUrl} className="max-h-[70vh] w-full border bg-preview-surface object-contain" />
            )}
            {!failure && kind === "text" && text && (
                <pre className="max-h-[70vh] overflow-auto border bg-muted/40 p-2 text-xs">{text}</pre>
            )}
        </div>
    );
}

export function VendorPackCard({
    projectId,
    buildId,
    profiles,
    busy,
    readiness = [],
    vendorId: controlledVendorId,
    onVendorChange,
    children,
}: {
    projectId: string;
    buildId: string;
    profiles: VendorProfile[];
    busy: string;
    readiness?: VendorReadiness[];
    vendorId?: string;
    onVendorChange?: (vendorId: string) => void;
    children?: ReactNode;
}) {
    const [uncontrolledVendorId, setUncontrolledVendorId] = useState(profiles[0]?.id ?? "");
    const vendorId = controlledVendorId ?? uncontrolledVendorId;
    const selected = profiles.find((profile) => profile.id === vendorId) ?? profiles[0];
    const readinessForSelected = readiness.find((item) => (item.vendor_id || item.profile_id) === selected?.id);
    const ready = readinessForSelected?.ready === true;
    if (!selected) return null;

    return (
        <div className="space-y-2 border p-3">
            <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1 space-y-1 text-xs">
                    <span className="text-muted-foreground">Manufacturer</span>
                    <select
                        aria-label="Manufacturer"
                        className="flex h-8 w-full border border-input bg-background px-2 py-1 text-xs leading-none"
                        value={selected.id}
                        onChange={(event) => {
                            setUncontrolledVendorId(event.target.value);
                            onVendorChange?.(event.target.value);
                        }}
                    >
                        {profiles.map((profile) => (
                            <option key={profile.id} value={profile.id}>
                                {profile.title}
                            </option>
                        ))}
                    </select>
                </label>
                <Button
                    size="xs"
                    variant="outline"
                    aria-label={`Download ${selected.pack_filename}`}
                    disabled={Boolean(busy) || !ready}
                    onClick={() =>
                        void api.downloadFile(
                            api.vendorPackUrl(projectId, buildId, selected.id),
                            selected.pack_filename,
                        )
                    }
                >
                    <Download className="mr-1 h-3 w-3" /> {selected.pack_filename}
                </Button>
            </div>
            {children}
            {!ready && (
                <p className="text-xs text-destructive">
                    Incomplete: {(readinessForSelected?.missing_requirements ?? []).join(", ") || "manufacturer pack is not ready"}
                </p>
            )}
        </div>
    );
}
