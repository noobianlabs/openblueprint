/**
 * Engine selection.
 *
 * The local engine is the default and always works. The Claude engine is
 * used only when the server reports a configured key; the probe runs once
 * per page load and is short-timeout, so a hanging route cannot stall the
 * generation flow.
 */

import type { DesignEngine } from "./types";
import { claudeAvailable, claudeEngine } from "./claude";
import { localEngine } from "./local";

export type { DesignEngine, PlanResult, RefineQuestion } from "./types";
export { localEngine } from "./local";
export { claudeEngine, ClaudeEngineError } from "./claude";
export { validateDesign, assertValidDesign } from "./local/validate";

const PROBE_TIMEOUT_MS = 1500;

let probe: Promise<DesignEngine> | null = null;

export function getEngine(): Promise<DesignEngine> {
  // No fetch on the server, and no reason to probe there either.
  if (typeof window === "undefined") return Promise.resolve(localEngine);

  probe ??= (async () => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), PROBE_TIMEOUT_MS);
    try {
      return (await claudeAvailable(abort.signal)) ? claudeEngine : localEngine;
    } finally {
      clearTimeout(timer);
    }
  })();

  return probe;
}

/** Test seam: forget the cached probe result. */
export function resetEngineProbe(): void {
  probe = null;
}
