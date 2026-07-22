/** Inline syntax understood by the intentionally small demo parser. */
export type MarkdownTokenKind = "text" | "bold" | "italic" | "strike" | "code" | "link";

/** One source-preserving Markdown token. */
export interface MarkdownToken {
  readonly kind: MarkdownTokenKind;
  /** Exact source slice; concatenating every token recreates block content. */
  readonly raw: string;
  /** Visible text inside semantic formatting. */
  readonly text: string;
  /** Sanitized destination for link tokens. */
  readonly href?: string;
}

const INLINE_MARKDOWN = /\*\*[^*\n]+\*\*|~~[^~\n]+~~|`[^`\n]+`|\*[^*\n]+\*|\[[^\]\n]+\]\([^)\n]+\)/g;

/** Allows ordinary relative URLs and a short explicit safe-scheme list. */
function safeHref(value: string): string | undefined {
  const scheme = value.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase();
  return !scheme || scheme === "http" || scheme === "https" || scheme === "mailto" ? value : undefined;
}

/** Parses non-nested inline Markdown while retaining every source character. */
export function tokenizeMarkdown(source: string): MarkdownToken[] {
  const tokens: MarkdownToken[] = [];
  let offset = 0;
  for (const match of source.matchAll(INLINE_MARKDOWN)) {
    const index = match.index ?? 0;
    if (index > offset) {
      const raw = source.slice(offset, index);
      tokens.push({ kind: "text", raw, text: raw });
    }
    const raw = match[0];
    if (raw.startsWith("**")) tokens.push({ kind: "bold", raw, text: raw.slice(2, -2) });
    else if (raw.startsWith("~~")) tokens.push({ kind: "strike", raw, text: raw.slice(2, -2) });
    else if (raw.startsWith("`")) tokens.push({ kind: "code", raw, text: raw.slice(1, -1) });
    else if (raw.startsWith("*")) tokens.push({ kind: "italic", raw, text: raw.slice(1, -1) });
    else {
      const link = raw.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = link && safeHref(link[2]!);
      tokens.push(href
        ? { kind: "link", raw, text: link![1]!, href }
        : { kind: "text", raw, text: raw });
    }
    offset = index + raw.length;
  }
  if (offset < source.length) {
    const raw = source.slice(offset);
    tokens.push({ kind: "text", raw, text: raw });
  }
  return tokens;
}
