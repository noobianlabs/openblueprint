/**
 * Per-project chat history, and the generation record an edit rebuilds from.
 *
 * Two families of key, both browser-local and both per slug:
 *   obp:chat:<slug>  the message log the chat panel renders
 *   obp:gen:<slug>   the prompt and answers the design was built from
 *
 * The gen record exists because the local engine is a pure function of
 * (prompt, answers): to change one choice you have to know the other two.
 * Nothing writes it at generation time yet, so the chat seeds it the first
 * time it sees a project — see `recordGeneration` for the hook a generator
 * should call once it wants to record the real prompt.
 *
 * Every accessor is guarded the way progress.ts is: no window on the server,
 * and a corrupt or quota-blocked store degrades to "no history" rather than
 * taking the project page down.
 */

const CHAT_PREFIX = "obp:chat:";
const GEN_PREFIX = "obp:gen:";

/** Oldest messages are dropped past this, so a long chat cannot fill the quota. */
const MAX_MESSAGES = 200;

export type ChatRole = "user" | "assistant";

/**
 * `kind` is what the message is about, not who sent it: a question and its
 * answer are both "question", an edit request and its outcome both "edit",
 * and "info" covers everything the chat says on its own behalf.
 */
export type ChatKind = "question" | "edit" | "info";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  kind: ChatKind;
  text: string;
  /** ISO timestamp. */
  at: string;
}

/** What the local engine needs to rebuild this design. */
export interface GenRecord {
  prompt: string;
  answers: Record<string, string>;
}

/* ---------- storage plumbing ---------- */

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function read(key: string): unknown {
  const store = storage();
  if (!store) return undefined;
  try {
    const raw = store.getItem(key);
    if (!raw) return undefined;
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // Full or unavailable — the conversation is still on screen, just not saved.
  }
}

function remove(key: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    /* nothing to do — the caller has already dropped its own copy */
  }
}

/* ---------- messages ---------- */

function isMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<ChatMessage>;
  return (
    typeof m.id === "string" &&
    (m.role === "user" || m.role === "assistant") &&
    (m.kind === "question" || m.kind === "edit" || m.kind === "info") &&
    typeof m.text === "string" &&
    typeof m.at === "string"
  );
}

/** Oldest first. Empty on the server or on any failure. */
export function readChat(slug: string): ChatMessage[] {
  const parsed = read(`${CHAT_PREFIX}${slug}`);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isMessage);
}

export function writeChat(slug: string, messages: ChatMessage[]): void {
  write(`${CHAT_PREFIX}${slug}`, messages.slice(-MAX_MESSAGES));
}

/** Append and persist. Returns the new log so callers can drop it into state. */
export function appendChat(slug: string, ...messages: ChatMessage[]): ChatMessage[] {
  const next = [...readChat(slug), ...messages].slice(-MAX_MESSAGES);
  writeChat(slug, next);
  return next;
}

export function clearChat(slug: string): void {
  remove(`${CHAT_PREFIX}${slug}`);
}

let messageCounter = 0;

/**
 * Message id. Unique within a browser session without needing crypto —
 * the counter breaks ties inside a single millisecond.
 */
export function makeMessageId(): string {
  messageCounter += 1;
  return `m${Date.now().toString(36)}${messageCounter.toString(36)}`;
}

export function makeMessage(role: ChatRole, kind: ChatKind, text: string): ChatMessage {
  return { id: makeMessageId(), role, kind, text, at: new Date().toISOString() };
}

/* ---------- generation record ---------- */

export function readGen(slug: string): GenRecord | undefined {
  const parsed = read(`${GEN_PREFIX}${slug}`);
  if (!parsed || typeof parsed !== "object") return undefined;
  const g = parsed as Partial<GenRecord>;
  if (typeof g.prompt !== "string") return undefined;
  const answers: Record<string, string> = {};
  if (g.answers && typeof g.answers === "object") {
    for (const [k, v] of Object.entries(g.answers as Record<string, unknown>)) {
      if (typeof v === "string") answers[k] = v;
    }
  }
  return { prompt: g.prompt, answers };
}

/**
 * Record what a design was generated from. The run view does not call this
 * yet; when it does, the chat inherits the real prompt instead of falling
 * back to the package name.
 */
export function recordGeneration(slug: string, prompt: string, answers: Record<string, string>): void {
  write(`${GEN_PREFIX}${slug}`, { prompt, answers } satisfies GenRecord);
}

export function clearGeneration(slug: string): void {
  remove(`${GEN_PREFIX}${slug}`);
}
