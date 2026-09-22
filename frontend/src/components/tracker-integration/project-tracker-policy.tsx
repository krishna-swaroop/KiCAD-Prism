import type { Dispatch, SetStateAction } from "react";
import { Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { roleLabel } from "@/lib/roles";
import type { ProjectTrackerSettings } from "@/types/trackers";

import type { TrackerSettingsDraft } from "./project-tracker-destination";

const SEVERITY_OPTIONS = ["info", "minor", "major", "critical"] as const;
const PROMOTE_ROLE_OPTIONS = ["designer", "viewer"] as const;

export function autoPromoteSummary(settings: Pick<ProjectTrackerSettings, "autoMinSeverity" | "autoTaskClass">): string {
    const taskPart = settings.autoTaskClass ? " and class task" : "";
    return `Auto-promote at severity ≥ ${settings.autoMinSeverity}${taskPart}; question/info stay local.`;
}

export function promoteRoleExplanation(promoteMinRole: string): string {
    if (promoteMinRole === "viewer") {
        return "Viewers may publish when this project opts in. Default is designer-only publication.";
    }
    return "Only designers and administrators can publish. Viewers stay local-only unless you opt in below.";
}

interface PolicySectionProps {
    settings: ProjectTrackerSettings;
    draft: TrackerSettingsDraft;
    setDraft: Dispatch<SetStateAction<TrackerSettingsDraft | null>>;
    isAdmin: boolean;
}

export function ProjectTrackerPolicySection({ settings, draft, setDraft, isAdmin }: PolicySectionProps) {
    return (
        <section className="space-y-3" data-testid="policy-section">
            <div>
                <h3 className="text-sm font-medium">Publishing rules</h3>
                <p className="text-[11px] text-muted-foreground">Which comments become issues on their own, and who may publish the rest.</p>
            </div>
            {isAdmin ? (
                <>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="tracker-auto-severity">Auto-publish from severity</Label>
                            <Select value={draft.autoMinSeverity} onValueChange={(autoMinSeverity) => setDraft((prev) => prev ? { ...prev, autoMinSeverity } : prev)}>
                                <SelectTrigger id="tracker-auto-severity" className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {SEVERITY_OPTIONS.map((severity) => <SelectItem key={severity} value={severity}>{severity}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="tracker-promote-role">Who may publish</Label>
                            <Select value={draft.promoteMinRole} onValueChange={(promoteMinRole) => setDraft((prev) => prev ? { ...prev, promoteMinRole } : prev)}>
                                <SelectTrigger id="tracker-promote-role" className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {PROMOTE_ROLE_OPTIONS.map((role) => <SelectItem key={role} value={role}>{roleLabel(role)} and above</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex items-start gap-2">
                        <Checkbox id="tracker-auto-task" checked={draft.autoTaskClass} onCheckedChange={(checked) => setDraft((prev) => prev ? { ...prev, autoTaskClass: checked === true } : prev)} />
                        <Label htmlFor="tracker-auto-task" className="font-normal">
                            Also auto-publish comments classed as <span className="font-medium">task</span>, whatever their severity
                        </Label>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        <span>{autoPromoteSummary(draft)}</span>{" "}
                        <span>{promoteRoleExplanation(draft.promoteMinRole)}</span>
                    </p>
                </>
            ) : (
                <dl className="grid gap-2 text-xs sm:grid-cols-2">
                    <div><dt className="text-muted-foreground">Auto-publish</dt><dd>{autoPromoteSummary(settings)}</dd></div>
                    <div><dt className="text-muted-foreground">Who may publish</dt><dd>{promoteRoleExplanation(settings.promoteMinRole)}</dd></div>
                </dl>
            )}
            <Collapsible>
                <CollapsibleTrigger asChild>
                    <Button type="button" variant="ghost" size="xs" className="-ml-2 text-muted-foreground"><Tag aria-hidden="true" />Issue labels</Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4">
                        <div><dt className="text-muted-foreground">Base</dt><dd className="font-mono">{settings.labels.base}</dd></div>
                        <div><dt className="text-muted-foreground">Severity</dt><dd className="font-mono">{settings.labels.severityPrefix}…</dd></div>
                        <div><dt className="text-muted-foreground">Class</dt><dd className="font-mono">{settings.labels.classPrefix}…</dd></div>
                        <div><dt className="text-muted-foreground">Board</dt><dd className="font-mono">{settings.labels.boardPrefix}…</dd></div>
                    </dl>
                </CollapsibleContent>
            </Collapsible>
        </section>
    );
}
