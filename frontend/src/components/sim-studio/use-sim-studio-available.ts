import { useEffect, useState } from "react";

import { fetchAuthConfig } from "@/lib/auth";

let availability: Promise<boolean> | null = null;

/**
 * Whether the backend serves Simulation Studio (PRISM_SIM_STUDIO_ENABLED), as
 * the app configuration says; its routes 404 otherwise, so they are not probed.
 */
export function simStudioAvailable(): Promise<boolean> {
    availability ??= fetchAuthConfig().then(
        (config) => config.sim_studio_enabled === true,
        () => {
            // A failed read is not an answer: clearing the memo makes the next
            // use refetch instead of keeping Studio off for the whole page.
            availability = null;
            return false;
        },
    );
    return availability;
}

export function useSimStudioAvailable(): boolean {
    const [available, setAvailable] = useState(false);
    useEffect(() => {
        let cancelled = false;
        void simStudioAvailable().then((value) => { if (!cancelled) setAvailable(value); });
        return () => { cancelled = true; };
    }, []);
    return available;
}
