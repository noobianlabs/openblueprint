/**
 * Deterministic randomness.
 *
 * The local engine must yield byte-identical packages for identical input,
 * so every "choice" it makes runs through a PRNG seeded from the prompt.
 */

/** FNV-1a. Stable across runtimes, unlike anything hash-like in the stdlib. */
export function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export type Rng = () => number;

/** mulberry32 — small, fast, good enough for picking flavour text. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFor(seedText: string): Rng {
  return mulberry32(hashString(seedText));
}

/** Deterministic pick from a non-empty list. */
export function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length) % list.length];
}

/** Deterministic integer in [min, max]. */
export function pickInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}
