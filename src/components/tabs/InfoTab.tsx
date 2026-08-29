"use client";

import { useState } from "react";
import type { DesignPackage, Part, PartCategory, ProjectRecord } from "@/lib/design/schema";
import {
  CATEGORY_META,
  bomRollup,
  fmtCost,
  partCount,
  subtotal,
  totalCost,
} from "@/lib/design/schema";
import { geometryFor, maxExtent } from "@/lib/design/geometry";
import { PartArt } from "@/components/art/PartArt";

/* Shared column widths — every BOM row uses these so the columns line up. */
const COL_PARTS = "w-16 shrink-0 text-right tabular-nums";
const COL_COST = "w-24 shrink-0 text-right tabular-nums";

/**
 * Where each satellite sits on the parts plate, and how big it is drawn.
 * Fixed anchors, so a design always composes the same way.
 */
const SATELLITE_SLOTS = [
  { left: "70%", top: "28%", size: 76 },
  { left: "84%", top: "62%", size: 64 },
  { left: "16%", top: "66%", size: 64 },
  { left: "50%", top: "18%", size: 58 },
];

/**
 * The handful of parts worth drawing: the biggest mechanical body as the
 * backdrop, the controller, then the largest distinct electrical parts.
 */
function heroCast(pkg: DesignPackage): { shell?: Part; mcu?: Part; satellites: Part[] } {
  const biggestFirst = (a: Part, b: Part) => maxExtent(geometryFor(b)) - maxExtent(geometryFor(a));
  const shells = pkg.parts.filter((p) => p.category === "enclosure" || p.category === "print3d");
  const shell = [...(shells.length ? shells : pkg.parts)].sort(biggestFirst)[0];
  const mcu = pkg.parts.find((p) => p.category === "mcu");

  const others = pkg.parts.filter((p) => p !== shell && p !== mcu);
  const electrical = others.filter((p) => p.domain === "electrical");
  const pool = [...(electrical.length ? electrical : others)].sort(biggestFirst);

  // One per category first, so the plate shows variety rather than four
  // near-identical sensor boards; top up from what is left if it is a
  // small design.
  const seen = new Set<PartCategory>();
  const satellites: Part[] = [];
  for (const p of pool) {
    if (satellites.length >= SATELLITE_SLOTS.length) break;
    if (seen.has(p.category)) continue;
    seen.add(p.category);
    satellites.push(p);
  }
  for (const p of pool) {
    if (satellites.length >= SATELLITE_SLOTS.length) break;
    if (!satellites.includes(p)) satellites.push(p);
  }

  return { shell, mcu, satellites };
}

export function InfoTab({ record }: { record: ProjectRecord }) {
  const { pkg, cover } = record;
  const groups = bomRollup(pkg);
  const cast = heroCast(pkg);
  const [collapsed, setCollapsed] = useState<Set<PartCategory>>(new Set());

  function toggle(category: PartCategory) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Parts plate: the design's headline parts drawn from their derived
            geometry, arranged on the cover's own gradient ground. */}
        <div>
          <div
            className="blueprint-grid relative h-64 overflow-hidden rounded-md border border-line"
            style={{
              background: `radial-gradient(120% 140% at 20% 0%, ${cover.hueA}26, transparent 55%), radial-gradient(120% 140% at 85% 100%, ${cover.hueB}22, transparent 55%), var(--bg-inset)`,
            }}
          >
            {cast.shell && (
              <div
                className="absolute opacity-70"
                style={{ left: "50%", top: "58%", transform: "translate(-50%, -50%)" }}
                title={cast.shell.name}
              >
                <PartArt part={cast.shell} size={186} />
              </div>
            )}
            {cast.satellites.map((part, i) => (
              <div
                key={part.id}
                className="absolute"
                style={{
                  left: SATELLITE_SLOTS[i].left,
                  top: SATELLITE_SLOTS[i].top,
                  transform: "translate(-50%, -50%)",
                }}
                title={part.name}
              >
                <PartArt part={part} size={SATELLITE_SLOTS[i].size} />
              </div>
            ))}
            {cast.mcu && (
              <div
                className="absolute"
                style={{ left: "28%", top: "34%", transform: "translate(-50%, -50%)" }}
                title={cast.mcu.name}
              >
                <PartArt part={cast.mcu} size={88} />
              </div>
            )}
          </div>
          <p className="microlabel mt-2 text-ink-faint">
            Schematic parts plate — bodies derived from the BOM, not a render
          </p>
        </div>

        <div>
          <div className="flex flex-wrap gap-2">
            {pkg.tags.map((t) => (
              <span
                key={t}
                className="cat-chip"
                style={{ ["--chip-color" as string]: "var(--accent)" }}
              >
                {t}
              </span>
            ))}
          </div>
          <p className="microlabel mt-6">AI summary</p>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-dim">{pkg.summary}</p>
        </div>
      </div>

      <h1 className="mt-10 text-xl font-extrabold tracking-[0.1em] uppercase">{pkg.name}</h1>
      <p className="microlabel mt-1 text-ink-faint">by {record.author}</p>

      {/* BOM rollup: domain → category → parts */}
      <section className="mt-6 overflow-hidden rounded-md border border-line bg-bg-card">
        <div className="flex items-center gap-3 border-b border-line px-4 py-2">
          <span className="microlabel flex-1">Category</span>
          <span className={`microlabel ${COL_PARTS}`}>Parts</span>
          <span className={`microlabel ${COL_COST}`}>Cost</span>
        </div>

        {groups.map((group) => (
          <div key={group.domain}>
            <div className="flex items-center gap-3 border-b border-line bg-bg-raised px-4 py-2 text-[12px] font-bold tracking-[0.08em] uppercase">
              <span className="flex-1">{group.domain}</span>
              <span className={COL_PARTS}>{group.lineCount}</span>
              <span className={COL_COST}>{fmtCost(group.cost)}</span>
            </div>

            {group.categories.map((cat) => {
              const meta = CATEGORY_META[cat.category];
              const isOpen = !collapsed.has(cat.category);
              return (
                <div key={cat.category}>
                  <button
                    type="button"
                    onClick={() => toggle(cat.category)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 border-b border-line px-4 py-2 text-left text-[12px] hover:bg-bg-raised"
                    style={{ color: meta.color }}
                  >
                    <span className="w-3 shrink-0 text-ink-faint">{isOpen ? "▾" : "▸"}</span>
                    <span className="flex-1 tracking-[0.08em] uppercase">{meta.label}</span>
                    <span className={COL_PARTS}>{cat.lineCount}</span>
                    <span className={COL_COST}>{fmtCost(cat.cost)}</span>
                  </button>

                  {isOpen &&
                    cat.parts.map((part) => (
                      <div
                        key={part.id}
                        className="flex items-center gap-3 border-b border-line py-1.5 pr-4 pl-10 text-[12px] text-ink-dim"
                      >
                        <span className="flex-1 truncate">{part.name}</span>
                        <span className={COL_PARTS}>{part.qty}</span>
                        <span className={COL_COST}>{fmtCost(subtotal(part))}</span>
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        ))}

        <div className="flex items-center gap-3 px-4 py-2.5 text-[12px] font-bold tracking-[0.08em] uppercase">
          <span className="flex-1">Total</span>
          <span className={COL_PARTS}>{partCount(pkg)}</span>
          <span className={`${COL_COST} text-accent`}>{fmtCost(totalCost(pkg))}</span>
        </div>
      </section>
    </div>
  );
}
