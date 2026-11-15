// Financial snapshot, trajectory, cash quality and leverage, computed in code (FR-12, FR-13).
// No model here: these are arithmetic over tables compiled from the company's own filings,
// and every signal names the table it came from.
import type { Analysis, Fundamentals, Signal, Table, Tile } from "./types";

function row(t: Table | null, ...labels: string[]): (number | null)[] | null {
  if (!t) return null;
  for (const l of labels) if (t.rows[l]) return t.rows[l];
  return null;
}

/** Annual columns only ("Mar 2026"), dropping TTM and half-year columns. */
function fyIdx(t: Table | null): number[] {
  if (!t) return [];
  return t.periods.map((p, i) => (/^[A-Z][a-z]{2} \d{4}$/.test(p) ? i : -1)).filter((i) => i >= 0);
}

function cagr(series: (number | null)[], years: number): number | null {
  const vals = series.filter((v): v is number => v !== null);
  if (vals.length < years + 1) return null;
  const end = vals[vals.length - 1];
  const start = vals[vals.length - 1 - years];
  if (start <= 0 || end <= 0) return null;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function crore(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const abs = Math.abs(v);
  if (abs >= 100000) return `${v < 0 ? "−" : ""}₹${(abs / 100000).toFixed(abs >= 1000000 ? 1 : 2)} L cr`;
  return `${v < 0 ? "−" : ""}₹${Math.round(abs).toLocaleString("en-IN")} cr`;
}

const pctText = (n: number) => `${n >= 0 ? "" : "−"}${Math.abs(n).toFixed(Math.abs(n) >= 10 ? 0 : 1)}%`;

export function analyse(f: Fundamentals): Analysis {
  const pl = f.tables.profit_loss;
  const lender = !!pl && !!(pl.rows["Financing Profit"] || pl.rows["Financing Margin %"]);
  const revenue = row(pl, "Sales", "Revenue") ?? [];
  const profit = row(pl, "Net Profit") ?? [];
  // For lenders Screener's "Financing Margin %" can go negative on consolidated books that carry
  // insurance subsidiaries, which misleads. Net profit margin (profit / revenue) is unambiguous.
  const margin = lender
    ? revenue.map((r, i) => (r && profit[i] !== null && profit[i] !== undefined ? (profit[i]! / r) * 100 : null))
    : (row(pl, "OPM %") ?? []);
  const fy = fyIdx(pl);
  const ttmIdx = pl ? pl.periods.indexOf("TTM") : -1;
  const plSource = `Screener · Profit & Loss (from annual reports)`;

  const fyRevenue = fy.map((i) => revenue[i] ?? null);
  const fyProfit = fy.map((i) => profit[i] ?? null);
  const fyMargin = fy.map((i) => margin[i] ?? null);
  const years = fy.map((i) => pl!.periods[i].slice(-4));

  const signals: Signal[] = [];
  const tiles: Tile[] = [];

  // ---- headline tiles
  const latestRev = ttmIdx >= 0 ? revenue[ttmIdx] : fyRevenue[fyRevenue.length - 1];
  const latestProfit = ttmIdx >= 0 ? profit[ttmIdx] : fyProfit[fyProfit.length - 1];
  const lastFyRev = fyRevenue[fyRevenue.length - 1];
  const lastFyProfit = fyProfit[fyProfit.length - 1];
  const tag = ttmIdx >= 0 ? "last 12 months" : `FY${years[years.length - 1]?.slice(2)}`;
  tiles.push({
    label: lender ? "Revenue (interest + fees)" : "Revenue",
    value: crore(latestRev),
    sub: latestRev && lastFyRev && ttmIdx >= 0 ? `${tag} · ${pctText((latestRev / lastFyRev - 1) * 100)} vs last FY` : tag,
  });
  tiles.push({
    label: "Net profit",
    value: crore(latestProfit),
    sub: latestProfit && lastFyProfit && ttmIdx >= 0 ? `${tag} · ${pctText((latestProfit / lastFyProfit - 1) * 100)} vs last FY` : tag,
    tone: latestProfit !== null && latestProfit < 0 ? "down" : undefined,
  });
  const lastMargin = fyMargin.filter((m): m is number => m !== null).slice(-1)[0];
  if (lastMargin !== undefined) {
    tiles.push({ label: lender ? "Net profit margin" : "Operating margin", value: `${lastMargin.toFixed(0)}%`, sub: `FY${years[years.length - 1]?.slice(2)}` });
  }
  const roce = row(f.tables.ratios, "ROCE %", "ROE %");
  const roceVals = roce ? fyIdx(f.tables.ratios).map((i) => roce[i]).filter((v): v is number => v !== null) : [];
  if (roceVals.length) {
    tiles.push({
      label: f.tables.ratios?.rows["ROCE %"] ? "ROCE" : "ROE",
      value: `${roceVals[roceVals.length - 1].toFixed(0)}%`,
      sub: roceVals.length >= 4 ? `${roceVals[roceVals.length - 4].toFixed(0)}% three years earlier` : undefined,
      tone: roceVals.length >= 4 ? (roceVals[roceVals.length - 1] >= roceVals[roceVals.length - 4] ? "up" : "down") : undefined,
    });
  }

  // ---- growth (trajectory)
  for (const n of [5, 3]) {
    const r = cagr(fyRevenue, n);
    const p = cagr(fyProfit, n);
    if (r === null) continue;
    const pText = p === null ? "profit isn't comparable (a loss in the base year)" : `profit ${pctText(p)}`;
    signals.push({
      kind: "growth",
      text: `Over ${n} years, revenue compounded ${pctText(r)} a year; ${pText}.`,
      tone: p !== null && p > r + 2 ? "up" : p !== null && p < r - 2 ? "down" : r > 0 ? "up" : "down",
      source: plSource,
    });
    break;
  }

  // ---- margins: last FY vs the average of the three before
  const m = fyMargin.filter((v): v is number => v !== null);
  if (m.length >= 4) {
    const prior = avg(m.slice(-4, -1))!;
    const delta = m[m.length - 1] - prior;
    const word = Math.abs(delta) < 1 ? "held steady" : delta > 0 ? "expanded" : "compressed";
    signals.push({
      kind: "margin",
      text: `${lender ? "Net profit" : "Operating"} margin ${word}: ${m[m.length - 1].toFixed(0)}% last year vs ${prior.toFixed(0)}% on average in the three years before${Math.abs(delta) >= 1 ? ` (${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(0)} ${Math.abs(delta).toFixed(0) === "1" ? "pt" : "pts"})` : ""}.`,
      tone: Math.abs(delta) < 1 ? "neutral" : delta > 0 ? "up" : "down",
      source: plSource,
    });
  }

  // ---- momentum: last 4 quarters vs the same 4 a year earlier
  const q = f.tables.quarters;
  const qRev = row(q, "Sales", "Revenue");
  if (q && qRev && qRev.length >= 8) {
    const recent = sum(qRev.slice(-4));
    const before = sum(qRev.slice(-8, -4));
    if (before > 0) {
      const g = (recent / before - 1) * 100;
      signals.push({
        kind: "momentum",
        text: `Last four quarters (${q.periods[q.periods.length - 4]}–${q.periods[q.periods.length - 1]}): revenue ${g >= 0 ? "up" : "down"} ${pctText(Math.abs(g))} on the same four a year earlier.`,
        tone: g >= 0 ? "up" : "down",
        source: "Screener · Quarterly results (from exchange filings)",
      });
    }
  }

  // ---- cash quality (not meaningful for lenders: lending itself is operating cash outflow)
  let cash: Analysis["cash"] = null;
  const cf = f.tables.cash_flow;
  const cfo = row(cf, "Cash from Operating Activity");
  if (!lender && cf && cfo && pl) {
    const cfYears = fyIdx(cf).map((i) => cf.periods[i]);
    const pairs = cfYears
      .map((p) => ({ year: p.slice(-4), cfo: cfo[cf.periods.indexOf(p)], profit: profit[pl.periods.indexOf(p)] ?? null }))
      .filter((x) => x.cfo !== null && x.profit !== null);
    const last3 = pairs.slice(-3);
    if (last3.length === 3) {
      const ratio = (sum(last3.map((x) => x.cfo)) / sum(last3.map((x) => x.profit))) * 100;
      const verdict =
        ratio >= 90 ? "profits are turning into cash" : ratio >= 70 ? "most profit turns into cash" : "profit is not fully turning into cash; worth asking why";
      signals.push({
        kind: "cash",
        text: `Over 3 years, operations generated ${crore(sum(last3.map((x) => x.cfo)))} against ${crore(sum(last3.map((x) => x.profit)))} of profit (${ratio.toFixed(0)}%): ${verdict}.`,
        tone: ratio >= 90 ? "up" : ratio >= 70 ? "neutral" : "down",
        source: "Screener · Cash flow and Profit & Loss (from annual reports)",
      });
      tiles.push({
        label: "Cash conversion",
        value: `${ratio.toFixed(0)}%`,
        sub: "operating cash ÷ profit, 3 years",
        tone: ratio < 70 ? "down" : undefined,
      });
    }
    cash = { years: pairs.slice(-6).map((x) => x.year), cfo: pairs.slice(-6).map((x) => x.cfo), profit: pairs.slice(-6).map((x) => x.profit) };
  }

  // ---- leverage (corporates; a bank's borrowings are its raw material)
  const bs = f.tables.balance_sheet;
  if (!lender && bs) {
    const debt = row(bs, "Borrowings");
    const eq = row(bs, "Equity Capital");
    const res = row(bs, "Reserves");
    const idx = fyIdx(bs);
    const de = idx.map((i) => (debt?.[i] != null && eq?.[i] != null && res?.[i] != null ? debt![i]! / (eq![i]! + res![i]!) : null));
    const valid = de.filter((v): v is number => v !== null);
    if (valid.length >= 4) {
      const now = valid[valid.length - 1];
      const then = valid[valid.length - 4];
      const word = now < 0.1 ? "Practically debt-free" : now < 0.5 ? "Modest debt" : now < 1 ? "Meaningful debt" : "Heavily geared";
      const dir = Math.abs(now - then) < 0.05 ? "about the same as" : now < then ? "down from" : "up from";
      signals.push({
        kind: "debt",
        text: `${word}: debt-to-equity ${now.toFixed(2)}, ${dir} ${then.toFixed(2)} three years earlier.`,
        tone: now <= then + 0.05 ? (now < 0.5 ? "up" : "neutral") : "down",
        source: "Screener · Balance sheet (from annual reports)",
      });
      // Rising from 0.02 to 0.03 is not a warning; only flag leverage that matters.
      const tone = now < 0.25 ? undefined : now <= then ? "up" : "down";
      tiles.push({ label: "Debt / equity", value: now.toFixed(2), sub: `${then.toFixed(2)} three years earlier`, tone });
    }
  }

  // ---- working capital
  const ccc = row(f.tables.ratios, "Cash Conversion Cycle");
  const cccIdx = fyIdx(f.tables.ratios);
  if (!lender && ccc) {
    const vals = cccIdx.map((i) => ccc[i]).filter((v): v is number => v !== null);
    if (vals.length >= 4) {
      const now = vals[vals.length - 1];
      const then = vals[vals.length - 4];
      const d = now - then;
      signals.push({
        kind: "working_capital",
        text: `Cash conversion cycle ${now.toFixed(0)} days, ${Math.abs(d) < 5 ? "about the same as" : d > 0 ? `${d.toFixed(0)} days longer than` : `${Math.abs(d).toFixed(0)} days shorter than`} three years ago${d >= 15 ? ": more cash is getting tied up in operations" : ""}.`,
        tone: d >= 15 ? "down" : d <= -10 ? "up" : "neutral",
        source: "Screener · Ratios (from annual reports)",
      });
    }
  }

  return {
    kind: lender ? "lender" : "corporate",
    revenueLabel: "Revenue",
    marginLabel: lender ? "Net profit margin" : "Operating margin",
    tiles: tiles.slice(0, 6),
    trajectory: { years: years.slice(-10), revenue: fyRevenue.slice(-10), profit: fyProfit.slice(-10), margin: fyMargin.slice(-10) },
    cash,
    signals,
    marketCap: f.top_ratios["Market Cap"] ?? null,
    price: f.top_ratios["Current Price"] ?? null,
  };
}
