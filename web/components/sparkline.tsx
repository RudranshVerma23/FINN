import type { Bar } from "@/lib/types";

/** Tiny close-price line. Server-rendered SVG, no chart library. */
export function Sparkline({
  bars,
  width = 96,
  height = 28,
  marks = [],
  fluid = false,
}: {
  bars: Bar[];
  width?: number;
  height?: number;
  marks?: string[]; // dates to mark (e.g. days with material filings)
  fluid?: boolean; // stretch to the container's width
}) {
  if (bars.length < 2) return null;
  const closes = bars.map((b) => b.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const x = (i: number) => (i / (bars.length - 1)) * width;
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4);
  const d = closes.map((c, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(c).toFixed(1)}`).join(" ");
  const up = closes[closes.length - 1] >= closes[0];
  const markSet = new Set(marks);
  return (
    <svg
      width={fluid ? "100%" : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={fluid ? "none" : undefined}
      aria-hidden
      className="block overflow-visible"
    >
      <path
        d={d}
        fill="none"
        stroke={up ? "var(--up)" : "var(--down)"}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {bars.map((b, i) =>
        markSet.has(b.date) ? <circle key={b.date} cx={x(i)} cy={y(b.close)} r={2.6} fill="var(--accent)" stroke="var(--surface)" strokeWidth={1} /> : null,
      )}
    </svg>
  );
}
