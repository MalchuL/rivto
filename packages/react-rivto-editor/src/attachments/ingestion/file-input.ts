import type { FileReference } from "..";

/**
 * Checks whether the browser hides a transferred URI from the paste event.
 *
 * @param data - Clipboard or drag data, if available.
 * @returns True when a URI list is advertised but no text or HTML exposes content.
 */
export function hasRedactedUriList(data: Pick<DataTransfer, "types" | "getData"> | null): boolean {
  return Boolean(
    data?.types.includes("text/uri-list") &&
    !data.getData("text/uri-list") &&
    !data.getData("text/plain") &&
    !data.getData("text/html"),
  );
}

/** Known file extensions used when a browser supplies no MIME type. */
const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  pdf: "application/pdf",
  csv: "text/csv",
  txt: "text/plain",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

/** Transfer fields used while collecting clipboard or drag files. */
interface FileTransferData {
  /** Browser-provided file list, examined before transfer items. */
  readonly files: Iterable<File>;
  /** Transfer items used as a fallback when the file list has no match. */
  readonly items: Iterable<Pick<DataTransferItem, "kind" | "getAsFile">>;
}

/**
 * Returns files exposed by a clipboard or drag data store.
 *
 * The item list is used only when the file list contains no matching files.
 * Without a predicate, every transferred file matches.
 *
 * @param data - Native transferable data, when provided.
 * @param matches - Predicate called with each candidate file; defaults to accepting all files.
 * @returns Matching files in browser-provided order.
 * @throws If the predicate fails while inspecting a file.
 */
export function getTransferredFiles(
  data: FileTransferData | null,
  matches: (file: File) => boolean = () => true,
): File[] {
  if (!data) {
    return [];
  }
  const files = [...data.files].filter(matches);
  if (files.length) {
    return files;
  }
  // Some clipboard implementations expose files only through transfer items.
  // File items can still return null when the browser no longer exposes their data.
  return [...data.items]
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null && matches(file));
}

/**
 * Reads the first non-comment entry from URI-list or plain clipboard text.
 *
 * @param text - Transferred text that may contain URI-list comments.
 * @returns The first entry, or undefined when no entry is present.
 */
export function firstUriListEntry(text: string): string | undefined {
  // URI-list comments do not identify transferable files.
  return text
    .trim()
    .split(/\r?\n/)
    .find((line) => line && !line.startsWith("#"));
}

/**
 * Checks whether one URI or path refers to a local filesystem location.
 *
 * @param value - One transferred URI or path, without URI-list comments.
 * @returns True for file URIs and absolute Unix or Windows paths.
 */
export function isLocalFileUri(value: string): boolean {
  return /^file:\/\//i.test(value) || /^\//.test(value) || /^[a-z]:[\\/]/i.test(value);
}

/**
 * Reads local paths from a URI list or plain clipboard text.
 *
 * @param text - Clipboard text containing one path per line and optional URI-list comments.
 * @returns Paths in source order, or an empty array if any entry is not local.
 */
export function findLocalFileUris(text: string): string[] {
  const paths = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  return paths.every(isLocalFileUri) ? paths : [];
}

/**
 * Reads local paths exposed by the clipboard, preferring URI-list data.
 *
 * @param data - Clipboard data, or null when unavailable.
 * @returns Local paths in source order, or an empty array when none are available.
 */
export function findTransferredLocalFileUris(data: Pick<DataTransfer, "getData"> | null): string[] {
  const uris = findLocalFileUris(data?.getData("text/uri-list") ?? "");
  return uris.length ? uris : findLocalFileUris(data?.getData("text/plain") ?? "");
}

/**
 * Returns the first local filesystem URI exposed as clipboard text.
 *
 * URI-list comments are skipped and only the first remaining line is considered.
 *
 * @param text - URI-list or plain clipboard text.
 * @returns Absolute local reference, when present.
 */
export function findLocalFileUri(text: string): string | undefined {
  const value = firstUriListEntry(text);
  return value && isLocalFileUri(value) ? value : undefined;
}

/**
 * Finds a local file reference in transferred URI-list or plain text data.
 *
 * URI-list data takes precedence when its first entry is a local path; otherwise
 * the first plain-text entry is considered.
 *
 * @param data - Clipboard or drag data, or null when none is available.
 * @returns The local reference, or undefined when neither format supplies one.
 * @throws If the browser's data-store read fails.
 */
export function findTransferredLocalFileUri(
  data: Pick<DataTransfer, "getData"> | null,
): string | undefined {
  return (
    findLocalFileUri(data?.getData("text/uri-list") ?? "") ??
    findLocalFileUri(data?.getData("text/plain") ?? "")
  );
}

/**
 * Infers conservative metadata for a referenced local file.
 *
 * Invalid URI escapes retain the literal filename; unknown extensions use a generic MIME type.
 *
 * @param uri - Absolute local path or file URI.
 * @returns Portable reference with conservative MIME inference.
 */
export function createFileReferenceFromUri(uri: string): FileReference {
  const path = uri.split(/[?#]/, 1)[0]!;
  const encodedName = path.split(/[\\/]/).pop() || "file";
  let name = encodedName;
  try {
    name = decodeURIComponent(encodedName);
  } catch {
    /* Keep the literal basename. */
  }
  const extension = name.match(/\.([a-z\d]+)$/i)?.[1].toLowerCase();
  const mimeType = mimeTypeFromExtension(extension);
  return { uri, name, mimeType };
}

/**
 * Infers a conservative MIME type from a normalized filename extension.
 *
 * @param extension - Lowercase filename extension without a leading dot, if present.
 * @returns The known type, or generic binary when the extension is unknown.
 */
export function mimeTypeFromExtension(extension: string | undefined): string {
  if (extension && Object.hasOwn(MIME_TYPES, extension)) {
    return MIME_TYPES[extension];
  }
  return "application/octet-stream";
}
