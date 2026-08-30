/**
 * Project export — the whole design as one ZIP, built in the browser.
 *
 * Four members, chosen so the archive is useful without OpenBlueprint: the
 * package itself (`design.json`), a bill of materials a spreadsheet opens
 * (`bom.csv`), the build steps as prose (`instructions.md`), and the massing
 * mesh (`assembly.stl`).
 *
 * The archive is written by hand — a ZIP with stored entries is a few hundred
 * bytes of header work, which is cheaper than shipping a compression library
 * into the client bundle. Nothing here reads the clock: the caller passes the
 * timestamp, so the same design and the same date always produce the same
 * bytes.
 */

import { geometryFor, type PartGeometry } from "./geometry";
import {
  partById,
  subtotal,
  totalCost,
  type AssemblyNode,
  type DesignPackage,
  type Part,
  type ProjectRecord,
} from "./schema";
import { toStl, type StlSolid } from "./stl";

/* ---------- CRC-32 ---------- */

/** Standard reflected CRC-32 table (polynomial 0xEDB88320), built once. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/* ---------- ZIP ---------- */

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
/** PKZip 2.0 — the floor for stored entries. */
const VERSION_NEEDED = 20;

/**
 * MS-DOS date/time pair. The DOS epoch is 1980, and the year field would
 * underflow for anything older, so earlier dates clamp to 1980-01-01. Seconds
 * have two-second resolution — that is the format, not a rounding choice here.
 */
