"use client";

/**
 * Hero shot — a project's product photo, rendered from its own massing model.
 *
 * The closed product photographs its designs with an image model. We render
 * ours: the same `scene.ts` builders the MECH viewer uses are pointed at a
 * fixed three-quarter camera, rendered once offscreen, and turned into a PNG.
 * The picture is therefore *derived from the design*, never fetched, and it
 * moves when the design does — no key, no network, nothing to go stale.
 *
 * Two things dominate the design of this file:
 *
 * 1. **WebGL contexts are a hard budget.** Browsers keep only ~8–16 live, and
 *    the landing page mounts one cover per seed. So there is exactly ONE
 *    module-level renderer, shared by every instance, fed by a queue that
 *    services one job at a time and yields a frame between jobs so the page
 *    stays interactive. Never a renderer per component.
 * 2. **three.js must not reach the landing route's eager bundle.** three and
 *    `scene.ts` are pulled in by a dynamic `import()` inside the render path,
 *    so this module itself is a few hundred bytes of client JS and the heavy
 *    graph stays an async chunk shared with the MECH viewer.
 *
 * Everything degrades to the glyph-on-gradient cover: that is what the server
 * renders, what a browser without WebGL keeps, and what a failed render falls
 * back to. The container is a fixed height in every case, so the shot swaps in
 * without moving the page.
 */

import { useEffect, useState } from "react";
import type * as ThreeNS from "three";
import type { DesignPackage, ProjectCover, ProjectRecord } from "@/lib/design/schema";

type Three = typeof ThreeNS;
type SceneModule = typeof import("@/components/tabs/mech/scene");

export type HeroShotVariant = "hero" | "card";

/* ---------- Framing ---------- */

interface ShotSpec {
  /** Drawing-buffer size, mm-independent. 2× the display box, ≤ 1024 long edge. */
  width: number;
  height: number;
  /** Fraction of the frame the assembly's bounding box is fitted into. */
  fill: number;
}

/**
 * Both variants share one camera angle so a card and its hero read as the same
 * photograph at two sizes. The angle is a touch higher and a touch narrower
 * than the MECH viewer's default: a long lens flattens the perspective the way
 * a product shot does, and looking slightly down shows the top faces that carry
 * the silkscreen and the bevels.
 */
const THETA = 0.82;
const PHI = 0.92;
const FOV = 30;

const SPECS: Record<HeroShotVariant, ShotSpec> = {
  // Hero panel is h-64 (256px) and half of a max-w-5xl grid (~480px).
  hero: { width: 960, height: 512, fill: 0.8 },
  // Card cover is h-36 (144px) in a four-up grid (~260px).
  card: { width: 520, height: 288, fill: 0.86 },
};

/* ---------- Module-level renderer, cache and queue ---------- */

/** Rendered PNGs, keyed by slug + variant + a hash of the BOM. */
const shots = new Map<string, string>();
/** Keys whose render threw; never retried, so a bad design cannot spin. */
const failedKeys = new Set<string>();
/** Keys currently queued or rendering, so four mounts of one card share a job. */
const pending = new Map<string, Promise<string>>();
/** Data URLs are large; hold enough for a full landing page and its hero. */
const CACHE_LIMIT = 24;

interface Job {
  key: string;
  pkg: DesignPackage;
  spec: ShotSpec;
  resolve: (url: string) => void;
  reject: (error: unknown) => void;
}

const queue: Job[] = [];
let pumping = false;

let modulesPromise: Promise<[Three, SceneModule]> | null = null;
let renderer: ThreeNS.WebGLRenderer | null = null;
let contextLosses = 0;
/** Set once WebGL is known to be unavailable, so no job tries again. */
let webglBroken = false;

function loadModules(): Promise<[Three, SceneModule]> {
  modulesPromise ??= Promise.all([
    import("three"),
    import("@/components/tabs/mech/scene"),
  ]);
  return modulesPromise;
}

/**
 * The one renderer. It is created on the first job and then kept alive for the
 * lifetime of the page: creating and destroying a context per snapshot leaks
 * contexts just as surely as holding one per component does.
 */
function sharedRenderer(three: Three, scene: SceneModule): ThreeNS.WebGLRenderer {
  if (webglBroken) throw new Error("WebGL is unavailable");
  if (renderer) return renderer;

  // `preserveDrawingBuffer` so `toDataURL` still sees the frame we just drew;
  // without it the buffer is allowed to be cleared the moment render returns.
  const created = new three.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  // We size the drawing buffer ourselves at 2× the display box, so the device
  // ratio must stay at 1 or the shot renders at 4×.
  scene.applyRendererProfile(created, 1);

  created.domElement.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    renderer = null;
    contextLosses += 1;
    // One loss is bad luck and worth a fresh context; two is a pattern, and
    // rebuilding forever would be worse than the glyph fallback.
    if (contextLosses > 1) webglBroken = true;
  });

  renderer = created;
  return created;
}

