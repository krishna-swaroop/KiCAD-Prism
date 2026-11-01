import { Badge } from "@/components/ui/badge";

/** Marks a figure a simulated connector made up, wherever it shows (U6). */
export function TestDataChip({ show }: { show: boolean | null | undefined }) {
  if (!show) return null;
  return <Badge variant="outline" className="ml-1 h-4 border-warning/60 px-1 text-[10px] font-normal text-warning">Test data</Badge>;
}
