/** Local demo middleware for bounded file reads, writes and native opening. @module */
import { fileURLToPath } from "node:url";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, extname, isAbsolute, join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, PreviewServer, ViteDevServer } from "vite";

const LOCAL_FILE_ROUTE = "/__rivto_demo_local_file";
const CLIPBOARD_FILE_ROUTE = "/__rivto_demo_clipboard_file";
const OPEN_FILE_ROUTE = "/__rivto_demo_open_file";
const LOCAL_FILE_MAX_BYTES = 10 * 1024 * 1024;
const CLIPBOARD_FILE_DIRECTORY = join(tmpdir(), "rivto-files");
const IMAGE_CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

/**
 * Reads a request body while enforcing the same bound as the editor fallback.
 *
 * @param request - Incoming stream carrying clipboard file bytes.
 * @returns A promise resolving to the complete concatenated body.
 * @throws If the stream fails or exceeds the 10 MiB limit.
 */
async function readBoundedBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const raw of request) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    size += chunk.byteLength;
    if (size > LOCAL_FILE_MAX_BYTES) {
      throw new RangeError("Clipboard file is too large");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Produces a safe supplied filename or a UUID name with a useful extension.
 *
 * The supplied basename is normalized, has unsafe characters replaced and
 * leading or trailing dots, and limited to 100 UTF-16 code units.
 *
 * @param name - Filename supplied by the request.
 * @param contentType - MIME type used to choose a fallback image extension.
 * @returns Sanitized basename, or a generated name with a known extension or `.bin`.
 */
function clipboardFileName(name: string, contentType: string): string {
  const supplied = basename(name)
    .normalize("NFKC")
    .replace(/[\p{Cc}/\\:*?"<>|]+/gu, "-")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 100);
  if (supplied) {
    return supplied;
  }
  const extension =
    Object.entries(IMAGE_CONTENT_TYPES).find(([, type]) => type === contentType)?.[0] ?? ".bin";
  return `${randomUUID()}${extension}`;
}

/**
 * Stores clipboard file bytes without overwriting an existing temp file.
 *
 * @param request - Request whose body contains the file bytes.
 * @param name - Optional filename supplied by the clipboard writer.
 * @returns The absolute path of the stored temporary file.
 */
async function storeClipboardFile(request: IncomingMessage, name: string): Promise<string> {
  const contentType = String(request.headers["content-type"] ?? "")
    .split(";", 1)[0]!
    .toLowerCase();
  const fileName = clipboardFileName(name, contentType);
  const contents = await readBoundedBody(request);
  await mkdir(CLIPBOARD_FILE_DIRECTORY, { recursive: true });
  let path = join(CLIPBOARD_FILE_DIRECTORY, fileName);
  try {
    await writeFile(path, contents, { flag: "wx" });
  } catch {
    path = join(CLIPBOARD_FILE_DIRECTORY, `${randomUUID()}${extname(fileName).toLowerCase()}`);
    await writeFile(path, contents, { flag: "wx" });
  }
  return path;
}

/**
 * Converts an accepted absolute path or file URI into a local filename.
 *
 * @param uri - Candidate file URI or absolute filesystem path.
 * @returns A local path, or undefined when the input is invalid or relative.
 */
function localFilePath(uri: string): string | undefined {
  let result: string | undefined;
  try {
    const candidate = uri.startsWith("file://") ? fileURLToPath(uri) : uri;
    if (isAbsolute(candidate) || /^[a-z]:[\\/]/i.test(candidate)) {
      result = candidate;
    }
  } catch {
    result = undefined;
  }
  return result;
}

/**
 * Opens one verified local file with the operating system's associated app.
 *
 * @param path - Absolute path already validated as a regular file.
 * @returns A promise that settles once the platform opener starts.
 */
function openNativeFile(path: string): Promise<void> {
  let command = "xdg-open";
  if (process.platform === "darwin") {
    command = "open";
  }
  if (process.platform === "win32") {
    command = "explorer.exe";
  }
  const args = [path];
  // Resolve when the opener starts; its independent lifetime is not awaited.
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    // Detach the child after startup so it can outlive the demo server.
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
    child.once("error", reject);
  });
}

/**
 * Stores submitted bytes and authorizes only the resulting path for native opening.
 *
 * @param request - Same-origin request containing file bytes.
 * @param response - Response receiving the created path or an error.
 * @param url - Request URL containing the optional filename.
 * @param authorizedFiles - Paths stored by this server instance.
 * @returns A promise resolving after the response is sent.
 */
async function serveClipboardFile(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  authorizedFiles: Set<string>,
): Promise<void> {
  try {
    if (request.method !== "POST") {
      throw new TypeError("POST required");
    }
    const uri = await storeClipboardFile(request, url.searchParams.get("name") ?? "");
    authorizedFiles.add(uri);
    const body = JSON.stringify({ uri });
    response.writeHead(201, {
      "Cache-Control": "no-store",
      "Content-Length": Buffer.byteLength(body),
      "Content-Type": "application/json",
    });
    response.end(body);
  } catch {
    response.writeHead(400, { "Cache-Control": "no-store", "Content-Type": "text/plain" });
    response.end("Clipboard file could not be stored");
  }
}

/**
 * Opens a regular file previously stored by this server through its native app.
 *
 * @param request - Same-origin request asking to open a stored file.
 * @param response - Response receiving the opening result or an error.
 * @param url - Request URL containing the stored file reference.
 * @param authorizedFiles - Paths stored by this server instance.
 * @returns A promise resolving after the response is sent.
 */
async function serveNativeOpen(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  authorizedFiles: Set<string>,
): Promise<void> {
  try {
    if (request.method !== "POST") {
      throw new TypeError("POST required");
    }
    const path = localFilePath(url.searchParams.get("uri") ?? "");
    const metadata = path && authorizedFiles.has(path) ? await stat(path) : undefined;
    if (!path || !metadata?.isFile()) {
      throw new TypeError("Regular file required");
    }
    await openNativeFile(path);
    response.writeHead(204, { "Cache-Control": "no-store" });
    response.end();
  } catch {
    response.writeHead(404, { "Cache-Control": "no-store", "Content-Type": "text/plain" });
    response.end("Local file could not be opened");
  }
}

/**
 * Reads a bounded local file for the demo attachment provider.
 *
 * @param response - Response receiving file bytes or an error.
 * @param url - Request URL containing the local file reference.
 * @returns A promise resolving after the response is sent.
 */
async function serveFileBytes(response: ServerResponse, url: URL): Promise<void> {
  const path = localFilePath(url.searchParams.get("uri") ?? "");
  const contentType = path
    ? (IMAGE_CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream")
    : undefined;
  try {
    const metadata = path && contentType ? await stat(path) : undefined;
    if (!path || !contentType || !metadata?.isFile() || metadata.size > LOCAL_FILE_MAX_BYTES) {
      throw new Error("Unsupported local file");
    }
    const contents = await readFile(path);
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": contents.byteLength,
      "Content-Type": contentType,
    });
    response.end(contents);
  } catch {
    response.writeHead(404, { "Cache-Control": "no-store", "Content-Type": "text/plain" });
    response.end("Local file is unavailable");
  }
}

