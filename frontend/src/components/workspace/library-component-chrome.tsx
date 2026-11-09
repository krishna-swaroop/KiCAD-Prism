import { Boxes, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LibraryPreviewViewport } from "./library-preview-viewport";
import { catalogPreviewUrl } from "./catalog-client";

export const shortHash = (value: string, length = 10) => (value ? value.slice(0, length) : "—");

// Constructing an Intl formatter is the expensive part; the runtime locale
// cannot change mid-session, so build it once.
const DATE_TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : DATE_TIME_FORMAT.format(date);
};

export const humanize = (value: string) =>
  value
    .replace(/^field:/, "")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export const formatBytes = (value?: number) => {
  if (!value) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

/** A label and its value; `detail` is the hover hint. */
export function MetricCard({ label, value, detail }: { label: string; value: React.ReactNode; detail?: string }) {
  return (
    <div className="min-w-0 border bg-card px-3 py-2" title={detail}>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

export function DefinitionRows({ rows }: { rows: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <dl className="divide-y divide-border">
      {rows.map((row) => (
        <div key={row.label} className="grid gap-1 py-2 sm:grid-cols-3 sm:gap-3">
          <dt className="text-xs text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0 break-words text-xs font-medium sm:col-span-2">{row.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PanelCard({
  title,
  action,
  children,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      <CardHeader className="flex min-h-10 flex-row items-center justify-between gap-3 border-b px-3 py-1.5">
        <CardTitle className="truncate text-sm">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="p-3">{children}</CardContent>
    </Card>
  );
}

export function PreviewImage({ previewId, label }: { previewId: string; label: string }) {
  return (
    <LibraryPreviewViewport viewportKey={previewId} className="h-64">
      <img
        src={catalogPreviewUrl(previewId)}
        alt={label}
        draggable={false}
        className="pointer-events-none h-full w-full select-none object-contain p-3"
      />
    </LibraryPreviewViewport>
  );
}

export function EmptyState({ icon: Icon, title }: { icon: typeof Boxes; title: string }) {
  return (
    <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground">
      <Icon className="size-4" aria-hidden />
      {title}
    </div>
  );
}

/** A spinner; `label` is for assistive technology only. */
export function LoadingState({ label }: { label: string }) {
  return <div className="flex min-h-48 items-center justify-center text-muted-foreground" role="status" aria-label={label}><Loader2 className="h-4 w-4 animate-spin" /></div>;
}
