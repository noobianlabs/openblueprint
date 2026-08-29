/**
 * STL export for the schematic assembly.
 *
 * The Mech viewer draws every part as one of six primitives; this module
 * triangulates those same primitives so a downloaded mesh matches what the
 * viewer shows. Output is binary STL — 84 bytes of preamble plus 50 per facet —
 * written little-endian, which is what every slicer and mesh viewer expects.
 *
 * The result is a massing model. Dimensions come from `geometry.ts`, which is
 * deliberately approximate, so this file is good for checking that a design
 * fits on a bench or in a bag, not for machining.
 *
 * Deliberately free of three.js: the Mech tab loads the viewer lazily, and
 * keeping the exporter framework-free keeps it out of that chunk.
 */

import type { PartGeometry } from "./geometry";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** One primitive body placed in assembly space, in mm. */
export interface StlSolid {
  geom: PartGeometry;
  /** World centre of the body's bounding box. */
  position: Vec3;
}

/** Which world axis a cylindrical body runs along. */
export type SolidAxis = "y" | "z";

/** Segment counts — enough to read as round, few enough to keep files small. */
const RADIAL_SEGMENTS = 24;
const DOME_RINGS = 6;

/**
 * A cylinder's axis has to be inferred, because `geometry.ts` reports a
 * bounding box rather than a profile. Two near-equal edges name the circular
 * cross-section, and the odd edge out is the length: an 18650 cell reads
 * 18 × 18 × 65, so it lies along Z, while a knob reads 20 × 14 × 20 and stands
 * up along Y.
 */
export function cylinderProfile(g: PartGeometry): {
  radius: number;
  length: number;
  axis: SolidAxis;
} {
  const span = Math.max(g.w, g.h, g.d) || 1;
  if (Math.abs(g.w - g.d) / span < 0.25) {
    return { radius: (g.w + g.d) / 4, length: g.h, axis: "y" };
  }
  if (Math.abs(g.w - g.h) / span < 0.35) {
    return { radius: (g.w + g.h) / 4, length: g.d, axis: "z" };
  }
  return { radius: (g.w + g.d) / 4, length: g.h, axis: "y" };
}

/* ---------- Triangle emission ---------- */

/**
 * Receives one triangle in the local frame of the body being built. Winding is
 * counter-clockwise seen from outside, which is what fixes the facet normal.
 */
type Emit = (
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
) => void;

/**
 * Emitter that translates a body to `origin`, optionally tipping its local Y
 * axis onto world Z first. The tip is a +90° rotation about X — a rotation, not
 * a mirror, so winding (and therefore every normal) survives it.
 */
function emitterFor(out: number[], origin: Vec3, axis: SolidAxis): Emit {
  const map =
    axis === "z"
      ? (x: number, y: number, z: number) => {
          out.push(origin.x + x, origin.y - z, origin.z + y);
        }
      : (x: number, y: number, z: number) => {
          out.push(origin.x + x, origin.y + y, origin.z + z);
        };

  return (ax, ay, az, bx, by, bz, cx, cy, cz) => {
    map(ax, ay, az);
    map(bx, by, bz);
    map(cx, cy, cz);
  };
}

/** Two triangles for a planar quad, given in outward-facing order. */
function quad(
  emit: Emit,
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
  d: readonly [number, number, number],
): void {
  emit(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  emit(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]);
}

/** Axis-aligned box centred on the local origin — 12 facets. */
function emitBox(emit: Emit, w: number, h: number, d: number, cy = 0): void {
  const x = w / 2;
  const y = h / 2;
  const z = d / 2;
  const p = (sx: number, sy: number, sz: number) =>
    [sx * x, cy + sy * y, sz * z] as const;

  quad(emit, p(1, -1, 1), p(1, -1, -1), p(1, 1, -1), p(1, 1, 1)); // +X
  quad(emit, p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1)); // -X
  quad(emit, p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1), p(-1, 1, -1)); // +Y
  quad(emit, p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1)); // -Y
  quad(emit, p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1)); // +Z
  quad(emit, p(1, -1, -1), p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1)); // -Z
}

/** Closed cylinder about the local Y axis, centred at `cy`. */
function emitCylinder(emit: Emit, radius: number, length: number, cy = 0): void {
  const top = cy + length / 2;
  const bottom = cy - length / 2;

  for (let i = 0; i < RADIAL_SEGMENTS; i++) {
    const t0 = (i / RADIAL_SEGMENTS) * Math.PI * 2;
    const t1 = ((i + 1) / RADIAL_SEGMENTS) * Math.PI * 2;
    const x0 = Math.cos(t0) * radius;
    const z0 = Math.sin(t0) * radius;
    const x1 = Math.cos(t1) * radius;
    const z1 = Math.sin(t1) * radius;

    quad(emit, [x0, bottom, z0], [x0, top, z0], [x1, top, z1], [x1, bottom, z1]);
    emit(0, top, 0, x1, top, z1, x0, top, z0);
    emit(0, bottom, 0, x0, bottom, z0, x1, bottom, z1);
  }
}

/**
 * Hemisphere capped with a flat disc, so the body is closed from every angle.
 * `height` may be shorter than `radius` — LEDs are squat — so the dome is an
 * ellipsoid rather than a true half-sphere.
 */
