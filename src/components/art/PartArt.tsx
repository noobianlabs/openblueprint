/**
 * Procedural part illustrations.
 *
 * Nothing here is stored artwork: every drawing is derived from
 * `geometryFor(part)`, so the same part always produces byte-identical SVG and
 * a part's proportions on screen are its proportions in millimetres.
 *
 * One projection for everything — a cabinet oblique with width across the
 * screen, height up it, and depth receding up and to the right. A board and
 * the case it bolts into therefore look drawn by the same hand. Round bodies
 * (cylinder, dome, fastener) stand on their axis: their caps and rims are
 * sampled through the same `project()` used for prism faces (via
 * `circleTransform`/`frontRim`/`bandOutline`/`collarOutline` below), so a can
 * and the board next to it tilt in agreement instead of one going straight-on
 * while the other skews.
 *
 * Each body is lit from directly above: a lighter top face, a mid-tone front
 * face, a darker side face, computed by mixing the category tint toward
 * white/black (`shade`) rather than by layering flat alpha — that's what
 * gives the three faces of a box visibly different tones instead of just
 * different transparencies over whatever sits behind them. A soft seated
 * shadow (sheared the same way as everything else) grounds every part so it
 * reads as sitting on a surface rather than floating.
 */

import type { ReactNode } from "react";
import type { Part } from "@/lib/design/schema";
import type { PartGeometry } from "@/lib/design/geometry";
import { geometryFor, maxExtent } from "@/lib/design/geometry";

/* ---------- projection ---------- */

/** Screen offset per mm of depth. Height maps to exactly (0, -1). */
const DEPTH_X = 0.4;
const DEPTH_Y = 0.5;

/** Square drawing field. The part is fitted and centred inside the padding. */
const VIEW = 100;
const FIT = 86;

type Pt = [number, number];
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function project(x: number, y: number, z: number): Pt {
  return [x + DEPTH_X * z, -y - DEPTH_Y * z];
}

/* ---------- face and path helpers ---------- */

