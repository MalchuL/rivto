/**
 * Browser-safe adapter for desktop-host asset-folder bridges.
 *
 * Rivto chooses a safe collision-resistant filename and logical URI while the
 * host callbacks perform privileged filesystem reads and writes. No Node or
 * desktop runtime API enters the React package.
 *
 * @module
 */
import type { ReactEditorExtension } from "../../managers";

/** Settings and privileged callbacks required by the local asset bridge. */
export interface LocalFileBridgeOptions {
  readonly id?: string;
  readonly directory: string;
  readonly uriPrefix: string;
  readonly maxBytes?: number;
  readonly writeFile: (input: {
    readonly directory: string;
    readonly fileName: string;
    readonly file: File;
    readonly signal: AbortSignal;
  }) => void | Promise<void>;
  readonly readFile: (input: {
    readonly directory: string;
    readonly uri: string;
    readonly signal: AbortSignal;
    readonly documentId: string;
  }) => string | Blob | Promise<string | Blob>;
}

/** Produces a portable basename while preserving a short useful extension. */
function safeFileName(file: File): string {
  const original = file.name || "file";
  const dot = original.lastIndexOf(".");
  const extension = dot > 0 && original.length - dot <= 12
    ? original.slice(dot).replace(/[^.a-z\d_-]/gi, "")
    : "";
  const stem = (dot > 0 ? original.slice(0, dot) : original)
    .normalize("NFKC")
    .replace(/[\p{Cc}/\\:*?"<>|]+/gu, "-")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 80) || "file";
  return `${stem}-${crypto.randomUUID()}${extension.toLowerCase()}`;
}

/** Joins one logical URI prefix and encoded filename without path ambiguity. */
function logicalUri(prefix: string, fileName: string): string {
  const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return normalized + encodeURIComponent(fileName);
}

/**
 * Creates an extension that registers one local uploader and its matching reader.
 *
 * Relative URIs are claimed only under `uriPrefix`; file URIs are claimed only
 * under a `file:` directory. Broader filesystem access requires an explicit
 * host resolver and is never inferred from document text.
 *
 * @param options - Opaque directory, logical prefix, limits, and host bridges.
 * @returns Lifecycle-owned file pipeline registrations.
 */
export function createLocalFileBridge(options: LocalFileBridgeOptions): ReactEditorExtension {
  const id = options.id?.trim() || "local-files";
  const prefix = options.uriPrefix.endsWith("/") ? options.uriPrefix : `${options.uriPrefix}/`;
  return {
    id: `files.${id}`,
    setup: (reactEditor) => {
      reactEditor.files.registerUploadHandler({
        id,
        maxBytes: options.maxBytes,
        upload: async (file, context) => {
          const fileName = safeFileName(file);
          await options.writeFile({ directory: options.directory, fileName, file, signal: context.signal });
          return logicalUri(prefix, fileName);
        },
      });
      reactEditor.files.registerUriResolver({
        id,
        resolve: (uri, context) => {
          const localRelative = !/^[a-z][a-z\d+.-]*:/i.test(uri) && uri.startsWith(prefix);
          const localFile = options.directory.startsWith("file:") && uri.startsWith(options.directory);
          return localRelative || localFile
            ? options.readFile({ directory: options.directory, uri, signal: context.signal, documentId: context.documentId })
            : undefined;
        },
      });
    },
  };
}
