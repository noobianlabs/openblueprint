/**
 * Mech scene — the assembly as three.js objects, with no React attached.
 *
 * Everything that turns a `DesignPackage` into geometry, materials, lights and
 * ground lives here; `MechViewer` owns the interactive shell around it (orbit,
 * picking, HUD, STL buttons) and the offscreen hero renderer reuses the same
 * builders so a project's card cover and its viewer are demonstrably the same
 * model.
 *
 * Layout: every part becomes one primitive body sized from `geometry.ts`, and
 * the assembly tree becomes the layout — a node's children are laid out in a
 * grid centred on it, sitting on its top face, or dropped inside it when the
 * node is big enough to be a container. That is the whole trick: the tree
 * already encodes what mounts to what, so nothing else has to be authored.
 *
 * The model is deliberately approximate. It answers "what goes where, and how
 * big is this thing" — not "will this part fit its footprint to 0.1 mm".
 */

import * as THREE from "three";
import {
  partById,
  type AssemblyNode,
  type DesignPackage,
  type Part,
  type PartCategory,
} from "@/lib/design/schema";
import { geometryFor, type PartGeometry } from "@/lib/design/geometry";
import { cylinderProfile } from "@/lib/design/stl";

/* ---------- Renderer ---------- */

/**
 * The render profile every mech surface shares, so the viewer and the offscreen
 * hero shot agree on exposure and colour.
 *
 * ACES filmic keeps the accent-lit highlights from clipping to flat white the
 * way the old linear output did; the lighting rig below is balanced for it, so
 * the two have to move together.
 */
export function applyRendererProfile(renderer: THREE.WebGLRenderer, pixelRatio?: number): void {
  renderer.setPixelRatio(
    pixelRatio ?? Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio, 2),
  );
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
}

/* ---------- Layout ---------- */

/** Clearance between siblings, mm. */
const SIBLING_GAP = 9;
/** Clearance between separate root assemblies, mm. */
const ROOT_GAP = 28;
/** Nominal wall thickness used to keep a container's contents off its walls. */
const WALL = 3;

interface Measured {
  part: Part;
  geom: PartGeometry;
  children: Measured[];
  /** Children drop inside this body rather than standing on its lid. */
  container: boolean;
  /** Footprint of this node and everything mounted to it. */
  spanW: number;
  spanD: number;
  cols: number;
  cellW: number;
  cellD: number;
}

export interface PlacedPart {
  /** Matches AssemblyTree's row path, so selection maps both ways. */
  path: string;
  part: Part;
  geom: PartGeometry;
  depth: number;
  container: boolean;
  /** Centre of the body's bounding box, mm. */
  x: number;
  y: number;
  z: number;
}

/**
 * A box body counts as a container when it is an enclosure, or simply tall
 * enough that dropping things inside reads better than stacking them on top.
 * A 16 mm-tall bracket fails that test, which is right — parts sit *on* a
 * bracket.
 */
function isContainer(part: Part, geom: PartGeometry): boolean {
  return geom.shape === "box" && (part.category === "enclosure" || geom.h >= 25);
}

function measure(node: AssemblyNode, pkg: DesignPackage): Measured | null {
  const part = partById(pkg, node.part);
  if (!part) return null;

  const geom = geometryFor(part);
  const children = (node.children ?? [])
    .map((child) => measure(child, pkg))
    .filter((child): child is Measured => child !== null);

  let cols = 0;
  let cellW = 0;
  let cellD = 0;
  let gridW = 0;
  let gridD = 0;

  if (children.length > 0) {
    cols = Math.ceil(Math.sqrt(children.length));
    const rows = Math.ceil(children.length / cols);
    cellW = Math.max(...children.map((c) => c.spanW)) + SIBLING_GAP;
    cellD = Math.max(...children.map((c) => c.spanD)) + SIBLING_GAP;
    gridW = cols * cellW;
    gridD = rows * cellD;
  }

  return {
    part,
    geom,
    children,
    container: isContainer(part, geom),
    /* A container swallows its children, so it spans only its own shell. An
       open mount carries them on its face, where they may overhang. */
    spanW: isContainer(part, geom) ? geom.w : Math.max(geom.w, gridW),
    spanD: isContainer(part, geom) ? geom.d : Math.max(geom.d, gridD),
    cols,
    cellW,
    cellD,
  };
}

