"use client";

/**
 * Mech viewer — the interactive shell around the assembly scene.
 *
 * The model itself (layout, bodies, materials, lights, ground) is built by
 * `scene.ts`, which knows nothing about React; this file owns the canvas, the
 * orbit gestures, picking, the HUD and the STL buttons.
 *
 * three.js is heavy, so this module is loaded lazily by MechTab and owns the
 * whole viewer surface to keep three out of the tab's eager chunk.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { CATEGORY_META } from "@/lib/design/schema";
import type { DesignPackage } from "@/lib/design/schema";
import { dimsLabel } from "@/lib/design/geometry";
import { stlFilename, toStl, type StlSolid } from "@/lib/design/stl";
import type { AssemblySelection } from "@/components/tabs/mech/AssemblyTree";
import {
  applyRendererProfile,
  buildAssemblyGroup,
  buildGround,
  buildLighting,
  layoutAssembly,
} from "@/components/tabs/mech/scene";

/* ---------- Component ---------- */

interface ViewerApi {
  /** Highlight a part and ease the camera onto it. */
  focus(path: string | null): void;
  resetView(): void;
}

const FOV = 38;
const EXPLODE_RADIAL = 0.55;
const EXPLODE_LIFT = 0.3;

export function MechViewer({
  pkg,
  selection,
  onSelect,
}: {
  pkg: DesignPackage;
  selection: AssemblySelection | null;
  onSelect: (selection: AssemblySelection) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<ViewerApi | null>(null);
  const explodeRef = useRef(0);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const placed = useMemo(() => layoutAssembly(pkg), [pkg]);
  const [explode, setExplode] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  const selectedPath = selection?.path ?? null;
  const selectedPlaced = placed.find((p) => p.path === selectedPath) ?? null;
  const hoveredPlaced = placed.find((p) => p.path === hovered) ?? null;

  /* ---------- Scene ---------- */

  useEffect(() => {
    const host = hostRef.current;
    if (!host || placed.length === 0) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setUnsupported(true);
      return;
    }
    applyRendererProfile(renderer);
    renderer.setSize(host.clientWidth || 1, host.clientHeight || 1, false);

    const canvas = renderer.domElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.touchAction = "none";
    canvas.style.outline = "none";
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 20000);

    const assembly = buildAssemblyGroup(pkg, placed);
    scene.add(assembly.group);
    const { centroid, span, radius, meshesByPath: groups, pickables } = assembly;

    /* Explode offsets: push outward from the centroid, and lift by depth so a
       nested stack unpacks upward instead of smearing sideways. Parts sitting
       on the centroid get a deterministic fan direction instead of a zero. */
    const offsets = new Map<string, THREE.Vector3>();
    placed.forEach((item, i) => {
      const delta = new THREE.Vector3(item.x, item.y, item.z).sub(centroid);
      if (delta.length() < radius * 0.05) {
        const angle = i * 2.399963;
        delta.set(Math.cos(angle), 0.4, Math.sin(angle));
      }
      delta.normalize().multiplyScalar(radius * EXPLODE_RADIAL);
      delta.y += item.depth * radius * EXPLODE_LIFT;
      offsets.set(item.path, delta);
    });

    scene.add(buildLighting(span));

    const ground = buildGround(centroid, assembly.size, span);
    scene.add(ground.group);

    const outline = new THREE.BoxHelper(new THREE.Object3D(), 0x3ddbb4);
    (outline.material as THREE.LineBasicMaterial).depthTest = false;
    // The selection outline is UI, not lit geometry — keep ACES off it so it
    // stays the same accent as the chips in the HUD.
    (outline.material as THREE.LineBasicMaterial).toneMapped = false;
    outline.visible = false;
    scene.add(outline);

    /* ---------- Hand-rolled orbit ----------
       three's OrbitControls lives in `three/examples/jsm`, which drags an
       untyped addon graph into the bundle for behaviour we need three gestures
       of. Pointer events give us all three, plus a clean click-vs-drag test for
       picking, in far less code. */
    const view = {
      theta: 0.85,
      phi: 1.02,
      dist: span / 2 / Math.tan((FOV / 2) * THREE.MathUtils.DEG2RAD) * 1.55 + span * 0.2,
      target: centroid.clone(),
      focus: null as THREE.Vector3 | null,
      selected: null as string | null,
    };
    const home = { theta: view.theta, phi: view.phi, dist: view.dist, target: centroid.clone() };
    const minDist = span * 0.15;
    const maxDist = span * 8;

    function applyCamera() {
      const sinPhi = Math.sin(view.phi);
      camera.position.set(
        view.target.x + view.dist * sinPhi * Math.sin(view.theta),
        view.target.y + view.dist * Math.cos(view.phi),
        view.target.z + view.dist * sinPhi * Math.cos(view.theta),
      );
      camera.lookAt(view.target);
    }

    let drag: { x: number; y: number; pan: boolean; moved: number; id: number } | null = null;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function pick(event: PointerEvent): THREE.Mesh | null {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickables, false);
      if (hits.length === 0) return null;
      // See through a transparent shell to whatever is mounted inside it; the
      // shell itself stays selectable from the tree, and from here when it is
      // the only thing under the cursor.
      const solid = hits.find((hit) => !hit.object.userData.container);
      return (solid?.object ?? hits[0].object) as THREE.Mesh;
    }

    function setSelected(path: string | null, moveCamera: boolean) {
      view.selected = path;
      assembly.setSelected(path);
      const group = path ? groups.get(path) : null;
      outline.visible = Boolean(group);
      if (group && moveCamera) view.focus = group.position.clone();
    }

    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0 && event.button !== 2 && event.button !== 1) return;
      canvas.setPointerCapture(event.pointerId);
      drag = {
        x: event.clientX,
        y: event.clientY,
        pan: event.button === 2 || event.button === 1 || event.shiftKey,
        moved: 0,
        id: event.pointerId,
      };
      canvas.style.cursor = "grabbing";
    }

    function onPointerMove(event: PointerEvent) {
      if (!drag) {
        const hit = pick(event);
        const path = (hit?.userData.path as string | undefined) ?? null;
        setHovered(path);
        canvas.style.cursor = path ? "pointer" : "grab";
        return;
      }
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);

      if (drag.pan) {
        const scale = (2 * view.dist * Math.tan((FOV / 2) * THREE.MathUtils.DEG2RAD)) / canvas.clientHeight;
        const m = camera.matrixWorld.elements;
        view.target.x += -dx * scale * m[0] + dy * scale * m[4];
        view.target.y += -dx * scale * m[1] + dy * scale * m[5];
        view.target.z += -dx * scale * m[2] + dy * scale * m[6];
        view.focus = null;
      } else {
        view.theta -= dx * 0.007;
        view.phi = THREE.MathUtils.clamp(view.phi - dy * 0.007, 0.08, Math.PI - 0.08);
      }
      applyCamera();
    }

    function onPointerUp(event: PointerEvent) {
      if (!drag) return;
      const wasClick = drag.moved < 5;
      if (canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
      drag = null;
      canvas.style.cursor = "grab";
      if (!wasClick || event.button !== 0) return;

      const hit = pick(event);
      const path = hit?.userData.path as string | undefined;
      if (!path) return;
      const item = placed.find((p) => p.path === path);
      if (item) onSelectRef.current({ path, partId: item.part.id });
    }

    // Attached by hand, not via JSX: React registers onWheel passively, so
    // preventDefault there is ignored and the page scrolls behind the canvas.
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      view.dist = THREE.MathUtils.clamp(view.dist * Math.exp(event.deltaY * 0.0012), minDist, maxDist);
      applyCamera();
    }

    const onContextMenu = (event: MouseEvent) => event.preventDefault();
    const onPointerLeave = () => setHovered(null);

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu);

    apiRef.current = {
      focus: (path) => setSelected(path, true),
      resetView: () => {
        view.theta = home.theta;
        view.phi = home.phi;
        view.dist = home.dist;
        view.target.copy(home.target);
        view.focus = null;
        applyCamera();
      },
    };

    /* ---------- Resize ---------- */

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    applyCamera();

    /* ---------- Frame loop ---------- */

    let frame = 0;
    let last = performance.now();
    let current = explodeRef.current;

    function tick(now: number) {
      frame = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      // Critically damped-ish easing: fast to start, no overshoot, and it
      // settles rather than snapping when the slider stops.
      const ease = 1 - Math.exp(-dt * 7);
      const target = explodeRef.current;
      if (Math.abs(target - current) > 0.0005) {
        current += (target - current) * ease;
      } else {
        current = target;
      }

      for (const item of placed) {
        const group = groups.get(item.path);
        const offset = offsets.get(item.path);
        if (!group || !offset) continue;
        group.position.set(
          item.x + offset.x * current,
          item.y + offset.y * current,
          item.z + offset.z * current,
        );
      }

      if (view.focus) {
        view.target.lerp(view.focus, ease);
        if (view.target.distanceTo(view.focus) < span * 0.002) view.focus = null;
        applyCamera();
      }

      if (view.selected) {
        const group = groups.get(view.selected);
        if (group) {
          scene.updateMatrixWorld(true);
          outline.setFromObject(group);
        }
      }

      renderer.render(scene, camera);
    }
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      apiRef.current = null;
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
      assembly.dispose();
      ground.dispose();
      outline.geometry.dispose();
      (outline.material as THREE.Material).dispose();
      scene.clear();
      renderer.dispose();
      canvas.remove();
    };
  }, [pkg, placed]);

  /* Sidebar selection drives the scene; scene clicks go back out through
     onSelect, so the tab's state stays the single source of truth. */
  useEffect(() => {
    apiRef.current?.focus(selectedPath);
  }, [selectedPath]);

  useEffect(() => {
    explodeRef.current = explode;
  }, [explode]);

  /* ---------- STL ---------- */

  const download = useCallback(
    (scope: "assembly" | "part") => {
      const solids: StlSolid[] =
        scope === "part" && selectedPlaced
          ? [{ geom: selectedPlaced.geom, position: { x: 0, y: 0, z: 0 } }]
          : placed.map((item) => ({
              geom: item.geom,
              position: { x: item.x, y: item.y, z: item.z },
            }));
      if (solids.length === 0) return;

      const label =
        scope === "part" && selectedPlaced ? selectedPlaced.part.name : pkg.name;
      const blob = toStl(solids, label);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = stlFilename(label, scope === "part" ? "part" : "assembly");
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoke on the next turn: Safari needs the URL alive past the click.
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    },
    [placed, pkg.name, selectedPlaced],
  );

  /* ---------- Render ---------- */

  if (placed.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="microlabel text-ink-faint">No mechanical data</p>
      </div>
    );
  }

  const readout = selectedPlaced ?? hoveredPlaced;

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="absolute inset-0" />

      {unsupported && (
        <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
          <p className="max-w-sm text-[12px] leading-relaxed text-ink-faint">
            This browser could not start WebGL, so the assembly cannot be drawn. The tree on
            the right still maps every part to its mount.
          </p>
        </div>
      )}

      {/* Toolbar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-2 p-3">
        <div className="pointer-events-auto flex items-center gap-2.5 rounded-sm border border-line bg-bg/80 px-3 py-1.5 backdrop-blur">
          <label htmlFor="explode" className="microlabel text-[10px]">
            Explode
          </label>
          <input
            id="explode"
            type="range"
            min={0}
            max={100}
            value={Math.round(explode * 100)}
            onChange={(e) => setExplode(Number(e.target.value) / 100)}
            className="w-28 cursor-pointer"
            // A bare `h-1` range is a 4px-tall hit target — easy to miss and
            // impossible to drag on touch. Keep the track thin visually but
            // give the control a real height to grab.
            style={{ accentColor: "var(--accent)", height: 20 }}
          />
          <span className="microlabel w-8 text-right text-[10px] tabular-nums text-ink-faint">
            {Math.round(explode * 100)}%
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            setExplode(0);
            apiRef.current?.resetView();
          }}
          className="microlabel pointer-events-auto rounded-sm border border-line bg-bg/80 px-3 py-1.5 text-[10px] backdrop-blur hover:border-line-strong hover:text-ink"
        >
          Reset view
        </button>

        <div className="pointer-events-auto flex items-center rounded-sm border border-line bg-bg/80 backdrop-blur">
          <span className="microlabel border-r border-line px-2.5 py-1.5 text-[10px] text-ink-faint">
            Download STL
          </span>
          <button
            type="button"
            onClick={() => download("assembly")}
            className="microlabel px-2.5 py-1.5 text-[10px] text-accent hover:bg-bg-raised"
            title="Binary STL of the whole assembly, in millimetres"
          >
            Assembly
          </button>
          <button
            type="button"
            onClick={() => download("part")}
            disabled={!selectedPlaced}
            className="microlabel border-l border-line px-2.5 py-1.5 text-[10px] hover:bg-bg-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            title={
              selectedPlaced
                ? `Binary STL of ${selectedPlaced.part.name} alone`
                : "Select a part to export it on its own"
            }
          >
            Part
          </button>
        </div>

        <span className="microlabel ml-auto text-[10px] text-ink-faint">
          {placed.length} parts
        </span>
      </div>

      {/* Readout */}
      {readout && (
        <div className="pointer-events-none absolute bottom-14 left-3 max-w-[280px] rounded-sm border border-line bg-bg/85 px-3 py-2 backdrop-blur">
          <p className="text-[12px] leading-tight font-bold">{readout.part.name}</p>
          <p className="mt-0.5 text-[11px] leading-tight text-ink-dim">{readout.part.role}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span
              className="cat-chip"
              style={{ ["--chip-color" as string]: CATEGORY_META[readout.part.category].color }}
            >
              {CATEGORY_META[readout.part.category].label}
            </span>
            <span className="microlabel text-[10px] text-ink-faint">
              {dimsLabel(readout.geom)}
            </span>
          </div>
        </div>
      )}

      <p className="pointer-events-none absolute bottom-4 left-3 max-w-[420px] text-[10px] leading-relaxed text-ink-faint">
        Schematic massing model — primitive bodies at estimated sizes, not manufacturing CAD.
        Drag to orbit, scroll to zoom, shift-drag or right-drag to pan.
      </p>

      <div className="pointer-events-none absolute right-4 bottom-4 rounded-sm border border-line bg-bg/70 px-2 py-1 backdrop-blur">
        {/* Inline size: `.microlabel` is unlayered and outranks utilities. */}
        <span className="microlabel" style={{ fontSize: 9 }}>
          Powered by OpenBlueprint Mech
        </span>
      </div>
    </div>
  );
}
