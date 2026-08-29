"use client";

/**
 * ARCH — the system architecture view.
 *
 * The wiring tab answers "which pin goes where". This one answers the question
 * you ask first: what are the blocks, what flows between them, and where does
 * the power come from. Signal is read left to right (sense → compute → act)
 * and power is read as a tree along the bottom, because those are two
 * different stories and overlaying them is what makes schematics unreadable.
 *
 * Everything is derived from the DesignPackage — no authored layout.
 */

import { useMemo, useState } from "react";
import type { Connection, Part, PartCategory, ProjectRecord } from "@/lib/design/schema";
import { CATEGORY_META } from "@/lib/design/schema";

type Lane = "input" | "compute" | "output" | "power";

const LANE_OF: Partial<Record<PartCategory, Lane>> = {
  sensor: "input",
  comms: "input",
  mcu: "compute",
  module: "compute",
  actuator: "output",
  display: "output",
  power: "power",
};

const LANE_TITLE: Record<Lane, string> = {
  input: "Sense",
  compute: "Compute",
  output: "Act",
  power: "Power",
};

const LANE_NOTE: Record<Lane, string> = {
  input: "sensors and interfaces feeding the controller",
  compute: "the controller running the logic",
  output: "what the system drives in the world",
  power: "supply, conversion, and distribution",
};

/* Layout constants, in SVG user units. */
const BOX_W = 168;
const BOX_H = 60;
const V_GAP = 20;
const COL_X: Record<Exclude<Lane, "power">, number> = { input: 40, compute: 268, output: 496 };
const SIGNAL_TOP = 70;
const RAIL_GAP = 56;

interface Block {
  part: Part;
  lane: Lane;
  x: number;
  y: number;
}