function place(
  node: Measured,
  cx: number,
  cz: number,
  baseY: number,
  depth: number,
  parentPath: string,
  index: number,
  out: PlacedPart[],
): void {
  const path = `${parentPath}/${node.part.id}#${index}`;
  out.push({
    path,
    part: node.part,
    geom: node.geom,
    depth,
    container: node.container,
    x: cx,
    y: baseY + node.geom.h / 2,
    z: cz,
  });

  if (node.children.length === 0) return;

  // Inside a container children rest on the floor; otherwise on the lid.
  const childBase = node.container
    ? baseY + Math.min(3, Math.max(1, node.geom.h * 0.08))
    : baseY + node.geom.h;

  const rows = Math.ceil(node.children.length / node.cols);

  /* The grid is sized to the widest child, so it can easily out-span the parent
     it belongs to — that is what made the rest pose read as already exploded,
     with boards floating outside their own housing. Squeeze the pitch until the
     span of child *centres* fits the parent's footprint (its interior, for a
     container). Bodies may still overhang a little, which reads as a snug fit;
     what matters is that children stay visually held by their parent. */
  const fitW = node.container ? node.geom.w - WALL * 2 : node.geom.w;
  const fitD = node.container ? node.geom.d - WALL * 2 : node.geom.d;
  const cellW = node.cols > 1 ? Math.min(node.cellW, Math.max(fitW, 1) / (node.cols - 1)) : 0;
  const cellD = rows > 1 ? Math.min(node.cellD, Math.max(fitD, 1) / (rows - 1)) : 0;

  const startX = cx - ((node.cols - 1) * cellW) / 2;
  const startZ = cz - ((rows - 1) * cellD) / 2;

  node.children.forEach((child, i) => {
    /* A child wider than the box it nominally lives in cannot be inside it —
       a 110 mm solar panel does not fit a 95 mm housing. Sit it on the lid
       instead of letting it spear the walls. */
    const oversized = node.container && (child.spanW > fitW || child.spanD > fitD);

    place(
      child,
      startX + (i % node.cols) * cellW,
      startZ + Math.floor(i / node.cols) * cellD,
      oversized ? baseY + node.geom.h : childBase,
      depth + 1,
      path,
      i,
      out,
    );
  });
}

/** Flatten the assembly tree into placed bodies, roots standing on y = 0. */
export function layoutAssembly(pkg: DesignPackage): PlacedPart[] {
  const roots = pkg.assembly
    .map((node) => measure(node, pkg))
    .filter((node): node is Measured => node !== null);
  if (roots.length === 0) return [];

  const cols = Math.ceil(Math.sqrt(roots.length));
  const rows = Math.ceil(roots.length / cols);
  const cellW = Math.max(...roots.map((r) => r.spanW)) + ROOT_GAP;
  const cellD = Math.max(...roots.map((r) => r.spanD)) + ROOT_GAP;
  const startX = -((cols - 1) * cellW) / 2;
  const startZ = -((rows - 1) * cellD) / 2;

  const out: PlacedPart[] = [];
  roots.forEach((root, i) => {
    place(
      root,
      startX + (i % cols) * cellW,
      startZ + Math.floor(i / cols) * cellD,
      0,
      0,
      "",
      i,
      out,
    );
  });
  return out;
}

/* ---------- Bodies ---------- */

/** Deterministic 0–1 from a part id, for per-part material variation. */
export function grain(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (Math.abs(h) % 100) / 100;
}

