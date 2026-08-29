/**
 * Archetype contract plus the small helpers every archetype needs.
 *
 * An archetype is a parametric design: keywords that claim a prompt, the
 * decisions it would narrate, the three questions worth asking, and a
 * builder that turns prompt + answers into a DesignPackage.
 */

import type { DesignPackage, ProjectCover } from "../../../design/schema";
import type { RefineQuestion } from "../../types";
import type { Rng } from "../rng";

export interface BuildContext {
  prompt: string;
  answers: Record<string, string>;
  rng: Rng;
  /** Content words from the prompt, in order, deduped. */
  nouns: string[];
  /** Lowercase noun phrase from the prompt, e.g. "self-watering desk planter". */
  subject: string;
  /** Title-cased project name. */
  title: string;
}

export interface Archetype {
  id: string;
  label: string;
  /** Lowercase stems matched against the prompt. */
  keywords: string[];
  /** Used when the prompt yields no usable noun phrase. */
  fallbackSubject: string;
  fallbackTitle: string;
  cover: ProjectCover;
  decisions(ctx: BuildContext): string[];
  questions(ctx: BuildContext): RefineQuestion[];
  build(ctx: BuildContext): DesignPackage;
}

/**
 * Index of the selected option, or 0 when the question was skipped or
 * answered with free text. Reading only by question id keeps the build
 * independent of the order the user clicked things in.
 */
export function choice(ctx: BuildContext, id: string, options: string[]): number {
  const given = ctx.answers[id];
  if (!given) return 0;
  const i = options.indexOf(given);
  return i >= 0 ? i : 0;
}

/** The user's free-text answer, when it wasn't one of the offered options. */
export function customAnswer(ctx: BuildContext, id: string, options: string[]): string {
  const given = (ctx.answers[id] ?? "").trim();
  if (!given || options.includes(given)) return "";
  return given;
}

/**
 * Assumption line recording a free-text answer we could not turn into a
 * part swap — better surfaced than silently dropped.
 */
export function customNote(ctx: BuildContext, id: string, options: string[], subject: string): string[] {
  const custom = customAnswer(ctx, id, options);
  if (!custom) return [];
  return [`You asked for "${custom}" for the ${subject}; the BOM keeps the default until that part is swapped in.`];
}

/** Sentence-cased join: ["a", "b", "c"] → "a, b, and c". */
export function listPhrase(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
