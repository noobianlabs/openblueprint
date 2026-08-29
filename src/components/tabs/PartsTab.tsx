"use client";

import { useMemo, useState } from "react";
import type { PartCategory, ProjectRecord } from "@/lib/design/schema";
import { CATEGORY_META, fmtCost, subtotal, totalCost } from "@/lib/design/schema";
import { dimsLabel, geometryFor } from "@/lib/design/geometry";
import { PartThumb } from "@/components/tabs/PartThumb";

const COL_QTY = "w-12 shrink-0 text-right tabular-nums";
const COL_UNIT = "w-20 shrink-0 text-right tabular-nums";
const COL_SUB = "w-24 shrink-0 text-right tabular-nums";

type Filter = PartCategory | "all";

export function PartsTab({ record }: { record: ProjectRecord }) {
  const { pkg } = record;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  /** Categories actually used by this design, with their line counts. */
  const present = useMemo(() => {
    const counts = new Map<PartCategory, number>();
    for (const p of pkg.parts) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return (Object.keys(CATEGORY_META) as PartCategory[])
      .filter((c) => counts.has(c))
      .map((c) => ({ category: c, count: counts.get(c) ?? 0 }));
  }, [pkg]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pkg.parts.filter((p) => {
      if (filter !== "all" && p.category !== filter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    });
  }, [pkg, query, filter]);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search parts..."
          aria-label="Search parts"
          className="min-w-0 flex-1 rounded-sm border border-line bg-bg-inset px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-line-strong focus:outline-none"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          aria-label="Filter by category"
          className="microlabel rounded-sm border border-line bg-bg-inset px-3 py-2 text-ink [color-scheme:dark] focus:border-line-strong focus:outline-none"
        >
          <option value="all">All ({pkg.parts.length})</option>
          {present.map(({ category, count }) => (
            <option key={category} value={category}>
              {CATEGORY_META[category].label} ({count})
            </option>
          ))}
        </select>
      </div>

      <div className="mt-6 flex items-center gap-3 border-b border-line px-3 pb-2">
        <span className="microlabel flex-1">Part</span>
        <span className={`microlabel ${COL_QTY}`}>Qty</span>
        <span className={`microlabel ${COL_UNIT}`}>Unit</span>
        <span className={`microlabel ${COL_SUB}`}>Subtotal</span>
      </div>

      {visible.length === 0 ? (
        <p className="microlabel py-16 text-center text-ink-faint">no parts match</p>
      ) : (
        <ul>
          {visible.map((part) => {
            const meta = CATEGORY_META[part.category];
            return (
              <li
                key={part.id}
                className="flex items-start gap-3 border-b border-line px-3 py-3 hover:bg-bg-card"
              >
                <PartThumb category={part.category} part={part} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold">{part.name}</p>
                  <p className="mt-0.5 text-[12px] text-ink-dim">{part.role}</p>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-ink-faint">
                    {part.description}
                  </p>
                  {part.printSettings && (
                    <p className="mt-1 text-[12px] text-ink-faint">⬡ {part.printSettings}</p>
                  )}
                  {/* Approximate body, derived — the package never states sizes. */}
                  <p className="mt-1 text-[12px] text-ink-faint tabular-nums">
                    {dimsLabel(geometryFor(part))}
                  </p>
                  <span
                    className="cat-chip mt-2"
                    style={{ ["--chip-color" as string]: meta.color }}
                  >
                    {meta.label}
                  </span>
                </div>
                <span className={`${COL_QTY} text-[13px]`}>{part.qty}</span>
                <span className={`${COL_UNIT} text-[13px] text-ink-dim`}>
                  {fmtCost(part.unitCost)}
                </span>
                <span className={`${COL_SUB} text-[13px]`}>{fmtCost(subtotal(part))}</span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="sticky bottom-0 mt-4 flex items-center justify-between border-t border-line-strong bg-bg/95 px-3 py-3 backdrop-blur">
        <span className="microlabel">Total estimated cost</span>
        <span className="text-[14px] font-bold text-accent tabular-nums">
          {fmtCost(totalCost(pkg))}
        </span>
      </div>
    </div>
  );
}
