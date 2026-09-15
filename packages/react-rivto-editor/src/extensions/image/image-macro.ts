/**
 * Canonical inline image macro parsing, serialization, and Markdown AST conversion.
 *
 * The grammar intentionally accepts only generated attribute order so malformed
 * or hand-written near-matches remain visible instead of being interpreted
 * ambiguously. String values use JSON quoting and sizes are positive pixels.
 *
 * @module
 */

/** Portable image metadata shared by inline macros and standalone images. */
export interface ImageReference {
  readonly uri: string;
  readonly alt?: string;
  readonly width?: number;
  readonly height?: number;
}

/** One parsed image macro and its source range. */
export interface ParsedImageMacro extends ImageReference {
  readonly start: number;
  readonly end: number;
}

const QUOTED_STRING = '"(?:\\\\.|[^"\\\\])*"';
const IMAGE_MACRO_PATTERN = new RegExp(
  `\\{\\{image\\s+path=(${QUOTED_STRING})(?:\\s+alt=(${QUOTED_STRING}))?(?:\\s+width=(\\d+))?(?:\\s+height=(\\d+))?\\}\\}`,
  "g",
);

/** Returns a finite positive integer or no value. */
function positiveInteger(value: string | undefined): number | undefined {
  const parsed = value === undefined ? undefined : Number(value);
  return parsed !== undefined && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/** Parses every valid canonical image macro in source order. */
export function parseImageMacros(source: string): ParsedImageMacro[] {
  const macros: ParsedImageMacro[] = [];
  for (const match of source.matchAll(IMAGE_MACRO_PATTERN)) {
    const start = match.index;
    const width = positiveInteger(match[3]);
    const height = positiveInteger(match[4]);
    if (start === undefined || (match[3] && !width) || (match[4] && !height)) continue;
    try {
      const uri = JSON.parse(match[1]!) as unknown;
      const alt = match[2] ? JSON.parse(match[2]) as unknown : undefined;
      if (typeof uri !== "string" || !uri || (alt !== undefined && typeof alt !== "string")) continue;
      macros.push({ uri, alt, width, height, start, end: start + match[0].length });
    } catch {
      // Invalid JSON quoting is literal Markdown, not an image.
    }
  }
  return macros;
}

/** Serializes one image reference using the stable macro attribute order. */
export function serializeImageMacro(image: ImageReference): string {
  if (!image.uri) throw new TypeError("Image URI is required");
  const dimensions = [image.width, image.height];
  if (dimensions.some((value) => value !== undefined && (!Number.isSafeInteger(value) || value <= 0))) {
    throw new TypeError("Image dimensions must be positive integers");
  }
  return `{{image path=${JSON.stringify(image.uri)}`
    + (image.alt === undefined ? "" : ` alt=${JSON.stringify(image.alt)}`)
    + (image.width === undefined ? "" : ` width=${image.width}`)
    + (image.height === undefined ? "" : ` height=${image.height}`)
    + "}}";
}

/** Replaces one exact macro range without disturbing surrounding Markdown. */
export function replaceImageMacro(
  source: string,
  range: Pick<ParsedImageMacro, "start" | "end">,
  image: ImageReference,
): string {
  return source.slice(0, range.start) + serializeImageMacro(image) + source.slice(range.end);
}

interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  alt?: string;
  data?: { hProperties?: Record<string, unknown> };
  position?: { start?: { offset?: number }; end?: { offset?: number } };
  children?: MarkdownNode[];
}

/** Converts macro text nodes into ordinary Markdown image nodes with edit metadata. */
export function remarkImageMacros() {
  return (tree: MarkdownNode): void => {
    const visit = (node: MarkdownNode): void => {
      if (node.children) {
        node.children = node.children.flatMap((child) => {
          if (child.type !== "text" || !child.value) {
            visit(child);
            return [child];
          }
          const base = child.position?.start?.offset ?? 0;
          const macros = parseImageMacros(child.value);
          if (!macros.length) return [child];
          const result: MarkdownNode[] = [];
          let cursor = 0;
          macros.forEach((macro) => {
            if (macro.start > cursor) result.push({ type: "text", value: child.value!.slice(cursor, macro.start) });
            result.push({
              type: "image",
              url: macro.uri,
              alt: macro.alt ?? "",
              data: { hProperties: {
                "data-rivto-image-uri": macro.uri,
                "data-rivto-image-start": base + macro.start,
                "data-rivto-image-end": base + macro.end,
                ...(macro.width ? { width: macro.width } : {}),
                ...(macro.height ? { height: macro.height } : {}),
              } },
            });
            cursor = macro.end;
          });
          if (cursor < child.value.length) result.push({ type: "text", value: child.value.slice(cursor) });
          return result;
        });
        node.children.forEach(visit);
      }
    };
    visit(tree);
  };
}
