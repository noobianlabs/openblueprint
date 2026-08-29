/**
 * Archetype registry and prompt matching.
 *
 * Order matters twice: it breaks scoring ties, and it is the order the
 * cover table walks. `generic` is the fallback and is never matched by
 * keyword — it has none.
 */

import type { Archetype } from "./base";
import { rover } from "./rover";
import { station } from "./station";
import { lamp } from "./lamp";
import { planter } from "./planter";
import { timer } from "./timer";
import { wearable } from "./wearable";
import { gadget } from "./gadget";
import { generic } from "./generic";

export const archetypes: Archetype[] = [
  rover,
  station,
  lamp,
  planter,
  timer,
  wearable,
  gadget,
];

export const fallbackArchetype = generic;

export const allArchetypes: Archetype[] = [...archetypes, generic];

/** Highest keyword score wins; ties go to the earlier archetype. */
export function matchArchetype(prompt: string): Archetype {
  const haystack = ` ${prompt.toLowerCase()} `;
  let best: Archetype = generic;
  let bestScore = 0;

  for (const arch of archetypes) {
    let score = 0;
    for (const keyword of arch.keywords) {
      if (haystack.includes(keyword)) score += 1;
    }
    if (score > bestScore) {
      best = arch;
      bestScore = score;
    }
  }
  return best;
}

export type { Archetype, BuildContext } from "./base";
