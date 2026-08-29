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
 * (cylinder, dome, fastener) stand on their axis and use the same depth
 * foreshortening for their cross-section ellipses.
 */

import type { ReactNode } from "react";
import type { Part } from "@/lib/design/schema";
import type { PartGeometry } from "@/lib/design/geometry";
import { geometryFor, maxExtent } from "@/lib/design/geometry";

/* ---------- projection ---------- */

/** Screen offset per mm of depth. Height maps to exactly (0, -1). */
const DEPTH_X = 0.4;
const DEPTH_Y = 0.5;
/** A circle lying in the plan (x/z) plane projects to this squash. */
const ELLIPSE_K = DEPTH_Y;

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

/* ---------- shared ink ---------- */

/** Face alphas, lit from the top so the three faces read apart. */
const FACE_TOP = 0.26;
const FACE_FRONT = 0.15;
const FACE_SIDE = 0.09;
const EDGE = 0.8;
/** Neutral marks — silkscreen, vents, threads — ride on `currentColor`. */
const MARK = 0.45;

interface Skin {
  /** Stroke width in local (pre-scale) units. */
  sw: number;
  /** Above thumbnail size, where sub-millimetre detail still resolves. */
  fine: boolean;
}

interface Drawing {
  box: Box;
  render: (sk: Skin) => ReactNode;
}

/* ---------- board ---------- */

function drawBoard(g: PartGeometry): Drawing {
  const { w, h, d } = g;
  const alongZ = d >= w;
  const long = alongZ ? d : w;
  const short = alongZ ? w : d;

  return {
    box: prismBox(w, d, h),
    render: (sk) => {
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
        pads.push(
          <path key="rail" d={poly(railQuad)} fill={g.color} fillOpacity={0.12} stroke="none" />,
        );
        for (let i = 0; i < count; i++) {
          const c = -span / 2 + step * (i + 0.5);
          const quad = alongZ
            ? planQuad(rail - padShort / 2, c - padLong / 2, rail + padShort / 2, c + padLong / 2, h)
            : planQuad(c - padLong / 2, rail - padShort / 2, c + padLong / 2, rail + padShort / 2, h);
          pads.push(
            <path key={`p${i}`} d={poly(quad)} fill={g.color} fillOpacity={0.62} stroke="none" />,
          );
        }
      }

      // Two component blocks: a squarish chip in the field, and a connector
      // sitting on one end. Both are pushed clear of the header rail.
      const chip = block(g, sk, {
        cx: alongZ ? -w * 0.11 : 0,
        cz: alongZ ? 0 : -d * 0.11,
        w: alongZ ? w * 0.4 : w * 0.22,
        d: alongZ ? d * 0.16 : d * 0.4,
        h: Math.max(h * 0.7, 1.2),
      });
      const conn = block(g, sk, {
        cx: alongZ ? 0 : -w * 0.5 + w * 0.09,
        cz: alongZ ? -d * 0.5 + d * 0.09 : 0,
        w: alongZ ? w * 0.5 : w * 0.12,
        d: alongZ ? d * 0.12 : d * 0.5,
        h: Math.max(h * 1.1, 1.6),
      });

      return (
        <>
          <path
            d={poly(f.front)}
            fill={g.color}
            fillOpacity={FACE_FRONT}
            stroke={g.color}
            strokeOpacity={EDGE * 0.7}
            strokeWidth={sk.sw}
          />
          <path
            d={poly(f.side)}
            fill={g.color}
            fillOpacity={FACE_SIDE}
            stroke={g.color}
            strokeOpacity={EDGE * 0.7}
            strokeWidth={sk.sw}
          />
          <path
            d={roundedPoly(f.top, Math.min(w, d) * 0.1)}
            fill={g.color}
            fillOpacity={FACE_TOP}
            stroke={g.color}
            strokeOpacity={EDGE}
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
          {conn}
        </>
      );
    },
  };
}

