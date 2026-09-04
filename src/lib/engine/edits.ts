/**
 * Chat answers and design edits, derived from the package itself.
 *
 * Two jobs, both deterministic and both deliberately narrow:
 *
 *   answerQuestion  reads a fact out of the DesignPackage — cost, power
 *                   chain, what a part does, how it is wired, tools, print
 *                   settings, part count. Nothing is invented: every number
 *                   and every name comes from the package on screen.
 *
 *   parseEdit       maps a request onto the archetype's OWN question and
 *                   option space, then rebuilds through buildLocal. The
 *                   local engine is a pure function of (prompt, answers),
 *                   so the only edits it can honestly make are the ones its
 *                   questions already offer. Anything else is refused with
 *                   the list of what it CAN do rather than faked.
 *
 * `answerQuestion` and `parseEdit` are pure. `applyEdit` is the one impure
 * entry point: it persists through saveProject so the rest of the app sees
 * the change. Version snapshotting is Card F's concern — if saveProject
 * grows snapshot behavior, every edit here inherits it for free.
 */

import type { Connection, DesignPackage, Part, ProjectRecord } from "../design/schema";
import {
  CATEGORY_META,
  bomRollup,
  fmtCost,
  partCount,
  subtotal,
  totalCost,
} from "../design/schema";
import type { RefineQuestion } from "./types";
import { buildLocal, planLocal } from "./local";
import { makeUserRecord, saveProject } from "../store";
import { readGen, recordGeneration } from "../chat-store";
import type { GenRecord } from "../chat-store";

/* ------------------------------------------------------------------ *
 * text plumbing
 * ------------------------------------------------------------------ */

/**
 * Words carrying no signal for either matching pass. Question words are in
 * here too: "what powers the display" targets the display, not the "what".
 */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "in", "on", "to", "for", "from", "with", "it", "its",
  "is", "are", "was", "be", "do", "does", "did", "can", "could", "should", "would", "will",
  "what", "whats", "which", "why", "how", "where", "when", "who", "much", "many",
  "i", "me", "my", "you", "your", "we", "this", "that", "these", "those", "there",
  "please", "just", "only", "some", "any", "all", "more", "less", "new", "instead",
  "want", "need", "like", "make", "made", "use", "using", "used", "uses", "get", "got",
  "design", "project", "build", "built", "thing", "stuff", "part", "parts", "please",
  "change", "swap", "switch", "replace", "add", "remove", "set", "put", "give", "turn",
]);

/**
 * Lowercase alphanumeric tokens. Hyphenated compounds yield their pieces and
 * the joined form, so "Wi-Fi" and "wifi" and "USB-C" and "usbc" all meet.
 */
function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const chunk of text.toLowerCase().split(/[^a-z0-9-]+/)) {
    if (!chunk) continue;
    const joined = chunk.replace(/-/g, "");
    for (const piece of chunk.split("-")) if (piece) out.push(piece);
    if (joined && !out.includes(joined)) out.push(joined);
  }
  return out;
}

function contentTokens(text: string): string[] {
  const seen = new Set<string>();
  for (const t of tokenize(text)) {
    if (t.length < 3 || STOPWORDS.has(t)) continue;
    seen.add(t);
  }
  return [...seen];
}

/** Everyday words for things the option lists name differently. */
const SYNONYMS: Record<string, string[]> = {
  mains: ["adapter", "wall"],
  wall: ["adapter"],
  outlet: ["adapter"],
  plug: ["adapter"],
  plugged: ["adapter"],
  psu: ["adapter"],
  batteries: ["battery", "lipo", "cells"],
  battery: ["lipo", "cells"],
  rechargeable: ["battery", "lipo"],
  cordless: ["battery", "lipo"],
  portable: ["battery", "lipo", "bank"],
  screen: ["display", "oled"],
  monitor: ["display"],
  button: ["buttons"],
  buttons: ["button"],
  wireless: ["wifi"],
  radio: ["wifi"],
  sunlight: ["solar"],
  motor: ["servo", "stepper"],
  relay: ["relay"],
  quiet: ["silent"],
  vibration: ["haptic"],
  sound: ["buzzer", "piezo"],
  beep: ["buzzer"],
};

function expand(tokens: string[]): Set<string> {
  const out = new Set(tokens);
  for (const t of tokens) for (const extra of SYNONYMS[t] ?? []) out.add(extra);
  return out;
}

