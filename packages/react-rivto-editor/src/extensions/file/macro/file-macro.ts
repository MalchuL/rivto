/**
 * Canonical inline file macro parsing, serialization, and Markdown source formatting.
 *
 * File metadata stays visible as ordinary text when malformed. Valid macros
 * become inert Markdown links carrying renderer-only data attributes.
 *
 * @module
 */
import type { FileReference } from "../../../attachments";

/** One parsed file macro and its exact source range. */
export interface ParsedFileMacro extends FileReference {
  /** Inclusive offset where the macro begins in the source string. */
  readonly start: number;
  /** Exclusive offset immediately after the macro in the source string. */
  readonly end: number;
}

const QUOTED_STRING = '"(?:\\\\.|[^"\\\\])*"';
const FILE_MACRO_PATTERN = new RegExp(
  `\\{\\{file\\s+path=(${QUOTED_STRING})\\s+name=(${QUOTED_STRING})\\s+type=(${QUOTED_STRING})(?:\\s+size=(\\d+))?\\}\\}`,
  "g",
);

/**
 * Parses every valid canonical file macro in source order.
 *
 * Invalid metadata and JSON quoting remain literal Markdown. Source ranges
 * are offsets into the supplied text and include the complete macro.
 *
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
        match.index === undefined ||
        typeof uri !== "string" ||
        !uri ||
        typeof name !== "string" ||
        !name ||
        typeof mimeType !== "string" ||
        !mimeType ||
        (size !== undefined && (!Number.isSafeInteger(size) || size < 0))
      ) {
        continue;
      }
      macros.push({
        uri,
        name,
        mimeType,
        size,
        start: match.index,
        end: match.index + match[0].length,
      });
    } catch {
      // Invalid JSON quoting remains literal Markdown.
    }
  }
  return macros;
}

/**
 * Serializes one stable file reference for inline persistence.
 *
 * Metadata strings use JSON quoting, and an omitted size is not serialized.
 *
 * @param file - Portable file metadata.
 * @returns Canonical inline file macro.
 * @throws If required metadata is empty or size is not a non-negative safe integer.
 */
export function serializeFileMacro(file: FileReference): string {
  if (!file.uri || !file.name || !file.mimeType) {
    throw new TypeError("File URI, name, and MIME type are required");
  }
  if (file.size !== undefined && (!Number.isSafeInteger(file.size) || file.size < 0)) {
    throw new TypeError("File size must be a non-negative integer");
  }
  return (
    `{{file path=${JSON.stringify(file.uri)} name=${JSON.stringify(file.name)} type=${JSON.stringify(file.mimeType)}` +
    (file.size === undefined ? "" : ` size=${file.size}`) +
    "}}"
  );
}
