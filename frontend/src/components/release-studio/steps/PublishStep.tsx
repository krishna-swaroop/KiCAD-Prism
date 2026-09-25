import { useState } from "react";
import { ExternalLink, Loader2, Upload } from "lucide-react";

import { HoldToConfirmButton } from "@/components/ui/hold-to-confirm-button";

import * as api from "../api";
import type { BuildDetail } from "../types";
import type { RunFn } from "../shared";

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
    const forgeUrl = detail.forge_release?.url || detail.approvals?.published?.forge_url || publishedUrl;
    const ready = detail.build.status === "succeeded";
    const tag = String(detail.configuration?.revision || "");
    const documentName = String(detail.configuration?.document_number || "");
    const notes = String(detail.configuration?.release_notes || "");
    const gates = detail.approvals;
    const publishing = busy === "publish";
    const canPublish = Boolean(
        canMutate
        && ready
        && tag.trim()
        && !publishing
        && (gates ? gates.can_publish : false),
    );
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
                    <p className="text-sm text-muted-foreground">
                        Prism recorded this publish, but {forgeName} no longer has a Release for {tag || "this tag"}.
                    </p>
                )}
                <p className="text-sm text-muted-foreground">Tag {tag} · {documentName || "—"}</p>
            </div>
        );
    }

    const publish = () => {
        void onRun("publish", async () => {
            const result = await api.publishBuild(projectId, detail.build.id, {
                tag: tag.trim(),
                title: tag.trim(),
                notes,
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
                <div className="sm:col-span-2">
                    <dt className="text-xs uppercase text-muted-foreground">Notes</dt>
                    <dd className="whitespace-pre-wrap">{notes || "—"}</dd>
                </div>
            </dl>
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

export default PublishStep;
