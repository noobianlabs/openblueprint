/**
 * Browser-local persistence.
 *
 * There is no account and no server: generated designs and stars live in
 * localStorage under two keys. Every accessor is SSR-safe and swallows
 * storage failures (private mode, quota, disabled site data) rather than
 * taking a page down over them.
 */

import type { DesignPackage, ProjectCover, ProjectRecord } from "./design/schema";
import { seeds } from "./design/seeds";
import { matchArchetype } from "./engine/local";

const PROJECTS_KEY = "obp:projects";
const STARS_KEY = "obp:stars";

/* ---------- storage plumbing ---------- */

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string, fallback: T): T {
  const store = storage();
  if (!store) return fallback;
  try {
    const raw = store.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // Full or unavailable — the design is still on screen, just not saved.
  }
}

/* ---------- projects ---------- */

/** Newest first. */
export function listMyProjects(): ProjectRecord[] {
  return readJson<ProjectRecord[]>(PROJECTS_KEY, [])
    .filter((r) => r && typeof r.slug === "string" && r.pkg)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getMyProject(slug: string): ProjectRecord | undefined {
  return listMyProjects().find((r) => r.slug === slug);
}

/** Upsert by slug. */
export function saveProject(record: ProjectRecord): void {
  const existing = readJson<ProjectRecord[]>(PROJECTS_KEY, []).filter((r) => r.slug !== record.slug);
  writeJson(PROJECTS_KEY, [...existing, record]);
}

export function deleteProject(slug: string): void {
  const kept = readJson<ProjectRecord[]>(PROJECTS_KEY, []).filter((r) => r.slug !== slug);
  writeJson(PROJECTS_KEY, kept);
}

/* ---------- stars ---------- */

export function listStars(): string[] {
  return readJson<string[]>(STARS_KEY, []).filter((s) => typeof s === "string");
}

export function isStarred(slug: string): boolean {
  return listStars().includes(slug);
}

/** Returns the new starred state. */
export function toggleStar(slug: string): boolean {
  const stars = listStars();
  const next = stars.includes(slug) ? stars.filter((s) => s !== slug) : [...stars, slug];
  writeJson(STARS_KEY, next);
  return next.includes(slug);
}

/** Displayed star count: the record's own plus this browser's, if set. */
export function starCount(record: ProjectRecord): number {
  return record.stars + (isStarred(record.slug) ? 1 : 0);
}

/* ---------- new records ---------- */

const SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function kebab(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || "design";
}

function randomSuffix(): string {
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += SUFFIX_ALPHABET[Math.floor(Math.random() * SUFFIX_ALPHABET.length)];
  }
  return out;
}

/**
 * Kebab-cased slug, with a random suffix on collision. Seed slugs count as
 * taken: /p/[slug] resolves seeds first, so a user design that shadowed one
 * would be permanently unreachable.
 */
export function makeSlug(name: string): string {
  const base = kebab(name);
  const taken = new Set<string>([
    ...seeds.map((s) => s.slug),
    ...readJson<ProjectRecord[]>(PROJECTS_KEY, []).map((r) => r.slug),
  ]);

  if (!taken.has(base)) return base;
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = `${base}-${randomSuffix()}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Cover art per archetype — text glyphs only, matching the seed style. */
const COVERS: Record<string, ProjectCover> = {
  rover: { glyph: "◫", hueA: "#f87171", hueB: "#fbbf24" },
  station: { glyph: "◉", hueA: "#22d3ee", hueB: "#4ade80" },
  lamp: { glyph: "☼", hueA: "#fbbf24", hueB: "#f472b6" },
  planter: { glyph: "❖", hueA: "#4ade80", hueB: "#22d3ee" },
  timer: { glyph: "◷", hueA: "#a78bfa", hueB: "#22d3ee" },
  wearable: { glyph: "✦", hueA: "#f472b6", hueB: "#fbbf24" },
  gadget: { glyph: "⎔", hueA: "#fb923c", hueB: "#a78bfa" },
  generic: { glyph: "◈", hueA: "#a78bfa", hueB: "#3ddbb4" },
};

/**
 * Cover for a package. The archetype match runs over the prompt plus the
 * design's own name and tags, so a Claude-generated package that never saw
 * the local archetype table still lands on a fitting glyph.
 */
export function coverFor(pkg: DesignPackage, prompt: string): ProjectCover {
  const haystack = `${prompt} ${pkg.name} ${pkg.tags.join(" ")}`;
  return COVERS[matchArchetype(haystack).id] ?? COVERS.generic;
}

export function makeUserRecord(pkg: DesignPackage, prompt: string): ProjectRecord {
  return {
    slug: makeSlug(pkg.name),
    author: "you",
    source: "user",
    stars: 0,
    createdAt: new Date().toISOString(),
    cover: coverFor(pkg, prompt),
    pkg,
  };
}
