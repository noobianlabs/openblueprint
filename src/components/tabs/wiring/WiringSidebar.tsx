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
    <aside className="flex w-[260px] shrink-0 flex-col overflow-y-auto border-l border-line bg-bg">
      <div className="border-b border-line px-4 py-3">
        <p className="microlabel">Electrical parts</p>
      </div>

      <div className="flex-1 px-4 py-3">
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
                      className={`flex w-full items-baseline gap-1 rounded-sm px-1 py-[3px] text-left text-[11px] transition-colors ${
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