/**
 * Serves one bounded local file to the same-origin demo resolver.
 *
 * @param request - Incoming request handled by the demo middleware.
 * @param response - Response used for file bytes or validation errors.
 * @param next - Callback for routes not owned by the local file bridge.
 * @param authorizedFiles - Paths created from files submitted to this server.
 * @returns A promise that settles after the request is handled or delegated.
 */
async function serveLocalFile(
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
  authorizedFiles: Set<string>,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname === CLIPBOARD_FILE_ROUTE || url.pathname === OPEN_FILE_ROUTE) {
    const protocol = "encrypted" in request.socket && request.socket.encrypted ? "https" : "http";
    if (
      !request.headers.host ||
      request.headers.origin !== `${protocol}://${request.headers.host}`
    ) {
      response.writeHead(403, { "Cache-Control": "no-store" });
      response.end();
      return;
    }
    if (url.pathname === CLIPBOARD_FILE_ROUTE) {
      await serveClipboardFile(request, response, url, authorizedFiles);
    } else {
      await serveNativeOpen(request, response, url, authorizedFiles);
    }
    return;
  }
  if (url.pathname === LOCAL_FILE_ROUTE) {
    await serveFileBytes(response, url);
    return;
  }
  next();
}

/**
 * Registers the same local-file middleware for Vite dev and preview servers.
 *
 * Each configured server owns its own set of temporary paths authorized for
 * native opening; it is not shared between server instances.
 *
 * @returns A Vite plugin that installs the middleware during server setup.
 */
export function localFileBridgePlugin(): Plugin {
  // Install local-file routes with a separate authorization set for each server.
  const configure = (server: ViteDevServer | PreviewServer): void => {
    const authorizedFiles = new Set<string>();
    server.middlewares.use((request, response, next) => {
      void serveLocalFile(request, response, next, authorizedFiles);
    });
  };
  return {
    name: "rivto-demo-local-file-bridge",
    configureServer: configure,
    configurePreviewServer: configure,
  };
}