function list(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/* ------------------------------------------------------------------ *
 * part lookup
 * ------------------------------------------------------------------ */

type PartLookup =
  | { kind: "found"; part: Part }
  | { kind: "ambiguous"; parts: Part[] }
  | { kind: "none" };

/**
 * Fuzzy part match. Identity fields (id, name, role, category label) score
 * heavily; the description scores lightly, so "the temperature sensor" can
 * still find a part whose name is only a part number.
 */
function findPart(pkg: DesignPackage, text: string): PartLookup {
  const query = contentTokens(text);
  if (query.length === 0) return { kind: "none" };

  let best = 0;
  let winners: Part[] = [];

  for (const part of pkg.parts) {
    const identity = new Set(
      tokenize(`${part.id} ${part.name} ${part.role} ${CATEGORY_META[part.category].label}`),
    );
    const described = new Set(tokenize(part.description));
    let score = 0;
    for (const token of query) {
      if (identity.has(token)) score += 3;
      else if ([...identity].some((h) => h.length >= 4 && (h.startsWith(token) || token.startsWith(h)))) score += 1;
      else if (described.has(token)) score += 1;
    }
    if (score > best) {
      best = score;
      winners = [part];
    } else if (score === best && score > 0) {
      winners.push(part);
    }
  }

  if (best < 3) return { kind: "none" };
  if (winners.length > 1) return { kind: "ambiguous", parts: winners };
  return { kind: "found", part: winners[0] };
}

/* ------------------------------------------------------------------ *
 * topic detection
 * ------------------------------------------------------------------ */

export type AnswerTopic =
  | "cost"
  | "power"
  | "wiring"
  | "purpose"
  | "print"
  | "tools"
  | "count"
  | "unknown";

const TOPIC_RULES: { topic: Exclude<AnswerTopic, "unknown">; patterns: [RegExp, number][] }[] = [
  {
    topic: "count",
    patterns: [
      [/how many (parts|components|pieces|items)/, 4],
      [/\bpart count\b/, 4],
      [/\bhow many\b/, 2],
      [/\bbom\b/, 1],
    ],
  },
  {
    topic: "cost",
    patterns: [
      [/\bcosts?\b/, 3],
      [/\bprices?\b/, 3],
      [/how much/, 3],
      [/\bexpensive\b/, 3],
      [/\bcheape?(r|st)?\b/, 3],
      [/\$/, 2],
      [/\bbudget\b/, 1],
      [/\btotal\b/, 1],
      [/\bbom\b/, 1],
    ],
  },
  {
    topic: "power",
    patterns: [
      [/power budget/, 4],
      [/\bpowers?\b|\bpowered\b|\bpowering\b/, 3],
      [/\bvolts?\b|\bvoltage\b/, 3],
      [/\brails?\b/, 2],
      [/\bbatter(y|ies)\b/, 2],
      [/\bsupply\b|\bsupplies\b/, 2],
      [/\bcurrent\b|\bamps?\b|\bmilliamps?\b/, 2],
      [/\bfeeds?\b|\bfed\b/, 1],
    ],
  },
  {
    topic: "wiring",
    patterns: [
      [/\bwir(e|ed|es|ing)\b/, 3],
      [/\bconnect(s|ed|ion|ions)?\b/, 3],
      [/\bpins?\b|\bpinout\b/, 3],
      [/\bhooked\b/, 2],
      [/\bi2c\b|\bspi\b|\bgpio\b|\badc\b|\bpwm\b/, 2],
      [/\bnets?\b/, 1],
    ],
  },
  {
    topic: "print",
    patterns: [
      [/print settings/, 4],
      [/\bprints?\b|\bprinted\b|\bprinting\b/, 3],
      [/\bfilament\b|\binfill\b|\bpla\b|\bpetg\b|\babs\b|\bnozzle\b/, 3],
      [/\bslicer\b|\bperimeters?\b/, 2],
      [/\bmaterial\b|\blayers?\b/, 1],
    ],
  },
  {
    topic: "tools",
    patterns: [
      [/\btools?\b|\btooling\b/, 3],
      [/\bequipment\b/, 3],
      [/what do i need/, 2],
      [/\bsolder(ing)?\b/, 1],
    ],
  },
  {
    topic: "purpose",
    patterns: [
      [/what (does|do)\b/, 3],
      [/\bwhy\b/, 3],
      [/\bpurpose\b|\brole\b|\bjob\b/, 3],
      [/what (is|are)\b/, 2],
      [/what.s\b/, 2],
      [/\bfor\?/, 1],
    ],
  },
];

function detectTopic(text: string): AnswerTopic {
  const lower = text.toLowerCase();
  let best: AnswerTopic = "unknown";
  let bestScore = 0;
  for (const rule of TOPIC_RULES) {
    let score = 0;
    for (const [pattern, weight] of rule.patterns) if (pattern.test(lower)) score += weight;
    if (score > bestScore) {
      bestScore = score;
      best = rule.topic;
    }
  }
  return bestScore >= 2 ? best : "unknown";
}

/* ------------------------------------------------------------------ *
 * answers
 * ------------------------------------------------------------------ */

export interface DerivedAnswer {
  topic: AnswerTopic;
  text: string;
}

const CAPABILITIES =
  "I can answer questions about cost, parts, wiring, power and tools for this design — " +
  "try \"how much does it cost\", \"what does the BME280 do\", \"how is the OLED connected\", " +
  "\"what powers the display\", \"what tools do I need\", \"what are the print settings\", " +
  "or \"how many parts are there\".";

function costAnswer(pkg: DesignPackage): string {
  const total = totalCost(pkg);
  const units = pkg.parts.reduce((sum, p) => sum + p.qty, 0);
  const domains = bomRollup(pkg)
    .map((g) => `${g.domain} ${fmtCost(g.cost)} over ${g.lineCount} lines`)
    .join(", ");
  const dearest = [...pkg.parts]
    .sort((a, b) => subtotal(b) - subtotal(a))
    .slice(0, 3)
    .map((p) => `${p.name} ${fmtCost(subtotal(p))}${p.qty > 1 ? ` (${p.qty}×)` : ""}`);
  return (
    `${pkg.name} totals ${fmtCost(total)} across ${partCount(pkg)} part lines (${units} units). ` +
    `By domain: ${domains}. The biggest lines are ${list(dearest)}. ` +
    "These are the BOM's own estimates — no shipping, no tax, and no filament cost beyond the printed parts' own estimates."
  );
}

/** Power and ground edges, treated as undirected: wire direction varies by builder. */
function powerEdges(pkg: DesignPackage, partId: string): { conn: Connection; other: string; pin: string; otherPin: string }[] {
  const out: { conn: Connection; other: string; pin: string; otherPin: string }[] = [];
  for (const conn of pkg.connections) {
    if (conn.net !== "power" && conn.net !== "ground") continue;
    if (conn.from.part === partId) out.push({ conn, other: conn.to.part, pin: conn.from.pin, otherPin: conn.to.pin });
    else if (conn.to.part === partId) out.push({ conn, other: conn.from.part, pin: conn.to.pin, otherPin: conn.from.pin });
  }
  return out;
}

function nameOf(pkg: DesignPackage, id: string): string {
  return pkg.parts.find((p) => p.id === id)?.name ?? id;
}

/** Shortest hop path from a part back to the nearest power-category part. */
function traceToSupply(pkg: DesignPackage, start: string): { id: string; label: string }[] | null {
  const isSupply = (id: string) => pkg.parts.find((p) => p.id === id)?.category === "power";
  const seen = new Set([start]);
  let frontier: { id: string; path: { id: string; label: string }[] }[] = [{ id: start, path: [] }];

  for (let depth = 0; depth < 8 && frontier.length > 0; depth++) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      for (const edge of powerEdges(pkg, node.id)) {
        if (seen.has(edge.other)) continue;
        seen.add(edge.other);
        const path = [...node.path, { id: edge.other, label: edge.conn.label ?? edge.conn.net }];
        if (isSupply(edge.other)) return path;
        next.push({ id: edge.other, path });
      }
    }
    frontier = next;
  }
  return null;
}

