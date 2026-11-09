/**
 * Public tracker-integration surface for settings/UI tickets (TR-37+).
 *
 * Import from this barrel rather than deep paths so unused-export scan
 * treats the frozen DTO/client API as consumed.
 */
export * from "@/types/trackers";
export {
    DestinationDisclosure,
    destinationPolicyAlerts,
    destinationSourceLabel,
    formatDestinationLine,
    isImportedDefaultDestination,
    visibilityAckState,
    visibilityBadgeVariant,
    visibilityLabel,
} from "./destination-disclosure";
export type { DestinationDisclosureProps, DestinationDisclosureVariant, VisibilityAckState } from "./destination-disclosure";
export {
    ProjectTrackerSettingsPanel,
    autoPromoteSummary,
    describeProjectTrackerError,
    promoteRoleExplanation,
} from "./project-tracker-settings";
export type { ProjectTrackerSettingsPanelProps, ProjectTrackerSettingsPhase } from "./project-tracker-settings";
export {
    TRACKER_ROUTES,
    TrackerApiError,
    beginIdentityLink,
    createConnector,
    deleteConnector,
    listConnectorRepositories,
    listConnectors,
    listIdentities,
    projectionFromComment,
    promoteComment,
    retryThreadSync,
    stripTrackerSecrets,
    unlinkIdentity,
    unlinkThread,
    repromoteComment,
} from "@/lib/trackers-client";
