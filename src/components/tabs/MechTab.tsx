"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
  CATEGORY_META,
  partById,
  type PartCategory,
  type ProjectRecord,
} from "@/lib/design/schema";
import {
  AssemblyTree,
  type AssemblySelection,
} from "@/components/tabs/mech/AssemblyTree";

/* three.js is a large dependency and needs a real DOM, so the viewer is loaded
   on demand and never server-rendered. Everything else in this tab stays in the
   eager chunk. */
const MechViewer = dynamic(
  () => import("@/components/tabs/mech/MechViewer").then((m) => m.MechViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <p className="microlabel text-ink-faint">Loading viewer</p>
      </div>
    ),
  },
);

/** Cover hues are authored as hex, but color-mix keeps any CSS color working. */
function tint(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

export function MechTab({ record }: { record: ProjectRecord }) {
  const { pkg, cover } = record;
  const [selection, setSelection] = useState<AssemblySelection | null>(null);

  const categoryCounts = useMemo(() => {
    return (Object.keys(CATEGORY_META) as PartCategory[])
      .map((category) => ({
        category,
        count: pkg.parts.filter((p) => p.category === category).length,
      }))
      .filter((c) => c.count > 0);
  }, [pkg.parts]);

  if (pkg.assembly.length === 0) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="microlabel text-ink-faint">No mechanical data</p>
      </div>
    );
  }

  const selectedPart = selection ? partById(pkg, selection.partId) : undefined;

  return (
    <div className="flex h-[calc(100vh-52px)] min-h-[560px] w-full">
      {/* Viewer */}
      <div className="blueprint-grid relative min-w-0 flex-1 overflow-hidden bg-bg-inset">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(58% 58% at 28% 24%, ${tint(cover.hueA, 14)}, transparent 68%), radial-gradient(54% 54% at 74% 78%, ${tint(cover.hueB, 12)}, transparent 70%)`,
          }}
          aria-hidden
        />

        <div className="relative h-full">
          <MechViewer pkg={pkg} selection={selection} onSelect={setSelection} />
        </div>
      </div>

      {/* Sidebar */}
      <aside className="flex w-[300px] shrink-0 flex-col border-l border-line bg-bg">
        <div className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-3">
          <p className="microlabel text-ink">Parts</p>
          <p className="microlabel text-[10px] text-ink-faint">Assembly</p>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          <AssemblyTree
            pkg={pkg}
            nodes={pkg.assembly}
            selection={selection}
            onSelect={setSelection}
          />
        </div>

        {selectedPart && (
          <div className="border-t border-line bg-bg-card px-4 py-3">
            <p className="text-[12px] leading-tight font-bold">{selectedPart.name}</p>
            <p className="mt-0.5 text-[11px] text-ink-dim">{selectedPart.role}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className="cat-chip"
                style={{
                  ["--chip-color" as string]: CATEGORY_META[selectedPart.category].color,
                }}
              >
                {CATEGORY_META[selectedPart.category].label}
              </span>
              <span className="microlabel text-[10px] text-ink-faint">
                Qty {selectedPart.qty}
              </span>
            </div>
            {selectedPart.printSettings && (
              <p className="mt-2 text-[10px] leading-relaxed text-ink-faint">
                {selectedPart.printSettings}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 border-t border-line px-4 py-3">
          {categoryCounts.map(({ category, count }) => (
            <span
              key={category}
              className="cat-chip"
              style={{ ["--chip-color" as string]: CATEGORY_META[category].color }}
            >
              {CATEGORY_META[category].label} ({count})
            </span>
          ))}
        </div>
      </aside>
    </div>
  );
}
