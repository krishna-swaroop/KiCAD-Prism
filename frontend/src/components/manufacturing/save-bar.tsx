import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/** Warn on tab close or reload while there are unsaved edits. */
export function useBeforeUnloadWhen(active: boolean) {
    useEffect(() => {
        if (!active) return;
        const handler = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            // Required by some browsers to show the prompt.
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [active]);
}

interface SaveBarProps {
    saving: boolean;
    onSave: () => void;
    onDiscard: () => void;
    saveLabel?: string;
}

/** Sticks to the bottom of its scroll area while there are unsaved changes. */
export function SaveBar({ saving, onSave, onDiscard, saveLabel = "Save spec" }: SaveBarProps) {
    return (
        <div
            role="region"
            aria-label="Unsaved changes"
            className="sticky bottom-0 z-10 -mx-1 flex items-center justify-between gap-3 border bg-card px-4 py-2.5 shadow-md"
        >
            <span className="text-sm">You have unsaved changes.</span>
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
                    Discard
                </Button>
                <Button size="sm" onClick={onSave} disabled={saving}>
                    {saving ? "Saving..." : saveLabel}
                </Button>
            </div>
        </div>
    );
}