function powerAnswer(pkg: DesignPackage, target: Part | null): string {
  const supplies = pkg.parts.filter((p) => p.category === "power");
  const rails = [
    ...new Set(
      pkg.connections
        .filter((c) => c.net === "power" && c.label)
        .map((c) => c.label as string),
    ),
  ];

  if (!target) {
    const chain = supplies.length
      ? `The power chain is ${supplies.map((p) => p.name).join(" → ")}.`
      : "This design has no parts filed under power — it is fed from whatever the enclosing system supplies.";
    const railLine = rails.length ? ` Power nets in the design carry ${list(rails)}.` : "";
    return (
      `${chain}${railLine} ` +
      "The BOM records parts and nets, not current draw, so I can tell you the supply chain but not a milliamp budget — " +
      "name a part and I will trace how it is fed."
    );
  }

  if (target.domain === "mechanical") {
    return `${target.name} is a mechanical part (${target.role}); nothing feeds it. ${
      supplies.length ? `The electrical side runs from ${list(supplies.map((p) => p.name))}.` : ""
    }`.trim();
  }

  const edges = powerEdges(pkg, target.id);
  if (edges.length === 0) {
    return `${target.name} has no power or ground connection in this design — it appears only on signal nets. That is worth checking before you build it.`;
  }

  const feeds = edges
    .filter((e) => e.conn.net === "power")
    .map((e) => `${e.pin} from ${nameOf(pkg, e.other)}.${e.otherPin}${e.conn.label ? ` (${e.conn.label})` : ""}`);
  const grounds = edges.filter((e) => e.conn.net === "ground").map((e) => `${e.pin} to ${nameOf(pkg, e.other)}.${e.otherPin}`);
  const trace = traceToSupply(pkg, target.id);
  const traceLine = trace
    ? ` Traced back, that reaches the supply as ${target.name} ← ${trace
        .map((hop) => `${nameOf(pkg, hop.id)} (${hop.label})`)
        .join(" ← ")}.`
    : "";

  return (
    `${target.name} takes ${feeds.length ? list(feeds) : "no dedicated supply line"}` +
    `${grounds.length ? `, and grounds ${list(grounds)}` : ""}.${traceLine} ` +
    "Current draw is not in the BOM, so treat this as the supply path rather than a power budget."
  );
}

