// Formatting helpers shared by server and client components.

const IST = "Asia/Kolkata";

export function pct(n: number, digits = 1): string {
  const s = Math.abs(n).toFixed(digits);
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${s}%`;
}

export function inr(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: n >= 1000 ? 0 : 2 });
}

/** "2h ago", "Yesterday", "Thu", "6 Nov", relative to the snapshot's clock, not the viewer's. */
export function ago(iso: string, now: string): string {
  const t = new Date(iso).getTime();
  const n = new Date(now).getTime();
  const mins = Math.round((n - t) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 20) return `${hours}h ago`;
  const day = (d: number) => new Date(d).toLocaleDateString("en-CA", { timeZone: IST });
  const yesterday = new Date(n - 86400000);
  if (day(t) === day(yesterday.getTime())) return "Yesterday";
  if (n - t < 6 * 86400000) return new Date(t).toLocaleDateString("en-IN", { weekday: "short", timeZone: IST });
  return new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: IST });
}

export function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: IST });
}

/** "2026-11-13" -> "Fri 13 Nov" */
export function shortDate(day: string): string {
  return new Date(`${day}T12:00:00+05:30`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: IST,
  });
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: IST });
}

/** "works at Tata Power", "ex-Kaynes Technology", "at competitor UPL". */
export function relationText(r: string, org: string): string {
  if (r === "former") return `ex-${org}`;
  const verb = { current: "works at", competitor: "at competitor", supplier: "at supplier", customer: "at customer" }[r] ?? r;
  return `${verb} ${org}`;
}

const WORDS = ["Nothing", "One thing", "Two things", "Three things", "Four things", "Five things", "Six things", "Seven things"];

export function countPhrase(n: number): string {
  return WORDS[n] ?? `${n} things`;
}