/** Trim decimals so the markup stays small and comparable between renders. */
function n(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function poly(pts: Pt[]): string {
  return pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${n(x)},${n(y)}`).join(" ") + " Z";
}

/** Pull `from` toward `toward` by up to `r`, never past the edge midpoint. */
function trim(from: Pt, toward: Pt, r: number): Pt {
  const dx = toward[0] - from[0];
  const dy = toward[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const k = Math.min(r, len * 0.42) / len;
  return [from[0] + dx * k, from[1] + dy * k];
}

/** Polygon with corners cut back to quadratic fillets — works on skewed faces. */
function roundedPoly(pts: Pt[], r: number): string {
  const out: string[] = [];
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    const a = trim(cur, pts[(i - 1 + pts.length) % pts.length], r);
    const b = trim(cur, pts[(i + 1) % pts.length], r);
    out.push(`${i === 0 ? "M" : "L"}${n(a[0])},${n(a[1])}`);
    out.push(`Q${n(cur[0])},${n(cur[1])} ${n(b[0])},${n(b[1])}`);
  }
  return out.join(" ") + " Z";
}

/**
 * The three faces a box shows under this projection: top, front (-z) and the
 * right side (+x). The other three always point away from the viewer.
 */
function prismFaces(cx: number, cz: number, w: number, d: number, y0: number, h: number) {
  const hw = w / 2;
  const hd = d / 2;
  const t = (x: number, z: number) => project(cx + x, y0 + h, cz + z);
  const b = (x: number, z: number) => project(cx + x, y0, cz + z);
  return {
    top: [t(-hw, -hd), t(hw, -hd), t(hw, hd), t(-hw, hd)] as Pt[],
    front: [t(-hw, -hd), t(hw, -hd), b(hw, -hd), b(-hw, -hd)] as Pt[],
    side: [t(hw, -hd), t(hw, hd), b(hw, hd), b(hw, -hd)] as Pt[],
  };
}

/** Bounding box of a prism, in projected millimetres. */
function prismBox(w: number, d: number, h: number): Box {
  const hw = w / 2;
  const hd = d / 2;
  return {
    x0: -hw - DEPTH_X * hd,
    x1: hw + DEPTH_X * hd,
    y0: -h - DEPTH_Y * hd,
    y1: DEPTH_Y * hd,
  };
}

/** Rectangle on a horizontal plane, given in plan coordinates. */
function planQuad(x0: number, z0: number, x1: number, z1: number, y: number): Pt[] {
  return [project(x0, y, z0), project(x1, y, z0), project(x1, y, z1), project(x0, y, z1)];
}

/* ---------- round-body projection ----------
 *
 * A vertical circle (cylinder cap, dome flange, fastener head) is the image
 * of a plan circle under `project`. Two facts make that image easy to draw
 * exactly, with no per-shape trigonometry:
 *
 *  1. The screen-X extreme of a plan circle (its left/right tangent point)
 *     sits at a fixed angle, independent of height or depth offset — because
 *     `project`'s X ignores height and only shifts with depth linearly.
 *  2. A *full* circle maps to an ellipse by an exact affine transform: a
 *     unit circle scaled to radius r, then sheared by the same
 *     (DEPTH_X, -DEPTH_Y) that `project` applies to z. SVG's `matrix()`
 *     transform expresses that directly, so `<circle r>` under
 *     `circleTransform(...)` renders the identical ellipse `project` would
 *     produce point-by-point.
 *
 * A *partial* arc (the visible sliver of a base rim, where a straight SVG
 * arc command can't share a transform with the straight walls beside it in
 * one path) is instead sampled directly through `project` — `frontRim`.
 */

/** Angle of the rightmost screen-X point on any plan circle under `project`. */
const TANGENT_R = Math.atan2(DEPTH_X, 1);

/** Left (-1) or right (+1) tangent point of the plan circle (cx, cz) r, at height y. */
function tangent(cx: number, y: number, cz: number, r: number, side: -1 | 1): Pt {
  const a = side > 0 ? TANGENT_R : TANGENT_R + Math.PI;
  return project(cx + r * Math.cos(a), y, cz + r * Math.sin(a));
}

/**
 * Sampled points along the viewer-facing half of the plan circle (cx, cz) r
 * at height y, left tangent to right tangent, passing through the near pole.
 */
function frontRim(cx: number, y: number, cz: number, r: number, steps: number): Pt[] {
  const pts: Pt[] = [];
  const start = TANGENT_R - Math.PI;
  for (let i = 0; i <= steps; i++) {
    const a = start + (Math.PI * i) / steps;
    pts.push(project(cx + r * Math.cos(a), y, cz + r * Math.sin(a)));
  }
  return pts;
}

/** Exact affine map from a local unit circle onto the screen ellipse a plan
 *  circle at (cx, y, cz) projects to — apply to `<circle>`/`<ellipse rx=ry>`. */
function circleTransform(cx: number, y: number, cz: number): string {
  const [sx, sy] = project(cx, y, cz);
  return `matrix(1,0,${n(DEPTH_X)},${n(-DEPTH_Y)},${n(sx)},${n(sy)})`;
}

/**
 * Silhouette of a cylindrical band standing from y0 to y1: two straight
 * walls plus the visible front sliver of its base rim. Its open top edge is
 * a straight chord between the tangent points — meant to be covered by a
 * full top ellipse (via `circleTransform`) drawn afterward, layered above.
 */
function bandOutline(cx: number, cz: number, r: number, y0: number, y1: number, steps: number): string {
  const lTop = tangent(cx, y1, cz, r, -1);
  const rTop = tangent(cx, y1, cz, r, 1);
  const rim = frontRim(cx, y0, cz, r, steps);
  return poly([lTop, ...rim, rTop]);
}

/**
 * Silhouette of a collar (a band whose top is only partly visible, e.g. a
 * flange with a dome rising out of its centre): curved front rims at both
 * y0 and y1, joined by straight walls at their shared tangent points.
 */
function collarOutline(cx: number, cz: number, r: number, y0: number, y1: number, steps: number): string {
  const rimLo = frontRim(cx, y0, cz, r, steps);
  const rimHi = frontRim(cx, y1, cz, r, steps);
  return poly([...rimLo, ...rimHi.slice().reverse()]);
}

/**
 * Round bodies carry two matching cross-section dimensions and one axis.
 * Picking the odd one out stands an 18×18×65 cell tall while keeping a
 * 14×8×14 buzzer squat.
 */
function roundAxis(g: PartGeometry): { dia: number; len: number } {
  const rel = (a: number, b: number) => Math.abs(a - b) / (a + b || 1);
  const options = [
    { k: rel(g.w, g.h), dia: (g.w + g.h) / 2, len: g.d },
    { k: rel(g.w, g.d), dia: (g.w + g.d) / 2, len: g.h },
    { k: rel(g.h, g.d), dia: (g.h + g.d) / 2, len: g.w },
  ];
  options.sort((a, b) => a.k - b.k);
  return { dia: options[0].dia, len: options[0].len };
}

/* ---------- colour ---------- */

/** Mix a `#rrggbb` colour toward white (amt > 0) or black (amt < 0). Pure,
 *  deterministic — the top-light shading model is entirely this function. */
function shade(hex: string, amt: number): string {
  const num = parseInt(hex.slice(1), 16);
  const target = amt >= 0 ? 255 : 0;
  const k = Math.min(1, Math.abs(amt));
  const mix = (channel: number) => Math.round(channel + (target - channel) * k);
  const r = mix((num >> 16) & 0xff);
  const g = mix((num >> 8) & 0xff);
  const b = mix(num & 0xff);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Three tones lit from directly above: a bright top, a mid front, a dark side. */
function tones(color: string) {
  return {
    top: shade(color, 0.34),
    front: shade(color, -0.08),
    side: shade(color, -0.42),
    edge: shade(color, 0.55),
  };
}

/* ---------- shared ink ---------- */

const FILL_TOP = 0.94;
const FILL_FRONT = 0.86;
const FILL_SIDE = 0.86;
const EDGE_OP = 0.55;
/** Neutral marks — silkscreen, vents, threads — ride on `currentColor`. */
const MARK = 0.45;

interface Skin {
  /** Stroke width in local (pre-scale) units. */
  sw: number;
  /** Above thumbnail size, where sub-millimetre detail still resolves. */
  fine: boolean;
  /** Per-instance id prefix — keeps this part's <defs> ids collision-free
   *  when several PartArts (or the same part at two sizes) share a page. */
  uid: string;
}

interface Drawing {
  box: Box;
  render: (sk: Skin, t: ReturnType<typeof tones>, color: string) => ReactNode;
}

/** Plan half-extents used to size and place the seated shadow. */
function shadowFootprint(g: PartGeometry): { rx: number; rz: number } {
  if (g.shape === "cylinder" || g.shape === "dome" || g.shape === "fastener") {
    const { dia } = roundAxis(g);
    return { rx: dia / 2, rz: dia / 2 };
  }
  return { rx: g.w / 2, rz: g.d / 2 };
}

/* ---------- board ---------- */

function drawBoard(g: PartGeometry): Drawing {
  const { w, h, d } = g;
  const alongZ = d >= w;
  const long = alongZ ? d : w;
  const short = alongZ ? w : d;

  return {
    box: prismBox(w, d, h),
    render: (sk, t, color) => {
      const f = prismFaces(0, 0, w, d, 0, h);
      const pads: ReactNode[] = [];
      const count = Math.min(g.headerPins, sk.fine ? 24 : 8);

      if (count > 0) {
        const margin = Math.min(long * 0.14, 4);
        const span = long - margin * 2;
        const step = span / count;
        const padLong = Math.min(step * 0.6, 2.2);
        const padShort = Math.min(short * 0.17, 2);
        const rail = short / 2 - padShort * 0.75 - short * 0.05;
        // Header rail: a dim strip the pads sit on.
        const railQuad = alongZ
          ? planQuad(rail - padShort * 0.9, -span / 2, rail + padShort * 0.9, span / 2, h)
          : planQuad(-span / 2, rail - padShort * 0.9, span / 2, rail + padShort * 0.9, h);
        pads.push(<path key="rail" d={poly(railQuad)} fill={color} fillOpacity={0.14} stroke="none" />);
        for (let i = 0; i < count; i++) {
          const c = -span / 2 + step * (i + 0.5);
          const quad = alongZ
            ? planQuad(rail - padShort / 2, c - padLong / 2, rail + padShort / 2, c + padLong / 2, h)
            : planQuad(c - padLong / 2, rail - padShort / 2, c + padLong / 2, rail + padShort / 2, h);
          pads.push(<path key={`p${i}`} d={poly(quad)} fill={t.top} fillOpacity={0.68} stroke="none" />);
          if (sk.fine) {
            // Solder highlight: a bright fleck on each pad.
            const hlCx = alongZ ? rail - padShort * 0.18 : c - padLong * 0.1;
            const hlCz = alongZ ? c - padLong * 0.1 : rail - padShort * 0.18;
            const [hx, hy] = project(hlCx, h, hlCz);
            pads.push(
              <circle key={`ph${i}`} cx={n(hx)} cy={n(hy)} r={n(padShort * 0.16)} fill="#ffffff" fillOpacity={0.5} />,
            );
          }
        }
      }

      // Two component blocks: a squarish chip in the field, and a connector
      // sitting on one end. Both are pushed clear of the header rail.
      const chipSpec = {
        cx: alongZ ? -w * 0.11 : 0,
        cz: alongZ ? 0 : -d * 0.11,
        w: alongZ ? w * 0.4 : w * 0.22,
        d: alongZ ? d * 0.16 : d * 0.4,
        h: Math.max(h * 0.7, 1.2),
      };
      const connSpec = {
        cx: alongZ ? 0 : -w * 0.5 + w * 0.09,
        cz: alongZ ? -d * 0.5 + d * 0.09 : 0,
        w: alongZ ? w * 0.5 : w * 0.12,
        d: alongZ ? d * 0.12 : d * 0.5,
        h: Math.max(h * 1.1, 1.6),
      };
      const chip = block(sk, h, chipSpec);
      const conn = block(sk, h, connSpec);
      let pin1: ReactNode = null;
      if (sk.fine) {
        // IC pin-1 dot: a small mark at one corner of the chip's top face.
        const cf = prismFaces(chipSpec.cx, chipSpec.cz, chipSpec.w, chipSpec.d, h, chipSpec.h);
        const [px, py] = cf.top[0];
        pin1 = <circle cx={n(px)} cy={n(py)} r={n(sk.sw * 1.1)} fill="#ffffff" fillOpacity={0.55} />;
      }

      return (
        <>
          <path d={poly(f.front)} fill={t.front} fillOpacity={FILL_FRONT} stroke={t.edge} strokeOpacity={EDGE_OP * 0.7} strokeWidth={sk.sw} />
          <path d={poly(f.side)} fill={t.side} fillOpacity={FILL_SIDE} stroke={t.edge} strokeOpacity={EDGE_OP * 0.7} strokeWidth={sk.sw} />
          <path
            d={roundedPoly(f.top, Math.min(w, d) * 0.1)}
            fill={t.top}
            fillOpacity={FILL_TOP}
            stroke={t.edge}
            strokeOpacity={EDGE_OP}
            strokeWidth={sk.sw}
            strokeLinejoin="round"
          />
          {sk.fine && (
            <path
              d={roundedPoly(
                planQuad(-w / 2 + w * 0.09, -d / 2 + d * 0.09, w / 2 - w * 0.09, d / 2 - d * 0.09, h),
                Math.min(w, d) * 0.08,
              )}
              fill="none"
              stroke="currentColor"
              strokeOpacity={MARK * 0.55}
              strokeWidth={sk.sw * 0.7}
              strokeLinejoin="round"
            />
          )}
          {pads}
          {chip}
          {pin1}
          {conn}
        </>
      );
    },
  };
}

/** A small extruded block standing on a body's top face at height y0. */
function block(sk: Skin, y0: number, b: { cx: number; cz: number; w: number; d: number; h: number }): ReactNode {
  const f = prismFaces(b.cx, b.cz, b.w, b.d, y0, b.h);
  return (
    <>
      <path d={poly(f.front)} fill="currentColor" fillOpacity={0.14} stroke="none" />
      <path d={poly(f.side)} fill="currentColor" fillOpacity={0.09} stroke="none" />
      <path
        d={poly(f.top)}
        fill="currentColor"
        fillOpacity={0.22}
        stroke="currentColor"
        strokeOpacity={MARK}
        strokeWidth={sk.sw * 0.8}
        strokeLinejoin="round"
      />
    </>
  );
}

/* ---------- plate ---------- */

function drawPlate(g: PartGeometry): Drawing {
  const { w, h, d } = g;
  return {
    box: prismBox(w, d, h),
    render: (sk, t, color) => {
      const f = prismFaces(0, 0, w, d, 0, h);
      const inner: ReactNode[] = [];
      const alongZ = d >= w;
      const long = alongZ ? d : w;
      const short = alongZ ? w : d;
      const inset = Math.min(long, short) * 0.13;

      if (g.detail > 0) {
        // Repeating cells: solar wafers, LEDs on a strip.
        const rows = short / long > 0.45 && g.detail >= 4 ? 2 : 1;
        const cols = Math.ceil(g.detail / rows);
        const gap = Math.min(long / cols, short / rows) * 0.16;
        const cellLong = (long - inset * 2 - gap * (cols - 1)) / cols;
        const cellShort = (short - inset * 2 - gap * (rows - 1)) / rows;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const a0 = -long / 2 + inset + c * (cellLong + gap);
            const b0 = -short / 2 + inset + r * (cellShort + gap);
            const quad = alongZ
              ? planQuad(b0, a0, b0 + cellShort, a0 + cellLong, h)
              : planQuad(a0, b0, a0 + cellLong, b0 + cellShort, h);
            inner.push(
              <path
                key={`c${r}-${c}`}
                d={poly(quad)}
                fill={t.top}
                fillOpacity={0.4}
                stroke="currentColor"
                strokeOpacity={MARK * 0.5}
                strokeWidth={sk.sw * 0.6}
              />,
            );
          }
        }
      } else {
        // Active area: screens and blank panels get one inset window.
        const quad = planQuad(-w / 2 + w * 0.14, -d / 2 + d * 0.14, w / 2 - w * 0.14, d / 2 - d * 0.14, h);
        inner.push(
          <path
            key="window"
            d={roundedPoly(quad, Math.min(w, d) * 0.05)}
            fill={t.side}
            fillOpacity={0.5}
            stroke={t.edge}
            strokeOpacity={EDGE_OP * 0.6}
            strokeWidth={sk.sw * 0.8}
            strokeLinejoin="round"
          />,
        );
        if (sk.fine) {
          // Sheen: a soft diagonal highlight across the active area, the
          // way glass or a coated panel catches the overhead light.
          inner.push(
            <path
              key="sheen"
              d={roundedPoly(quad, Math.min(w, d) * 0.05)}
              fill={`url(#${sk.uid}-sheen)`}
              stroke="none"
            />,
          );
          for (let i = 0; i < 3; i++) {
            const zt = -d / 2 + d * (0.3 + i * 0.2);
            const [ax, ay] = project(-w / 2 + w * 0.22, h, zt);
            const [bx, by] = project(w / 2 - w * (i === 2 ? 0.42 : 0.22), h, zt);
            inner.push(
              <line
                key={`s${i}`}
                x1={n(ax)}
                y1={n(ay)}
                x2={n(bx)}
                y2={n(by)}
                stroke="currentColor"
                strokeOpacity={MARK * 0.65}
                strokeWidth={sk.sw * 0.7}
              />,
            );
          }
        }
      }

      return (
        <>
          <path d={poly(f.front)} fill={t.front} fillOpacity={FILL_FRONT} stroke={t.edge} strokeOpacity={EDGE_OP * 0.7} strokeWidth={sk.sw} />
          <path d={poly(f.side)} fill={t.side} fillOpacity={FILL_SIDE} stroke={t.edge} strokeOpacity={EDGE_OP * 0.7} strokeWidth={sk.sw} />
          <path
            d={roundedPoly(f.top, Math.min(w, d) * 0.07)}
            fill={t.top}
            fillOpacity={FILL_TOP}
            stroke={t.edge}
            strokeOpacity={EDGE_OP}
            strokeWidth={sk.sw}
            strokeLinejoin="round"
          />
          {sk.fine && (
            // Bezel: a thin inset lip around the whole face.
            <path
              d={roundedPoly(
                planQuad(-w / 2 + w * 0.05, -d / 2 + d * 0.05, w / 2 - w * 0.05, d / 2 - d * 0.05, h),
                Math.min(w, d) * 0.05,
              )}
              fill="none"
              stroke={t.edge}
              strokeOpacity={0.3}
              strokeWidth={sk.sw * 0.6}
              strokeLinejoin="round"
            />
          )}
          {inner}
        </>
      );
    },
  };
}

/* ---------- box ---------- */

function drawBox(g: PartGeometry): Drawing {
  const { w, h, d } = g;
  return {
    box: prismBox(w, d, h),
    render: (sk, t, color) => {
      const f = prismFaces(0, 0, w, d, 0, h);
      const marks: ReactNode[] = [];

      if (g.detail > 0) {
        // Vents cut into the front face, ribbed.
        const span = w * 0.5;
        const step = span / g.detail;
        for (let i = 0; i < g.detail; i++) {
          const x = -span / 2 + step * (i + 0.5);
          const [ax, ay] = project(x, h * 0.68, -d / 2);
          const [bx, by] = project(x, h * 0.24, -d / 2);
          marks.push(
            <line key={`v${i}`} x1={n(ax)} y1={n(ay)} x2={n(bx)} y2={n(by)} stroke="currentColor" strokeOpacity={MARK} strokeWidth={sk.sw * 1.1} strokeLinecap="round" />,
          );
        }
      }

      if (sk.fine) {
        // Lid seam on the top face.
        marks.push(
          <path
            key="lid"
            d={roundedPoly(
              planQuad(-w / 2 + w * 0.09, -d / 2 + d * 0.09, w / 2 - w * 0.09, d / 2 - d * 0.09, h),
              Math.min(w, d) * 0.05,
            )}
            fill="none"
            stroke="currentColor"
            strokeOpacity={MARK * 0.6}
            strokeWidth={sk.sw * 0.7}
            strokeLinejoin="round"
          />,
        );
        // Edge highlight: the top-front edge catches the overhead light.
        const [ex0, ey0] = f.top[0];
        const [ex1, ey1] = f.top[1];
        marks.push(
          <line
            key="edge"
            x1={n(ex0)}
            y1={n(ey0)}
            x2={n(ex1)}
            y2={n(ey1)}
            stroke={t.edge}
            strokeOpacity={0.65}
            strokeWidth={sk.sw * 0.8}
            strokeLinecap="round"
          />,
        );
      }

      return (
        <>
          <path d={poly(f.front)} fill={t.front} fillOpacity={FILL_FRONT} stroke={t.edge} strokeOpacity={EDGE_OP} strokeWidth={sk.sw} strokeLinejoin="round" />
          <path d={poly(f.side)} fill={t.side} fillOpacity={FILL_SIDE} stroke={t.edge} strokeOpacity={EDGE_OP} strokeWidth={sk.sw} strokeLinejoin="round" />
          <path d={poly(f.top)} fill={t.top} fillOpacity={FILL_TOP} stroke={t.edge} strokeOpacity={EDGE_OP} strokeWidth={sk.sw} strokeLinejoin="round" />
          {marks}
        </>
      );
    },
  };
}

/* ---------- cylinder ---------- */

function drawCylinder(g: PartGeometry): Drawing {
  const { dia, len } = roundAxis(g);
  const r = dia / 2;
  const stubH = Math.max(len * 0.12, r * 0.35);
  const stubR = Math.max(r * 0.24, 0.6);
  const box = prismBox(dia, dia, len);

  return {
    box: { ...box, y0: box.y0 - stubH - stubR * DEPTH_Y },
    render: (sk, t, color) => {
      const steps = sk.fine ? 12 : 6;
      const barrel = bandOutline(0, 0, r, 0, len, steps);
      const stub = bandOutline(0, 0, stubR, len, len + stubH, Math.max(6, steps - 4));
      const [topCx, topCy] = project(0, len, 0);
      const [stubCx, stubCy] = project(0, len + stubH, 0);

      return (
        <>
          <path d={barrel} fill={t.front} fillOpacity={FILL_FRONT} stroke={t.edge} strokeOpacity={EDGE_OP} strokeWidth={sk.sw} strokeLinejoin="round" />
          <ellipse cx={0} cy={0} rx={n(r)} ry={n(r)} transform={circleTransform(0, len, 0)} fill={t.top} fillOpacity={FILL_TOP} stroke={t.edge} strokeOpacity={EDGE_OP} strokeWidth={sk.sw} />
          {/* Terminal stub / output shaft, standing on the cap. */}
          <path d={stub} fill={t.side} fillOpacity={0.62} stroke={t.edge} strokeOpacity={EDGE_OP} strokeWidth={sk.sw * 0.9} />
          <ellipse cx={0} cy={0} rx={n(stubR)} ry={n(stubR)} transform={circleTransform(0, len + stubH, 0)} fill={t.top} fillOpacity={0.55} stroke={t.edge} strokeOpacity={EDGE_OP} strokeWidth={sk.sw * 0.9} />
          {sk.fine && (
            <>
              {/* End-cap highlight ring, inset from the rim. */}
              <ellipse cx={0} cy={0} rx={n(r * 0.72)} ry={n(r * 0.72)} transform={circleTransform(0, len, 0)} fill="none" stroke="#ffffff" strokeOpacity={0.22} strokeWidth={sk.sw * 0.6} />
              {/* Terminal contact dot. */}
              <circle cx={n(stubCx)} cy={n(stubCy)} r={n(stubR * 0.3)} fill="#ffffff" fillOpacity={0.5} />
              <path d={`M${n(-r)},${n(-len + len * 0.18)} A${n(r)},${n(r * 0.5)} 0 0 0 ${n(r)},${n(-len + len * 0.18)}`} fill="none" stroke="currentColor" strokeOpacity={MARK * 0.35} strokeWidth={sk.sw * 0.6} />
            </>
          )}
        </>
      );
    },
  };
}

/* ---------- dome ---------- */

function drawDome(g: PartGeometry): Drawing {
  const { dia } = roundAxis(g);
  const r = dia / 2;
  const flangeR = r * 1.12;
  const flangeH = r * 0.34;
  const legs = r * 1.25;
  const box = prismBox(flangeR * 2, flangeR * 2, flangeH + r);

  return {
    box: { x0: box.x0, y0: box.y0 - r * 0.3, x1: box.x1, y1: legs },
    render: (sk, t, color) => {
      const steps = sk.fine ? 12 : 6;
      const collar = collarOutline(0, 0, flangeR, 0, flangeH, steps);

      const lTop = tangent(0, flangeH, 0, r, -1);
      const rTop = tangent(0, flangeH, 0, r, 1);
      const rim = frontRim(0, flangeH, 0, r, steps);
      const bulge =
        `M${n(lTop[0])},${n(lTop[1])} A${n(r)},${n(r)} 0 0 1 ${n(rTop[0])},${n(rTop[1])} ` +
        rim
          .slice(0, -1)
          .reverse()
          .map(([x, y]) => `L${n(x)},${n(y)}`)
          .join(" ") +
        " Z";

      const [specCx, specCy] = project(-r * 0.32, flangeH + r * 0.42, -r * 0.28);

      return (
        <>
          {/* Legs. */}
          {[-1, 1].map((s) => (
            <path
              key={`leg${s}`}
              d={`M${n(s * r * 0.42)},${n(-flangeH * 0.6)} L${n(s * r * 0.42)},${n(legs * (s < 0 ? 1 : 0.72))}`}
              stroke="currentColor"
              strokeOpacity={MARK * 1.2}
              strokeWidth={sk.sw * 1.2}
              strokeLinecap="round"
              fill="none"
            />
          ))}
          {/* Flange / collar. */}
          <path d={collar} fill={t.front} fillOpacity={FILL_FRONT} stroke={t.edge} strokeOpacity={EDGE_OP} strokeWidth={sk.sw} />
          {/* Hemisphere. */}
          <path d={bulge} fill={t.top} fillOpacity={FILL_TOP} stroke={t.edge} strokeOpacity={EDGE_OP} strokeWidth={sk.sw} />
          {sk.fine && <circle cx={n(specCx)} cy={n(specCy)} r={n(r * 0.14)} fill="#ffffff" fillOpacity={0.75} />}
        </>
      );
    },
  };
}

/* ---------- fastener ---------- */

function drawFastener(g: PartGeometry): Drawing {
  const { dia, len } = roundAxis(g);
  const r = dia / 2;
  const headH = Math.max(len * 0.28, r * 0.7);
  const shaftR = r * 0.56;
  const yHead = -len;
  const yShoulder = yHead + headH;
  const tip = len * 0.14;
  const box = prismBox(dia, dia, len);

  return {
    box: { ...box, y1: 0 },
    render: (sk, t, color) => {
      const steps = sk.fine ? 12 : 6;
      const headLocalTop = len;
      const headLocalShoulder = len - headH;
      const headBand = bandOutline(0, 0, r, headLocalShoulder, headLocalTop, steps);

      const ticks: ReactNode[] = [];
      const threadTop = yShoulder + (0 - yShoulder) * 0.22;
      const threadSpan = 0 - tip - threadTop;
      for (let i = 0; i < 4; i++) {
        const y = threadTop + (threadSpan / 4) * (i + 0.5);
        ticks.push(
          <path key={`t${i}`} d={`M${n(-shaftR)},${n(y - threadSpan * 0.06)} L${n(shaftR)},${n(y + threadSpan * 0.06)}`} stroke="currentColor" strokeOpacity={MARK} strokeWidth={sk.sw * 0.8} strokeLinecap="round" />,
        );
      }
      // Socket: a hexagon on the head's top plane, projected exactly like
      // every other plan point — no separate squash factor to keep in sync.
      const hex: Pt[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        hex.push(project(r * 0.5 * Math.cos(a), len, r * 0.5 * Math.sin(a)));
      }
      const [hcx, hcy] = project(0, len, 0);

      return (
        <>
          {/* Shaft with a chamfered tip. */}
          <path
            d={
              `M${n(-shaftR)},${n(yShoulder)} L${n(-shaftR)},${n(-tip)} ` +
              `L${n(-shaftR * 0.45)},0 L${n(shaftR * 0.45)},0 ` +
              `L${n(shaftR)},${n(-tip)} L${n(shaftR)},${n(yShoulder)} Z`
            }
            fill={t.front}
            fillOpacity={FILL_FRONT}
            stroke={t.edge}
            strokeOpacity={EDGE_OP}
            strokeWidth={sk.sw}
            strokeLinejoin="round"
          />
          {ticks}
          {/* Head. */}
          <path d={headBand} fill={t.front} fillOpacity={FILL_FRONT} stroke={t.edge} strokeOpacity={EDGE_OP} strokeWidth={sk.sw} />
          <ellipse cx={0} cy={0} rx={n(r)} ry={n(r)} transform={circleTransform(0, len, 0)} fill={t.top} fillOpacity={FILL_TOP} stroke={t.edge} strokeOpacity={EDGE_OP} strokeWidth={sk.sw} />
          {/* Socket recess: darkened below the lit top, deep enough to read as a hole. */}
          <path d={poly(hex)} fill={t.side} fillOpacity={0.85} stroke={t.edge} strokeOpacity={MARK} strokeWidth={sk.sw * 0.7} strokeLinejoin="round" />
          {sk.fine && <circle cx={n(hcx)} cy={n(hcy)} r={n(r * 0.12)} fill="#000000" fillOpacity={0.4} />}
        </>
      );
    },
  };
}

/* ---------- assembly ---------- */

function drawingFor(g: PartGeometry): Drawing {
  switch (g.shape) {
    case "board":
      return drawBoard(g);
    case "plate":
      return drawPlate(g);
    case "box":
      return drawBox(g);
    case "cylinder":
      return drawCylinder(g);
    case "dome":
      return drawDome(g);
    case "fastener":
      return drawFastener(g);
  }
}

/** Turn an id into something safe (and unique-enough) for an SVG `<defs>` id:
 *  the part's own id plus the rendered size, so the same part drawn twice at
 *  two sizes on one page — a thumbnail and a detail view — never collide. */
function sanitizeId(part: Part, size: number): string {
  return `pa-${part.id.replace(/[^A-Za-z0-9_-]/g, "-")}-${size}`;
}

export interface PartArtProps {
  part: Part;
  /** Rendered edge length in px. Also gates how much fine detail is drawn. */
  size?: number;
  className?: string;
}

/**
 * Inline SVG illustration of one part. Pure: same part and size always yield
 * the same markup.
 */
export function PartArt({ part, size = 48, className }: PartArtProps) {
  const g = geometryFor(part);
  const drawing = drawingFor(g);
  const bw = drawing.box.x1 - drawing.box.x0 || 1;
  const bh = drawing.box.y1 - drawing.box.y0 || 1;

  // Normalise on the longest edge so parts keep their real proportions, then
  // clamp so a projection wider than its own longest edge still fits.
  const scale = Math.min(FIT / maxExtent(g), FIT / bw, FIT / bh);
  const tx = VIEW / 2 - (scale * (drawing.box.x0 + drawing.box.x1)) / 2;
  const ty = VIEW / 2 - (scale * (drawing.box.y0 + drawing.box.y1)) / 2;

  const uid = sanitizeId(part, size);
  const skin: Skin = {
    // Strokes are specified in viewBox units, then divided back out of the
    // fit transform so a screw and an enclosure carry the same line weight.
    sw: Math.min(2.6, Math.max(0.9, 120 / size)) / scale,
    fine: size >= 56,
    uid,
  };
  const t = tones(g.color);
  const shadow = shadowFootprint(g);
  const shadowScale = 1.18;

  return (
    <svg viewBox={`0 0 ${VIEW} ${VIEW}`} width={size} height={size} role="img" aria-label={part.name} className={className}>
      <defs>
        <radialGradient id={`${uid}-shadow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
        {skin.fine && g.shape === "plate" && (
          <linearGradient id={`${uid}-sheen`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        )}
      </defs>
      <g transform={`translate(${n(tx)} ${n(ty)}) scale(${n(scale)})`} aria-hidden="true">
        <ellipse
          cx={0}
          cy={0}
          rx={n(shadow.rx * shadowScale)}
          ry={n(shadow.rz * shadowScale)}
          transform={circleTransform(0, 0, 0)}
          fill={`url(#${uid}-shadow)`}
        />
        {drawing.render(skin, t, g.color)}
      </g>
    </svg>
  );
}