function wiringAnswer(pkg: DesignPackage, target: Part | null): string {
  if (!target) {
    const byNet = (["data", "power", "ground"] as const).map(
      (net) => `${pkg.connections.filter((c) => c.net === net).length} ${net}`,
    );
    return (
      `This design has ${pkg.connections.length} connections — ${list(byNet)}. ` +
      "Name a part and I will list its lines, for example \"how is the OLED connected\"."
    );
  }

  const lines = pkg.connections
    .filter((c) => c.from.part === target.id || c.to.part === target.id)
    .map((c) => {
      const mine = c.from.part === target.id ? c.from : c.to;
      const other = c.from.part === target.id ? c.to : c.from;
      return `${mine.pin} → ${nameOf(pkg, other.part)}.${other.pin} [${c.net}${c.label ? ` · ${c.label}` : ""}]`;
    });

  if (lines.length === 0) {
    return `${target.name} has no connections in the wiring diagram${
      target.domain === "mechanical" ? " — it is a mechanical part." : ", which is unusual for an electrical part."
    }`;
  }
  return `${target.name} (${target.role}) has ${lines.length} connection${lines.length === 1 ? "" : "s"}:\n${lines
    .map((l) => `  ${l}`)
    .join("\n")}`;
}

function purposeAnswer(pkg: DesignPackage, target: Part | null, text: string): DerivedAnswer {
  if (!target) {
    const lookup = findPart(pkg, text);
    if (lookup.kind === "ambiguous") {
      return {
        topic: "purpose",
        text: `Several parts match that: ${list(lookup.parts.map((p) => p.name))}. Which one?`,
      };
    }
    return {
      topic: "unknown",
      text:
        `Nothing in this design matches that name. The BOM has ${list(pkg.parts.map((p) => p.name))}. ` +
        CAPABILITIES,
    };
  }
  const cost = `${fmtCost(subtotal(target))}${target.qty > 1 ? ` for ${target.qty}` : ""}`;
  const print = target.printSettings ? ` Printed as ${target.printSettings}.` : "";
  return {
    topic: "purpose",
    text: `${target.name} is the ${target.role.toLowerCase()} of this design. ${target.description} It is a ${CATEGORY_META[target.category].label.toLowerCase()} part on the ${target.domain} side, ${cost}.${print}`,
  };
}

function printAnswer(pkg: DesignPackage): string {
  const printed = pkg.parts.filter((p) => p.category === "print3d");
  if (printed.length === 0) return `${pkg.name} has no 3D-printed parts in its BOM.`;
  const lines = printed.map(
    (p) => `  ${p.name}${p.qty > 1 ? ` ×${p.qty}` : ""} — ${p.printSettings ?? "no settings recorded"}`,
  );
  return `${printed.length} printed part${printed.length === 1 ? "" : "s"}:\n${lines.join("\n")}`;
}

function toolsAnswer(pkg: DesignPackage): string {
  if (pkg.tools.length === 0) return "No tools are listed for this design.";
  return `The instructions call for ${pkg.tools.length} tools: ${list(pkg.tools)}. Every one of them appears in at least one build step.`;
}

