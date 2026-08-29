/**
 * Part geometry — the spine of every visual view.
 *
 * A DesignPackage names parts but never dimensions them, so both the 2D part
 * illustrations and the 3D assembly viewer derive geometry here. Derivation is
 * deterministic: the same part always produces the same body, so a design's
 * visuals never shuffle between renders.
 *
 * Sizes are millimetres and deliberately approximate. They exist to make a
 * design legible at a glance — which part is the board, which is the battery,
 * what stacks inside what — not to drive a CNC.
 */

import type { Part, PartCategory } from "./schema";

/** Primitive body used by both renderers. */
export type ShapeKind = "board" | "box" | "cylinder" | "dome" | "plate" | "fastener";

export interface PartGeometry {
  /** Bounding box in mm: width (x), height (y), depth (z). */
  w: number;
  h: number;
  d: number;
  shape: ShapeKind;
  /** Category tint, shared by the SVG art and the 3D material. */
  color: string;
  /** Board-like parts draw pin headers along one edge. */
  headerPins: number;
  /** Cosmetic detail count — LEDs on a strip, keys on a pad, vents on a case. */
  detail: number;
}

/** Category tints. Kept in step with CATEGORY_META in schema.ts. */
const TINT: Record<PartCategory, string> = {
  mcu: "#3ddbb4",
  sensor: "#22d3ee",
  actuator: "#f87171",
  power: "#fbbf24",
  comms: "#a78bfa",
  display: "#60a5fa",
  module: "#94a3b8",
  enclosure: "#cbd5e1",
  print3d: "#4ade80",
  misc: "#94a3b8",
};

/** Default body per category, before name-based refinement. */
const BASE: Record<PartCategory, { w: number; h: number; d: number; shape: ShapeKind }> = {
  mcu: { w: 21, h: 3, d: 51, shape: "board" },
  sensor: { w: 16, h: 3, d: 20, shape: "board" },
  actuator: { w: 24, h: 18, d: 24, shape: "cylinder" },
  power: { w: 22, h: 6, d: 43, shape: "board" },
  comms: { w: 16, h: 3, d: 18, shape: "board" },
  display: { w: 27, h: 4, d: 27, shape: "plate" },
  module: { w: 20, h: 5, d: 25, shape: "board" },
  enclosure: { w: 90, h: 35, d: 70, shape: "box" },
  print3d: { w: 40, h: 12, d: 40, shape: "box" },
  misc: { w: 10, h: 6, d: 10, shape: "fastener" },
};

/**
 * Name-driven refinements. First match wins, so order matters: more specific
 * patterns sit above the families that would also match them.
 */
const REFINEMENTS: Array<{
  test: RegExp;
  geom: Partial<PartGeometry> & { shape?: ShapeKind };
}> = [
  // Round bodies
  { test: /\bmotor\b|servo|pump|fan\b/i, geom: { shape: "cylinder", w: 24, h: 24, d: 36 } },
  { test: /n20|gearmotor/i, geom: { shape: "cylinder", w: 12, h: 12, d: 34 } },
  { test: /buzzer|speaker|piezo/i, geom: { shape: "cylinder", w: 14, h: 8, d: 14 } },
  { test: /\b18650\b|li-?ion cell|lipo|battery/i, geom: { shape: "cylinder", w: 18, h: 18, d: 65 } },
  { test: /\bled\b(?!.*\bstrip\b)|diode|emitter/i, geom: { shape: "dome", w: 10, h: 8, d: 10, detail: 1 } },
  { test: /knob|wheel|bearing|pulley/i, geom: { shape: "cylinder", w: 20, h: 14, d: 20 } },

  // Flat bodies
  { test: /solar panel/i, geom: { shape: "plate", w: 110, h: 3, d: 70, detail: 6 } },
  { test: /\boled\b|\blcd\b|screen|display/i, geom: { shape: "plate", w: 27, h: 4, d: 27 } },
  { test: /strip|chain|ring\b/i, geom: { shape: "plate", w: 10, h: 3, d: 90, detail: 8 } },
  { test: /plate|shell|lid|cover|panel/i, geom: { shape: "plate", w: 80, h: 6, d: 60 } },
  { test: /foam|gasket|pad\b/i, geom: { shape: "plate", w: 60, h: 3, d: 45 } },

  // Boards
  { test: /pico|rp2040|esp32|teensy|arduino|nano|xiao/i, geom: { shape: "board", w: 21, h: 3, d: 51, headerPins: 20 } },
  { test: /breakout|driver|converter|charger|regulator|amplifier|\btp4056\b|hx711/i, geom: { shape: "board", w: 18, h: 3, d: 26, headerPins: 6 } },
  { test: /probe|sensor|encoder|switch\b/i, geom: { shape: "board", w: 15, h: 4, d: 22, headerPins: 4 } },

  // Hardware
  { test: /screw|bolt|insert|standoff|nut\b|fastener/i, geom: { shape: "fastener", w: 6, h: 14, d: 6 } },
  { test: /keycap|key tops|bumper|feet/i, geom: { shape: "box", w: 18, h: 10, d: 18 } },
  { test: /enclosure|housing|case|box\b|tub|reservoir/i, geom: { shape: "box", w: 95, h: 40, d: 72, detail: 4 } },
  { test: /mount|bracket|cradle|holder|clamp|spike|collar/i, geom: { shape: "box", w: 42, h: 16, d: 34 } },
];

/** Stable small integer from a string — keeps sizing deterministic. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Geometry for one part. Deterministic in the part's id, name, role and
 * category — no randomness, no dependence on position in the list.
 */
export function geometryFor(part: Part): PartGeometry {
  const base = BASE[part.category] ?? BASE.misc;
  const haystack = `${part.name} ${part.role}`;

  let geom: PartGeometry = {
    w: base.w,
    h: base.h,
    d: base.d,
    shape: base.shape,
    color: TINT[part.category] ?? TINT.misc,
    headerPins: base.shape === "board" ? Math.min(part.pins?.length ?? 4, 20) : 0,
    detail: 0,
  };

  for (const rule of REFINEMENTS) {
    if (rule.test.test(haystack)) {
      geom = { ...geom, ...rule.geom };
      break;
    }
  }

  // Pin count is real data — let it win over the pattern's guess.
  if (geom.shape === "board" && part.pins?.length) {
    geom.headerPins = Math.min(part.pins.length, 24);
  }

  // ±12% jitter keyed to the part id, so same-category parts aren't identical
  // twins in the assembly view but never change size between renders.
  const jitter = 0.88 + ((hash(part.id) % 25) / 100);
  geom.w = round(geom.w * jitter);
  geom.d = round(geom.d * jitter);
  geom.h = round(geom.h * (0.94 + ((hash(part.id + "h") % 13) / 100)));

  return geom;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Longest edge — used to scale a part into a fixed drawing area. */
export function maxExtent(g: PartGeometry): number {
  return Math.max(g.w, g.h, g.d);
}

/** Human-readable footprint, e.g. "21 × 3 × 51 mm". */
export function dimsLabel(g: PartGeometry): string {
  return `${g.w} × ${g.h} × ${g.d} mm`;
}
