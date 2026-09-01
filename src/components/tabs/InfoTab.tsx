"use client";

import { useState } from "react";
import type { PartCategory, ProjectRecord } from "@/lib/design/schema";
import {
  CATEGORY_META,
  bomRollup,
  fmtCost,
  partCount,
  subtotal,
  totalCost,
} from "@/lib/design/schema";
import { HeroShot } from "@/components/art/HeroShot";

/* Shared column widths — every BOM row uses these so the columns line up. */
const COL_PARTS = "w-16 shrink-0 text-right tabular-nums";
const COL_COST = "w-24 shrink-0 text-right tabular-nums";

export function InfoTab({ record }: { record: ProjectRecord }) {
  const { pkg } = record;
  const groups = bomRollup(pkg);
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
        {/* Hero shot: the assembly photographed offscreen from the same model
            the MECH tab shows, on the cover's own gradient ground. */}
        <div>
          <HeroShot
            record={record}
            variant="hero"
            className="blueprint-grid h-64 rounded-md border border-line"
          />
          <p className="microlabel mt-2 text-ink-faint">
            Rendered from this design&apos;s massing model
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
