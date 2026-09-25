import type { Dispatch, SetStateAction } from "react";
import { Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProjectTrackerSettings } from "@/types/trackers";

import type { TrackerSettingsDraft } from "./project-tracker-settings-model";

const SEVERITY_OPTIONS = [
    { value: "info", label: "Every comment" },
    { value: "minor", label: "Minor and above" },
    { value: "major", label: "Major and above" },
    { value: "critical", label: "Critical only" },
] as const;

const PROMOTE_ROLE_OPTIONS = [
    { value: "designer", label: "Designers and admins" },
    { value: "viewer", label: "Everyone, including viewers" },
] as const;

function severityLabel(value: string): string {
    return SEVERITY_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function autoPromoteSummary(settings: Pick<ProjectTrackerSettings, "autoMinSeverity" | "autoTaskClass">): string {
    return `${severityLabel(settings.autoMinSeverity)}${settings.autoTaskClass ? ", plus every task" : ""}`;
}

export function promoteRoleExplanation(promoteMinRole: string): string {
    return PROMOTE_ROLE_OPTIONS.find((option) => option.value === promoteMinRole)?.label ?? promoteMinRole;
}

interface PolicySectionProps {
    settings: ProjectTrackerSettings;
    draft: TrackerSettingsDraft;
    setDraft: Dispatch<SetStateAction<TrackerSettingsDraft | null>>;
    isAdmin: boolean;
}

export function ProjectTrackerPolicySection({ settings, draft, setDraft, isAdmin }: PolicySectionProps) {
    return (
        <div className="space-y-3" data-testid="policy-section">
            {isAdmin ? (
                <>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="tracker-auto-severity">Publish automatically</Label>
                            <Select value={draft.autoMinSeverity} onValueChange={(autoMinSeverity) => setDraft((prev) => prev ? { ...prev, autoMinSeverity } : prev)}>
                                <SelectTrigger id="tracker-auto-severity" className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {SEVERITY_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="tracker-promote-role">Who can publish</Label>
                            <Select value={draft.promoteMinRole} onValueChange={(promoteMinRole) => setDraft((prev) => prev ? { ...prev, promoteMinRole } : prev)}>
                                <SelectTrigger id="tracker-promote-role" className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {PROMOTE_ROLE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Checkbox id="tracker-auto-task" checked={draft.autoTaskClass} onCheckedChange={(checked) => setDraft((prev) => prev ? { ...prev, autoTaskClass: checked === true } : prev)} />
                        <Label htmlFor="tracker-auto-task" className="font-normal">Always publish tasks</Label>
                    </div>
                </>
            ) : (
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <div><dt className="text-xs text-muted-foreground">Publish automatically</dt><dd>{autoPromoteSummary(settings)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Who can publish</dt><dd>{promoteRoleExplanation(settings.promoteMinRole)}</dd></div>
                </dl>
            )}
            <Collapsible>
                <CollapsibleTrigger asChild>
                    <Button type="button" variant="ghost" size="xs" className="-ml-2 text-muted-foreground"><Tag aria-hidden="true" />Labels</Button>
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
        </div>
    );
}
