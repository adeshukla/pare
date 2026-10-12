import { useEffect, useState } from 'react';

/**
 * Settings that survive a reload, in this browser only. A convenience, never a
 * dependency: storage may be absent or throw (private windows, blocked site
 * data), and then the defaults are simply used.
 *
 * Stored values are merged over the defaults one level deep, so a setting added
 * in a later version gets its default rather than `undefined`.
 */
export function usePersistent<T extends Record<string, unknown>>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return initial;
      const stored = JSON.parse(raw) as Partial<T>;
      const merged = { ...initial };
      for (const k of Object.keys(initial) as Array<keyof T>) {
        const s = stored[k];
        if (s === undefined) continue;
        const d = initial[k];
        merged[k] = (
          d && typeof d === 'object' && !Array.isArray(d) ? { ...d, ...(s as object) } : s
        ) as T[keyof T];
      }
      return merged;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or refused; the setting still applies for this visit.
    }
  }, [key, value]);

  return [value, setValue] as const;
}