function countAnswer(pkg: DesignPackage): string {
  const units = pkg.parts.reduce((sum, p) => sum + p.qty, 0);
  const byCategory = [...new Set(pkg.parts.map((p) => p.category))].map(
    (c) => `${pkg.parts.filter((p) => p.category === c).length} ${CATEGORY_META[c].label.toLowerCase()}`,
  );
  return `${partCount(pkg)} part lines, ${units} units in total: ${list(byCategory)}. The wiring diagram closes ${pkg.connections.length} connections between them.`;
}

/**
 * Answer a question from the package. Never guesses: an unrecognised
 * question returns topic "unknown" and says what it can do instead.
 */
export function answerQuestion(pkg: DesignPackage, text: string): DerivedAnswer {
  const topic = detectTopic(text);
  const lookup = findPart(pkg, text);
  const target = lookup.kind === "found" ? lookup.part : null;

  if (lookup.kind === "ambiguous" && (topic === "power" || topic === "wiring" || topic === "purpose")) {
    return {
      topic,
      text: `Several parts match that: ${list(lookup.parts.map((p) => p.name))}. Which one did you mean?`,
    };
  }

  switch (topic) {
    case "cost":
      return { topic, text: costAnswer(pkg) };
    case "power":
      return { topic, text: powerAnswer(pkg, target) };
    case "wiring":
      return { topic, text: wiringAnswer(pkg, target) };
    case "purpose":
      return purposeAnswer(pkg, target, text);
    case "print":
      return { topic, text: printAnswer(pkg) };
    case "tools":
      return { topic, text: toolsAnswer(pkg) };
    case "count":
      return { topic, text: countAnswer(pkg) };
    case "unknown":
      // A bare part name with no question words still deserves an answer.
      if (target) return purposeAnswer(pkg, target, text);
      return { topic: "unknown", text: CAPABILITIES };
  }
}

/* ------------------------------------------------------------------ *
 * edits
 * ------------------------------------------------------------------ */

export interface EditMatch {
  questionId: string;
  question: string;
  option: string;
}

export type EditResult =
  | {
      ok: true;
      pkg: DesignPackage;
      /** Full answer set for the rebuild — persist this, edits accumulate. */
      answers: Record<string, string>;
      match: EditMatch;
      description: string;
    }
  | { ok: false; reason: string };

/** The archetype's own questions for a prompt — the whole edit vocabulary. */
export function editVocabulary(prompt: string): RefineQuestion[] {
  return planLocal(prompt).questions;
}

function vocabularyText(questions: RefineQuestion[]): string {
  const lines = questions.map((q) => `  ${q.question} ${q.options.join(" / ")}`);
  return `What I can change on this design:\n${lines.join("\n")}\nAsk for one of those and I will rebuild the package around it.`;
}

/** Added and removed part names between two packages. */
function partDelta(before: DesignPackage, after: DesignPackage): { added: string[]; removed: string[] } {
  const beforeIds = new Set(before.parts.map((p) => p.id));
  const afterIds = new Set(after.parts.map((p) => p.id));
  return {
    added: after.parts.filter((p) => !beforeIds.has(p.id)).map((p) => p.name),
    removed: before.parts.filter((p) => !afterIds.has(p.id)).map((p) => p.name),
  };
}

/**
 * Map an edit request onto the archetype's option space and rebuild.
 *
 * `answers` is the design's current answer set: it is what makes the rebuild
 * change one choice rather than resetting the other two.
 */
