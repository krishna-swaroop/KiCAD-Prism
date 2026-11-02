import { Button } from "@/components/ui/button";

/** In place of a list or a figure whose read failed, so it never reads as empty: the error and a Retry. */
export function ReadFailed({ error, onRetry, className = "" }: { error: string; onRetry: () => void; className?: string }) {
  return (
    <div role="alert" className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs text-destructive ${className}`}>
      {error}
      <Button size="sm" variant="outline" className="h-7" onClick={onRetry}>Retry</Button>
    </div>
  );
}
