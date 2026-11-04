/**
 * Browser-safe adapter for desktop-host asset-folder bridges.
 *
 * Rivto chooses a safe filename and logical URI while the host callbacks
 * perform privileged filesystem reads and exclusive writes. No Node or
 * desktop runtime API enters the React package.
 *
 * @module
 */
import type { BinaryProvider, BinaryReadContext, BinaryWriteContext } from "../../../attachments";

/** Destination, binary contents, and cancellation for an exclusive file write. */
export interface LocalFileWriteInput {
  /** Host directory selected for storing the file. */
  readonly directory: string;
  /** Generated filename to create within the directory. */
  readonly fileName: string;
  /** Binary content to write. */
  readonly file: Blob;
  /** Signal for cancelling the write. */
  readonly signal: AbortSignal;
}

/** Host filesystem reference and document context for a file read. */
export interface LocalFileReadInput {
  /** Host directory containing local assets. */
  readonly directory: string;
  /** Logical URI to resolve within the directory. */
  readonly uri: string;
  /** Signal for cancelling the read. */
  readonly signal: AbortSignal;
  /** Document requesting the file. */
  readonly documentId: string;
}

/** Settings and privileged callbacks required by the local asset bridge. */
export interface LocalFileBridgeOptions {
  /** Host directory used by read and write callbacks. */
  readonly directory: string;
  /** Logical URI prefix assigned to locally stored files. */
  readonly uriPrefix: string;
  /** Optional upper bound on file size in bytes. */
  readonly maxBytes?: number;
  /**
   * Creates a file only when its name does not already exist.
   *
   * @param input - Destination, contents, and cancellation signal.
   * @returns True when created, or false when the filename already exists.
   * @throws If the write fails for a reason other than a name collision.
   *
   * @example
   * const created = await options.writeFile(input);
   * // true: file created; false: filename already exists.
   */
  readonly writeFile: (input: LocalFileWriteInput) => boolean | Promise<boolean>;
  /**
   * Resolves a stored reference through the host filesystem bridge.
   *
   * Return file contents directly or a URL that the provider can fetch.
   *
   * @param input - Configured directory, stored URI, cancellation, and document identity.
   * @returns File contents or a fetchable URL, immediately or after host access completes.
   * @throws If host access fails, including a rejected promise.
   *
   * @example
   * const result = await options.readFile(input);
   * // A Blob containing the file, or a URL such as "blob:https://app.test/...".
   */
  readonly readFile: (input: LocalFileReadInput) => string | Blob | Promise<string | Blob>;
}

/** Maximum portable filename length in UTF-8 bytes. */
const MAX_FILE_NAME_BYTES = 80;
/** Maximum attempts to create a filename without overwriting an existing file. */
const MAX_FILE_WRITE_ATTEMPTS = 100;
/** Number of UUID characters appended after a filename collision. */
const FILE_COLLISION_SUFFIX_LENGTH = 7;

/**
 * Limits a filename without splitting a Unicode code point.
 *
 * @param name - Filename to shorten when necessary.
 * @param maxBytes - Maximum UTF-8 byte length.
 * @returns A prefix that fits within the byte limit.
 *
 * @example
 * limitFileName("éé.png", 3); // "é" (each é occupies two UTF-8 bytes).
 */
function limitFileName(name: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  let result = "";
  let size = 0;
  for (const character of name) {
    size += encoder.encode(character).length;
    if (size > maxBytes) {
      break;
    }
    result += character;
  }
  return result;
}

/**
 * Removes nonportable filename characters and supplies a fallback when needed.
 *
 * @param name - Original filename supplied by the caller.
 * @returns A portable filename within the UTF-8 byte limit.
 *
 * @example
 * safeFileName("a/b?.txt"); // "ab.txt"
 * safeFileName("CON.txt"); // "_CON.txt"
 * safeFileName("<>"); // "file"
 */