/** Largest edge break, mm. Real parts are chamfered; renders that aren't look CG. */
const CHAMFER_MAX = 1.2;

/**
 * A box with its twelve edges broken — six inset faces, twelve chamfer strips
 * and eight corner triangles, 44 triangles in all.
 *
 * This is the single change that does the most for the render: a sharp box has
 * exactly one shade per face, so it reads as a debug primitive. A chamfer gives
 * every silhouette edge a thin band at a different angle to the key light, and
 * that highlight is what the eye reads as "machined".
 *
 * The bounding box is still exactly w × h × d — the faces stay on the original
 * planes and only the edges are cut back — so `layoutAssembly`'s containment
 * maths is untouched.
 */
function chamferedBox(w: number, h: number, d: number): THREE.BufferGeometry {
  const half = [w / 2, h / 2, d / 2];
  const t = Math.min(CHAMFER_MAX, half[0] * 0.28, half[1] * 0.28, half[2] * 0.28);
  if (t <= 0.01) return new THREE.BoxGeometry(w, h, d);

  const positions: number[] = [];
  const normals: number[] = [];

  /** Emit one triangle, winding it to face `n` so the caller cannot get it wrong. */
  const tri = (a: number[], b: number[], c: number[], n: number[]) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    const facing = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2];
    const ordered = facing < 0 ? [a, c, b] : [a, b, c];
    for (const p of ordered) {
      positions.push(p[0], p[1], p[2]);
      normals.push(n[0], n[1], n[2]);
    }
  };
  /** Corners given in cyclic order around the quad. */
  const quad = (a: number[], b: number[], c: number[], e: number[], n: number[]) => {
    tri(a, b, c, n);
    tri(a, c, e, n);
  };
  const point = (i: number, vi: number, j: number, vj: number, k: number, vk: number) => {
    const p = [0, 0, 0];
    p[i] = vi;
    p[j] = vj;
    p[k] = vk;
    return p;
  };
  const unit = (v: number[]) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };

  // Six faces, each inset by the chamfer on all four sides.
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    const k = (i + 2) % 3;
    for (const s of [1, -1]) {
      const n = [0, 0, 0];
      n[i] = s;
      const fi = s * half[i];
      const ej = half[j] - t;
      const ek = half[k] - t;
      quad(
        point(i, fi, j, ej, k, ek),
        point(i, fi, j, -ej, k, ek),
        point(i, fi, j, -ej, k, -ek),
        point(i, fi, j, ej, k, -ek),
        n,
      );
    }
  }

  // Twelve edge strips, each bridging two inset face borders.
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      const k = 3 - i - j;
      for (const si of [1, -1]) {
        for (const sj of [1, -1]) {
          const n = [0, 0, 0];
          n[i] = si;
          n[j] = sj;
          const ek = half[k] - t;
          quad(
            point(i, si * half[i], j, sj * (half[j] - t), k, ek),
            point(i, si * half[i], j, sj * (half[j] - t), k, -ek),
            point(i, si * (half[i] - t), j, sj * half[j], k, -ek),
            point(i, si * (half[i] - t), j, sj * half[j], k, ek),
            unit(n),
          );
        }
      }
    }
  }

  // Eight corner triangles closing the shell.
  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      for (const sz of [1, -1]) {
        tri(
          [sx * half[0], sy * (half[1] - t), sz * (half[2] - t)],
          [sx * (half[0] - t), sy * half[1], sz * (half[2] - t)],
          [sx * (half[0] - t), sy * (half[1] - t), sz * half[2]],
          unit([sx, sy, sz]),
        );
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return geo;
}

/**
 * Bodies for one part, primitive for primitive with `stl.ts` — same shapes at
 * the same sizes, so the download is the thing on screen.
 *
 * The one deviation is cosmetic: view bodies carry a chamfer of at most
 * CHAMFER_MAX (1.2 mm) that the STL's sharp primitives do not, and the fastener
 * head is drawn hex where the export writes it round. Bounding boxes match
 * exactly either way.
 */
