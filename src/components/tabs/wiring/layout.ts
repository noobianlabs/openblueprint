import type { CSSProperties } from "react";
import type { Edge, Node } from "@xyflow/react";
import {
  CATEGORY_META,
  type DesignPackage,
  type NetType,
  type Part,
  type PartCategory,
} from "@/lib/design/schema";

/* ---------- Card geometry ---------- */

export const NODE_WIDTH = 180;
export const COLUMN_WIDTH = 260;
/** Nominal vertical pitch; widened when a card outgrows it. */
export const ROW_PITCH = 140;
/** Height of one pin row inside a card (matches `h-4` in PartNode). */
const PIN_ROW_HEIGHT = 16;
/** Borders + header + name + pin-strip padding. */
const CARD_CHROME_HEIGHT = 54;
/** Minimum air between two stacked cards. */
const CARD_GAP = 40;
/** Odd columns drop by this much so neighbours don't line up. */
const COLUMN_STAGGER = 60;

/**
 * Column order, left to right. Groups with no parts fold out, so a design
 * without modules puts its display column where the module column would be.
 */
const COLUMN_GROUPS: PartCategory[][] = [
  ["power"],
  ["sensor"],
  ["mcu"],
  ["module"],
  ["actuator", "display", "comms"],
];

/* ---------- Node type ---------- */

export type PartNodeData = {
  name: string;
  role: string;
  category: PartCategory;
  pins: string[];
  /** Mirrored card: sources on the left, targets on the right. */
  flipped: boolean;
};

export type PartNodeType = Node<PartNodeData, "part">;

export function estimateNodeHeight(pinCount: number): number {
  return CARD_CHROME_HEIGHT + Math.max(pinCount, 1) * PIN_ROW_HEIGHT;
}

/* ---------- Net styling ---------- */

const NET_STYLE: Record<NetType, CSSProperties> = {
  data: { stroke: "var(--net-data)", strokeWidth: 1.5 },
  power: { stroke: "var(--net-power)", strokeWidth: 1.5, strokeDasharray: "7 5" },
  ground: {
    stroke: "var(--net-ground)",
    strokeWidth: 1.5,
    strokeDasharray: "1 5",
    strokeLinecap: "round",
  },
};

export const NET_LEGEND: { net: NetType; glyph: string; label: string; color: string }[] = [
  { net: "data", glyph: "———", label: "Data", color: "var(--net-data)" },
  { net: "power", glyph: "— —", label: "Power", color: "var(--net-power)" },
  { net: "ground", glyph: "· · ·", label: "Ground", color: "var(--net-ground)" },
];

/* ---------- Graph build ---------- */

export interface WiringGraph {
  nodes: PartNodeType[];
  edges: Edge[];
  /** Electrical parts grouped by category, in CATEGORY_META order. */
  groups: { category: PartCategory; parts: Part[] }[];
}

/**
 * Deterministic column layout — no dagre. Parts are bucketed into category
 * columns, each column is stacked top-to-bottom and centred on y=0, and odd
 * columns are staggered so long horizontal runs stay legible.
 */
export function buildWiringGraph(pkg: DesignPackage): WiringGraph {
  const electrical = pkg.parts.filter((p) => CATEGORY_META[p.category].domain === "electrical");

  const grouped = COLUMN_GROUPS.map((cats) => electrical.filter((p) => cats.includes(p.category)));
  const placedIds = new Set(grouped.flat().map((p) => p.id));
  const leftovers = electrical.filter((p) => !placedIds.has(p.id));
  const columns = [...grouped, leftovers].filter((col) => col.length > 0);

  const mcuColumn = columns.findIndex((col) => col.some((p) => p.category === "mcu"));
  /** Cards right of the MCU face inward, so their wires never wrap the card. */
  const flipFrom = mcuColumn === -1 ? Number.POSITIVE_INFINITY : mcuColumn + 1;

  const nodes: PartNodeType[] = [];

  columns.forEach((col, colIndex) => {
    const heights = col.map((p) => estimateNodeHeight(p.pins?.length ?? 0));
    const tops: number[] = [];
    let cursor = 0;
    heights.forEach((h) => {
      tops.push(cursor);
      cursor += Math.max(ROW_PITCH, h + CARD_GAP);
    });

    const span = tops[tops.length - 1] + heights[heights.length - 1];
    const offset = -span / 2 + (colIndex % 2 === 1 ? COLUMN_STAGGER : 0);

    col.forEach((part, i) => {
      nodes.push({
        id: part.id,
        type: "part",
        position: { x: colIndex * COLUMN_WIDTH, y: tops[i] + offset },
        data: {
          name: part.name,
          role: part.role,
          category: part.category,
          pins: part.pins ?? [],
          flipped: colIndex >= flipFrom,
        },
      });
    });
  });

  const nodeIds = new Set(nodes.map((n) => n.id));

  const edges: Edge[] = pkg.connections
    .filter((c) => nodeIds.has(c.from.part) && nodeIds.has(c.to.part))
    .map((c) => ({
      id: c.id,
      source: c.from.part,
      target: c.to.part,
      sourceHandle: c.from.pin,
      targetHandle: c.to.pin,
      animated: c.net === "data",
      style: NET_STYLE[c.net],
      label: c.label,
      labelShowBg: Boolean(c.label),
      labelStyle: { fill: "var(--text-dim)", fontSize: 9, letterSpacing: "0.08em" },
      labelBgStyle: { fill: "var(--bg-inset)", stroke: "var(--border)", strokeWidth: 1 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 2,
      data: { net: c.net },
    }));

  const groups = (Object.keys(CATEGORY_META) as PartCategory[])
    .map((category) => ({ category, parts: electrical.filter((p) => p.category === category) }))
    .filter((g) => g.parts.length > 0);

  return { nodes, edges, groups };
}