export function parseEdit(
  prompt: string,
  pkg: DesignPackage,
  text: string,
  answers: Record<string, string> = {},
): EditResult {
  const questions = editVocabulary(prompt);
  const wanted = expand(contentTokens(text));

  let best: { q: RefineQuestion; option: string; hits: number; ratio: number } | null = null;

  for (const q of questions) {
    for (const option of q.options) {
      const optionTokens = contentTokens(option);
      if (optionTokens.length === 0) continue;
      const hits = optionTokens.filter((t) => wanted.has(t)).length;
      if (hits === 0) continue;
      const ratio = hits / optionTokens.length;
      // Ties resolve by declaration order, so the same sentence always lands
      // on the same option.
      if (!best || hits > best.hits || (hits === best.hits && ratio > best.ratio)) {
        best = { q, option, hits, ratio };
      }
    }
  }

  if (!best) {
    return {
      ok: false,
      reason:
        `I cannot do that. The local engine builds designs from a fixed set of choices, and nothing in "${text.trim()}" matches one of them.\n\n` +
        vocabularyText(questions),
    };
  }

  const current = answers[best.q.id];
  if (current === best.option) {
    return {
      ok: false,
      reason: `This design already uses "${best.option}" for "${best.q.question}" — nothing to change.\n\n${vocabularyText(questions)}`,
    };
  }

  const next = { ...answers, [best.q.id]: best.option };
  const rebuilt = buildLocal(prompt, next);
  const delta = partDelta(pkg, rebuilt);
  const deltaText = [
    delta.added.length ? `Added ${list(delta.added)}` : "",
    delta.removed.length ? `removed ${list(delta.removed)}` : "",
  ]
    .filter(Boolean)
    .join("; ");

  return {
    ok: true,
    pkg: rebuilt,
    answers: next,
    match: { questionId: best.q.id, question: best.q.question, option: best.option },
    description: `Rebuilt with ${best.q.question} ${best.option}.${deltaText ? ` ${deltaText}.` : " The BOM is unchanged; the summary and wiring reflect the new choice."}`,
  };
}

/* ------------------------------------------------------------------ *
 * generation record
 * ------------------------------------------------------------------ */

/**
 * Recover the answers a package was built from, by rebuilding every
 * combination and comparing part sets. An exact hit is the real answer set;
 * anything else returns empty rather than a plausible-looking guess, because
 * a wrong "current answer" would make the next edit lie about what changed.
 */
export function inferAnswers(prompt: string, pkg: DesignPackage): Record<string, string> {
  const questions = editVocabulary(prompt);
  const combos = questions.reduce((n, q) => n * q.options.length, 1);
  // Three questions of three or four options each; the guard is for an
  // archetype that grows past what is worth brute-forcing.
  if (combos > 81) return {};

  const target = [...pkg.parts.map((p) => p.id)].sort().join(",");
  let candidates: Record<string, string>[] = [{}];
  for (const q of questions) {
    candidates = candidates.flatMap((base) => q.options.map((option) => ({ ...base, [q.id]: option })));
  }

  for (const answers of candidates) {
    try {
      const built = buildLocal(prompt, answers);
      if ([...built.parts.map((p) => p.id)].sort().join(",") === target) return answers;
    } catch {
      // A combination an archetype rejects is simply not the one we want.
    }
  }
  return {};
}

/**
 * The gen record for a project, created on first sight if missing.
 *
 * Seeds and anything generated before this existed have no stored prompt, so
 * the package name stands in — matchArchetype reads it well enough to land on
 * the right archetype and therefore the right question set.
 */
export function ensureGen(slug: string, pkg: DesignPackage): GenRecord {
  const stored = readGen(slug);
  if (stored) return stored;
  const prompt = pkg.name;
  const record: GenRecord = { prompt, answers: inferAnswers(prompt, pkg) };
  recordGeneration(slug, record.prompt, record.answers);
  return record;
}

/* ------------------------------------------------------------------ *
 * applying an edit
 * ------------------------------------------------------------------ */

export type ApplyResult =
  | {
      ok: true;
      record: ProjectRecord;
      /** True when the source was a seed and the edit landed on a new copy. */
      forked: boolean;
      description: string;
      match: EditMatch;
    }
  | { ok: false; reason: string };

/**
 * Parse, rebuild, and persist.
 *
 * Seeds fork: /p/[slug] resolves seeds ahead of stored projects, so saving an
 * edited seed under its own slug would write a record nothing could ever
 * reach. Editing one therefore produces a copy in your projects, the same
 * thing the COPY button does, and the caller navigates to it.
 */
export function applyEdit(record: ProjectRecord, text: string): ApplyResult {
  const gen = ensureGen(record.slug, record.pkg);
  const result = parseEdit(gen.prompt, record.pkg, text, gen.answers);
  if (!result.ok) return result;

  if (record.source === "seed") {
    const forked = makeUserRecord(result.pkg, gen.prompt);
    saveProject(forked);
    recordGeneration(forked.slug, gen.prompt, result.answers);
    return {
      ok: true,
      record: forked,
      forked: true,
      description: `${result.description} ${record.pkg.name} is a community design, so the edit went into your own copy rather than changing the original.`,
      match: result.match,
    };
  }

  const updated: ProjectRecord = { ...record, pkg: result.pkg };
  saveProject(updated);
  recordGeneration(record.slug, gen.prompt, result.answers);
  return { ok: true, record: updated, forked: false, description: result.description, match: result.match };
}

export { CAPABILITIES };
