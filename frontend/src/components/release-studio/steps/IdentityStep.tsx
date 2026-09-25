import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import * as api from "../api";
import type { ReleaseIdentity } from "../types";

/**
 * What the forges accept, mirroring `_TAG_RE` in `forge_publish_service`.
 *
 * Checked here because the tag is printed as the drawing revision: a tag the
 * forge rejects is only discovered at Publish, by which point every sheet has
 * already been composed with it and the build has to be thrown away.
 */
const FORGE_TAG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export function IdentityStep({
    projectId,
    identity,
    canMutate,
    busy,
    onChange,
    onContinue,
}: {
    projectId: string;
    identity: ReleaseIdentity;
    canMutate: boolean;
    busy: string;
    onChange: (next: ReleaseIdentity) => void;
    onContinue: () => void;
}) {
    const [tagError, setTagError] = useState("");
    const [checking, setChecking] = useState(false);
    const tag = identity.tag.trim();
    const malformed = Boolean(tag) && !FORGE_TAG.test(tag);
    const ready = Boolean(tag && !malformed && identity.document_name.trim() && identity.date.trim());

    useEffect(() => {
        // A malformed tag cannot exist on the forge, and asking wastes a call.
        if (!tag || malformed) {
            setTagError("");
            setChecking(false);
            return;
        }
        let cancelled = false;
        setChecking(true);
        // Debounced: this reaches GitHub/GitLab through the backend, and firing
        // it per keystroke spent a round-trip on every prefix of the tag.
        const timer = window.setTimeout(() => {
            void api.tagExists(projectId, tag)
                .then((exists) => {
                    if (!cancelled) setTagError(exists ? `${tag} already exists on GitHub/GitLab.` : "");
                })
                .catch(() => {
                    if (!cancelled) setTagError("");
                })
                .finally(() => {
                    if (!cancelled) setChecking(false);
                });
        }, 400);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [projectId, tag, malformed]);

    return (
        <div className="space-y-5">
            <h3 className="text-lg font-semibold">Release identity</h3>
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="rs-identity-tag">Tag</Label>
                    <Input
                        id="rs-identity-tag"
                        value={identity.tag}
                        onChange={(event) => onChange({ ...identity, tag: event.target.value })}
                        placeholder="v1.0.0"
                        disabled={!canMutate}
                    />
                    {malformed && (
                        <p className="text-sm text-destructive">
                            GitHub and GitLab will not accept this tag. Start with a letter or
                            digit and use only letters, digits, dots, underscores, and hyphens
                            — no slashes.
                        </p>
                    )}
                    {!malformed && checking && <p className="text-xs text-muted-foreground">Checking whether this tag exists…</p>}
                    {!malformed && tagError && <p className="text-sm text-destructive">{tagError}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="rs-identity-doc">Document Name</Label>
                    <Input
                        id="rs-identity-doc"
                        value={identity.document_name}
                        onChange={(event) => onChange({ ...identity, document_name: event.target.value })}
                        placeholder="USBPD-100"
                        disabled={!canMutate}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="rs-identity-date">Date</Label>
                    <Input
                        id="rs-identity-date"
                        type="date"
                        value={identity.date}
                        onChange={(event) => onChange({ ...identity, date: event.target.value })}
                        disabled={!canMutate}
                    />
                </div>
            </div>
            <div className="space-y-2">
                <Label htmlFor="rs-identity-notes">Release notes</Label>
                <Textarea
                    id="rs-identity-notes"
                    value={identity.notes}
                    onChange={(event) => onChange({ ...identity, notes: event.target.value })}
                    rows={4}
                    disabled={!canMutate}
                />
            </div>
            {canMutate && (
                <Button disabled={!ready || Boolean(tagError) || checking || Boolean(busy)} onClick={onContinue}>
                    Continue
                </Button>
            )}
        </div>
    );
}

export default IdentityStep;