function bodiesFor(geom: PartGeometry): THREE.BufferGeometry[] {
  switch (geom.shape) {
    case "cylinder": {
      const { radius, length, axis } = cylinderProfile(geom);
      const body = new THREE.CylinderGeometry(radius, radius, length, 48);
      // stl.ts tips local Y onto world Z with the same quarter turn about X.
      if (axis === "z") body.rotateX(Math.PI / 2);
      return [body];
    }

    case "dome": {
      const radius = geom.w / 2;
      const flangeH = Math.max(0.8, geom.h * 0.2);
      const domeH = Math.max(0.1, geom.h - flangeH);
      const flange = new THREE.CylinderGeometry(radius * 1.1, radius * 1.1, flangeH, 40);
      flange.translate(0, -geom.h / 2 + flangeH / 2, 0);
      const dome = new THREE.SphereGeometry(radius, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2);
      dome.scale(1, domeH / radius, 1);
      dome.translate(0, -geom.h / 2 + flangeH, 0);
      return [flange, dome];
    }

    case "fastener": {
      const headH = geom.h * 0.22;
      const shaftH = geom.h - headH;
      const shaft = new THREE.CylinderGeometry(geom.w * 0.24, geom.w * 0.24, shaftH, 24);
      shaft.translate(0, -geom.h / 2 + shaftH / 2, 0);
      // Six radial segments is a hex head — the cheapest way to make a screw
      // read as a screw rather than a peg.
      const head = new THREE.CylinderGeometry(geom.w / 2, geom.w / 2, headH, 6);
      head.translate(0, geom.h / 2 - headH / 2, 0);
      return [shaft, head];
    }

    default:
      return [chamferedBox(geom.w, geom.h, geom.d)];
  }
}

/* ---------- Materials ---------- */

/**
 * Base finish per category. A steel screw, an FDM bracket and a glossy display
 * lens reflect nothing alike, and giving every body the same roughness was the
 * main reason the old scene read as one plastic blob.
 */
/** Shell alpha at rest, and when the shell itself is the selected part. */
const SHELL_OPACITY = 0.17;
const SHELL_OPACITY_SELECTED = 0.4;

const FINISH: Record<PartCategory, { metalness: number; roughness: number }> = {
  mcu: { metalness: 0.18, roughness: 0.54 },
  sensor: { metalness: 0.18, roughness: 0.52 },
  actuator: { metalness: 0.7, roughness: 0.34 },
  power: { metalness: 0.42, roughness: 0.44 },
  comms: { metalness: 0.2, roughness: 0.5 },
  display: { metalness: 0.1, roughness: 0.2 },
  module: { metalness: 0.24, roughness: 0.48 },
  enclosure: { metalness: 0.04, roughness: 0.28 },
  print3d: { metalness: 0.02, roughness: 0.78 },
  misc: { metalness: 0.82, roughness: 0.3 },
};

/**
 * A view-angle rim, added as a second skin over transparent shells.
 *
 * Thin transparent walls have almost no shading cue of their own, so an
 * enclosure rendered as flat 25% alpha looks like a selection box rather than a
 * housing. Brightening it where the surface turns away from the eye — the
 * Fresnel term real glass has — puts an edge back on the silhouette for the
 * cost of one extra draw. Deliberately un-tone-mapped: it is a thin additive
 * pass, so it is tuned low rather than routed through ACES.
 */
