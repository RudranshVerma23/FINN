"use client";

// Per-viewer triage state (done / snoozed) in localStorage, exposed as an external store so
// React reads it without effects and the server render sees an empty store (no hydration mismatch).
import { useSyncExternalStore } from "react";

export type TriageState = "done" | "snoozed";
/** `snapshot` = the data snapshot the action was taken on. A snooze lasts until the next snapshot. */
export type Triage = Record<string, { state: TriageState; snapshot: string }>;

const KEY = "finn.triage.v1";
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: Triage } = { raw: null, value: {} };

function read(): Triage {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return cache.value; // storage blocked (private mode, previews): run without persistence
  }
  if (raw !== cache.raw) cache = { raw, value: raw ? safeParse(raw) : {} };
  return cache.value;
}

function safeParse(raw: string): Triage {
  try {
    return JSON.parse(raw) as Triage;
  } catch {
    return {};
  }
}

function write(next: Triage) {
  const raw = JSON.stringify(next);
  cache = { raw, value: next };
  try {
    localStorage.setItem(KEY, raw);
  } catch {
    /* keep the in-memory value */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const EMPTY: Triage = {};

export function useTriage(snapshot: string) {
  const triage = useSyncExternalStore(subscribe, read, () => EMPTY);
  return {
    triage,
    isHidden: (id: string) => {
      const t = triage[id];
      return !!t && (t.state === "done" || t.snapshot === snapshot);
    },
    mark: (id: string, state: TriageState) => write({ ...read(), [id]: { state, snapshot } }),
    restore: (ids: string[]) => {
      const next = { ...read() };
      ids.forEach((id) => delete next[id]);
      write(next);
    },
  };
}
