import { useEffect, useState } from "react";

import { readCatalog } from "./api";

let availability: Promise<boolean> | null = null;

/** Whether the backend serves Simulation Studio (PRISM_SIM_STUDIO_ENABLED); its routes 404 otherwise. */
export function simStudioAvailable(): Promise<boolean> {
    availability ??= readCatalog().then(() => true, () => false);
    return availability;
}

/** Test seam: forget the cached answer. */
export function resetSimStudioAvailability(): void {
    availability = null;
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
