/**
 * Seeded word generator for the mock model.
 *
 * Completions finish the current token, then add a short run of words and
 * punctuation. Passages are the same generator used when a tool streams new
 * block text. Nothing here calls a network.
 *
 * @module
 */

/** Readable tails so a partial word grows by a few characters. */
const WORD_TAILS = ["ing", "ed", "ly", "er", "s", "tion", "ck", "ve", "al", "ous", "ish", "en"];

/** Small lexicon. The mock samples it the way a model samples tokens. */
const WORDS = [
  "amber", "bridge", "cinder", "drift", "ember", "field", "garden", "harbor",
  "ivory", "junction", "kindle", "lantern", "meadow", "north", "orbit", "pebble",
  "quiet", "river", "signal", "timber", "umber", "valley", "willow", "yellow",
  "archive", "button", "canvas", "delta", "editor", "folder", "glossary", "horizon",
  "index", "journal", "kernel", "ledger", "margin", "notebook", "outline", "parcel",
  "quartz", "ribbon", "shadow", "thread", "update", "vessel", "window", "year",
  "bronze", "copper", "dawn", "echo", "frost", "grove", "hearth", "island",
  "jasper", "kettle", "lattice", "mirror", "needle", "orchard", "prairie", "quart",
] as const;

/** Terminal marks a completion or passage may end with. */
const ENDINGS = [".", "...", "!", "?"] as const;

/** Deterministic generator. The same seed replays the same words. */
export interface Rng {
  /** @returns A float in `[0, 1)`. */
  next(): number;
  /** @param max - Exclusive upper bound. @returns An integer in `[0, max)`. */
  int(max: number): number;
  /** @param items - Non-empty list. @returns One entry. */
  pick<T>(items: readonly T[]): T;
}

/**
 * Mulberry32 generator.
 *
 * @param seed - Any integer. Non-finite values collapse to `1`.
 * @returns Deterministic random source.
 */
export function createRng(seed: number): Rng {
  let state = (Number.isFinite(seed) ? seed : 1) >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (max) => Math.floor(next() * max),
    pick: (items) => items[Math.floor(next() * items.length)]!,
  };
}

/**
 * FNV-1a hash so a prompt can seed the mock without a global counter.
 *
 * @param text - Source text.
 * @returns Unsigned 32-bit hash.
 */
export function hashString(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Ghost-text suffix for the caret.
 *
 * When `prefix` ends in a word character the suffix starts by finishing that
 * word (a few letters). It then adds 2–5 words, a comma or semicolon, and a
 * terminal mark such as `.` or `...`.
 *
 * @param prefix - Document text before the caret.
 * @param rng - Seeded generator.
 * @returns Text to insert at the caret. It does not repeat `prefix`.
 */
export function buildCompletion(prefix: string, rng: Rng): string {
  const endsWithWord = /[A-Za-z0-9]$/.test(prefix);
  const parts: string[] = [];
  if (endsWithWord) parts.push(rng.pick(WORD_TAILS));
  const count = 2 + rng.int(4);
  for (let index = 0; index < count; index += 1) {
    const word = rng.pick(WORDS);
    if (index === 0) {
      parts.push(endsWithWord || prefix.endsWith(" ") || prefix.length === 0 ? (endsWithWord ? ` ${word}` : word) : ` ${word}`);
    } else if (index === 1) {
      parts.push(`, ${word}`);
    } else {
      parts.push(rng.next() < 0.5 ? ` ${word}` : `; ${word}`);
    }
  }
  parts.push(rng.pick(ENDINGS));
  return parts.join("");
}

/**
 * Short block passage: several words, one comma, and a closing mark.
 *
 * @param rng - Seeded generator.
 * @returns A sentence the agent can stream into a block.
 */
export function buildPassage(rng: Rng): string {
  const count = 6 + rng.int(7);
  const words: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const word = rng.pick(WORDS);
    words.push(index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word);
  }
  if (words.length > 4) words[2] = `${words[2]},`;
  return `${words.join(" ")}${rng.pick(ENDINGS)}`;
}

/**
 * Splits text into whitespace and non-whitespace tokens for frame streaming.
 *
 * @param text - Source text.
 * @returns Tokens that concatenate back to `text`.
 */
export function splitTokens(text: string): string[] {
  return text.match(/\s+|\S+/g) ?? [];
}
