/**
 * The local design engine — the keyless default.
 *
 * Deterministic end to end: the same prompt and answers always produce a
 * byte-identical package, because every choice runs through a PRNG seeded
 * from the prompt and every answer is read by question id rather than by
 * whatever order the user clicked things in.
 */

import type { DesignPackage } from "../../design/schema";
import type { DesignEngine, PlanResult } from "../types";
import type { Archetype, BuildContext } from "./archetypes";
import { matchArchetype } from "./archetypes";
import { rngFor } from "./rng";
import { contentWords, resolveSubject } from "./text";
import { assertValidDesign } from "./validate";

/** Answers, serialised by question id — never by object key order. */
function seedFor(archetype: Archetype, prompt: string, answers: Record<string, string>): string {
  const ordered = archetype
    .questions({
      prompt,
      answers,
      rng: rngFor(prompt),
      nouns: [],
      subject: "",
      title: "",
    })
    .map((q) => `${q.id}=${answers[q.id] ?? ""}`)
    .join("&");
  return `${prompt.trim().toLowerCase()}::${ordered}`;
}

export function makeContext(
  archetype: Archetype,
  prompt: string,
  answers: Record<string, string> = {},
): BuildContext {
  const { subject, title } = resolveSubject(prompt, archetype.fallbackSubject, archetype.fallbackTitle);
  return {
    prompt,
    answers,
    rng: rngFor(seedFor(archetype, prompt, answers)),
    nouns: contentWords(prompt),
    subject,
    title,
  };
}

export function planLocal(prompt: string): PlanResult {
  const archetype = matchArchetype(prompt);
  const ctx = makeContext(archetype, prompt);
  return {
    decisions: archetype.decisions(ctx),
    questions: archetype.questions(ctx),
  };
}

export function buildLocal(prompt: string, answers: Record<string, string> = {}): DesignPackage {
  const archetype = matchArchetype(prompt);
  const ctx = makeContext(archetype, prompt, answers);
  const pkg = archetype.build(ctx);
  // A failure here is a bug in an archetype, not bad user input — every
  // archetype × answer combination is checked by the validation script.
  return assertValidDesign(pkg, { prompt });
}

export const localEngine: DesignEngine = {
  id: "local",
  label: "local engine",
  async plan(prompt) {
    return planLocal(prompt);
  },
  async build(prompt, answers) {
    return buildLocal(prompt, answers);
  },
};

export { matchArchetype };
export { validateDesign, assertValidDesign } from "./validate";
