import type { ProjectRecord } from "../schema";
import { weatherStation } from "./weather-station";
import { lineFollower } from "./line-follower";
import { macropad } from "./macropad";
import { planter } from "./planter";

/**
 * Seed community projects. All original, benign designs.
 * Additional seeds are registered here as they are authored.
 */
export const seeds: ProjectRecord[] = [weatherStation, lineFollower, macropad, planter];

export function getSeed(slug: string): ProjectRecord | undefined {
  return seeds.find((s) => s.slug === slug);
}
