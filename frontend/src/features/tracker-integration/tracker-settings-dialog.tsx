import { useNavigate } from "react-router-dom";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { settingsHref } from "@/lib/settings-tabs";

import { ProjectTrackerSettingsPanel } from "./project-tracker-settings";

interface TrackerSettingsDialogProps {
    projectId: string;
    isAdmin: boolean;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * Where this project's discussions are published. Code hosts themselves are
 * workspace-wide and live in Settings → Code hosts.
 */
export function TrackerSettingsDialog({ projectId, isAdmin, open, onOpenChange }: TrackerSettingsDialogProps) {
    const navigate = useNavigate();
    const openCodeHosts = () => {
        onOpenChange(false);
        navigate(settingsHref("code-hosts"));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
                <DialogTitle>Issue publishing</DialogTitle>
                <DialogDescription className="sr-only">Where this project's comments are published as issues.</DialogDescription>
                <ProjectTrackerSettingsPanel
                    projectId={projectId}
                    isAdmin={isAdmin}
                    chromeless
                    onManageCodeHosts={isAdmin ? openCodeHosts : undefined}
                />
            </DialogContent>
        </Dialog>
    );
}
