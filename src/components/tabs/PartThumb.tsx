import type { Part, PartCategory } from "@/lib/design/schema";
import { CATEGORY_META } from "@/lib/design/schema";
import { PartArt } from "@/components/art/PartArt";

/**
 * Legacy category glyphs. Nothing renders these any more — PartThumb draws
 * real geometry — but the map is cheap to keep for callers that want a
 * one-character stand-in.
 */
export const CATEGORY_GLYPH: Record<PartCategory, string> = {
  mcu: "▣",
  sensor: "◉",
  actuator: "▸",
  power: "↯",
  comms: "⇌",
  display: "▭",
  module: "⌗",
  enclosure: "▢",
  print3d: "⬡",
  misc: "✚",
};

/** A part stub, so a category on its own still draws that category's body. */
function stubPart(category: PartCategory): Part {
  return {
    id: `category-${category}`,
    name: CATEGORY_META[category].label,
    role: "",
    description: "",
    category,
    domain: CATEGORY_META[category].domain,
    qty: 1,
    unitCost: 0,
  };
}

export interface PartThumbProps {
  category: PartCategory;
  /** The part to draw. Omitted, the category's default body stands in. */
  part?: Part;
  /** Tile edge in px. */
  size?: number;
  className?: string;
}

/** Category-tinted tile holding the part's illustration. */
export function PartThumb({ category, part, size = 48, className }: PartThumbProps) {
  const color = CATEGORY_META[category].color;
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-sm border bg-bg-inset ${
        className ?? ""
      }`}
      style={{
        width: size,
        height: size,
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
        // Drives `currentColor` inside the art, which draws the neutral marks
        // — silkscreen, vents, threads. The body takes its own geometry tint.
        color: "var(--text-dim)",
      }}
    >
      <PartArt part={part ?? stubPart(category)} size={size} />
    </div>
  );
}
