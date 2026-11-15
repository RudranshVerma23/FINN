// Small multiples for the research view: one series per chart, no axes clutter, first/last labelled.
// Server-rendered SVG; no chart library.

type Series = (number | null)[];

export function MiniBars({
  label,
  years,
  values,
  format,
  height = 56,
}: {
  label: string;
  years: string[];
  values: Series;
  format: (v: number) => string;
  height?: number;
}) {
  const vals = values.map((v) => v ?? 0);
  const max = Math.max(...vals.map(Math.abs), 1);
  const hasNeg = vals.some((v) => v < 0);
  const zero = hasNeg ? height / 2 : height;
  const w = 100 / Math.max(vals.length, 1);
  const last = values[values.length - 1];
  return (
    <figure className="min-w-0">
      <figcaption className="flex items-baseline justify-between text-[12px]">
        <span className="text-muted">{label}</span>
        <span className="tabular font-mono text-ink">{last !== null && last !== undefined ? format(last) : "—"}</span>
      </figcaption>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="mt-1 block h-14 w-full" aria-hidden>
        {vals.map((v, i) => {
          const h = (Math.abs(v) / max) * (hasNeg ? height / 2 - 2 : height - 2);
          const y = v >= 0 ? zero - h : zero;
          const isLast = i === vals.length - 1;
          return (
            <rect
              key={i}
              x={i * w + w * 0.15}
              y={y}
              width={w * 0.7}
              height={Math.max(h, 0.6)}
              rx={0.6}
              fill={v < 0 ? "var(--down)" : isLast ? "var(--ink)" : "var(--muted)"}
              opacity={isLast ? 1 : 0.45}
            />
          );
        })}
      </svg>
      <div className="mt-0.5 flex justify-between text-[10.5px] text-muted">
        <span>{years[0]}</span>
        <span>{years[years.length - 1]}</span>
      </div>
    </figure>
  );
}

export function MiniLine({ label, years, values, height = 56 }: { label: string; years: string[]; values: Series; height?: number }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (pts.length < 2) return null;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const span = max - min || 1;
  const x = (i: number) => (i / Math.max(values.length - 1, 1)) * 100;
  const y = (v: number) => height - 4 - ((v - min) / span) * (height - 8);
  const d = pts.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(2)},${y(p.v).toFixed(2)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <figure className="min-w-0">
      <figcaption className="flex items-baseline justify-between text-[12px]">
        <span className="text-muted">{label}</span>
        <span className="tabular font-mono text-ink">{last.v.toFixed(0)}%</span>
      </figcaption>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="mt-1 block h-14 w-full" aria-hidden>
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="mt-0.5 flex justify-between text-[10.5px] text-muted">
        <span>
          {years[0]} · {pts[0].v.toFixed(0)}%
        </span>
        <span>{years[years.length - 1]}</span>
      </div>
    </figure>
  );
}

/** Operating cash flow next to net profit, per year: do profits turn into cash? */
export function CashVsProfit({ years, cfo, profit }: { years: string[]; cfo: Series; profit: Series }) {
  const all = [...cfo, ...profit].map((v) => Math.abs(v ?? 0));
  const max = Math.max(...all, 1);
  const H = 64;
  const w = 100 / years.length;
  return (
    <figure>
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="block h-16 w-full" aria-hidden>
        {years.map((_, i) => {
          const c = Math.max(0, cfo[i] ?? 0);
          const p = Math.max(0, profit[i] ?? 0);
          return (
            <g key={i}>
              <rect x={i * w + w * 0.12} y={H - (c / max) * (H - 2)} width={w * 0.36} height={(c / max) * (H - 2)} rx={0.6} fill="var(--accent)" />
              <rect x={i * w + w * 0.52} y={H - (p / max) * (H - 2)} width={w * 0.36} height={(p / max) * (H - 2)} rx={0.6} fill="var(--muted)" opacity={0.55} />
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex items-center justify-between text-[10.5px] text-muted">
        <span>{years[0]}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-accent" /> Cash from operations
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-muted opacity-60" /> Net profit
          </span>
        </span>
        <span>{years[years.length - 1]}</span>
      </figcaption>
    </figure>
  );
}
