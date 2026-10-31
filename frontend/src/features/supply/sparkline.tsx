import { sparklinePoints } from "./supply-format";

interface SparklineProps {
  values: number[];
  label: string;
  width?: number;
  height?: number;
}

/** A tiny line of a series. No axes: the numbers are shown next to it. */
export function Sparkline({ values, label, width = 160, height = 36 }: SparklineProps) {
  if (values.length === 0) return null;
  return (
    <svg role="img" aria-label={label} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="text-primary">
      <polyline fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"
        points={sparklinePoints(values, width, height)} />
    </svg>
  );
}