export function ArchTab({ record }: { record: ProjectRecord }) {
  const { pkg } = record;
  const [selected, setSelected] = useState<string | null>(null);

  const model = useMemo(() => buildModel(pkg.parts, pkg.connections), [pkg.parts, pkg.connections]);

  if (model.blocks.length === 0) {
    return (
      <div className="flex h-[60vh] items-center justify-center px-6 text-center">
        <p className="text-[13px] text-ink-dim">
          This design has no electrical parts, so it has no system architecture to draw.
        </p>
      </div>
    );
  }

  const active = selected ? model.blocks.find((b) => b.part.id === selected) : undefined;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="microlabel text-ink">System architecture</h2>
          <p className="mt-1 max-w-[62ch] text-[13px] text-ink-dim">
            Signal flows left to right; the power tree runs along the bottom. Pin-level detail
            lives in the wiring view.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LegendSwatch label="Data" className="text-[var(--net-data)]" dash="" />
          <LegendSwatch label="Power" className="text-[var(--net-power)]" dash="7 5" />
        </div>
      </div>

      <div className="mt-5 overflow-x-auto rounded-md border border-line bg-bg-inset">
        <svg
          viewBox={`0 0 ${model.width} ${model.height}`}
          style={{ minWidth: model.width }}
          className="blueprint-grid block"
          role="img"
          aria-label={`System architecture for ${pkg.name}`}
        >
          {/* Lane headings for the signal path */}
          {(["input", "compute", "output"] as const).map((lane) =>
            model.laneCounts[lane] ? (
              <g key={lane} aria-hidden="true">
                <text
                  x={COL_X[lane]}
                  y={40}
                  className="fill-[var(--text-faint)]"
                  style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase" }}
                >
                  {LANE_TITLE[lane]}
                </text>
                <text
                  x={COL_X[lane]}
                  y={53}
                  className="fill-[var(--text-faint)]"
                  style={{ fontSize: 8, opacity: 0.75 }}
                >
                  {LANE_NOTE[lane]}
                </text>
              </g>
            ) : null,
          )}

          {/* Power band label */}
          {model.laneCounts.power > 0 && (
            <text
              x={40}
              y={model.railY - 24}
              className="fill-[var(--text-faint)]"
              style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase" }}
              aria-hidden="true"
            >
              {LANE_TITLE.power} — {LANE_NOTE.power}
            </text>
          )}

          {/* Edges first, so blocks sit on top of them */}
          <g aria-hidden="true">
            {model.edges.map((e, i) => (
              <ArchEdge
                key={i}
                edge={e}
                dimmed={Boolean(selected) && e.from !== selected && e.to !== selected}
              />
            ))}
          </g>

          {model.blocks.map((b) => (
            <ArchBlock
              key={b.part.id}
              block={b}
              selected={selected === b.part.id}
              dimmed={Boolean(selected) && selected !== b.part.id && !model.neighbours(selected!).has(b.part.id)}
              onSelect={() => setSelected(selected === b.part.id ? null : b.part.id)}
            />
          ))}
        </svg>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="rounded-md border border-line bg-bg-card p-4">
          <p className="microlabel text-ink-faint">
            {active ? "Selected block" : "Signal path"}
          </p>
          {active ? (
            <>
              <p className="mt-2 text-[13px] font-bold tracking-[0.06em] uppercase">
                {active.part.name}
              </p>
              <p className="text-[12px] text-ink-dim">{active.part.role}</p>
              <p className="mt-2 max-w-[62ch] text-[12px] leading-relaxed text-ink-dim">
                {active.part.description}
              </p>
            </>
          ) : (
            <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-ink-dim">
              {model.narrative}
            </p>
          )}
        </div>

        <div className="rounded-md border border-line bg-bg-card p-4">
          <p className="microlabel text-ink-faint">Blocks by lane</p>
          <ul className="mt-2 space-y-1.5">
            {(["input", "compute", "output", "power"] as const)
              .filter((l) => model.laneCounts[l] > 0)
              .map((l) => (
                <li key={l} className="flex items-baseline justify-between text-[12px]">
                  <span className="text-ink-dim">{LANE_TITLE[l]}</span>
                  <span className="tabular-nums text-ink">{model.laneCounts[l]}</span>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function LegendSwatch({ label, className, dash }: { label: string; className: string; dash: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="26" height="8" aria-hidden="true">
        <line
          x1="0"
          y1="4"
          x2="26"
          y2="4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray={dash || undefined}
          className={className}
        />
      </svg>
      <span className="microlabel text-ink-faint">{label}</span>
    </span>
  );
}

function ArchBlock({
  block,
  selected,
  dimmed,
  onSelect,
}: {
  block: Block;
  selected: boolean;
  dimmed: boolean;
  onSelect: () => void;
}) {
  const meta = CATEGORY_META[block.part.category];
  return (
    <g
      transform={`translate(${block.x} ${block.y})`}
      onClick={onSelect}
      style={{ cursor: "pointer", opacity: dimmed ? 0.32 : 1 }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${block.part.name} — ${block.part.role}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <rect
        width={BOX_W}
        height={BOX_H}
        rx="3"
        fill="var(--bg-card)"
        stroke={selected ? meta.color : "var(--border)"}
        strokeWidth={selected ? 1.8 : 1}
      />
      {/* Category stripe — encodes the block's role in the system */}
      <rect width="3" height={BOX_H} rx="1.5" fill={meta.color} />
      <text
        x="12"
        y="18"
        fill={meta.color}
        style={{ fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase" }}
      >
        {meta.label}
      </text>
      <text x="12" y="34" className="fill-[var(--text)]" style={{ fontSize: 11, fontWeight: 600 }}>
        {truncate(block.part.role, 24)}
      </text>
      <text x="12" y="48" className="fill-[var(--text-dim)]" style={{ fontSize: 9 }}>
        {truncate(block.part.name, 30)}
      </text>
    </g>
  );
}

interface ArchEdgeModel {
  from: string;
  to: string;
  net: "data" | "power";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
}

function ArchEdge({ edge, dimmed }: { edge: ArchEdgeModel; dimmed: boolean }) {
  const color = edge.net === "power" ? "var(--net-power)" : "var(--net-data)";
  const midX = (edge.x1 + edge.x2) / 2;
  const path =
    Math.abs(edge.y1 - edge.y2) < 2
      ? `M ${edge.x1} ${edge.y1} L ${edge.x2} ${edge.y2}`
      : `M ${edge.x1} ${edge.y1} C ${midX} ${edge.y1}, ${midX} ${edge.y2}, ${edge.x2} ${edge.y2}`;
  return (
    <g style={{ opacity: dimmed ? 0.18 : 1 }}>
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        strokeDasharray={edge.net === "power" ? "7 5" : undefined}
      />
      <circle cx={edge.x2} cy={edge.y2} r="2.4" fill={color} />
    </g>
  );
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/* ---------- model ---------- */

function buildModel(parts: Part[], connections: Connection[]) {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const electrical = parts.filter((p) => p.domain === "electrical" && LANE_OF[p.category]);

  const lanes: Record<Lane, Part[]> = { input: [], compute: [], output: [], power: [] };
  for (const p of electrical) {
    lanes[LANE_OF[p.category]!].push(p);
  }

  const signalRows = Math.max(lanes.input.length, lanes.compute.length, lanes.output.length);
  const signalHeight = signalRows * BOX_H + Math.max(signalRows - 1, 0) * V_GAP;
  const railY = SIGNAL_TOP + signalHeight + RAIL_GAP;
  const powerHeight = lanes.power.length ? BOX_H + 30 : 0;
  const height = railY + powerHeight + 30;

  const blocks: Block[] = [];

  /* Signal lanes: one column each, vertically centred against the tallest. */
  for (const lane of ["input", "compute", "output"] as const) {
    const list = lanes[lane];
    const colHeight = list.length * BOX_H + Math.max(list.length - 1, 0) * V_GAP;
    const offset = (signalHeight - colHeight) / 2;
    list.forEach((part, i) => {
      blocks.push({
        part,
        lane,
        x: COL_X[lane],
        y: SIGNAL_TOP + offset + i * (BOX_H + V_GAP),
      });
    });
  }

  /* Power lane: a row along the bottom, read as supply → conversion → rail. */
  const POWER_PITCH = BOX_W + 60;
  lanes.power.forEach((part, i) => {
    blocks.push({ part, lane: "power", x: 40 + i * POWER_PITCH, y: railY });
  });

  /* The canvas has to fit whichever row is longest. A design with four power
     stages runs wider than the three signal columns, and clipping it would
     silently drop a block. */
  const signalRight = COL_X.output + BOX_W;
  const powerRight = lanes.power.length ? 40 + (lanes.power.length - 1) * POWER_PITCH + BOX_W : 0;
  const width = Math.max(704, signalRight + 40, powerRight + 40);

  const pos = new Map(blocks.map((b) => [b.part.id, b]));

  /* One edge per part pair per net class — the block diagram collapses the
     many pin-level wires of the wiring view into a single relationship. */
  const seen = new Set<string>();
  const edges: ArchEdgeModel[] = [];
  const adjacency = new Map<string, Set<string>>();

  for (const c of connections) {
    if (c.net === "ground") continue;
    const a = pos.get(c.from.part);
    const b = pos.get(c.to.part);
    if (!a || !b || a.part.id === b.part.id) continue;

    const net: "data" | "power" = c.net === "power" ? "power" : "data";
    const key = [a.part.id, b.part.id].sort().join("→") + net;
    if (seen.has(key)) continue;
    seen.add(key);

    link(adjacency, a.part.id, b.part.id);

    // Draw from the left-hand block's right edge to the other's left edge.
    const [left, right] = a.x <= b.x ? [a, b] : [b, a];
    edges.push({
      from: a.part.id,
      to: b.part.id,
      net,
      x1: left.x + BOX_W,
      y1: left.y + BOX_H / 2,
      x2: right.x,
      y2: right.y + BOX_H / 2,
      label: c.label,
    });
  }

  const laneCounts: Record<Lane, number> = {
    input: lanes.input.length,
    compute: lanes.compute.length,
    output: lanes.output.length,
    power: lanes.power.length,
  };

  return {
    blocks,
    edges,
    height,
    width,
    railY,
    laneCounts,
    narrative: narrate(lanes, byId),
    neighbours: (id: string) => adjacency.get(id) ?? new Set<string>(),
  };
}

function link(map: Map<string, Set<string>>, a: string, b: string) {
  if (!map.has(a)) map.set(a, new Set());
  if (!map.has(b)) map.set(b, new Set());
  map.get(a)!.add(b);
  map.get(b)!.add(a);
}

/** A plain-English reading of the block diagram, for the panel below it. */
function narrate(lanes: Record<Lane, Part[]>, _byId: Map<string, Part>): string {
  const brain = lanes.compute[0];
  const sensing = lanes.input.map((p) => p.role.toLowerCase());
  const acting = lanes.output.map((p) => p.role.toLowerCase());
  const supply = lanes.power.map((p) => p.role.toLowerCase());

  const parts: string[] = [];
  if (brain) {
    parts.push(
      sensing.length
        ? `The ${brain.role.toLowerCase()} reads ${list(sensing)}`
        : `The ${brain.role.toLowerCase()} runs the system`,
    );
  }
  if (acting.length) {
    parts.push(`${parts.length ? "and drives" : "The system drives"} ${list(acting)}`);
  }
  const first = parts.length ? `${parts.join(" ")}.` : "";
  const second = supply.length ? ` Power comes in through ${list(supply)}.` : "";
  return `${first}${second} Select any block to isolate what it touches.`.trim();
}

function list(items: string[]): string {
  if (items.length === 0) return "nothing";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