function rimMaterial(color: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uPower: { value: 2.4 },
      uIntensity: { value: 0.5 },
    },
    vertexShader: `
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uPower;
      uniform float uIntensity;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        float f = 1.0 - abs(dot(normalize(vNormalView), normalize(vViewDir)));
        f = pow(clamp(f, 0.0, 1.0), uPower) * uIntensity;
        gl_FragColor = vec4(uColor * f, f);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}

/* ---------- Assembly ---------- */

/** One placed part's objects, so callers never dig into `children[0]`. */
export interface PartNode {
  placed: PlacedPart;
  /** Positioned at the part's centre; explode offsets move this. */
  group: THREE.Group;
  /** The body material, shared by every body of the part. */
  material: THREE.MeshStandardMaterial;
  /** Enclosures and containers are drawn as shells you can see through. */
  shell: boolean;
}

export interface Assembly {
  /** Sits at the origin, so a node's local position is also its world one. */
  group: THREE.Group;
  /** Path → the part's group, for selection, explode and camera focus. */
  meshesByPath: Map<string, THREE.Group>;
  nodes: Map<string, PartNode>;
  /** Only part bodies — never ground or shadow helpers. */
  pickables: THREE.Mesh[];
  bounds: THREE.Box3;
  centroid: THREE.Vector3;
  size: THREE.Vector3;
  /** Largest bounding-box edge, floored at 10 mm. Drives camera and lights. */
  span: number;
  radius: number;
  /** Highlight one part, or clear with null. */
  setSelected(path: string | null): void;
  dispose(): void;
}

/**
 * Build the whole assembly as one group at the origin.
 *
 * `layout` defaults to the package's own layout; pass one in only to render a
 * layout you have already computed.
 */
export function buildAssemblyGroup(
  pkg: DesignPackage,
  layout: PlacedPart[] = layoutAssembly(pkg),
): Assembly {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const meshesByPath = new Map<string, THREE.Group>();
  const nodes = new Map<string, PartNode>();
  const pickables: THREE.Mesh[] = [];
  const bounds = new THREE.Box3();

  for (const item of layout) {
    const partGroup = new THREE.Group();
    partGroup.position.set(item.x, item.y, item.z);

    const shell = item.container || item.part.category === "enclosure";
    const color = new THREE.Color(item.geom.color);
    const finish = FINISH[item.part.category] ?? FINISH.misc;
    // ±0.09 of roughness keyed to the part id, so two boards of the same
    // category catch the key light slightly differently instead of reading as
    // one extruded mass.
    const roughness = THREE.MathUtils.clamp(
      finish.roughness + (grain(item.part.id) - 0.5) * 0.18,
      0.06,
      0.95,
    );

    const material = shell
      ? new THREE.MeshPhysicalMaterial({
          color,
          roughness: 0.14,
          metalness: 0,
          transparent: true,
          opacity: SHELL_OPACITY,
          depthWrite: false,
          side: THREE.DoubleSide,
          // Clearcoat rather than transmission: transmission needs its own
          // render target and an environment to refract, and with a transparent
          // canvas and no envmap it renders as a black pane.
          clearcoat: 1,
          clearcoatRoughness: 0.08,
          ior: 1.45,
        })
      : new THREE.MeshStandardMaterial({
          color,
          roughness,
          metalness: finish.metalness,
          side: THREE.FrontSide,
        });
    materials.push(material);

    for (const body of bodiesFor(item.geom)) {
      geometries.push(body);
      const mesh = new THREE.Mesh(body, material);
      mesh.userData.path = item.path;
      mesh.userData.container = shell;
      partGroup.add(mesh);
      pickables.push(mesh);

      if (shell) {
        const rim = rimMaterial(color);
        materials.push(rim);
        const rimMesh = new THREE.Mesh(body, rim);
        // Never picked and never exported — it is a lighting cue on the shell
        // that already exists, so it carries no path.
        rimMesh.renderOrder = 2;
        partGroup.add(rimMesh);
      }
    }

    // A pin header makes a bare board read as a board.
    if (item.geom.headerPins > 0) {
      const header = chamferedBox(
        2.4,
        2.2,
        Math.min(item.geom.d * 0.8, item.geom.headerPins * 2.54),
      );
      geometries.push(header);
      const headerMat = new THREE.MeshStandardMaterial({
        color: 0x14161a,
        roughness: 0.72,
        metalness: 0.3,
      });
      materials.push(headerMat);
      const strip = new THREE.Mesh(header, headerMat);
      strip.position.set(item.geom.w / 2 - 1.6, item.geom.h / 2 + 1.1, 0);
      partGroup.add(strip);
    }

    group.add(partGroup);
    meshesByPath.set(item.path, partGroup);
    nodes.set(item.path, { placed: item, group: partGroup, material, shell });
    bounds.expandByPoint(
      new THREE.Vector3(
        item.x - item.geom.w / 2,
        item.y - item.geom.h / 2,
        item.z - item.geom.d / 2,
      ),
    );
    bounds.expandByPoint(
      new THREE.Vector3(
        item.x + item.geom.w / 2,
        item.y + item.geom.h / 2,
        item.z + item.geom.d / 2,
      ),
    );
  }

  const centroid = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());

  return {
    group,
    meshesByPath,
    nodes,
    pickables,
    bounds,
    centroid,
    size,
    span: Math.max(size.x, size.y, size.z, 10),
    radius: size.length() / 2,
    setSelected(path) {
      for (const node of nodes.values()) {
        const active = node.placed.path === path;
        node.material.emissive.setHex(active ? 0x3ddbb4 : 0x000000);
        node.material.emissiveIntensity = active ? 0.55 : 0;
        if (node.shell) {
          node.material.opacity = active ? SHELL_OPACITY_SELECTED : SHELL_OPACITY;
        }
      }
    },
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      group.clear();
    },
  };
}

/* ---------- Lighting ---------- */

/**
 * A three-point rig scaled to the assembly, so framing is size-independent.
 *
 * Warm key high on the right, cool fill low on the left to keep the shadow side
 * from going dead, and an accent rim from behind to cut the silhouette off the
 * background. Intensities are set for the ACES curve in `applyRendererProfile`
 * and will look blown out without it.
 */
export function buildLighting(span: number): THREE.Group {
  const group = new THREE.Group();

  // Sky/ground bounce — the base ambient that keeps undersides readable.
  group.add(new THREE.HemisphereLight(0xbfe4ff, 0x14181c, 1.0));
  group.add(new THREE.AmbientLight(0xdce8f5, 0.26));

  const key = new THREE.DirectionalLight(0xfff4e8, 3.2);
  key.position.set(span * 0.8, span * 1.4, span * 0.9);
  group.add(key);

  const fill = new THREE.DirectionalLight(0x9dc6ff, 1.05);
  fill.position.set(-span * 0.9, span * 0.35, span * 1.1);
  group.add(fill);

  const rim = new THREE.DirectionalLight(0x3ddbb4, 1.7);
  rim.position.set(-span * 0.8, span * 0.6, -span);
  group.add(rim);

  return group;
}

/* ---------- Ground ---------- */

export interface Ground {
  group: THREE.Group;
  dispose(): void;
}

/** Round a pitch to 1, 2 or 5 × a power of ten, so the grid reads in whole mm. */
function nicePitch(value: number): number {
  const decade = Math.pow(10, Math.floor(Math.log10(Math.max(value, 0.001))));
  const n = value / decade;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * decade;
}

const GRID_CELLS = 48;
const GRID_TEXTURE_PX = 1024;
const SHADOW_TEXTURE_PX = 256;

/**
 * The grid, baked once with its own distance fade.
 *
 * A `GridHelper` draws every line at full strength all the way to its edge,
 * which is what made the old floor read as a debug plane: the horizon was a
 * hard square that told you exactly how big the fake world was. Painting the
 * grid into one texture lets a radial alpha ramp dissolve it into the page
 * background instead, so the ground recedes.
 */
function gridTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = GRID_TEXTURE_PX;
  canvas.height = GRID_TEXTURE_PX;
  const ctx = canvas.getContext("2d")!;
  const step = GRID_TEXTURE_PX / GRID_CELLS;
  const mid = GRID_TEXTURE_PX / 2;

  ctx.clearRect(0, 0, GRID_TEXTURE_PX, GRID_TEXTURE_PX);
  for (let i = 0; i <= GRID_CELLS; i++) {
    const p = Math.round(i * step) + 0.5;
    const major = i % 8 === 0;
    ctx.strokeStyle = major ? "#59626e" : "#3a4048";
    ctx.lineWidth = major ? 1.6 : 1;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, GRID_TEXTURE_PX);
    ctx.moveTo(0, p);
    ctx.lineTo(GRID_TEXTURE_PX, p);
    ctx.stroke();
  }

  // The two axes through the origin, in the accent, so the model has a datum.
  ctx.strokeStyle = "#3ddbb4";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(mid, 0);
  ctx.lineTo(mid, GRID_TEXTURE_PX);
  ctx.moveTo(0, mid);
  ctx.lineTo(GRID_TEXTURE_PX, mid);
  ctx.stroke();

  // Dissolve outward, so the grid has no edge to give itself away.
  const fade = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(0.42, "rgba(0,0,0,0.82)");
  fade.addColorStop(0.72, "rgba(0,0,0,0.3)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, GRID_TEXTURE_PX, GRID_TEXTURE_PX);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** A soft elliptical blob — the assembly's weight on the floor. */
function shadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = SHADOW_TEXTURE_PX;
  canvas.height = SHADOW_TEXTURE_PX;
  const ctx = canvas.getContext("2d")!;
  const mid = SHADOW_TEXTURE_PX / 2;

  const blob = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
  blob.addColorStop(0, "rgba(0,0,0,0.62)");
  blob.addColorStop(0.34, "rgba(0,0,0,0.44)");
  blob.addColorStop(0.68, "rgba(0,0,0,0.14)");
  blob.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = blob;
  ctx.fillRect(0, 0, SHADOW_TEXTURE_PX, SHADOW_TEXTURE_PX);

  return new THREE.CanvasTexture(canvas);
}

/**
 * The ground the assembly stands on: a grid that fades with distance, and a
 * contact shadow under the footprint.
 *
 * The shadow is a painted blob rather than a shadow map. There is no solid
 * receiver here — the floor is a transparent plane over the page background —
 * so a real shadow map would have nothing to land on, and this costs one quad.
 */
export function buildGround(centroid: THREE.Vector3, size: THREE.Vector3, span: number): Ground {
  const group = new THREE.Group();
  const textures: THREE.Texture[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const pitch = nicePitch((span * 5) / GRID_CELLS);
  const extent = pitch * GRID_CELLS;

  const gridMap = gridTexture();
  textures.push(gridMap);
  const gridGeo = new THREE.PlaneGeometry(extent, extent);
  gridGeo.rotateX(-Math.PI / 2);
  geometries.push(gridGeo);
  const gridMat = new THREE.MeshBasicMaterial({
    map: gridMap,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    toneMapped: false,
  });
  materials.push(gridMat);
  const grid = new THREE.Mesh(gridGeo, gridMat);
  grid.position.set(centroid.x, -0.08, centroid.z);
  grid.renderOrder = -3;
  group.add(grid);

  const shadowMap = shadowTexture();
  textures.push(shadowMap);
  // Wider than the footprint: a contact shadow spreads, and a blob cropped to
  // the silhouette reads as a decal.
  const shadowW = size.x * 1.75 + span * 0.2;
  const shadowD = size.z * 1.75 + span * 0.2;
  const shadowGeo = new THREE.PlaneGeometry(shadowW, shadowD);
  shadowGeo.rotateX(-Math.PI / 2);
  geometries.push(shadowGeo);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowMap,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  materials.push(shadowMat);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.position.set(centroid.x, -0.04, centroid.z);
  shadow.renderOrder = -2;
  group.add(shadow);

  return {
    group,
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
      group.clear();
    },
  };
}
