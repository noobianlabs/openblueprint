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
const VERSIONS_PREFIX = "obp:versions:";
const MAX_VERSIONS = 12;

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

/**
 * Upsert by slug. If this overwrites an existing record whose design differs
 * from the incoming one, the OLD package is snapshotted into version history
 * first — so every generation and applied edit (and every restore) leaves a
 * trail. A rename alone (pkg.name changes, nothing else) does not count as a
 * design change and burns no version slot; see {@link pkgsDiffer}.
 */
export function saveProject(record: ProjectRecord, versionLabel?: string): void {
  const all = readJson<ProjectRecord[]>(PROJECTS_KEY, []);
  const existing = all.find((r) => r.slug === record.slug);
  if (existing && pkgsDiffer(existing.pkg, record.pkg)) {
    pushVersion(record.slug, existing.pkg, versionLabel ?? "before update");
  }
  const kept = all.filter((r) => r.slug !== record.slug);
  writeJson(PROJECTS_KEY, [...kept, record]);
}

export function deleteProject(slug: string): void {
  const kept = readJson<ProjectRecord[]>(PROJECTS_KEY, []).filter((r) => r.slug !== slug);
  writeJson(PROJECTS_KEY, kept);
}

/** Update just the display name. Slug is stable — links keep working. */
export function renameProject(slug: string, name: string): boolean {
  const record = getMyProject(slug);
  const trimmed = name.trim();
  if (!record || !trimmed) return false;
  saveProject({ ...record, pkg: { ...record.pkg, name: trimmed } });
  return true;
}

/* ---------- version history ---------- */

export interface VersionEntry {
  /** ISO date the snapshot was taken */
  at: string;
  /** What produced this snapshot, e.g. "before update", "before restore" */
  label: string;
  pkg: DesignPackage;
}

function versionsKey(slug: string): string {
  return `${VERSIONS_PREFIX}${slug}`;
}

/** Same design, ignoring the name — a rename alone must not read as a diff. */
function pkgsDiffer(a: DesignPackage, b: DesignPackage): boolean {
  return JSON.stringify({ ...a, name: "" }) !== JSON.stringify({ ...b, name: "" });
}

function pushVersion(slug: string, pkg: DesignPackage, label: string): void {
  const entry: VersionEntry = { at: new Date().toISOString(), label, pkg };
  const next = [entry, ...listVersions(slug)].slice(0, MAX_VERSIONS);
  writeJson(versionsKey(slug), next);
}

/** Newest first, capped at 12. */
export function listVersions(slug: string): VersionEntry[] {
  return readJson<VersionEntry[]>(versionsKey(slug), []).filter(
    (v) => v && typeof v.at === "string" && typeof v.label === "string" && v.pkg,
  );
}

/**
 * Swap a past version's package into the live record. Goes through
 * saveProject, so the state being replaced is itself snapshotted first
 * (labelled "before restore") — restoring is never destructive.
 */
export function restoreVersion(slug: string, index: number): boolean {
  const record = getMyProject(slug);
  const version = listVersions(slug)[index];
  if (!record || !version) return false;
  saveProject({ ...record, pkg: version.pkg }, "before restore");
  return true;
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
