import { useEffect, useMemo, useRef, useState } from "react";
import {
    Check,
    ChevronDown,
    ChevronRight,
    Download,
    Files,
    FileText,
    ListFilter,
    MessageSquare,
    Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CHANGE_KIND_LABEL, ChangeStatusDot } from "./change-status";
import type { ComparisonSelection } from "./comparison-selection-bridge";
import { connectionEntries } from "./comparison-property-model";
import type { ChangeGroup } from "./comparison-review-groups";
import {
    QUEUE_SECTION_LABEL,
    QUEUE_SECTION_ORDER,
    REVIEW_IMPACT_LABEL,
    groupDocumentEntries,
    queueSection,
    type GroupDocumentEntry,
    type QueueSection,
    type ReviewImpact,
} from "./comparison-review-queue";
import type { ChangeItem, ChangeKind } from "./types";

/**
 * The review queue: one row per authored decision, grouped into four sections.
 *
 * The pane fills whatever width its host gives it. Sizing belongs to the
 * workspace, which owns the layout — a queue that sized itself would be
 * competing with the property panel for the canvas between them.
 */

const STATUS_META: Array<{ id: ChangeKind; label: string }> = [
    { id: "added", label: CHANGE_KIND_LABEL.added },
    { id: "changed", label: CHANGE_KIND_LABEL.changed },
    { id: "removed", label: CHANGE_KIND_LABEL.removed },
];

type DifferencesPaneProps = {
    /** e.g. "Schematic compare" — names the queue the way Altium's rail does. */
    title: string;
    groups: ChangeGroup[];
    totalGroups: number;
    secondaryGroupCount: number;
    statusCounts: Record<ChangeKind, number>;
    impactCounts: Array<{ impact: ReviewImpact; count: number }>;
    impacts: Set<ReviewImpact>;
    onToggleImpact: (impact: ReviewImpact) => void;
    onExport: () => void;
    statuses: Set<ChangeKind>;
    onToggleStatus: (kind: ChangeKind) => void;
    search: string;
    onSearchChange: (value: string) => void;
    showSecondary: boolean;
    onShowSecondaryChange: (value: boolean) => void;
    selectedChangeId: string | null;
    selectedGroupId: string | null;
    selectedDocumentPath?: string;
    onSelectChange: (change: ChangeItem, documentPath?: string) => void;
    onSelectGroup: (group: ChangeGroup) => void;
    onPreviewChange: (selection: ComparisonSelection) => void;
    onPrevious: () => void;
    onNext: () => void;
};

function basename(path: string): string {
    return path.split("/").at(-1) ?? path;
}

/**
 * Sheets this review item touches, offered as a switch.
 *
 * Only rendered when the item genuinely spans more than one document, so the
 * icon doubles as the indicator that it does — a row without it is a row that
 * lives on one sheet.
 */
