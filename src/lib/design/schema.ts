/**
 * DesignPackage — the spine of OpenBlueprint.
 *
 * Every view (Info, Parts, Wiring, Mech, Instructions) renders from this
 * shape, every generation engine emits it, and seed projects are authored
 * in it. Change it here first; everything else follows.
 */

export type PartCategory =
  | "mcu"
  | "sensor"
  | "actuator"
  | "power"
  | "comms"
  | "display"
  | "module"
  | "enclosure"
  | "print3d"
  | "misc";

export type Domain = "electrical" | "mechanical";

export type NetType = "data" | "power" | "ground";

export interface Part {
  id: string;
  /** Product-style name, e.g. "Raspberry Pi Pico" */
  name: string;
  /** Role in this design, e.g. "Main Logic Controller" */
  role: string;
  description: string;
  category: PartCategory;
  domain: Domain;
  qty: number;
  /** Estimated unit cost, USD */
  unitCost: number;
  /** Electrical parts: pin names rendered as wiring handles */
  pins?: string[];
  /** print3d parts: e.g. "PETG · 40% infill, 0.2mm layer" */
  printSettings?: string;
}

export interface PinRef {
  part: string;
  pin: string;
}

export interface Connection {
  id: string;
  from: PinRef;
  to: PinRef;
  net: NetType;
  /** Rendered on the wire, e.g. "5V", "I2C", "PWM" */
  label?: string;
}

export interface AssemblyNode {
  part: string;
  children?: AssemblyNode[];
}

export interface Step {
  /** Display id, e.g. "1.1" */
  id: string;
  title: string;
  detail: string;
  /** Tool names (must exist in DesignPackage.tools) */
  tools: string[];
  /** Part ids (must exist in DesignPackage.parts) */
  parts: string[];
}

export interface InstructionPhase {
  id: string;
  /** e.g. "Fabricate", "Wire", "Bring-up", "Assemble" */
  title: string;
  steps: Step[];
}

export interface DesignPackage {
  name: string;
  /** One-paragraph AI summary of how the system works */
  summary: string;
  /** Feature tags, e.g. "SOLAR CHARGING" */
  tags: string[];
  parts: Part[];
  connections: Connection[];
  assembly: AssemblyNode[];
  tools: string[];
  assumptions: string[];
  instructions: InstructionPhase[];
}

export interface ProjectCover {
  /** Large glyph drawn on the card cover */
  glyph: string;
  /** Two CSS colors for the cover gradient */
  hueA: string;
  hueB: string;
}

export interface ProjectRecord {
  slug: string;
  author: string;
  source: "seed" | "user";
  stars: number;
  /** ISO date */
  createdAt: string;
  cover: ProjectCover;
  pkg: DesignPackage;
}

/* ---------- Category metadata ---------- */

export const CATEGORY_META: Record<
  PartCategory,
  { label: string; domain: Domain; color: string }
> = {
  mcu: { label: "MCU", domain: "electrical", color: "var(--cat-mcu)" },
  sensor: { label: "Sensor", domain: "electrical", color: "var(--cat-sensor)" },
  actuator: { label: "Actuator", domain: "electrical", color: "var(--cat-actuator)" },
  power: { label: "Power", domain: "electrical", color: "var(--cat-power)" },
  comms: { label: "Comms", domain: "electrical", color: "var(--cat-comms)" },
  display: { label: "Display", domain: "electrical", color: "var(--cat-display)" },
  module: { label: "Module", domain: "electrical", color: "var(--cat-module)" },
  enclosure: { label: "Enclosure", domain: "mechanical", color: "var(--cat-enclosure)" },
  print3d: { label: "3D Print", domain: "mechanical", color: "var(--cat-print3d)" },
  misc: { label: "Misc", domain: "mechanical", color: "var(--cat-misc)" },
};

/* ---------- Derived helpers ---------- */

export function partById(pkg: DesignPackage, id: string): Part | undefined {
  return pkg.parts.find((p) => p.id === id);
}

export function subtotal(part: Part): number {
  return part.qty * part.unitCost;
}

export function totalCost(pkg: DesignPackage): number {
  return pkg.parts.reduce((sum, p) => sum + subtotal(p), 0);
}

/** Distinct part-line count (what the UI calls "N parts") */
export function partCount(pkg: DesignPackage): number {
  return pkg.parts.length;
}

export interface BomGroup {
  domain: Domain;
  categories: {
    category: PartCategory;
    parts: Part[];
    lineCount: number;
    cost: number;
  }[];
  lineCount: number;
  cost: number;
}

/** Rollup for the INFO tab: domain → category → parts, with costs. */
export function bomRollup(pkg: DesignPackage): BomGroup[] {
  const domains: Domain[] = ["electrical", "mechanical"];
  return domains
    .map((domain) => {
      const categories = (Object.keys(CATEGORY_META) as PartCategory[])
        .filter((c) => CATEGORY_META[c].domain === domain)
        .map((category) => {
          const parts = pkg.parts.filter((p) => p.category === category);
          return {
            category,
            parts,
            lineCount: parts.length,
            cost: parts.reduce((s, p) => s + subtotal(p), 0),
          };
        })
        .filter((c) => c.parts.length > 0);
      return {
        domain,
        categories,
        lineCount: categories.reduce((s, c) => s + c.lineCount, 0),
        cost: categories.reduce((s, c) => s + c.cost, 0),
      };
    })
    .filter((g) => g.categories.length > 0);
}

export function fmtCost(n: number): string {
  return `~$${n.toFixed(2)}`;
}
