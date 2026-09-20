/**
 * Public tracker-integration surface for settings/UI tickets (TR-37+).
 *
 * Import from this barrel rather than deep paths so unused-export scan
 * treats the frozen DTO/client API as consumed.
 */
export * from "@/types/trackers";
export {
    TRACKER_ROUTES,
    TrackerApiError,
    acknowledgeDestination,
    beginIdentityLink,
    createConnector,
    getConnector,
    getConnectorHealth,
    getProjectTracker,
    listConnectors,
    listIdentities,
    pauseConnector,
    projectionFromComment,
    promoteComment,
    resumeConnector,
    retryThreadSync,
    revokeConnector,
    stripTrackerSecrets,
    testConnector,
    trackerUiMocks,
    unlinkIdentity,
    updateConnector,
    updateProjectTracker,
} from "@/lib/trackers-client";
