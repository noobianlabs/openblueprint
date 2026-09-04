"use client";

import type { Part, PartCategory } from "@/lib/design/schema";
import { CATEGORY_META } from "@/lib/design/schema";
import { NET_LEGEND } from "./layout";

export function WiringSidebar({
  groups,
  selectedId,
  onSelect,
}: {
  groups: { category: PartCategory; parts: Part[] }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="flex w-full shrink-0 flex-col border-t border-line bg-bg lg:w-[260px] lg:overflow-y-auto lg:border-t-0 lg:border-l">
      <div className="border-b border-line px-4 py-3">
        <p className="microlabel">Electrical parts</p>
      </div>

      <div className="max-h-[40vh] overflow-y-auto px-4 py-3 lg:max-h-none lg:flex-1 lg:overflow-visible">
        {groups.map((group) => {
          const meta = CATEGORY_META[group.category];
          return (
            <div key={group.category} className="mb-4 last:mb-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="microlabel text-[10px]" style={{ color: meta.color }}>
                  {meta.label}
                </span>
                <span className="text-[10px] text-ink-faint">{group.parts.length}</span>
              </div>
              <ul className="mt-1">
                {group.parts.map((part) => (
                  <li key={part.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(part.id)}
                      title={part.name}
                      className={`flex w-full items-baseline gap-1 rounded-sm px-1 py-1.5 text-left text-[11px] transition-colors ${
                        selectedId === part.id
                          ? "bg-bg-raised text-ink"
                          : "text-ink-dim hover:bg-bg-raised hover:text-ink"
                      }`}
                    >
                      <span className="shrink-0 text-ink-faint">⏚</span>
                      <span className="truncate">{part.role}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="border-t border-line px-4 py-3">
        <p className="microlabel mb-2 text-[10px] text-ink-faint">Nets</p>
        <ul className="space-y-1">
          {NET_LEGEND.map((net) => (
            <li key={net.net} className="flex items-center gap-2 text-[10px]">
              <span
                className="w-8 shrink-0 tracking-tighter"
                style={{ color: net.color }}
                aria-hidden
              >
                {net.glyph}
              </span>
              <span className="microlabel text-[10px]">{net.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