function SheetPicker({
    documents,
    selectedDocumentPath,
    onSelect,
}: {
    documents: GroupDocumentEntry[];
    selectedDocumentPath?: string;
    onSelect: (entry: GroupDocumentEntry) => void;
}) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label={`On ${documents.length} sheets`}
                    onClick={(event) => event.stopPropagation()}
                >
                    <Files className="h-3 w-3" />
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-1">
                {documents.map((entry) => {
                    const active = entry.documentPath === selectedDocumentPath;
                    return (
                        <button
                            key={entry.documentPath}
                            type="button"
                            className={cn(
                                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent",
                                active && "bg-accent",
                            )}
                            onClick={() => onSelect(entry)}
                            aria-current={active ? "page" : undefined}
                        >
                            <Check
                                className={cn(
                                    "h-3 w-3 shrink-0",
                                    !active && "invisible",
                                )}
                            />
                            <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate">
                                {basename(entry.documentPath)}
                            </span>
                            {entry.count > 1 && (
                                <span className="shrink-0 rounded bg-muted px-1 text-[9px] text-muted-foreground">
                                    {entry.count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </PopoverContent>
        </Popover>
    );
}

/** One review item: a single line, with its evidence one disclosure away. */
function QueueRow({
    group,
    expanded,
    onToggleExpanded,
    selected,
    selectedChangeId,
    selectedDocumentPath,
    onSelectChange,
    onSelectGroup,
    onPreviewChange,
    onPrevious,
    onNext,
}: {
    group: ChangeGroup;
    expanded: boolean;
    onToggleExpanded: () => void;
    selected: boolean;
    selectedChangeId: string | null;
    selectedDocumentPath?: string;
    onSelectChange: (change: ChangeItem, documentPath?: string) => void;
    onSelectGroup: (group: ChangeGroup) => void;
    onPreviewChange: (selection: ComparisonSelection) => void;
    onPrevious: () => void;
    onNext: () => void;
}) {
    const documents = groupDocumentEntries(group);
    const connections = connectionEntries(group.changes);
    /**
     * A row opens to its *members*, never to its changes.
     *
     * What changed is stated once, in the property panel, for whichever member
     * is selected; repeating it under the row said the same thing twice and
     * cost the space the members needed. That is how a part covering
     * twenty-eight designators ended up showing four and a dead "+24".
     */
    const members: Array<{
        id: string;
        label: string;
        change: ChangeItem;
        status?: ChangeKind;
    }> = connections.length
        ? connections.map((entry) => ({
            id: entry.id,
            label: `${entry.label}`,
            change: entry.change,
            status: entry.kind,
        }))
        : group.references.map((reference) => ({
            id: `${group.id}:${reference}`,
            label: reference,
            change: group.changes.find(
                (candidate) => candidate.reference === reference,
            ) ?? group.changes[0]!,
        }));
    const expandable = members.length > 1;
    // A fallback per-designator group already says the reference in its label;
    // repeating it as a chip would be noise.
    const showChips = group.references.length > 1
        || (group.references.length === 1 && group.references[0] !== group.label);

    return (
        <div>
            <div
                className={cn(
                    "flex w-full items-center gap-1.5 border-l-2 px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent",
                    selected
                        ? "border-primary bg-accent text-accent-foreground"
                        : "border-transparent",
                )}
                onMouseEnter={() => onPreviewChange({ kind: "group", id: group.id })}
                onMouseLeave={() => onPreviewChange(null)}
            >
                <button
                    type="button"
                    className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted disabled:invisible"
                    onClick={onToggleExpanded}
                    disabled={!expandable}
                    aria-expanded={expandable ? expanded : undefined}
                    aria-label={expanded ? "Collapse evidence" : "Expand evidence"}
                >
                    {expanded
                        ? <ChevronDown className="h-3 w-3" />
                        : <ChevronRight className="h-3 w-3" />}
                </button>
                <button
                    type="button"
                    data-group-id={group.id}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onSelectGroup(group)}
                    onKeyDown={(event) => {
                        if (event.key === "ArrowUp") {
                            event.preventDefault();
                            onPrevious();
                        } else if (event.key === "ArrowDown") {
                            event.preventDefault();
                            onNext();
                        }
                    }}
                >
                    <ChangeStatusDot kind={group.kind} />
                    <span className="min-w-0 truncate">
                        <span className="text-muted-foreground">
                            {`${CHANGE_KIND_LABEL[group.kind]} `}
                        </span>
                        <span className="font-medium">{group.label}</span>
                    </span>
                </button>
                {showChips && (
                    <span className="flex shrink-0 items-center gap-1">
                        {group.references.slice(0, 4).map((reference) => {
                            const change = group.changes.find(
                                (candidate) => candidate.reference === reference,
                            ) ?? group.changes[0]!;
                            return (
                                <button
                                    key={reference}
                                    type="button"
                                    data-change-id={change.id}
                                    className={cn(
                                        "rounded bg-muted px-1 font-mono text-[9px] transition-colors hover:bg-primary hover:text-primary-foreground",
                                        selectedChangeId === change.id
                                            && "bg-primary text-primary-foreground",
                                    )}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onSelectChange(change);
                                    }}
                                >
                                    {reference}
                                </button>
                            );
                        })}
                        {group.references.length > 4 && (
                            <button
                                type="button"
                                className="shrink-0 rounded px-1 text-[9px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onToggleExpanded();
                                }}
                                aria-expanded={expanded}
                                aria-label={`Show all ${group.references.length} designators`}
                            >
                                {`+${group.references.length - 4}`}
                            </button>
                        )}
                    </span>
                )}
                {group.unresolvedCount > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-muted px-1 text-[9px] text-muted-foreground">
                        <MessageSquare className="h-2.5 w-2.5" />
                        {group.unresolvedCount}
                    </span>
                )}
                {documents.length > 1 && (
                    <SheetPicker
                        documents={documents}
                        selectedDocumentPath={selectedDocumentPath}
                        onSelect={(entry) =>
                            onSelectChange(entry.change, entry.documentPath)}
                    />
                )}
            </div>

            {expanded && (
                <div className="ml-6 border-l py-1 pl-2">
                    {members.map((member) => (
                        <button
                            key={member.id}
                            type="button"
                            data-change-id={member.change.id}
                            className={cn(
                                "flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[10px] transition-colors hover:bg-accent",
                                selectedChangeId === member.change.id
                                    && "bg-primary/10 text-primary",
                            )}
                            onClick={() => onSelectChange(member.change)}
                        >
                            {member.status && (
                                <ChangeStatusDot kind={member.status} />
                            )}
                            <span className="min-w-0 flex-1 truncate font-mono">
                                {member.label}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/** Exported for tests; the workspace is the only production caller. */
export function DifferencesPane({
    title,
    groups,
    totalGroups,
    secondaryGroupCount,
    statusCounts,
    impactCounts,
    impacts,
    onToggleImpact,
    onExport,
    statuses,
    onToggleStatus,
    search,
    onSearchChange,
    showSecondary,
    onShowSecondaryChange,
    selectedChangeId,
    selectedGroupId,
    selectedDocumentPath,
    onSelectChange,
    onSelectGroup,
    onPreviewChange,
    onPrevious,
    onNext,
}: DifferencesPaneProps) {
    const paneRef = useRef<HTMLDivElement | null>(null);
    const [searchOpen, setSearchOpen] = useState(Boolean(search));
    const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(
        () => new Set(),
    );
    // Layout and documentation is the scope a release review does not normally
    // sign off, so it starts closed even when the reviewer has opted to see it.
    const [collapsedSections, setCollapsedSections] = useState<Set<QueueSection>>(
        () => new Set<QueueSection>(["layout"]),
    );

    const selectedGroup = groups.find((group) =>
        group.id === selectedGroupId
        || group.changes.some((change) => change.id === selectedChangeId)
    );
    useEffect(() => {
        if (!selectedGroup) return;
        setExpandedGroupIds((current) => {
            if (current.has(selectedGroup.id)) return current;
            const next = new Set(current);
            next.add(selectedGroup.id);
            return next;
        });
    }, [selectedGroup]);
    useEffect(() => {
        if (!selectedChangeId && !selectedGroupId) return;
        const frame = requestAnimationFrame(() => {
            const rows = paneRef.current?.querySelectorAll<HTMLElement>(
                "[data-change-id], [data-group-id]",
            );
            const row = [...(rows ?? [])].find(
                (candidate) =>
                    candidate.dataset.changeId === selectedChangeId
                    || candidate.dataset.groupId === selectedGroupId,
            );
            row?.scrollIntoView({ block: "nearest" });
        });
        return () => cancelAnimationFrame(frame);
    }, [selectedChangeId, selectedGroupId, groups]);

    const sections = useMemo(() => {
        const buckets = new Map<QueueSection, ChangeGroup[]>();
        for (const group of groups) {
            const section = queueSection(group);
            const existing = buckets.get(section);
            if (existing) existing.push(group);
            else buckets.set(section, [group]);
        }
        return QUEUE_SECTION_ORDER
            .filter((section) => buckets.has(section))
            .map((section) => ({ section, groups: buckets.get(section)! }));
    }, [groups]);

    const filtered = groups.length !== totalGroups;
    const activeFilters = statuses.size < STATUS_META.length
        || impacts.size > 0
        || Boolean(search.trim());

    return (
        <div ref={paneRef} className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
            <header className="flex h-10 shrink-0 items-center gap-1 border-b px-3">
                <h2 className="min-w-0 truncate text-xs font-semibold">{title}</h2>
                <span className="shrink-0 text-xs text-muted-foreground">
                    {filtered ? `(${groups.length}/${totalGroups})` : `(${totalGroups})`}
                </span>
                <span className="ml-auto" />
                <Button
                    variant={searchOpen ? "secondary" : "ghost"}
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                        const next = !searchOpen;
                        setSearchOpen(next);
                        if (!next) onSearchChange("");
                    }}
                    aria-label="Search changes"
                    aria-expanded={searchOpen}
                >
                    <Search className="h-3.5 w-3.5" />
                </Button>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant={activeFilters ? "secondary" : "ghost"}
                            size="icon"
                            className="h-7 w-7"
                            aria-label="Filter changes"
                        >
                            <ListFilter className="h-3.5 w-3.5" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-72 space-y-3">
                        <div className="space-y-1.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Status
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {STATUS_META.map((status) => (
                                    <Button
                                        key={status.id}
                                        variant={statuses.has(status.id) ? "secondary" : "outline"}
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => onToggleStatus(status.id)}
                                        aria-pressed={statuses.has(status.id)}
                                    >
                                        <ChangeStatusDot kind={status.id} className="mr-1.5" />
                                        {status.label} ({statusCounts[status.id]})
                                    </Button>
                                ))}
                            </div>
                        </div>
                        {impactCounts.length > 1 && (
                            <div className="space-y-1.5">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    Review owner
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {impactCounts.map(({ impact, count }) => (
                                        <Button
                                            key={impact}
                                            variant={impacts.has(impact) ? "secondary" : "outline"}
                                            size="sm"
                                            className="h-6 px-1.5 text-[10px]"
                                            onClick={() => onToggleImpact(impact)}
                                            aria-pressed={impacts.has(impact)}
                                        >
                                            {REVIEW_IMPACT_LABEL[impact]} ({count})
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
                            <input
                                type="checkbox"
                                checked={showSecondary}
                                onChange={(event) => onShowSecondaryChange(event.target.checked)}
                                className="accent-primary"
                            />
                            {`Show layout and documentation${
                                secondaryGroupCount > 0 ? ` (${secondaryGroupCount})` : ""
                            }`}
                        </label>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-full text-xs"
                            onClick={onExport}
                            disabled={!groups.length}
                        >
                            <Download className="mr-2 h-3.5 w-3.5" />
                            Export review queue
                        </Button>
                    </PopoverContent>
                </Popover>
            </header>

            {searchOpen && (
                <div className="shrink-0 border-b p-2">
                    <Input
                        autoFocus
                        value={search}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder="Search changes, nets, references…"
                        className="h-8 text-xs"
                    />
                </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto">
                {!groups.length ? (
                    <p className="px-3 py-10 text-center text-xs text-muted-foreground">
                        No differences match these filters.
                    </p>
                ) : (
                    sections.map(({ section, groups: sectionGroups }) => {
                        const collapsed = collapsedSections.has(section);
                        return (
                            <section key={section}>
                                <button
                                    type="button"
                                    className="sticky top-0 z-10 flex w-full items-center gap-1 border-b bg-background/95 px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
                                    onClick={() => setCollapsedSections((current) => {
                                        const next = new Set(current);
                                        if (next.has(section)) next.delete(section);
                                        else next.add(section);
                                        return next;
                                    })}
                                    aria-expanded={!collapsed}
                                >
                                    {collapsed
                                        ? <ChevronRight className="h-3 w-3" />
                                        : <ChevronDown className="h-3 w-3" />}
                                    {QUEUE_SECTION_LABEL[section]}
                                    <span className="ml-1 font-normal normal-case">
                                        {`(${sectionGroups.length})`}
                                    </span>
                                </button>
                                {!collapsed && sectionGroups.map((group) => (
                                    <QueueRow
                                        key={group.id}
                                        group={group}
                                        expanded={expandedGroupIds.has(group.id)}
                                        onToggleExpanded={() => setExpandedGroupIds((current) => {
                                            const next = new Set(current);
                                            if (next.has(group.id)) next.delete(group.id);
                                            else next.add(group.id);
                                            return next;
                                        })}
                                        selected={selectedGroup?.id === group.id}
                                        selectedChangeId={selectedChangeId}
                                        selectedDocumentPath={selectedDocumentPath}
                                        onSelectChange={onSelectChange}
                                        onSelectGroup={onSelectGroup}
                                        onPreviewChange={onPreviewChange}
                                        onPrevious={onPrevious}
                                        onNext={onNext}
                                    />
                                ))}
                            </section>
                        );
                    })
                )}
            </div>
        </div>
    );
}
