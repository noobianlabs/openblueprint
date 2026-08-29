/**
 * Build progress — which instruction steps a reader has ticked off.
 *
 * Stored per project slug in localStorage as a JSON array of step ids.
 * Every access is guarded: no window on the server, and a corrupt or
 * quota-blocked store degrades to "nothing checked" rather than throwing.
 */

const KEY_PREFIX = "obp:progress:";

function key(slug: string): string {
  return `${KEY_PREFIX}${slug}`;
}

/** Checked step ids for a project. Empty set on the server or on any failure. */
export function getProgress(slug: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key(slug));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

/** Flip one step and persist. Returns the new set so callers can drop it into state. */
export function toggleStep(slug: string, stepId: string): Set<string> {
  const next = getProgress(slug);
  if (next.has(stepId)) {
    next.delete(stepId);
  } else {
    next.add(stepId);
  }
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(key(slug), JSON.stringify([...next]));
    } catch {
      /* storage unavailable — keep the in-memory result */
    }
  }
  return next;
}
