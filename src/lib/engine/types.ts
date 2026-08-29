/**
 * Design engine contract.
 *
 * Two implementations ship: a deterministic local engine (the keyless
 * default) and a Claude-backed engine that runs behind server routes.
 * Both produce the same DesignPackage shape, so the run view never has to
 * know which one answered.
 */

import type { DesignPackage } from "../design/schema";

export interface RefineQuestion {
  id: string;
  question: string;
  /** Preset choices. The UI appends an "Other…" free-text option. */
  options: string[];
}

export interface PlanResult {
  /** Design-decision bullets, streamed into the run view one at a time. */
  decisions: string[];
  questions: RefineQuestion[];
}

export interface DesignEngine {
  id: "local" | "claude";
  label: string;
  plan(prompt: string): Promise<PlanResult>;
  build(prompt: string, answers: Record<string, string>): Promise<DesignPackage>;
}