/** Yield a frame so eight covers do not lock the main thread in one go. */
function yieldFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

function remember(key: string, url: string): void {
  shots.set(key, url);
  while (shots.size > CACHE_LIMIT) {
    const oldest = shots.keys().next().value;
    if (oldest === undefined) break;
    shots.delete(oldest);
  }
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length > 0) {
      await yieldFrame();
      const job = queue.shift();
      if (!job) break;
      try {
        const url = await renderShot(job.pkg, job.spec);
        remember(job.key, url);
        job.resolve(url);
      } catch (error) {
        failedKeys.add(job.key);
        job.reject(error);
      } finally {
        pending.delete(job.key);
      }
    }
  } finally {
    pumping = false;
  }
}

function requestShot(key: string, pkg: DesignPackage, spec: ShotSpec): Promise<string> {
  const done = shots.get(key);
  if (done) return Promise.resolve(done);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const promise = new Promise<string>((resolve, reject) => {
    queue.push({ key, pkg, spec, resolve, reject });
  });
  // The shared promise is handed to every waiter, but it must not look
  // unhandled if the only waiter has already unmounted.
  promise.catch(() => {});
  pending.set(key, promise);
  void pump();
  return promise;
}

/* ---------- Rendering ---------- */

/**
 * Place the camera so the assembly's bounding box fills `fill` of the frame.
 *
 * Fitting the bounding sphere is a line of code but leaves a flat, wide design
 * swimming in empty frame. Instead each of the eight box corners is asked how
 * far back the camera must be for it to land inside a frame shrunk to `fill`,
 * and the furthest answer wins — an exact fit for the actual silhouette.
 */
function frameCamera(
  three: Three,
  camera: ThreeNS.PerspectiveCamera,
  bounds: ThreeNS.Box3,
  target: ThreeNS.Vector3,
  spec: ShotSpec,
): void {
  const offset = new three.Vector3(
    Math.sin(PHI) * Math.sin(THETA),
    Math.cos(PHI),
    Math.sin(PHI) * Math.cos(THETA),
  ).normalize();

  const forward = offset.clone().negate();
  const right = new three.Vector3().crossVectors(forward, new three.Vector3(0, 1, 0)).normalize();
  const up = new three.Vector3().crossVectors(right, forward).normalize();

  const tanV = Math.tan((camera.fov / 2) * three.MathUtils.DEG2RAD) * spec.fill;
  const tanH = tanV * camera.aspect;

  const corner = new three.Vector3();
  let distance = 0;
  for (let i = 0; i < 8; i++) {
    corner.set(
      i & 1 ? bounds.max.x : bounds.min.x,
      i & 2 ? bounds.max.y : bounds.min.y,
      i & 4 ? bounds.max.z : bounds.min.z,
    );
    corner.sub(target);
    // With the camera at `target + offset * D`, a corner sits `D + corner·f`
    // along the view axis; solving the frustum test for D gives this.
    const depth = corner.dot(forward);
    const needed = Math.max(
      Math.abs(corner.dot(right)) / tanH,
      Math.abs(corner.dot(up)) / tanV,
    );
    distance = Math.max(distance, needed - depth);
  }

  camera.near = Math.max(0.1, distance * 0.01);
  camera.far = distance * 4 + bounds.getSize(new three.Vector3()).length() * 4;
  camera.position.copy(target).addScaledVector(offset, distance);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}

/**
 * A soft blob under the footprint, so the assembly has weight.
 *
 * `scene.buildGround` bundles its contact shadow with the receding grid, which
 * is right for the viewer and wrong here: at product framing the camera sees
 * only the middle of that grid, where it is still at full strength, and the
 * shot stops reading as a photograph and starts reading as CAD. So the hero
 * takes the shadow alone.
 */
