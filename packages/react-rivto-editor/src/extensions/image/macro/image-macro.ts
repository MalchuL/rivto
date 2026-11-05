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
  /** Persisted image URI or provider reference. */
  readonly uri: string;
  /** Optional alternative text for the image. */
  readonly alt?: string;
  /** Optional display width in pixels. */
  readonly width?: number;
  /** Optional display height in pixels. */
  readonly height?: number;
}

/** One parsed image macro and its source range. */
export interface ParsedImageMacro extends ImageReference {
  /** Inclusive offset where the macro begins in the source string. */
  readonly start: number;
  /** Exclusive offset immediately after the macro in the source string. */
  readonly end: number;
}

const QUOTED_STRING = '"(?:\\\\.|[^"\\\\])*"';
const IMAGE_MACRO_PATTERN = new RegExp(
  `\\{\\{image\\s+path=(${QUOTED_STRING})(?:\\s+alt=(${QUOTED_STRING}))?(?:\\s+width=(\\d+))?(?:\\s+height=(\\d+))?\\}\\}`,
  "g",
);

/**
 * Parses an optional positive integer dimension.
 *
 * @param value - Decimal attribute text, or undefined when the attribute is absent.
 * @returns A positive safe integer, or undefined for absent or invalid input.
 */
function positiveInteger(value: string | undefined): number | undefined {
  const parsed = value === undefined ? undefined : Number(value);
  return parsed !== undefined && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Parses every valid canonical image macro in source order.
 *
 * Invalid quoting, empty paths, and invalid dimensions are ignored so their
 * original text remains available to Markdown rendering.
 *
 * @param source - Markdown text containing zero or more image macros.
 * @returns Parsed metadata and UTF-16 source offsets in occurrence order.
 */
export function parseImageMacros(source: string): ParsedImageMacro[] {
  const macros: ParsedImageMacro[] = [];
  for (const match of source.matchAll(IMAGE_MACRO_PATTERN)) {
    const start = match.index;
    const width = positiveInteger(match[3]);
    const height = positiveInteger(match[4]);
    if (start === undefined || (match[3] && !width) || (match[4] && !height)) {
      continue;
    }
    try {
      const uri = JSON.parse(match[1]!) as unknown;
      const alt = match[2] ? (JSON.parse(match[2]) as unknown) : undefined;
      if (typeof uri !== "string" || !uri || (alt !== undefined && typeof alt !== "string")) {
        continue;
      }
      macros.push({ uri, alt, width, height, start, end: start + match[0].length });
    } catch {
      // Invalid JSON quoting is literal Markdown, not an image.
    }
  }
  return macros;
}

/**
 * Serializes one image reference using the stable macro attribute order.
 *
 * String attributes use JSON quoting; omitted metadata is not written.
 *
 * @param image - URI and optional alternative text and pixel dimensions.
 * @returns Canonical inline image macro.
 * @throws If the URI is empty or a dimension is not a positive safe integer.
 */
export function serializeImageMacro(image: ImageReference): string {
  if (!image.uri) {
    throw new TypeError("Image URI is required");
  }
  const dimensions = [image.width, image.height];
  if (
    dimensions.some((value) => value !== undefined && (!Number.isSafeInteger(value) || value <= 0))
  ) {
    throw new TypeError("Image dimensions must be positive integers");
  }
  return (
    `{{image path=${JSON.stringify(image.uri)}` +
    (image.alt === undefined ? "" : ` alt=${JSON.stringify(image.alt)}`) +
    (image.width === undefined ? "" : ` width=${image.width}`) +
    (image.height === undefined ? "" : ` height=${image.height}`) +
    "}}"
  );
}

/**
 * Replaces one exact macro range without disturbing surrounding Markdown.
 *
 * The caller supplies offsets captured from the same source; this function
 * does not verify that the range still contains the original macro.
 *
 * @param source - Markdown text containing the range to replace.
 * @param range - Start and exclusive end offsets in the supplied source.
 * @param image - Replacement image reference.
 * @returns Source text with the replacement macro spliced into the range.
 * @throws If the replacement URI or dimensions cannot be serialized.
 */
export function replaceImageMacro(
  source: string,
  range: Pick<ParsedImageMacro, "start" | "end">,
  image: ImageReference,
): string {
  return source.slice(0, range.start) + serializeImageMacro(image) + source.slice(range.end);
}

/** Minimal Markdown tree fields read or populated by the image transformer. */
interface MarkdownNode {
  /** Markdown node type. */
  type: string;
  /** Text held by a text node, when present. */
  value?: string;
  /** Image source for generated nodes. */
  url?: string;
  /** Alternative text for generated images. */
  alt?: string;
  /** Renderer properties attached to generated nodes. */
  data?: {
    /** HTML properties consumed by the renderer. */
    hProperties?: Record<string, unknown>;
  };
  /** Source range used to locate and edit macro text. */
  position?: {
    /** Source position at the start of the node. */
    start?: {
      /** Inclusive offset into the original Markdown string. */
      offset?: number;
    };
    /** Source position at the end of the node. */
    end?: {
      /** Exclusive offset into the original Markdown string. */
      offset?: number;
    };
  };
  /** Child nodes visited by the transformer. */
  children?: MarkdownNode[];
}

/**
 * Rejoins image macro text split by Markdown's automatic URL linking.
 *
 * Only automatic links fully contained in a valid macro are rejoined; other
 * links retain their original nodes and behavior.
 *
 * @param children - Adjacent Markdown nodes in their original source order.
 * @returns Nodes with split image macros restored to text for macro parsing.
 */
function joinImageMacroLinks(children: MarkdownNode[]): MarkdownNode[] {
  const result: MarkdownNode[] = [];
  for (let index = 0; index < children.length; index += 1) {
    const first = children[index]!;
    if (first.type !== "text" || !first.value?.includes("{{image")) {
      result.push(first);
      continue;
    }
    let value = first.value;
    const macroStart = value.lastIndexOf("{{image");
    let end = index;
    const links: number[] = [];
    while (value.indexOf("}}", macroStart) < 0 && end + 1 < children.length) {
      const next = children[end + 1]!;
      if (next.type === "text" && next.value !== undefined) {
        value += next.value;
      } else if (
        next.type === "link" &&
        typeof next.url === "string" &&
        next.children?.length === 1 &&
        next.children[0]?.type === "text" &&
        next.children[0].value === next.url
      ) {
        links.push(value.length);
        value += next.url;
      } else {
        break;
      }
      end += 1;
    }
    const macros = parseImageMacros(value);
    if (
      links.length &&
      links.every((offset) => macros.some((macro) => macro.start < offset && offset < macro.end))
    ) {
      result.push({ ...first, value });
      index = end;
    } else {
      result.push(first);
    }
  }
  return result;
}

/**
 * Converts macro text nodes into ordinary Markdown image nodes with edit metadata.
 *
 * The returned transformer mutates the supplied tree. Source offsets are
 * attached to each generated node for later edits; missing node offsets use zero.
 *
 * @returns A remark transformer that expands valid macros and preserves other text.
 */
export function remarkImageMacros() {
  return (tree: MarkdownNode): void => {
    // Expand macros in text children in place and visit nested Markdown nodes.
    const visit = (node: MarkdownNode): void => {
      if (node.children) {
        // Replace only text children; preserve non-text nodes and traverse their descendants.
        node.children = joinImageMacroLinks(node.children).flatMap((child) => {
          if (child.type !== "text" || !child.value) {
            return [child];
          }
          const base = child.position?.start?.offset ?? 0;
          const macros = parseImageMacros(child.value);
          if (!macros.length) {
            return [child];
          }
          const result: MarkdownNode[] = [];
          let cursor = 0;
          // Keep surrounding text and attach source offsets to generated images.
          macros.forEach((macro) => {
            if (macro.start > cursor) {
              result.push({ type: "text", value: child.value!.slice(cursor, macro.start) });
            }
            result.push({
              type: "image",
              url: macro.uri,
              alt: macro.alt ?? "",
              data: {
                hProperties: {
                  "data-rivto-image-uri": macro.uri,
                  "data-rivto-image-start": base + macro.start,
                  "data-rivto-image-end": base + macro.end,
                  ...(macro.width ? { width: macro.width } : {}),
                  ...(macro.height ? { height: macro.height } : {}),
                },
              },
            });
            cursor = macro.end;
          });
          if (cursor < child.value.length) {
            result.push({ type: "text", value: child.value.slice(cursor) });
          }
          return result;
        });
        node.children.forEach(visit);
      }
    };
    visit(tree);
  };
}