function safeFileName(name: string): string {
  let safe = name
    .replace(/[\p{Cc}\p{Cs}/\\:*?"<>|]/gu, "") // Remove control, surrogate, and path-unsafe characters.
    .replace(/[. ]+$/g, ""); // Remove trailing dots and spaces.
  const dot = safe.lastIndexOf(".");
  const extension = dot > 0 ? safe.slice(dot) : "";
  const extensionBytes = new TextEncoder().encode(extension).length;
  if (extension && extensionBytes < MAX_FILE_NAME_BYTES) {
    safe = `${limitFileName(safe.slice(0, dot), MAX_FILE_NAME_BYTES - extensionBytes)}${extension}`;
  } else {
    safe = limitFileName(safe, MAX_FILE_NAME_BYTES);
  }
  safe = safe.replace(/[. ]+$/g, "");
  if (!safe) {
    return "file";
  }
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) {
    safe = `_${limitFileName(safe, MAX_FILE_NAME_BYTES - 1)}`;
  }
  return safe;
}

/**
 * Adds a random suffix before a filename extension after a collision.
 *
 * @param name - Sanitized filename that already exists.
 * @returns A filename with a seven-character UUID suffix.
 * @throws If cryptographic random bytes are unavailable.
 *
 * @example
 * collisionFileName("photo.png"); // For example, "photo_a1b2c3d.png"; suffix varies.
 */
function collisionFileName(name: string): string {
  const suffix = `_${randomFileId().slice(0, FILE_COLLISION_SUFFIX_LENGTH)}`;
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot) : "";
  const extensionBytes = new TextEncoder().encode(extension).length;
  if (extension && extensionBytes < MAX_FILE_NAME_BYTES - suffix.length) {
    const stem = limitFileName(
      name.slice(0, dot),
      MAX_FILE_NAME_BYTES - suffix.length - extensionBytes,
    );
    if (stem) {
      return `${stem}${suffix}${extension}`;
    }
  }
  const stem = limitFileName(name, MAX_FILE_NAME_BYTES - suffix.length).replace(/[. ]+$/g, "");
  return `${stem || "file"}${suffix}`;
}

/**
 * Creates a random UUID for a stored filename, including on HTTP origins.
 *
 * @returns A cryptographically random version 4 UUID.
 * @throws If the browser cannot provide cryptographic random bytes.
 *
 * @example
 * randomFileId(); // For example, "550e8400-e29b-41d4-a716-446655440000"; value varies.
 */
function randomFileId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // Set the version and variant bits when randomUUID is unavailable.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

/**
 * Joins one logical URI prefix and encoded filename without path ambiguity.
 *
 * @param prefix - Logical URI prefix, with or without a trailing slash.
 * @param fileName - Filename to encode as a single URI segment.
 * @returns The prefix with a trailing slash followed by the encoded filename.
 * @throws If the filename contains an unpaired surrogate that cannot be URI-encoded.
 *
 * @example
 * logicalUri("assets", "Photo 1.PNG"); // "assets/Photo%201.PNG"
 */
function logicalUri(prefix: string, fileName: string): string {
  const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return normalized + encodeURIComponent(fileName);
}

/**
 * Checks that a relative URI path contains no encoded separators or traversal segments.
 *
 * @param path - URI-encoded path relative to the configured directory.
 * @returns True when each segment can be decoded without changing the path hierarchy.
 */
function isSafeRelativePath(path: string): boolean {
  try {
    // Decode each segment before rejecting traversal and encoded path separators.
    return path.split("/").every((segment) => {
      const decoded = decodeURIComponent(segment);
      return (
        decoded !== "." && decoded !== ".." && !decoded.includes("/") && !decoded.includes("\\")
      );
    });
  } catch {
    return false;
  }
}

/**
 * Provides binary storage through a host filesystem bridge.
 *
 * Relative URIs are claimed only under `uriPrefix`; file URIs are claimed only
 * under a `file:` directory. Encoded separators and traversal segments are rejected.
 * Broader filesystem access requires an explicit host resolver and is never inferred
 * from document text; host callbacks must enforce filesystem boundaries, including symlinks.
 */
export class LocalFileBridge implements BinaryProvider {
  /** Host callbacks and configuration retained for filesystem operations. */
  private readonly options: LocalFileBridgeOptions;
  /** Normalized logical URI prefix used to recognize local files. */
  private readonly prefix: string;
  /** Maximum accepted binary size in bytes. */
  private readonly maxBytes: number;

