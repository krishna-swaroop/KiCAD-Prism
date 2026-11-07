import { useCallback, useState } from "react";
import { toast } from "sonner";

import { KICAD_LIBRARIES_KEY, listLibraries } from "@/lib/kicad-libraries-client";
import { useServerState } from "@/lib/server-state";
import type { KicadLibraryList } from "@/types/kicad-libraries";

// A fetch's progress and a check's result show up within this; paused while the tab is hidden.
const POLL_MS = 3000;

/** The libraries and the variables boards use, kept fresh while the page is open. */
export function useKicadLibraries(): { list: KicadLibraryList | null; error: string | null; reload: () => Promise<void> } {
    const read = useServerState(KICAD_LIBRARIES_KEY, (signal) => listLibraries(signal), {
        pollMs: POLL_MS,
        whileVisible: true,
    });
    return { list: read.data ?? null, error: read.error?.message ?? null, reload: read.refresh };
}

function messageOf(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
}

/** One action at a time: it disables the page while it runs, reloads the list after, and reports a failure. */
export function useLibraryActions(reload: () => Promise<void>) {
    const [busy, setBusy] = useState(false);

    const run = useCallback(
        async (action: () => Promise<unknown>, failure: string, success?: string): Promise<boolean> => {
            setBusy(true);
            try {
                await action();
                await reload();
                if (success) toast.success(success);
                return true;
            } catch (caught) {
                toast.error(messageOf(caught, failure));
                // A write refused because the library changed elsewhere: show what it is now.
                await reload().catch(() => undefined);
                return false;
            } finally {
                setBusy(false);
            }
        },
        [reload],
    );

    return { busy, run };
}

export { messageOf };