function dosDateTime(at: Date): { date: number; time: number } {
  const year = at.getFullYear();
  if (!Number.isFinite(year) || year < 1980) {
    return { date: (1 << 5) | 1, time: 0 };
  }
  const date = ((year - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate();
  const time =
    (at.getHours() << 11) | (at.getMinutes() << 5) | Math.floor(at.getSeconds() / 2);
  return { date: date & 0xffff, time: time & 0xffff };
}

/**
 * A ZIP of stored (uncompressed) entries: one local header plus data per
 * entry, then a central directory record per entry, then the end-of-central
 * -directory record. Compressed and uncompressed sizes are equal because
 * method 0 stores bytes verbatim, and the central directory carries each
 * entry's local-header offset so the archive stays randomly addressable.
 */
export function buildZip(entries: ZipEntry[], at: Date): Blob {
  const encoder = new TextEncoder();
  const { date, time } = dosDateTime(at);

  const prepared = entries.map((entry) => ({
    name: encoder.encode(entry.name),
    data: entry.data,
    crc: crc32(entry.data),
  }));

  const localSize = prepared.reduce(
    (sum, e) => sum + 30 + e.name.length + e.data.length,
    0,
  );
  const centralBytes = prepared.reduce((sum, e) => sum + 46 + e.name.length, 0);

  const buffer = new ArrayBuffer(localSize + centralBytes + 22);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let at32 = 0;

  const u16 = (v: number) => {
    view.setUint16(at32, v & 0xffff, true);
    at32 += 2;
  };
  const u32 = (v: number) => {
    view.setUint32(at32, v >>> 0, true);
    at32 += 4;
  };
  const raw = (v: Uint8Array) => {
    bytes.set(v, at32);
    at32 += v.length;
  };

  const offsets: number[] = [];

  for (const entry of prepared) {
    offsets.push(at32);
    u32(LOCAL_SIG);
    u16(VERSION_NEEDED);
    u16(0); // general purpose flags — no data descriptor, no encryption
    u16(0); // method 0: stored
    u16(time);
    u16(date);
    u32(entry.crc);
    u32(entry.data.length); // compressed size
    u32(entry.data.length); // uncompressed size
    u16(entry.name.length);
    u16(0); // extra field length
    raw(entry.name);
    raw(entry.data);
  }

  const centralStart = at32;

  for (let i = 0; i < prepared.length; i++) {
    const entry = prepared[i];
    u32(CENTRAL_SIG);
    u16(VERSION_NEEDED); // version made by
    u16(VERSION_NEEDED); // version needed to extract
    u16(0);
    u16(0);
    u16(time);
    u16(date);
    u32(entry.crc);
    u32(entry.data.length);
    u32(entry.data.length);
    u16(entry.name.length);
    u16(0); // extra field length
    u16(0); // comment length
    u16(0); // disk number start
    u16(0); // internal attributes
    u32(0); // external attributes
    u32(offsets[i]);
    raw(entry.name);
  }

  /* Take the directory's length before writing the EOCD — the writer has
     already advanced the cursor by the time the size field is emitted, and
     measuring there overstates the directory by the 12 bytes written ahead
     of it. `unzip` notices. */
  const centralSize = at32 - centralStart;

  u32(EOCD_SIG);
  u16(0); // this disk
  u16(0); // disk with the central directory
  u16(prepared.length);
  u16(prepared.length);
  u32(centralSize);
  u32(centralStart);
  u16(0); // archive comment length

  return new Blob([buffer], { type: "application/zip" });
}

/* ---------- CSV ---------- */

/**
 * RFC 4180 quoting. Part descriptions are prose and routinely contain commas,
 * so this is load-bearing rather than defensive.
 */
export function csvField(value: string | number): string {
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csvRow(fields: Array<string | number>): string {
  return fields.map(csvField).join(",");
}

/**
 * Bill of materials, one row per part line, closed by a total that matches
 * `totalCost` — the same number the Info tab prints.
 */
export function toBomCsv(pkg: DesignPackage): string {
  const rows: string[] = [
    csvRow(["Name", "Role", "Category", "Domain", "Qty", "Unit Cost (USD)", "Subtotal (USD)"]),
  ];
  for (const part of pkg.parts) {
    rows.push(
      csvRow([
        part.name,
        part.role,
        part.category,
        part.domain,
        part.qty,
        part.unitCost.toFixed(2),
        subtotal(part).toFixed(2),
      ]),
    );
  }
  rows.push(csvRow(["TOTAL", "", "", "", "", "", totalCost(pkg).toFixed(2)]));
  return rows.join("\r\n") + "\r\n";
}

/* ---------- Markdown ---------- */

function partLabel(pkg: DesignPackage, id: string): string {
  return partById(pkg, id)?.name ?? id;
}

/** Build instructions as readable Markdown, part ids resolved to part names. */
export function toInstructionsMarkdown(pkg: DesignPackage): string {
  const lines: string[] = [`# ${pkg.name}`, "", pkg.summary, ""];

  if (pkg.tools.length > 0) {
    lines.push("## Tools", "");
    for (const tool of pkg.tools) lines.push(`- ${tool}`);
    lines.push("");
  }

  if (pkg.assumptions.length > 0) {
    lines.push("## Assumptions", "");
    for (const assumption of pkg.assumptions) lines.push(`- ${assumption}`);
    lines.push("");
  }

  lines.push("## Build", "");
  for (const phase of pkg.instructions) {
    lines.push(`### ${phase.title}`, "");
    for (const step of phase.steps) {
      lines.push(`${step.id}. **${step.title}**`, "", `   ${step.detail}`, "");
      if (step.tools.length > 0) lines.push(`   - Tools: ${step.tools.join(", ")}`);
      if (step.parts.length > 0) {
        lines.push(`   - Parts: ${step.parts.map((id) => partLabel(pkg, id)).join(", ")}`);
      }
      if (step.tools.length > 0 || step.parts.length > 0) lines.push("");
    }
  }

  return lines.join("\n");
}

/* ---------- STL placement ---------- */

/**
 * Placement for the exported mesh.
 *
 * This is deliberately its own, simple layout rather than a share of the Mech
 * viewer's: the viewer's arrangement is a rendering concern that carries an
 * explode factor and a camera with it, while the export only needs every body
 * present, at a sane scale, without interpenetrating. Children sit on their
 * parent's top face, spread along X in tree order; anything absent from
 * `pkg.assembly` is laid out in a trailing row so no part silently drops.
 * One solid per part line — a qty of 4 screws exports as one screw.
 */
function placeSolids(pkg: DesignPackage): StlSolid[] {
  const solids: StlSolid[] = [];
  const seen = new Set<string>();
  const gap = 6;

  const place = (node: AssemblyNode, x: number, y: number, z: number): number => {
    const part = partById(pkg, node.part);
    if (!part) return 0;
    seen.add(part.id);
    const geom = geometryFor(part);
    solids.push({ geom, position: { x, y: y + geom.h / 2, z } });

    const children = node.children ?? [];
    if (children.length === 0) return geom.w;

    const kids = children
      .map((child) => partById(pkg, child.part))
      .filter((p): p is Part => Boolean(p))
      .map((p) => geometryFor(p));
    const span = kids.reduce((sum, g) => sum + g.w + gap, -gap);

    let cursor = x - span / 2;
    for (let i = 0; i < children.length; i++) {
      const childGeom = kids[i];
      if (!childGeom) continue;
      place(children[i], cursor + childGeom.w / 2, y + geom.h, z);
      cursor += childGeom.w + gap;
    }
    return Math.max(geom.w, span);
  };

  let cursorX = 0;
  for (const root of pkg.assembly) {
    const width = place(root, cursorX, 0, 0);
    cursorX += width + gap * 4;
  }

  // Parts the assembly tree never mentions still belong in the mesh.
  let orphanX = 0;
  const orphans = pkg.parts.filter((p) => !seen.has(p.id));
  for (const part of orphans) {
    const geom: PartGeometry = geometryFor(part);
    solids.push({
      geom,
      position: { x: orphanX + geom.w / 2, y: geom.h / 2, z: -120 },
    });
    orphanX += geom.w + gap;
  }

  return solids;
}

/* ---------- Package ---------- */

/** Filesystem-safe archive name for a project, e.g. `balcony-weather-station.zip`. */
export function exportFilename(record: ProjectRecord): string {
  const stem =
    record.slug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "project";
  return `${stem}.zip`;
}

/**
 * The whole project as one ZIP. `at` stamps the archive's DOS timestamps —
 * passed in rather than read here so the builder stays deterministic.
 */
export async function buildProjectZip(record: ProjectRecord, at: Date): Promise<Blob> {
  const encoder = new TextEncoder();
  const pkg = record.pkg;

  const stlBlob = toStl(placeSolids(pkg), pkg.name);
  const stlBytes = new Uint8Array(await stlBlob.arrayBuffer());

  return buildZip(
    [
      { name: "design.json", data: encoder.encode(JSON.stringify(pkg, null, 2)) },
      { name: "bom.csv", data: encoder.encode(toBomCsv(pkg)) },
      { name: "instructions.md", data: encoder.encode(toInstructionsMarkdown(pkg)) },
      { name: "assembly.stl", data: stlBytes },
    ],
    at,
  );
}
