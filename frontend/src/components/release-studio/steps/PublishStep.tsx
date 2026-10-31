import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Upload } from "lucide-react";

import { HoldToConfirmButton } from "@/components/ui/hold-to-confirm-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { hasProjectUsage, readReleaseBom } from "@/features/supply/release-check-api";
import { ReleaseSnapshotCard } from "@/features/supply/release-snapshot-card";
import { ReleaseSupplySummary } from "@/features/supply/release-supply-check";

import * as api from "../api";
import type { BuildDetail } from "../types";
import type { RunFn } from "../shared";
import { UnpinnedModelsAck, useModelAcknowledgement } from "../UnpinnedModels";

export function PublishStep({
    projectId,
    detail,
    canMutate,
    busy,
    onRun,
}: {
    projectId: string;
    detail: BuildDetail;
    canMutate: boolean;
    busy: string;
    onRun: RunFn;
}) {
    const forge = detail.forge;
    const forgeName = forge?.name || "GitHub or GitLab";
    const [publishedUrl, setPublishedUrl] = useState("");
    const [attachDraft, setAttachDraft] = useState(false);
    const forgeUrl = detail.forge_release?.url || detail.approvals?.published?.forge_url || publishedUrl;
    const ready = detail.build.status === "succeeded";
    const tag = String(detail.configuration?.revision || "");
    const documentName = String(detail.configuration?.document_number || "");
    const notes = String(detail.configuration?.release_notes || "");
    const gates = detail.approvals;
    const unpinned = gates?.unpinned_models ?? [];
    const acknowledgement = useModelAcknowledgement(detail.build.id, unpinned);
    const publishing = busy === "publish";
    const canPublish = Boolean(
        canMutate
        && ready
        && tag.trim()
        && !publishing
        && (gates ? gates.can_publish : false)
        && acknowledgement.satisfied,
    );
    const selfContained = detail.candidate?.self_contained;
    const tokenHint = forge && !forge.token_configured ? forge.token_hint : "";
    const blocked = gates?.blocked_reason || "";

    if (publishedUrl || gates?.published) {
        return (
            <div className="space-y-3">
                <h3 className="text-lg font-semibold">Published to {forgeName}</h3>
                {forgeUrl ? (
                    <a href={forgeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline">
                        <ExternalLink className="h-3 w-3" /> {forgeUrl}
                    </a>
                ) : (
                    <p
                        className="truncate text-sm text-warning"
                        title={`Prism recorded this publish, but ${forgeName} no longer has a Release for ${tag || "this tag"}.`}
                    >
                        {forgeName} Release missing
                    </p>
                )}
                <p className="text-sm text-muted-foreground">Tag {tag} · {documentName || "—"}</p>
                <ReleaseSnapshotCard projectId={projectId} buildId={detail.build.id} />
                <KeepBomOffer projectId={projectId} buildId={detail.build.id} />
            </div>
        );
    }

    const publish = () => {
        void onRun("publish", async () => {
            const result = await api.publishBuild(projectId, detail.build.id, {
                tag: tag.trim(),
                title: tag.trim(),
                notes,
                attach_compliance_draft: attachDraft,
                acknowledged_models: acknowledgement.keys,
            });
            setPublishedUrl(result.release.url);
        });
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="space-y-1">
                <h3 className="text-lg font-semibold">Publish to {forgeName}</h3>
                {forge?.owner_repo && (
                    <p className="font-mono text-xs text-muted-foreground">{forge.host}/{forge.owner_repo}</p>
                )}
            </div>
            {tokenHint && <p className="text-sm text-destructive">{tokenHint}</p>}
            {blocked && <p className="text-sm text-destructive">{blocked}</p>}
            <ReleaseSupplySummary projectId={projectId} buildId={detail.build.id} />
            <dl className="grid gap-3 border p-3 text-sm sm:grid-cols-2">
                <div>
                    <dt className="text-xs uppercase text-muted-foreground">Tag</dt>
                    <dd className="font-mono">{tag || "—"}</dd>
                </div>
                <div>
                    <dt className="text-xs uppercase text-muted-foreground">Document Name</dt>
                    <dd>{documentName || "—"}</dd>
                </div>
                <div>
                    <dt className="text-xs uppercase text-muted-foreground">Date</dt>
                    <dd>{detail.configuration?.release_date || "—"}</dd>
                </div>
                <div>
                    <dt className="text-xs uppercase text-muted-foreground">Self-contained</dt>
                    <dd>{selfContained == null ? "—" : selfContained ? "Yes" : "No"}</dd>
                </div>
                <div className="sm:col-span-2">
                    <dt className="text-xs uppercase text-muted-foreground">Notes</dt>
                    <dd className="whitespace-pre-wrap">{notes || "—"}</dd>
                </div>
            </dl>
            <UnpinnedModelsAck
                models={unpinned}
                checked={acknowledgement.acknowledged}
                onCheckedChange={acknowledgement.setAcknowledged}
                disabled={!canMutate || publishing}
            />
            <div className="flex items-center gap-2">
                <Checkbox id="attach-compliance" checked={attachDraft} onCheckedChange={(value) => setAttachDraft(value === true)} />
                <Label htmlFor="attach-compliance" className="text-sm font-normal">
                    Attach the compliance draft (RoHS and REACH, a working document) to the release
                </Label>
            </div>
            <HoldToConfirmButton
                variant="default"
                className="self-start"
                disabled={!canPublish || Boolean(tokenHint) || publishing}
                holdingLabel="Keep holding…"
                progressClassName="bg-primary-foreground/25"
                onConfirm={publish}
            >
                {publishing ? (
                    <>
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        Publishing to {forgeName}…
                    </>
                ) : (
                    <>
                        <Upload className="mr-1 h-3 w-3" />
                        Hold to publish to {forgeName}
                    </>
                )}
            </HoldToConfirmButton>
        </div>
    );
}

/**
 * After publishing: offer to keep the release's BOM in Prism when Prism has never read this project's. It asks no
 * distributor and tracks nothing; tracking is a separate decision on the project's Supply tab.
 */
function KeepBomOffer({ projectId, buildId }: { projectId: string; buildId: string }) {
    const [offer, setOffer] = useState(false);
    const [done, setDone] = useState("");
    const [failed, setFailed] = useState("");

    useEffect(() => {
        const controller = new AbortController();
        hasProjectUsage(projectId, controller.signal)
            .then((state) => setOffer(!state.has_usage))
            .catch(() => setOffer(false));
        return () => controller.abort();
    }, [projectId]);

    if (done) return <p className="text-sm text-muted-foreground">{done}</p>;
    if (!offer) return null;
    return (
        <div className="space-y-1 border p-3 text-sm">
            <p>Prism has not read this project's BOM yet. Keep the release's BOM so supply can show what it knows of these parts.</p>
            <Button
                size="sm"
                variant="outline"
                onClick={() => {
                    readReleaseBom(projectId, buildId)
                        .then((result) => setDone(`Kept ${result.parts} parts. Nothing is tracked until you choose to.`))
                        .catch((error: Error) => setFailed(error.message));
                }}
            >
                Keep this BOM in Prism
            </Button>
            {failed ? <p className="text-destructive">{failed}</p> : null}
        </div>
    );
}

export default PublishStep;
