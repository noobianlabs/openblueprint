/**
 * Claude engine — the browser-side half.
 *
 * The SDK never reaches the client bundle: this module only speaks to the
 * two server routes, which hold the key. Any failure here (no key, a
 * validation rejection, a network problem) throws, and the run view falls
 * back to the local engine.
 */

import type { DesignPackage } from "../design/schema";
import type { DesignEngine, PlanResult } from "./types";

export class ClaudeEngineError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: string[],
  ) {
    super(message);
    this.name = "ClaudeEngineError";
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `request failed (${res.status})`;
    let details: string[] | undefined;
    try {
      const payload = (await res.json()) as { error?: string; issues?: string[] };
      if (payload.error) message = payload.error;
      if (Array.isArray(payload.issues)) details = payload.issues;
    } catch {
      // Non-JSON error body — the status is all we have.
    }
    throw new ClaudeEngineError(message, res.status, details);
  }
  return (await res.json()) as T;
}

/** Is a key configured on the server? Probed once by getEngine(). */
export async function claudeAvailable(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch("/api/generate/plan", { method: "GET", signal });
    if (!res.ok) return false;
    const payload = (await res.json()) as { available?: boolean };
    return payload.available === true;
  } catch {
    return false;
  }
}

export const claudeEngine: DesignEngine = {
  id: "claude",
  label: "claude engine",

  async plan(prompt) {
    return post<PlanResult>("/api/generate/plan", { prompt });
  },

  async build(prompt, answers) {
    return post<DesignPackage>("/api/generate/build", { prompt, answers });
  },
};
