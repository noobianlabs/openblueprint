"use client";

import type { AssemblyNode, DesignPackage } from "@/lib/design/schema";
import { CATEGORY_META, partById } from "@/lib/design/schema";

export interface AssemblySelection {
  /** Tree path, so a part mounted twice highlights independently. */
  path: string;
  partId: string;
}

/**
 * Box-drawing gutter for one row. Roots draw nothing, so gutter columns start
 * at depth 1 — hence the `slice(1)`: one rail per intermediate ancestor (drawn
 * only while that ancestor still has siblings below it), then this row's elbow.
 */
function gutter(ancestorsLast: boolean[], isLast: boolean): string {
  if (ancestorsLast.length === 0) return "";
  const rails = ancestorsLast.slice(1).map((last) => (last ? "   " : "│  "));
  return rails.join("") + (isLast ? "└─ " : "├─ ");
}

export function AssemblyTree({
  pkg,
  nodes,
  parentPath = "",
  ancestorsLast = [],
  selection,
  onSelect,
}: {
  pkg: DesignPackage;
  nodes: AssemblyNode[];
  parentPath?: string;
  ancestorsLast?: boolean[];
  selection: AssemblySelection | null;
  onSelect: (selection: AssemblySelection) => void;
}) {
  return (
    <ul>
      {nodes.map((node, index) => {
        const part = partById(pkg, node.part);
        const isLast = index === nodes.length - 1;
        const path = `${parentPath}/${node.part}#${index}`;
        const meta = part ? CATEGORY_META[part.category] : null;
        const active = selection?.path === path;

        return (
          <li key={path}>
            <button
              type="button"
              onClick={() => onSelect({ path, partId: node.part })}
              title={part?.name ?? node.part}
              className={`flex w-full items-center gap-1.5 rounded-sm py-1.5 pr-2 pl-1 text-left text-[11px] transition-colors ${
                active ? "bg-bg-raised text-ink" : "text-ink-dim hover:bg-bg-raised hover:text-ink"
              }`}
            >
              <span className="shrink-0 whitespace-pre text-[11px] text-ink-faint" aria-hidden>
                {gutter(ancestorsLast, isLast)}
              </span>
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: meta?.color ?? "var(--text-faint)" }}
                aria-hidden
              />
              <span className="truncate">{part?.role ?? node.part}</span>
            </button>

            {node.children && node.children.length > 0 && (
              <AssemblyTree
                pkg={pkg}
                nodes={node.children}
                parentPath={path}
                ancestorsLast={[...ancestorsLast, isLast]}
                selection={selection}
                onSelect={onSelect}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
