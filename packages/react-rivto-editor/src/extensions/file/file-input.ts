import type { FileReference } from "../../attachments";

/**
 * Returns files exposed by a clipboard or drag data store.
 *
 * The item list is used only when the file list is empty.
 *
 * @param data - Native transferable data, when provided.
 * @returns Files in browser-provided order.
 */
export function getTransferredFiles(data: DataTransfer | null): File[] {
  if (!data) {
    return [];
  }
  if (data.files.length) {
    return [...data.files];
  }
  return [...data.items]
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
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
  const value = text
    .trim()
    .split(/\r?\n/)
    .find((line) => line && !line.startsWith("#"));
  return value && (/^file:\/\//i.test(value) || /^\//.test(value) || /^[a-z]:[\\/]/i.test(value))
    ? value
    : undefined;
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
  const extension = name.match(/\.([a-z\d]+)$/i)?.[1]?.toLowerCase() ?? "";
  const mimeType =
    (
      {
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
      } as Record<string, string>
    )[extension] ?? "application/octet-stream";
  return { uri, name, mimeType };
}
