import { useCallback, useEffect, useState } from "react";

/**
 * Per-user viewer preferences, stored in the browser.
 *
 * These are display choices, not workspace data: the server does nothing with
 * them, so they live in localStorage keyed by the signed-in user rather than in
 * the database. Keying by email keeps two people sharing a browser from
 * inheriting each other's viewer preferences.
 */
export interface ViewerSettings {
    /** Render every viewer in greyscale instead of full colour. */
    greyscale: boolean;
}

const DEFAULTS: ViewerSettings = {
    greyscale: false,
};

const STORAGE_PREFIX = "prism.viewer-settings";
// Fired on the same tab after a write, so every mounted reader updates without
// waiting for another component to poll. The native `storage` event only fires
// in *other* tabs, which is why this exists alongside it.
const CHANGE_EVENT = "prism:viewer-settings-change";

// The signed-in user's email, published once by the app shell. Deep viewer
// components read their per-user settings without threading the user object
// through every intermediate prop; `useViewerSettings(email)` with an explicit
// email (e.g. the settings dialog) still takes precedence.
let activeUserEmail: string | null = null;

export function setActiveViewerUser(userEmail: string | null | undefined): void {
    activeUserEmail = userEmail?.toLowerCase() || null;
    if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(CHANGE_EVENT));
    }
}

function resolveEmail(userEmail: string | null | undefined): string {
    return (userEmail ?? activeUserEmail)?.toLowerCase() || "anon";
}

function storageKey(userEmail: string | null | undefined): string {
    return `${STORAGE_PREFIX}.${resolveEmail(userEmail)}`;
}

function readSettings(userEmail: string | null | undefined): ViewerSettings {
    if (typeof window === "undefined") return DEFAULTS;
    try {
        const raw = window.localStorage.getItem(storageKey(userEmail));
        if (!raw) return DEFAULTS;
        const parsed = JSON.parse(raw) as Partial<ViewerSettings>;
        return { ...DEFAULTS, ...parsed };
    } catch {
        return DEFAULTS;
    }
}

/**
 * Read and update the current user's viewer settings. Every hook instance stays
 * in sync: a write from one broadcasts to the others (this tab and any other).
 */
export function useViewerSettings(userEmail: string | null | undefined) {
    const key = storageKey(userEmail);
    const [settings, setSettings] = useState<ViewerSettings>(() => readSettings(userEmail));

    useEffect(() => {
        setSettings(readSettings(userEmail));
        const sync = () => setSettings(readSettings(userEmail));
        const onStorage = (event: StorageEvent) => {
            if (event.key === null || event.key === key) sync();
        };
        window.addEventListener(CHANGE_EVENT, sync);
        window.addEventListener("storage", onStorage);
        return () => {
            window.removeEventListener(CHANGE_EVENT, sync);
            window.removeEventListener("storage", onStorage);
        };
    }, [key, userEmail]);

    const update = useCallback(
        (patch: Partial<ViewerSettings>) => {
            const next = { ...readSettings(userEmail), ...patch };
            try {
                window.localStorage.setItem(key, JSON.stringify(next));
            } catch {
                // A full or unavailable localStorage should not break the UI;
                // the change simply will not persist across reloads.
            }
            window.dispatchEvent(new Event(CHANGE_EVENT));
            setSettings(next);
        },
        [key, userEmail],
    );

    return { settings, update };
}
