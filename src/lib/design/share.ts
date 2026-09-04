/**
 * Share links — the design travels INSIDE the URL.
 *
 * Nothing is uploaded anywhere: a share link is the project's package,
 * gzip-compressed and base64url-encoded into the fragment after `/p/shared#`.
 * Anyone who opens the link can decode it client-side; nobody who doesn't
 * have the link can see it, and there is no server copy to leak or expire.
 *
 * Both directions are browser-only (CompressionStream/DecompressionStream +
 * `location`), so every export here throws outside a browser context.
 */

import type { DesignPackage, PartCategory, ProjectCover, ProjectRecord } from "./schema";
import { CATEGORY_META } from "./schema";

const SHARE_VERSION = 1;

/** Fragment length past which a link is unwieldy to paste/send. Advisory only — still returned. */
const OVERSIZED_THRESHOLD = 50_000;

export interface SharePayload {
  v: 1;
  name: string;
  author: string;
  cover: ProjectCover;
  pkg: DesignPackage;
}

export class ShareDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShareDecodeError";
  }
}

function assertBrowser(fn: string): void {
  if (typeof window === "undefined") {
    throw new Error(`${fn} is browser-only`);
  }
}

/* ---------- byte <-> base64url ---------- */

function bytesToBase64(bytes: Uint8Array): string {
  // btoa needs a plain binary string; chunk to stay well under call-stack
  // argument limits for large designs.
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(base64url: string): string {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  return base64 + pad;
}

/* ---------- gzip via native streams ---------- */

async function gzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* ---------- encode ---------- */

/** Compress a project's package into a base64url fragment (no leading `#`). */
export async function encodeShare(record: ProjectRecord): Promise<string> {
  assertBrowser("encodeShare");
  const payload: SharePayload = {
    v: SHARE_VERSION,
    name: record.pkg.name,
    author: record.author,
    cover: record.cover,
    pkg: record.pkg,
  };
  const json = JSON.stringify(payload);
  const compressed = await gzip(new TextEncoder().encode(json));
  return toBase64Url(bytesToBase64(compressed));
}

/** True once a fragment is long enough that the link becomes unwieldy to share. */
export function isOversizedFragment(fragment: string): boolean {
  return fragment.length > OVERSIZED_THRESHOLD;
}

export interface ShareUrlResult {
  url: string;
  /** Advisory only — the URL is still returned in full. */
  oversized: boolean;
}

/** Full shareable URL for a project, plus whether it's advisably-oversized. */
export async function shareUrl(record: ProjectRecord): Promise<ShareUrlResult> {
  assertBrowser("shareUrl");
  const fragment = await encodeShare(record);
  return {
    url: `${window.location.origin}/p/shared#${fragment}`,
    oversized: isOversizedFragment(fragment),
  };
}

/* ---------- decode ---------- */

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === "string");
}

function validatePart(x: unknown): void {
  if (!isRecord(x)) throw new ShareDecodeError("a part is not an object");
  const required: [string, string][] = [
    ["id", "string"],
    ["name", "string"],
    ["role", "string"],
    ["description", "string"],
    ["category", "string"],
    ["domain", "string"],
  ];
  for (const [key, type] of required) {
    if (typeof x[key] !== type) throw new ShareDecodeError(`part.${key} is missing or wrong type`);
  }
  if (typeof x.qty !== "number" || typeof x.unitCost !== "number") {
    throw new ShareDecodeError("part.qty/unitCost missing or not numbers");
  }
  if (!(x.category as string in CATEGORY_META)) {
    throw new ShareDecodeError(`unknown part category "${String(x.category)}"`);
  }
  if (x.domain !== "electrical" && x.domain !== "mechanical") {
    throw new ShareDecodeError(`unknown part domain "${String(x.domain)}"`);
  }
  if (x.pins !== undefined && !isStringArray(x.pins)) {
    throw new ShareDecodeError("part.pins is not a string array");
  }
  if (x.printSettings !== undefined && typeof x.printSettings !== "string") {
    throw new ShareDecodeError("part.printSettings is not a string");
  }
}

function validatePinRef(x: unknown, field: string): void {
  if (!isRecord(x) || typeof x.part !== "string" || typeof x.pin !== "string") {
    throw new ShareDecodeError(`connection.${field} is malformed`);
  }
}