  /**
   * Configures host callbacks and validates the file size limit.
   *
   * The host owns filesystem access; this provider retains the supplied options.
   * The URI prefix is normalized once and the size limit defaults to 10 MiB.
   *
   * @param options - Opaque directory, logical prefix, limits, and host bridges.
   * @throws If the file size limit is not a positive safe integer.
   */
  constructor(options: LocalFileBridgeOptions) {
    this.options = options;
    this.prefix = options.uriPrefix.endsWith("/") ? options.uriPrefix : `${options.uriPrefix}/`;
    this.maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
    if (!Number.isSafeInteger(this.maxBytes) || this.maxBytes <= 0) {
      throw new TypeError("File limit must be a positive integer");
    }
  }

  /**
   * Stores a file under a safe filename without overwriting an existing file.
   *
   * Filename collisions retry with a random suffix, up to 100 write attempts.
   * Cancellation is checked before and after host writes; it does not undo a write.
   *
   * @param file - Binary content subject to the configured byte limit.
   * @param context - Original filename, attachment metadata, and cancellation signal.
   * @returns An encoded logical URI after the host reports successful creation.
   * @throws If cancelled, oversized, the host fails or returns an invalid result,
   * all attempts collide, or cryptographic randomness is unavailable when needed.
   *
   * @example
   * // With uriPrefix "assets/" and an available filename:
   * await provider.write(file, { ...context, name: "Photo 1.PNG" });
   * // "assets/Photo%201.PNG"; a collision adds a random suffix before ".PNG".
   */
  async write(file: Blob, context: BinaryWriteContext): Promise<string> {
    context.signal.throwIfAborted();
    if (file.size > this.maxBytes) {
      throw new RangeError("File exceeds the configured limit");
    }
    const originalName = safeFileName(context.name);
    let fileName = originalName;
    for (let attempt = 0; attempt < MAX_FILE_WRITE_ATTEMPTS; attempt++) {
      context.signal.throwIfAborted();
      const created = await this.options.writeFile({
        directory: this.options.directory,
        fileName,
        file,
        signal: context.signal,
      });
      context.signal.throwIfAborted();
      if (created === true) {
        return logicalUri(this.prefix, fileName);
      }
      if (created !== false) {
        throw new TypeError("File bridge writeFile must report whether the file was created");
      }
      // A collision retries with a fresh suffix; an existing file is never overwritten here.
      fileName = collisionFileName(originalName);
    }
    throw new Error("Unable to find an available filename");
  }

  /**
   * Reads an owned reference through the host and fetches returned URLs as needed.
   *
   * Host-provided blobs are returned directly. Empty URLs and JavaScript or VBScript
   * URLs are rejected before fetching; cancellation is passed to the host and fetch.
   *
   * @param uri - Persisted reference to check against the configured prefix or directory.
   * @param context - Document identity and cancellation signal.
   * @returns File contents, or undefined when the reference is not owned by this provider.
   * @throws If cancelled, the host fails, its URL is unsafe, or fetching fails.
   *
   * @example
   * // With uriPrefix "assets/" and directory "/assets":
   * const file = await provider.read("assets/Photo%201.PNG", context); // Blob.
   * await provider.read("https://example.test/photo.png", context); // undefined.
   */
  async read(uri: string, context: BinaryReadContext): Promise<Blob | undefined> {
    context.signal.throwIfAborted();
    const localRelative =
      !/^[a-z][a-z\d+.-]*:/i.test(uri) &&
      uri.startsWith(this.prefix) &&
      !/[?#]/.test(uri) &&
      isSafeRelativePath(uri.slice(this.prefix.length));
    let localFile = false;
    if (this.options.directory.startsWith("file:") && uri.startsWith("file:")) {
      try {
        const directory = new URL(this.options.directory);
        const file = new URL(uri);
        const directoryPath = directory.pathname.endsWith("/")
          ? directory.pathname
          : `${directory.pathname}/`;
        // Require the same host and a safe descendant path before asking the host to read.
        localFile =
          file.protocol === "file:" &&
          isSafeRelativePath(uri) &&
          file.host === directory.host &&
          !file.search &&
          !file.hash &&
          file.pathname.startsWith(directoryPath) &&
          isSafeRelativePath(file.pathname.slice(directoryPath.length));
      } catch {
        localFile = false;
      }
    }
    if (!localRelative && !localFile) {
      return undefined;
    }
    const result = await this.options.readFile({
      directory: this.options.directory,
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
  }
}