/** A small extruded block standing on a body's top face. */
function block(
  g: PartGeometry,
  sk: Skin,
  b: { cx: number; cz: number; w: number; d: number; h: number },
): ReactNode {
  const f = prismFaces(b.cx, b.cz, b.w, b.d, g.h, b.h);
  return (
    <>
      <path d={poly(f.front)} fill="currentColor" fillOpacity={0.12} stroke="none" />
      <path d={poly(f.side)} fill="currentColor" fillOpacity={0.08} stroke="none" />
      <path
        d={poly(f.top)}
        fill="currentColor"
        fillOpacity={0.2}
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
    render: (sk) => {
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
                fill={g.color}
                fillOpacity={0.3}
                stroke="currentColor"
                strokeOpacity={MARK * 0.5}
                strokeWidth={sk.sw * 0.6}
              />,
            );
          }
        }
      } else {
        // Active area: screens and blank panels get one inset window.
        const quad = planQuad(
          -w / 2 + w * 0.14,
          -d / 2 + d * 0.14,
          w / 2 - w * 0.14,
          d / 2 - d * 0.14,
          h,
        );
        inner.push(
          <path
            key="window"
            d={roundedPoly(quad, Math.min(w, d) * 0.05)}
            fill={g.color}
            fillOpacity={0.14}
            stroke={g.color}
            strokeOpacity={EDGE * 0.6}
            strokeWidth={sk.sw * 0.8}
            strokeLinejoin="round"
          />,
        );
        if (sk.fine) {
          for (let i = 0; i < 3; i++) {
            const t = -d / 2 + d * (0.3 + i * 0.2);
            const [ax, ay] = project(-w / 2 + w * 0.22, h, t);
            const [bx, by] = project(w / 2 - w * (i === 2 ? 0.42 : 0.22), h, t);
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
          <path
            d={poly(f.front)}
            fill={g.color}
            fillOpacity={FACE_FRONT}
            stroke={g.color}
            strokeOpacity={EDGE * 0.7}
            strokeWidth={sk.sw}
          />
          <path
            d={poly(f.side)}
            fill={g.color}
            fillOpacity={FACE_SIDE}
            stroke={g.color}
            strokeOpacity={EDGE * 0.7}
            strokeWidth={sk.sw}
          />
          <path
            d={roundedPoly(f.top, Math.min(w, d) * 0.07)}
            fill={g.color}
            fillOpacity={FACE_TOP}
            stroke={g.color}
            strokeOpacity={EDGE}
            strokeWidth={sk.sw}
            strokeLinejoin="round"
          />
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
    render: (sk) => {
      const f = prismFaces(0, 0, w, d, 0, h);
      const marks: ReactNode[] = [];

      if (g.detail > 0) {
        // Vents cut into the front face.
        const span = w * 0.5;
        const step = span / g.detail;
        for (let i = 0; i < g.detail; i++) {
          const x = -span / 2 + step * (i + 0.5);
          const [ax, ay] = project(x, h * 0.68, -d / 2);
          const [bx, by] = project(x, h * 0.24, -d / 2);
          marks.push(
            <line
              key={`v${i}`}
              x1={n(ax)}
              y1={n(ay)}
              x2={n(bx)}
              y2={n(by)}
              stroke="currentColor"
              strokeOpacity={MARK}
              strokeWidth={sk.sw * 1.1}
              strokeLinecap="round"
            />,
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
      }

      return (
        <>
          <path
            d={poly(f.front)}
            fill={g.color}
            fillOpacity={FACE_FRONT}
            stroke={g.color}
            strokeOpacity={EDGE}
            strokeWidth={sk.sw}
            strokeLinejoin="round"
          />
          <path
            d={poly(f.side)}
            fill={g.color}
            fillOpacity={FACE_SIDE}
            stroke={g.color}
            strokeOpacity={EDGE}
            strokeWidth={sk.sw}
            strokeLinejoin="round"
          />
          <path
            d={poly(f.top)}
            fill={g.color}
            fillOpacity={FACE_TOP}
            stroke={g.color}
            strokeOpacity={EDGE}
            strokeWidth={sk.sw}
            strokeLinejoin="round"
          />
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
  const ry = r * ELLIPSE_K;
  const stubH = Math.max(len * 0.12, r * 0.35);
  const stubR = Math.max(r * 0.24, 0.6);
  const stubRy = stubR * ELLIPSE_K;
  const yTop = -len;
  const yStub = yTop - stubH;

  return {
    box: { x0: -r, y0: yStub - stubRy, x1: r, y1: ry },
    render: (sk) => {
      // Barrel: down the left wall, under the front of the base, up the right
      // wall, then back across the front of the cap.
      const barrel =
        `M${n(-r)},${n(yTop)} L${n(-r)},0 ` +
        `A${n(r)},${n(ry)} 0 0 0 ${n(r)},0 ` +
        `L${n(r)},${n(yTop)} ` +
        `A${n(r)},${n(ry)} 0 0 1 ${n(-r)},${n(yTop)} Z`;
      const seamY = yTop + len * 0.18;
      return (
        <>
          <path
            d={barrel}
            fill={g.color}
            fillOpacity={FACE_FRONT}
            stroke={g.color}
            strokeOpacity={EDGE}
            strokeWidth={sk.sw}
          />
          <ellipse
            cx={0}
            cy={n(yTop)}
            rx={n(r)}
            ry={n(ry)}
            fill={g.color}
            fillOpacity={FACE_TOP}
            stroke={g.color}
            strokeOpacity={EDGE}
            strokeWidth={sk.sw}
          />
          {/* Terminal stub / output shaft, standing on the cap. */}
          <path
            d={
              `M${n(-stubR)},${n(yTop)} L${n(-stubR)},${n(yStub)} ` +
              `A${n(stubR)},${n(stubRy)} 0 0 1 ${n(stubR)},${n(yStub)} ` +
              `L${n(stubR)},${n(yTop)} Z`
            }
            fill={g.color}
            fillOpacity={FACE_SIDE + FACE_TOP}
            stroke={g.color}
            strokeOpacity={EDGE}
            strokeWidth={sk.sw * 0.9}
          />
          <ellipse
            cx={0}
            cy={n(yStub)}
            rx={n(stubR)}
            ry={n(stubRy)}
            fill={g.color}
            fillOpacity={0.42}
            stroke={g.color}
            strokeOpacity={EDGE}
            strokeWidth={sk.sw * 0.9}
          />
          {sk.fine && (
            <path
              d={`M${n(-r)},${n(seamY)} A${n(r)},${n(ry)} 0 0 0 ${n(r)},${n(seamY)}`}
              fill="none"
              stroke="currentColor"
              strokeOpacity={MARK * 0.7}
              strokeWidth={sk.sw * 0.7}
            />
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
  const ry = r * ELLIPSE_K;
  const flangeR = r * 1.12;
  const flangeRy = flangeR * ELLIPSE_K;
  const flangeH = r * 0.34;
  const legs = r * 1.25;

  return {
    box: { x0: -flangeR, y0: -flangeH - r, x1: flangeR, y1: legs },
    render: (sk) => {
      const yF = -flangeH;
      return (
        <>
          {/* Legs. */}
          {[-1, 1].map((s) => (
            <path
              key={`leg${s}`}
              d={
                `M${n(s * r * 0.42)},${n(yF + flangeH * 0.4)} ` +
                `L${n(s * r * 0.42)},${n(legs * (s < 0 ? 1 : 0.72))}`
              }
              stroke="currentColor"
              strokeOpacity={MARK * 1.2}
              strokeWidth={sk.sw * 1.2}
              strokeLinecap="round"
              fill="none"
            />
          ))}
          {/* Flange. */}
          <path
            d={
              `M${n(-flangeR)},${n(yF)} L${n(-flangeR)},0 ` +
              `A${n(flangeR)},${n(flangeRy)} 0 0 0 ${n(flangeR)},0 ` +
              `L${n(flangeR)},${n(yF)} ` +
              `A${n(flangeR)},${n(flangeRy)} 0 0 1 ${n(-flangeR)},${n(yF)} Z`
            }
            fill={g.color}
            fillOpacity={FACE_FRONT}
            stroke={g.color}
            strokeOpacity={EDGE}
            strokeWidth={sk.sw}
          />
          {/* Hemisphere. */}
          <path
            d={
              `M${n(-r)},${n(yF)} A${n(r)},${n(r)} 0 0 1 ${n(r)},${n(yF)} ` +
              `A${n(r)},${n(ry)} 0 0 1 ${n(-r)},${n(yF)} Z`
            }
            fill={g.color}
            fillOpacity={FACE_TOP}
            stroke={g.color}
            strokeOpacity={EDGE}
            strokeWidth={sk.sw}
          />
          {sk.fine && (
            <path
              d={`M${n(-r * 0.55)},${n(yF - r * 0.36)} A${n(r * 0.6)},${n(r * 0.6)} 0 0 1 ${n(
                -r * 0.1,
              )},${n(yF - r * 0.8)}`}
              fill="none"
              stroke="currentColor"
              strokeOpacity={MARK}
              strokeWidth={sk.sw * 0.8}
              strokeLinecap="round"
            />
          )}
        </>
      );
    },
  };
}

/* ---------- fastener ---------- */

function drawFastener(g: PartGeometry): Drawing {
  const { dia, len } = roundAxis(g);
  const r = dia / 2;
  const ry = r * ELLIPSE_K;
  const headH = Math.max(len * 0.28, r * 0.7);
  const shaftR = r * 0.56;
  const yHead = -len;
  const yShoulder = yHead + headH;
  const tip = len * 0.14;

  return {
    box: { x0: -r, y0: yHead - ry, x1: r, y1: 0 },
    render: (sk) => {
      const ticks: ReactNode[] = [];
      const threadTop = yShoulder + (0 - yShoulder) * 0.22;
      const threadSpan = 0 - tip - threadTop;
      for (let i = 0; i < 4; i++) {
        const y = threadTop + (threadSpan / 4) * (i + 0.5);
        ticks.push(
          <path
            key={`t${i}`}
            d={`M${n(-shaftR)},${n(y - threadSpan * 0.06)} L${n(shaftR)},${n(y + threadSpan * 0.06)}`}
            stroke="currentColor"
            strokeOpacity={MARK}
            strokeWidth={sk.sw * 0.8}
            strokeLinecap="round"
          />,
        );
      }
      // Socket: a hexagon squashed into the head's top ellipse.
      const hex: Pt[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        hex.push([r * 0.5 * Math.cos(a), yHead + r * 0.5 * ELLIPSE_K * Math.sin(a)]);
      }

      return (
        <>
          {/* Shaft with a chamfered tip. */}
          <path
            d={
              `M${n(-shaftR)},${n(yShoulder)} L${n(-shaftR)},${n(-tip)} ` +
              `L${n(-shaftR * 0.45)},0 L${n(shaftR * 0.45)},0 ` +
              `L${n(shaftR)},${n(-tip)} L${n(shaftR)},${n(yShoulder)} Z`
            }
            fill={g.color}
            fillOpacity={FACE_FRONT}
            stroke={g.color}
            strokeOpacity={EDGE}
            strokeWidth={sk.sw}
            strokeLinejoin="round"
          />
          {ticks}
          {/* Head. */}
          <path
            d={
              `M${n(-r)},${n(yHead)} L${n(-r)},${n(yShoulder)} ` +
              `A${n(r)},${n(ry)} 0 0 0 ${n(r)},${n(yShoulder)} ` +
              `L${n(r)},${n(yHead)} ` +
              `A${n(r)},${n(ry)} 0 0 1 ${n(-r)},${n(yHead)} Z`
            }
            fill={g.color}
            fillOpacity={FACE_FRONT}
            stroke={g.color}
            strokeOpacity={EDGE}
            strokeWidth={sk.sw}
          />
          <ellipse
            cx={0}
            cy={n(yHead)}
            rx={n(r)}
            ry={n(ry)}
            fill={g.color}
            fillOpacity={FACE_TOP}
            stroke={g.color}
            strokeOpacity={EDGE}
            strokeWidth={sk.sw}
          />
          <path
            d={poly(hex)}
            fill="currentColor"
            fillOpacity={0.16}
            stroke="currentColor"
            strokeOpacity={MARK}
            strokeWidth={sk.sw * 0.7}
            strokeLinejoin="round"
          />
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

  const skin: Skin = {
    // Strokes are specified in viewBox units, then divided back out of the
    // fit transform so a screw and an enclosure carry the same line weight.
    sw: Math.min(2.6, Math.max(0.9, 120 / size)) / scale,
    fine: size >= 56,
  };

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      width={size}
      height={size}
      role="img"
      aria-label={part.name}
      className={className}
    >
      <g transform={`translate(${n(tx)} ${n(ty)}) scale(${n(scale)})`} aria-hidden="true">
        {drawing.render(skin)}
      </g>
    </svg>
  );
}