function validateConnection(x: unknown): void {
  if (!isRecord(x)) throw new ShareDecodeError("a connection is not an object");
  if (typeof x.id !== "string") throw new ShareDecodeError("connection.id missing");
  validatePinRef(x.from, "from");
  validatePinRef(x.to, "to");
  if (x.net !== "data" && x.net !== "power" && x.net !== "ground") {
    throw new ShareDecodeError(`unknown connection net "${String(x.net)}"`);
  }
  if (x.label !== undefined && typeof x.label !== "string") {
    throw new ShareDecodeError("connection.label is not a string");
  }
}

function validateAssemblyNode(x: unknown): void {
  if (!isRecord(x) || typeof x.part !== "string") {
    throw new ShareDecodeError("an assembly node is malformed");
  }
  if (x.children !== undefined) {
    if (!Array.isArray(x.children)) throw new ShareDecodeError("assembly node children is not an array");
    x.children.forEach(validateAssemblyNode);
  }
}

function validateStep(x: unknown): void {
  if (!isRecord(x)) throw new ShareDecodeError("an instruction step is not an object");
  for (const key of ["id", "title", "detail"]) {
    if (typeof x[key] !== "string") throw new ShareDecodeError(`step.${key} missing`);
  }
  if (!isStringArray(x.tools) || !isStringArray(x.parts)) {
    throw new ShareDecodeError("step.tools/parts is not a string array");
  }
}

function validatePhase(x: unknown): void {
  if (!isRecord(x) || typeof x.id !== "string" || typeof x.title !== "string") {
    throw new ShareDecodeError("an instruction phase is malformed");
  }
  if (!Array.isArray(x.steps)) throw new ShareDecodeError("phase.steps is not an array");
  x.steps.forEach(validateStep);
}

function validatePackage(x: unknown): asserts x is DesignPackage {
  if (!isRecord(x)) throw new ShareDecodeError("pkg is not an object");
  if (typeof x.name !== "string" || typeof x.summary !== "string") {
    throw new ShareDecodeError("pkg.name/summary missing");
  }
  if (!isStringArray(x.tags)) throw new ShareDecodeError("pkg.tags is not a string array");
  if (!isStringArray(x.tools)) throw new ShareDecodeError("pkg.tools is not a string array");
  if (!isStringArray(x.assumptions)) throw new ShareDecodeError("pkg.assumptions is not a string array");
  if (!Array.isArray(x.parts)) throw new ShareDecodeError("pkg.parts is not an array");
  x.parts.forEach(validatePart);
  if (!Array.isArray(x.connections)) throw new ShareDecodeError("pkg.connections is not an array");
  x.connections.forEach(validateConnection);
  if (!Array.isArray(x.assembly)) throw new ShareDecodeError("pkg.assembly is not an array");
  x.assembly.forEach(validateAssemblyNode);
  if (!Array.isArray(x.instructions)) throw new ShareDecodeError("pkg.instructions is not an array");
  x.instructions.forEach(validatePhase);
}

function validatePayload(x: unknown): asserts x is SharePayload {
  if (!isRecord(x)) throw new ShareDecodeError("share payload is not an object");
  if (x.v !== SHARE_VERSION) throw new ShareDecodeError(`unsupported share version "${String(x.v)}"`);
  if (typeof x.name !== "string" || typeof x.author !== "string") {
    throw new ShareDecodeError("share payload name/author missing");
  }
  if (
    !isRecord(x.cover) ||
    typeof x.cover.glyph !== "string" ||
    typeof x.cover.hueA !== "string" ||
    typeof x.cover.hueB !== "string"
  ) {
    throw new ShareDecodeError("share payload cover is malformed");
  }
  validatePackage(x.pkg);
}

/** Reverse of {@link encodeShare}. Never throws a raw error — always {@link ShareDecodeError}. */
export async function decodeShare(fragment: string): Promise<SharePayload> {
  assertBrowser("decodeShare");
  const trimmed = fragment.trim();
  if (!trimmed) throw new ShareDecodeError("empty share link");

  let compressed: Uint8Array<ArrayBuffer>;
  try {
    compressed = base64ToBytes(fromBase64Url(trimmed));
  } catch {
    throw new ShareDecodeError("share link is not valid base64url");
  }

  let json: string;
  try {
    const inflated = await gunzip(compressed);
    json = new TextDecoder().decode(inflated);
  } catch {
    throw new ShareDecodeError("share link is damaged or truncated");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ShareDecodeError("share link payload is not valid JSON");
  }

  validatePayload(parsed);
  return parsed;
}
