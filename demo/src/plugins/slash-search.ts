import type { SlashCommand } from "@chulane/rivto";

/** One command paired with its stable declaration index and search score. */
export interface RankedSlashCommand {
  readonly command: SlashCommand;
  readonly score: number;
  readonly order: number;
}

/** Normalizes user-visible command text without applying locale-specific rules. */
export function normalizeSlashText(value: string): string {
  return value.normalize("NFKC").toLowerCase();
}

/** Maximum typo distance used by the demo's Logseq-style command search. */
export function slashSearchDistance(queryLength: number): number {
  if (queryLength <= 2) return 0;
  if (queryLength <= 5) return 1;
  if (queryLength <= 9) return 2;
  return 3;
}

/** Small dependency-free Levenshtein implementation for short menu strings. */
export function levenshtein(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length]!;
}

/** Scores one term: prefix, substring, then a bounded typo match. */
function scoreTerm(term: string, query: string): number | undefined {
  if (term.startsWith(query)) return 0;
  if (term.includes(query)) return 100;

  const distance = Math.min(
    levenshtein(query, term),
    levenshtein(query, term.slice(0, query.length)),
  );
  return distance <= slashSearchDistance(query.length) ? 200 + distance : undefined;
}

/**
 * Ranks available commands while preserving declaration order for equal hits.
 *
 * Complete titles, individual title words, and keywords are separate search
 * terms. The command manager remains UI-agnostic; this fuzzy policy belongs to
 * the demo popup and can be replaced without changing editor data APIs.
 */
export function rankSlashCommands(
  commands: readonly SlashCommand[],
  rawQuery: string,
): RankedSlashCommand[] {
  const query = normalizeSlashText(rawQuery);
  if (!query) return commands.map((command, order) => ({ command, score: 0, order }));

  return commands.flatMap((command, order) => {
    const title = normalizeSlashText(command.title);
    const terms = [title, ...title.split(/\s+/), ...(command.keywords ?? []).map(normalizeSlashText)];
    const scores = terms.flatMap((term) => {
      const score = scoreTerm(term, query);
      return score === undefined ? [] : [score];
    });
    return scores.length ? [{ command, order, score: Math.min(...scores) }] : [];
  }).sort((left, right) => left.score - right.score || left.order - right.order);
}

/** True while the two-character no-result grace window remains open. */
export function keepNoResultMenuOpen(queryLength: number, lastMatchedLength: number): boolean {
  return queryLength - lastMatchedLength <= 2;
}
