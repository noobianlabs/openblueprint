/**
 * Referential-integrity check for a DesignPackage.
 *
 * Both engines run this: the local one as a build-time guard, the Claude
 * route as the gate that decides between returning a design and returning
 * 422 so the client can fall back. It takes `unknown` on purpose — the
 * Claude path hands it model output, which is not to be trusted.
 */

import type { DesignPackage, Part, PartCategory } from "../../design/schema";
import { CATEGORY_META } from "../../design/schema";
import { contentWords } from "./text";

const NETS = new Set(["data", "power", "ground"]);
const CATEGORIES = new Set(Object.keys(CATEGORY_META));

export interface ValidateOptions {
  /** When given, the summary must mention something the user asked for. */
  prompt?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Returns a list of human-readable problems. Empty list = valid.
 * Stops early on structural failures so later checks can assume shape.
 */
export function validateDesign(value: unknown, opts: ValidateOptions = {}): string[] {
  const issues: string[] = [];

  if (!isRecord(value)) return ["package is not an object"];
  for (const key of ["name", "summary"]) {
    if (!isNonEmptyString(value[key])) issues.push(`${key} is missing or empty`);
  }
  for (const key of ["tags", "parts", "connections", "assembly", "tools", "assumptions", "instructions"]) {
    if (!Array.isArray(value[key])) issues.push(`${key} is not an array`);
  }
  if (issues.length) return issues;

  const pkg = value as unknown as DesignPackage;

  /* ---------- parts ---------- */

  const partIds = new Set<string>();
  const pinsById = new Map<string, Set<string>>();
  const domains = new Set<string>();

  pkg.parts.forEach((part, i) => {
    const where = `parts[${i}]`;
    if (!isRecord(part)) {
      issues.push(`${where} is not an object`);
      return;
    }
    const p = part as Part;
    if (!isNonEmptyString(p.id)) {
      issues.push(`${where} has no id`);
      return;
    }
    if (partIds.has(p.id)) issues.push(`${where}: duplicate part id "${p.id}"`);
    partIds.add(p.id);

    for (const key of ["name", "role", "description"] as const) {
      if (!isNonEmptyString(p[key])) issues.push(`part "${p.id}": ${key} is missing or empty`);
    }
    if (!CATEGORIES.has(p.category as string)) {
      issues.push(`part "${p.id}": unknown category "${p.category}"`);
    } else {
      const expected = CATEGORY_META[p.category as PartCategory].domain;
      if (p.domain !== expected) {
        issues.push(`part "${p.id}": category "${p.category}" belongs to the ${expected} domain, not "${p.domain}"`);
      }
      domains.add(expected);
    }
    if (typeof p.qty !== "number" || !Number.isFinite(p.qty) || p.qty < 1) {
      issues.push(`part "${p.id}": qty must be a positive number`);
    }
    if (typeof p.unitCost !== "number" || !Number.isFinite(p.unitCost) || p.unitCost < 0) {
      issues.push(`part "${p.id}": unitCost must be a non-negative number`);
    }
    if (p.domain === "electrical") {
      if (!Array.isArray(p.pins) || p.pins.length === 0) {
        issues.push(`part "${p.id}": electrical parts need at least one pin`);
      } else {
        pinsById.set(p.id, new Set(p.pins));
      }
    }
    if (p.category === "print3d" && !isNonEmptyString(p.printSettings)) {
      issues.push(`part "${p.id}": 3D-printed parts need printSettings`);
    }
  });

  if (pkg.parts.length < 10 || pkg.parts.length > 16) {
    issues.push(`expected 10–16 part lines, got ${pkg.parts.length}`);
  }
  for (const domain of ["electrical", "mechanical"]) {
    if (!domains.has(domain)) issues.push(`no ${domain} parts in the design`);
  }

  /* ---------- connections ---------- */

  const connIds = new Set<string>();
  const wired = new Set<string>();

  pkg.connections.forEach((conn, i) => {
    const where = `connections[${i}]`;
    if (!isRecord(conn)) {
      issues.push(`${where} is not an object`);
      return;
    }
    if (!isNonEmptyString(conn.id)) issues.push(`${where} has no id`);
    else if (connIds.has(conn.id)) issues.push(`${where}: duplicate connection id "${conn.id}"`);
    else connIds.add(conn.id);

    if (!NETS.has(conn.net as string)) {
      issues.push(`${where}: net must be data, power, or ground (got "${conn.net}")`);
    }
    for (const end of ["from", "to"] as const) {
      const ref = conn[end];
      if (!isRecord(ref) || !isNonEmptyString(ref.part) || !isNonEmptyString(ref.pin)) {
        issues.push(`${where}.${end} is not a {part, pin} reference`);
        continue;
      }
      const pins = pinsById.get(ref.part);
      if (!partIds.has(ref.part)) {
        issues.push(`${where}.${end} references unknown part "${ref.part}"`);
      } else if (!pins) {
        issues.push(`${where}.${end} references "${ref.part}", which has no pins`);
      } else if (!pins.has(ref.pin)) {
        issues.push(`${where}.${end}: part "${ref.part}" has no pin "${ref.pin}"`);
      } else {
        wired.add(ref.part);
      }
    }
  });

  for (const id of pinsById.keys()) {
    if (!wired.has(id)) issues.push(`electrical part "${id}" is not connected to anything`);
  }
  for (const net of ["data", "power", "ground"]) {
    if (!pkg.connections.some((c) => c.net === net)) issues.push(`no ${net} connections in the design`);
  }

  /* ---------- assembly ---------- */

  const placed = new Map<string, number>();
  const walk = (nodes: unknown, depth: number): void => {
    if (!Array.isArray(nodes)) {
      issues.push("assembly node children is not an array");
      return;
    }
    if (depth > 6) {
      issues.push("assembly tree is nested more than 6 levels deep");
      return;
    }
    for (const raw of nodes) {
      if (!isRecord(raw) || !isNonEmptyString(raw.part)) {
        issues.push("assembly node has no part reference");
        continue;
      }
      placed.set(raw.part, (placed.get(raw.part) ?? 0) + 1);
      if (raw.children !== undefined) walk(raw.children, depth + 1);
    }
  };
  walk(pkg.assembly, 0);

  for (const [id, count] of placed) {
    if (!partIds.has(id)) issues.push(`assembly references unknown part "${id}"`);
    else if (count > 1) issues.push(`part "${id}" appears ${count} times in the assembly tree`);
  }
  for (const id of partIds) {
    if (!placed.has(id)) issues.push(`part "${id}" is missing from the assembly tree`);
  }

  /* ---------- tags ---------- */

  if (pkg.tags.length < 3 || pkg.tags.length > 5) {
    issues.push(`expected 3–5 tags, got ${pkg.tags.length}`);
  }
  pkg.tags.forEach((t, i) => {
    if (!isNonEmptyString(t)) issues.push(`tags[${i}] is empty`);
    else if (t !== t.toUpperCase()) issues.push(`tags[${i}] "${t}" is not uppercase`);
  });

  /* ---------- instructions ---------- */

  const toolSet = new Set(pkg.tools.filter(isNonEmptyString));
  const usedTools = new Set<string>();

  if (pkg.instructions.length < 3 || pkg.instructions.length > 4) {
    issues.push(`expected 3–4 instruction phases, got ${pkg.instructions.length}`);
  }
  pkg.instructions.forEach((phase, i) => {
    const where = `instructions[${i}]`;
    if (!isRecord(phase) || !isNonEmptyString(phase.title) || !Array.isArray(phase.steps)) {
      issues.push(`${where} is not a phase`);
      return;
    }
    if (!isNonEmptyString(phase.id)) issues.push(`${where} has no id`);
    if (phase.steps.length < 3 || phase.steps.length > 4) {
      issues.push(`${where} ("${phase.title}") has ${phase.steps.length} steps, expected 3–4`);
    }
    phase.steps.forEach((step, j) => {
      const stepWhere = `${where}.steps[${j}]`;
      if (!isRecord(step)) {
        issues.push(`${stepWhere} is not an object`);
        return;
      }
      for (const key of ["id", "title", "detail"] as const) {
        if (!isNonEmptyString(step[key])) issues.push(`${stepWhere}: ${key} is missing or empty`);
      }
      if (!Array.isArray(step.tools) || !Array.isArray(step.parts)) {
        issues.push(`${stepWhere}: tools and parts must be arrays`);
        return;
      }
      for (const tool of step.tools) {
        if (!toolSet.has(tool as string)) issues.push(`${stepWhere} uses tool "${tool}", which is not in tools[]`);
        else usedTools.add(tool as string);
      }
      for (const id of step.parts) {
        if (!partIds.has(id as string)) issues.push(`${stepWhere} references unknown part "${id}"`);
      }
    });
  });

  for (const tool of toolSet) {
    if (!usedTools.has(tool)) issues.push(`tool "${tool}" is listed but never used in a step`);
  }
  if (pkg.assumptions.length === 0) issues.push("no assumptions listed");

  /* ---------- summary ---------- */

  if (opts.prompt) {
    const words = contentWords(opts.prompt).filter((w) => w.length >= 4);
    if (words.length) {
      const haystack = `${pkg.name} ${pkg.summary}`.toLowerCase();
      if (!words.some((w) => haystack.includes(w))) {
        issues.push("summary does not mention anything from the prompt");
      }
    }
  }

  return issues;
}

/** Throwing form, used where a failure is a bug rather than a fallback. */
export function assertValidDesign(value: unknown, opts: ValidateOptions = {}): DesignPackage {
  const issues = validateDesign(value, opts);
  if (issues.length) {
    throw new Error(`invalid design package:\n  - ${issues.join("\n  - ")}`);
  }
  return value as DesignPackage;
}
