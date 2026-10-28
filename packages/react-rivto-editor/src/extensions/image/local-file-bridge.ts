/**
 * Browser-safe adapter for desktop-host asset-folder bridges.
 *
 * Rivto chooses a safe collision-resistant filename and logical URI while the
 * host callbacks perform privileged filesystem reads and writes. No Node or
 * desktop runtime API enters the React package.
 *
 * @module
 */
import type { BinaryProvider } from "../../managers/files";

/** Settings and privileged callbacks required by the local asset bridge. */
export interface LocalFileBridgeOptions {
  readonly directory: string;
  readonly uriPrefix: string;
  readonly maxBytes?: number;
  readonly writeFile: (input: {
    readonly directory: string;
    readonly fileName: string;
    readonly file: Blob;
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
function safeFileName(name: string): string {
  const original = name || "file";
  const dot = original.lastIndexOf(".");
  const extension =
    dot > 0 && original.length - dot <= 12 ? original.slice(dot).replace(/[^.a-z\d_-]/gi, "") : "";
  const stem =
    (dot > 0 ? original.slice(0, dot) : original)
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
 * Creates a binary provider backed by a host filesystem bridge.
 *
 * Relative URIs are claimed only under `uriPrefix`; file URIs are claimed only
 * under a `file:` directory. Broader filesystem access requires an explicit
 * host resolver and is never inferred from document text.
 *
 * @param options - Opaque directory, logical prefix, limits, and host bridges.
 * @returns A binary provider for attachment extensions.
 */
export function createLocalFileBridge(
  options: LocalFileBridgeOptions,
): BinaryProvider<string, Blob> {
  const prefix = options.uriPrefix.endsWith("/") ? options.uriPrefix : `${options.uriPrefix}/`;
  const maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError("File limit must be a positive integer");
  }
  return {
    /** @inheritdoc BinaryProvider.write */
    async write(file, context) {
      context.signal.throwIfAborted();
      if (file.size > maxBytes) {
        throw new RangeError("File exceeds the configured limit");
      }
      const fileName = safeFileName(context.name);
      await options.writeFile({
        directory: options.directory,
        fileName,
        file,
        signal: context.signal,
      });
      context.signal.throwIfAborted();
      return logicalUri(prefix, fileName);
    },
    /** @inheritdoc BinaryProvider.read */
    async read(uri, context) {
      context.signal.throwIfAborted();
      const localRelative = !/^[a-z][a-z\d+.-]*:/i.test(uri) && uri.startsWith(prefix);
      const localFile = options.directory.startsWith("file:") && uri.startsWith(options.directory);
      if (!localRelative && !localFile) {
        return undefined;
      }
      const result = await options.readFile({
        directory: options.directory,
        uri,
        signal: context.signal,
        documentId: context.documentId,
      });
      context.signal.throwIfAborted();
      if (result instanceof Blob) {
        return result;
      }
      if (!result.trim() || /^(?:javascript|vbscript):/i.test(result.trim())) {
        throw new TypeError("File bridge returned an unsafe URI");
      }
      const response = await fetch(result, { signal: context.signal });
      if (!response.ok) {
        throw new Error(`Unable to read file: ${response.status}`);
      }
      return response.blob();
    },
  };
}