function contactShadow(
  three: Three,
  bounds: ThreeNS.Box3,
  centroid: ThreeNS.Vector3,
  size: ThreeNS.Vector3,
  span: number,
): { object: ThreeNS.Mesh; dispose(): void } {
  const px = 256;
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const mid = px / 2;
    const blob = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
    blob.addColorStop(0, "rgba(0,0,0,0.58)");
    blob.addColorStop(0.34, "rgba(0,0,0,0.4)");
    blob.addColorStop(0.68, "rgba(0,0,0,0.12)");
    blob.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = blob;
    ctx.fillRect(0, 0, px, px);
  }

  const texture = new three.CanvasTexture(canvas);
  // Wider than the footprint: a contact shadow spreads, and a blob cropped to
  // the silhouette reads as a decal.
  const geometry = new three.PlaneGeometry(
    size.x * 1.75 + span * 0.2,
    size.z * 1.75 + span * 0.2,
  );
  geometry.rotateX(-Math.PI / 2);
  const material = new three.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });

  const mesh = new three.Mesh(geometry, material);
  mesh.position.set(centroid.x, bounds.min.y - span * 0.004, centroid.z);
  mesh.renderOrder = -2;

  return {
    object: mesh,
    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}

/** Build, shoot, tear down. Only the renderer survives the call. */
async function renderShot(pkg: DesignPackage, spec: ShotSpec): Promise<string> {
  const [three, sceneModule] = await loadModules();
  const gl = sharedRenderer(three, sceneModule);

  const scene = new three.Scene();
  const assembly = sceneModule.buildAssemblyGroup(pkg);
  let shadow: { object: ThreeNS.Mesh; dispose(): void } | null = null;
  try {
    if (assembly.meshesByPath.size === 0) throw new Error("nothing to render");

    scene.add(assembly.group);
    scene.add(sceneModule.buildLighting(assembly.span));
    shadow = contactShadow(three, assembly.bounds, assembly.centroid, assembly.size, assembly.span);
    scene.add(shadow.object);

    const camera = new three.PerspectiveCamera(FOV, spec.width / spec.height, 0.5, 20000);
    frameCamera(three, camera, assembly.bounds, assembly.centroid, spec);

    gl.setSize(spec.width, spec.height, false);
    gl.render(scene, camera);
    return gl.domElement.toDataURL("image/png");
  } finally {
    shadow?.dispose();
    assembly.dispose();
    scene.clear();
  }
}

/* ---------- Keys ---------- */

/** FNV-1a over the BOM, so an edited design gets a different shot. */
function packageHash(pkg: DesignPackage): string {
  let h = 0x811c9dc5;
  for (const part of pkg.parts) {
    const token = `${part.id}:${part.qty};`;
    for (let i = 0; i < token.length; i++) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  return (h >>> 0).toString(36);
}

function shotKey(record: ProjectRecord, variant: HeroShotVariant): string {
  return `${record.slug}|${variant}|${packageHash(record.pkg)}`;
}

/* ---------- Component ---------- */

/** The project's own cover gradient, used as the ground under every shot. */
export function coverGradient(cover: ProjectCover): string {
  return `radial-gradient(120% 140% at 20% 0%, ${cover.hueA}26, transparent 55%), radial-gradient(120% 140% at 85% 100%, ${cover.hueB}22, transparent 55%), var(--bg-inset)`;
}

/**
 * `className` carries the box — height, rounding, border, and whatever grid the
 * caller wants behind the shot. This component owns only the gradient and what
 * sits on it.
 */
export function HeroShot({
  record,
  variant,
  className = "",
}: {
  record: ProjectRecord;
  variant: HeroShotVariant;
  className?: string;
}) {
  const spec = SPECS[variant];
  const key = shotKey(record, variant);
  const [src, setSrc] = useState<string | null>(() => shots.get(key) ?? null);

  useEffect(() => {
    const cached = shots.get(key);
    if (cached) {
      setSrc(cached);
      return;
    }
    setSrc(null);
    if (webglBroken || failedKeys.has(key)) return;

    let live = true;
    requestShot(key, record.pkg, spec).then(
      (url) => {
        if (live) setSrc(url);
      },
      // Nothing to do: the glyph cover is already on screen and stays.
      () => {},
    );
    return () => {
      live = false;
    };
  }, [key, record.pkg, spec]);

  const { cover, pkg } = record;

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={{ background: coverGradient(cover) }}
    >
      {src ? (
        /* A data URL has nothing for next/image to optimise. */
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt={`${pkg.name}, rendered from its massing model`}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain transition-transform group-hover:scale-105"
        />
      ) : (
        /* The cover this replaces, unchanged: what the server renders, and what
           stays when there is no WebGL. `group-hover` is inert unless the
           caller is a `group`, which the project card is. */
        <span
          className="text-5xl opacity-80 transition-transform group-hover:scale-110"
          style={{ textShadow: `0 0 40px ${cover.hueA}` }}
        >
          {cover.glyph}
        </span>
      )}
    </div>
  );
}
