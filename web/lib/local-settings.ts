"use client";

// Per-viewer settings in localStorage, read through useSyncExternalStore (no effects, no
// hydration mismatch: the server render uses the defaults). Storage can be unavailable
// (private mode, previews); then settings simply don't persist.
import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: unknown }>();

function read<T>(key: string, defaults: T): T {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return (cache.get(key)?.value as T) ?? defaults;
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  let value = defaults;
  try {
    if (raw) value = { ...defaults, ...JSON.parse(raw) };
  } catch {
    /* corrupt entry: fall back to defaults */
  }
  cache.set(key, { raw, value });
  return value;
}

export function useLocalSettings<T extends object>(key: string, defaults: T): [T, (next: Partial<T>) => void, () => void] {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => read(key, defaults),
    () => defaults,
  );
  const set = (next: Partial<T>) => {
    const merged = { ...read(key, defaults), ...next };
    const raw = JSON.stringify(merged);
    cache.set(key, { raw, value: merged });
    try {
      localStorage.setItem(key, raw);
    } catch {
      /* keep in memory */
    }
    listeners.forEach((l) => l());
  };
  const reset = () => {
    cache.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
  };
  return [value, set, reset];
}
