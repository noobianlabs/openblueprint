"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CATEGORY_META } from "@/lib/design/schema";
import { NODE_WIDTH, type PartNodeType } from "./layout";

/** Handle dots sit on the card border; inline styles beat the library sheet. */
const HANDLE_STYLE = {
  width: 5,
  height: 5,
  minWidth: 0,
  minHeight: 0,
  borderRadius: 999,
  background: "var(--bg-raised)",
  border: "1px solid var(--border-strong)",
};

export function PartNode({ data, selected }: NodeProps<PartNodeType>) {
  const meta = CATEGORY_META[data.category];
  const sourceSide = data.flipped ? Position.Left : Position.Right;
  const targetSide = data.flipped ? Position.Right : Position.Left;

  return (
    <div
      className={`rounded-sm border bg-bg-card ${
        selected ? "border-accent" : "border-line hover:border-line-strong"
      }`}
      style={{
        width: NODE_WIDTH,
        boxShadow: selected ? "0 0 0 1px var(--accent), 0 0 18px rgba(61,219,180,0.18)" : undefined,
      }}
    >
      <div className="px-2 pt-2 pb-1.5">
        <div className="flex items-baseline gap-1.5">
          {/* `.microlabel` is unlayered, so it outranks Tailwind's layered
              utilities — the 9px that keeps label + role inside 180px has to
              come from an inline style. */}
          <span className="microlabel shrink-0" style={{ color: meta.color, fontSize: 9 }}>
            {meta.label}
          </span>
          <span className="truncate text-[11px] leading-tight font-bold" title={data.role}>
            {data.role}
          </span>
        </div>
        <p className="truncate text-[10px] leading-tight text-ink-faint" title={data.name}>
          {data.name}
        </p>
      </div>

      <div className="border-t border-line py-1">
        {data.pins.length === 0 ? (
          <p className="microlabel px-2" style={{ fontSize: 9 }}>
            no pins
          </p>
        ) : (
          data.pins.map((pin) => (
            <div
              key={pin}
              className={`relative flex h-4 items-center px-2 ${
                data.flipped ? "justify-end" : "justify-start"
              }`}
            >
              <Handle
                id={pin}
                type="target"
                position={targetSide}
                isConnectable={false}
                style={HANDLE_STYLE}
              />
              <Handle
                id={pin}
                type="source"
                position={sourceSide}
                isConnectable={false}
                style={HANDLE_STYLE}
              />
              <span className="rounded-[2px] border border-line px-1 text-[9px] leading-[12px] text-ink-dim">
                {pin}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
