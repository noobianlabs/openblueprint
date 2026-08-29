/**
 * Prompt → words. Everything the local engine knows about the user's
 * intent comes out of these three functions: the subject phrase (used in
 * the title and summary), the content nouns (used for archetype matching
 * and tags), and title casing.
 */

const STOPWORDS = new Set([
  "a", "an", "the", "my", "our", "your", "some", "any", "this", "that", "these",
  "those", "it", "its", "is", "are", "be", "been", "am", "was", "were", "and",
  "or", "but", "so", "for", "to", "of", "in", "on", "at", "by", "with",
  "without", "from", "into", "onto", "over", "under", "up", "down", "out",
  "off", "as", "if", "then", "than", "when", "while", "which", "who", "what",
  "how", "can", "could", "should", "would", "will", "want", "wants", "need",
  "needs", "like", "make", "makes", "build", "builds", "design", "designs",
  "create", "creates", "me", "i", "we", "us", "please", "something", "thing",
  "project", "device", "gadget", "system", "using", "use", "uses", "based",
  "help", "give", "get", "there", "their", "about", "very", "really", "just",
]);

/** Prefixes people type before the actual noun phrase. */
const LEAD_VERBS =
  /^(please\s+)?(can you\s+|could you\s+)?(i\s+(want|need|would like)\s+(to\s+)?(build|make|design|create)?\s*)?(help me\s+)?(build|make|design|create|generate|blueprint|give me|show me)?\s*(me\s+)?(a|an|the|my|some)?\s*/i;

/** Where an English noun phrase usually stops. */
const CLAUSE_BREAK =
  /\s+(that|which|who|with|for|so|to|when|while|using|and|but|plus|featuring|able)\s+|[,;:.!?—–]/i;

const ACRONYMS: Record<string, string> = {
  led: "LED", leds: "LEDs", uv: "UV", co2: "CO2", usb: "USB", gps: "GPS",
  rfid: "RFID", nfc: "NFC", ir: "IR", pir: "PIR", oled: "OLED", lcd: "LCD",
  rgb: "RGB", diy: "DIY", ac: "AC", dc: "DC", pwm: "PWM", iot: "IoT",
  wifi: "Wi-Fi", "e-ink": "E-Ink", "3d": "3D", ph: "pH", pc: "PC", tv: "TV",
  cnc: "CNC", esp32: "ESP32", mqtt: "MQTT", ble: "BLE", "hi-fi": "Hi-Fi",
};

const SMALL_WORDS = new Set([
  "a", "an", "the", "and", "or", "of", "for", "to", "in", "on", "at", "with",
  "by", "from",
]);

function normalize(prompt: string): string {
  return prompt.trim().replace(/\s+/g, " ");
}

/**
 * The user's subject, lowercase, ≤5 words — e.g.
 * "a self-watering desk planter that monitors soil moisture"
 * → "self-watering desk planter".
 */
export function subjectPhrase(prompt: string): string {
  const cleaned = normalize(prompt);
  if (!cleaned) return "";

  const stripped = cleaned.replace(LEAD_VERBS, "");
  const head = stripped.split(CLAUSE_BREAK)[0] ?? stripped;

  const words = head
    .toLowerCase()
    .replace(/["'`()[\]{}]/g, "")
    .split(" ")
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}%-]+$/gu, ""))
    .filter(Boolean)
    .filter((w, i, arr) => !(i === 0 && SMALL_WORDS.has(w) && arr.length > 1));

  // The head noun sits at the end of an English noun phrase, so trim
  // from the front when the phrase runs long.
  const capped = words.length > 5 ? words.slice(words.length - 5) : words;
  return capped.join(" ");
}

/** Content words from the whole prompt, deduped, in first-seen order. */
export function contentWords(prompt: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of normalize(prompt).toLowerCase().split(/[^\p{L}\p{N}%-]+/u)) {
    const w = raw.replace(/^-+|-+$/g, "");
    if (w.length < 3 || STOPWORDS.has(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

export function titleCase(phrase: string): string {
  const words = phrase.split(" ").filter(Boolean);
  return words
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (ACRONYMS[lower]) return ACRONYMS[lower];
      if (i > 0 && i < words.length - 1 && SMALL_WORDS.has(lower)) return lower;
      return lower
        .split("-")
        .map((seg) =>
          ACRONYMS[seg] ?? (seg ? seg[0].toUpperCase() + seg.slice(1) : seg),
        )
        .join("-");
    })
    .join(" ");
}

/**
 * Subject and title for a design.
 *
 * The extracted noun phrase is used when it carries at least one content
 * word. When it does not — "something to make my morning less annoying"
 * extracts to "something" — the prompt's first content word is pinned in
 * front of the archetype's own subject instead, so the design is still
 * named after what was asked for.
 */
export function resolveSubject(
  prompt: string,
  fallbackSubject: string,
  fallbackTitle: string,
): { subject: string; title: string } {
  const phrase = subjectPhrase(prompt);
  const words = contentWords(prompt);

  if (phrase && contentWords(phrase).length > 0) {
    const cased = titleCase(phrase);
    return {
      subject: phrase,
      title: cased.length > 48 || !/\p{L}/u.test(cased) ? fallbackTitle : cased,
    };
  }

  const head = words.find((w) => w.length >= 4) ?? words[0];
  if (!head) return { subject: fallbackSubject, title: fallbackTitle };

  const subject = `${head} ${fallbackSubject}`;
  const cased = titleCase(subject);
  return { subject, title: cased.length > 48 ? fallbackTitle : cased };
}

/** Uppercase feature tag, e.g. "SOLAR CHARGING". */
export function tag(text: string): string {
  return text.toUpperCase();
}
