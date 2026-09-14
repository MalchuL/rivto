/**
 * Canonical inline file macro parsing, serialization, and Markdown conversion.
 *
 * File metadata stays visible as ordinary text when malformed. Valid macros
 * become inert Markdown links carrying renderer-only data attributes.
 *
 * @module
 */
import type { FileReference } from "../../managers/files";

/** One parsed file macro and its exact source range. */
export interface ParsedFileMacro extends FileReference {
  readonly start: number;
  readonly end: number;
}

const QUOTED_STRING = '"(?:\\\\.|[^"\\\\])*"';
const FILE_MACRO_PATTERN = new RegExp(
  `\\{\\{file\\s+path=(${QUOTED_STRING})\\s+name=(${QUOTED_STRING})\\s+type=(${QUOTED_STRING})(?:\\s+size=(\\d+))?\\}\\}`,
  "g",
);

/**
 * Parses every valid canonical file macro in source order.
 * @param source - Markdown source to inspect.
 * @returns Valid file macros with exact source ranges.
 */
export function parseFileMacros(source: string): ParsedFileMacro[] {
  const macros: ParsedFileMacro[] = [];
  for (const match of source.matchAll(FILE_MACRO_PATTERN)) {
    try {
      const uri = JSON.parse(match[1]!) as unknown;
      const name = JSON.parse(match[2]!) as unknown;
      const mimeType = JSON.parse(match[3]!) as unknown;
      const size = match[4] === undefined ? undefined : Number(match[4]);
      if (
        match.index === undefined
        || typeof uri !== "string" || !uri
        || typeof name !== "string" || !name
        || typeof mimeType !== "string" || !mimeType
        || (size !== undefined && (!Number.isSafeInteger(size) || size < 0))
      ) continue;
      macros.push({ uri, name, mimeType, size, start: match.index, end: match.index + match[0].length });
    } catch {
      // Invalid JSON quoting remains literal Markdown.
    }
  }
  return macros;
}

/**
 * Serializes one stable file reference for inline persistence.
 * @param file - Portable file metadata.
 * @returns Canonical inline file macro.
 */
export function serializeFileMacro(file: FileReference): string {
  if (!file.uri || !file.name || !file.mimeType) throw new TypeError("File URI, name, and MIME type are required");
  if (file.size !== undefined && (!Number.isSafeInteger(file.size) || file.size < 0)) {
    throw new TypeError("File size must be a non-negative integer");
  }
  return `{{file path=${JSON.stringify(file.uri)} name=${JSON.stringify(file.name)} type=${JSON.stringify(file.mimeType)}`
    + (file.size === undefined ? "" : ` size=${file.size}`)
    + "}}";
}

interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  data?: { hProperties?: Record<string, unknown> };
  position?: { start?: { offset?: number } };
  children?: MarkdownNode[];
}

/**
 * Converts canonical file macros into inert nodes rendered by `FileView`.
 * @returns Remark transformer factory.
 */
export function remarkFileMacros() {
  return (tree: MarkdownNode): void => {
    const visit = (node: MarkdownNode): void => {
      if (!node.children) return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== "text" || !child.value) {
          visit(child);
          return [child];
        }
        const base = child.position?.start?.offset ?? 0;
        const macros = parseFileMacros(child.value);
        if (!macros.length) return [child];
        const result: MarkdownNode[] = [];
        let cursor = 0;
        macros.forEach((macro) => {
          if (macro.start > cursor) result.push({ type: "text", value: child.value!.slice(cursor, macro.start) });
          result.push({
            type: "link",
            url: "#",
            children: [{ type: "text", value: macro.name }],
            data: { hProperties: {
              "data-rivto-file-uri": macro.uri,
              "data-rivto-file-name": macro.name,
              "data-rivto-file-type": macro.mimeType,
              "data-rivto-file-size": macro.size,
              "data-rivto-file-start": base + macro.start,
              "data-rivto-file-end": base + macro.end,
            } },
          });
          cursor = macro.end;
        });
        if (cursor < child.value.length) result.push({ type: "text", value: child.value.slice(cursor) });
        return result;
      });
      node.children.forEach(visit);
    };
    visit(tree);
  };
}