function emitDome(emit: Emit, radius: number, height: number, base: number): void {
  const point = (ring: number, seg: number): readonly [number, number, number] => {
    const phi = (ring / DOME_RINGS) * (Math.PI / 2);
    const theta = (seg / RADIAL_SEGMENTS) * Math.PI * 2;
    const r = Math.sin(phi) * radius;
    return [
      Math.cos(theta) * r,
      base + Math.cos(phi) * height,
      Math.sin(theta) * r,
    ];
  };

  for (let ring = 0; ring < DOME_RINGS; ring++) {
    for (let seg = 0; seg < RADIAL_SEGMENTS; seg++) {
      const upperA = point(ring, seg);
      const upperB = point(ring, seg + 1);
      const lowerA = point(ring + 1, seg);
      const lowerB = point(ring + 1, seg + 1);

      if (ring === 0) {
        // The top ring collapses to the pole; a quad there would be half degenerate.
        emit(...upperA, ...lowerB, ...lowerA);
      } else {
        quad(emit, upperA, upperB, lowerB, lowerA);
      }
    }
  }

  // Flat underside, wound to face -Y.
  for (let seg = 0; seg < RADIAL_SEGMENTS; seg++) {
    const a = point(DOME_RINGS, seg);
    const b = point(DOME_RINGS, seg + 1);
    emit(0, base, 0, a[0], base, a[2], b[0], base, b[2]);
  }
}

/**
 * Triangulate one placed part. Bodies that are physically two pieces — a screw,
 * a domed LED — are emitted as two closed solids rather than a boolean union;
 * overlapping closed shells are well-formed STL and every slicer handles them.
 */
function emitSolid(out: number[], solid: StlSolid): void {
  const { geom, position } = solid;
  const upright = emitterFor(out, position, "y");

  switch (geom.shape) {
    case "cylinder": {
      const { radius, length, axis } = cylinderProfile(geom);
      emitCylinder(emitterFor(out, position, axis), radius, length);
      break;
    }

    case "dome": {
      const radius = geom.w / 2;
      const flange = Math.max(0.8, geom.h * 0.2);
      // The rim is stepped out slightly — an LED's collar is wider than its
      // lens, and it keeps the two shells from sharing a coincident disc.
      emitCylinder(upright, radius * 1.1, flange, -geom.h / 2 + flange / 2);
      emitDome(upright, radius, Math.max(0.1, geom.h - flange), -geom.h / 2 + flange);
      break;
    }

    case "fastener": {
      const head = geom.h * 0.22;
      const shaft = geom.h - head;
      emitCylinder(upright, geom.w * 0.24, shaft, -geom.h / 2 + shaft / 2);
      emitCylinder(upright, geom.w / 2, head, geom.h / 2 - head / 2);
      break;
    }

    default:
      emitBox(upright, geom.w, geom.h, geom.d);
      break;
  }
}

/* ---------- Encoding ---------- */

/**
 * Binary STL for a set of placed bodies.
 *
 * The viewer works Y-up; STL is conventionally Z-up for printing, so vertices
 * are rotated a quarter turn about X on the way out. Coordinates are in mm.
 */
export function toStl(parts: StlSolid[], name: string): Blob {
  const verts: number[] = [];
  for (const solid of parts) emitSolid(verts, solid);

  const triangles = verts.length / 9;
  const buffer = new ArrayBuffer(84 + triangles * 50);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // 80-byte header. Never starts with "solid" — parsers sniff that prefix to
  // decide a file is ASCII.
  const header = `OpenBlueprint ${name} (schematic massing model, mm)`;
  for (let i = 0; i < Math.min(header.length, 79); i++) {
    bytes[i] = header.charCodeAt(i) & 0x7f;
  }
  view.setUint32(80, triangles, true);

  for (let t = 0; t < triangles; t++) {
    const v = t * 9;
    // Y-up to Z-up: (x, y, z) -> (x, -z, y).
    const ax = verts[v];
    const ay = -verts[v + 2];
    const az = verts[v + 1];
    const bx = verts[v + 3];
    const by = -verts[v + 5];
    const bz = verts[v + 4];
    const cx = verts[v + 6];
    const cy = -verts[v + 8];
    const cz = verts[v + 7];

    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const wx = cx - ax;
    const wy = cy - ay;
    const wz = cz - az;
    let nx = uy * wz - uz * wy;
    let ny = uz * wx - ux * wz;
    let nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 0) {
      nx /= len;
      ny /= len;
      nz /= len;
    }

    const at = 84 + t * 50;
    view.setFloat32(at, nx, true);
    view.setFloat32(at + 4, ny, true);
    view.setFloat32(at + 8, nz, true);
    const coords = [ax, ay, az, bx, by, bz, cx, cy, cz];
    for (let i = 0; i < 9; i++) view.setFloat32(at + 12 + i * 4, coords[i], true);
    view.setUint16(at + 48, 0, true);
  }

  return new Blob([buffer], { type: "model/stl" });
}

/** Filesystem-safe stem for a downloaded mesh. */
export function stlFilename(name: string, suffix: string): string {
  const stem =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "assembly";
  return `${stem}-${suffix}.stl`;
}
