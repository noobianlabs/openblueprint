/**
 * Curated list of ~16 buildable hardware project ideas.
 * Each phrased as a user would type it, covering archetype families.
 * Deterministic order, no duplicates of seed ideas.
 */

export const IDEA_LIST = [
  // Rover ideas
  "a four-wheel robot that follows a line on the floor",
  "a small obstacle-avoiding robot powered by two AA batteries",

  // Station ideas
  "a weather station that logs temperature and humidity to a file",
  "a CO2 monitor with a screen showing air quality levels",

  // Lamp ideas
  "a bedside lamp that adjusts brightness to your wake-up time",
  "a desk lamp with RGB color-changing light strips",

  // Planter ideas
  "a windowsill plant watering system triggered by dry soil",
  "a smart pot that alerts you when your houseplant needs water",

  // Timer ideas
  "a kitchen timer that displays countdown on a seven-segment display",
  "a meditation timer shaped like a smooth pebble",

  // Wearable ideas
  "a wearable step counter that clips to your shoe",
  "a smartwatch display powered by a coin cell battery",

  // Gadget ideas
  "a mechanical puzzle box with an electronic lock",
  "a wireless remote that controls a motorized door lock",

  // Generic/multi-archetype ideas
  "a desk organizer with motorized compartment lids",
  "a USB-powered fan with adjustable speed control",
];

let ideaIndex = 0;

/**
 * Get the next idea in the list, cycling through.
 * Increments a module-level counter deterministically.
 */
export function ideaAt(): string {
  const idea = IDEA_LIST[ideaIndex % IDEA_LIST.length];
  ideaIndex = (ideaIndex + 1) % IDEA_LIST.length;
  return idea;
}

/**
 * Get idea at a specific index (for testing or explicit access).
 */
export function getIdea(index: number): string {
  return IDEA_LIST[index % IDEA_LIST.length];
}
