import { Boxes, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LibraryPreviewViewport } from "./library-preview-viewport";

export const shortHash = (value: string, length = 10) => (value ? value.slice(0, length) : "—");

// Constructing an Intl formatter is the expensive part; the runtime locale
// cannot change mid-session, so build it once.
const DATE_TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export const formatDate = (value: string) => {
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

export function StatusBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const variant = tone === "success" ? "success" : tone === "warning" ? "warning" : tone === "danger" ? "destructive" : "outline";
  return <Badge variant={variant}>{children}</Badge>;
}

export function MetricCard({ label, value, detail }: { label: string; value: React.ReactNode; detail: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-lg">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground">{detail}</CardContent>
    </Card>
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
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      <CardHeader className="border-b p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

export function PreviewImage({ previewId, label }: { previewId: string; label: string }) {
  return (
    <LibraryPreviewViewport viewportKey={previewId} className="h-64">
      <img
        src={`/api/catalog/previews/${encodeURIComponent(previewId)}`}
        alt={label}
        draggable={false}
        className="pointer-events-none h-full w-full select-none object-contain p-3"
      />
    </LibraryPreviewViewport>
  );
}

export function EmptyState({ icon: Icon, title, detail }: { icon: typeof Boxes; title: string; detail: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 border border-dashed p-6 text-center">
      <Icon className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-xl text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{label}</div>;
}
