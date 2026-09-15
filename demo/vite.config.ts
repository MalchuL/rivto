/**
 * Vite configuration for the browser demo and its localhost-only file bridge.
 *
 * Package sources are resolved directly for development. The local bridge lets
 * the demo exercise host URI resolvers when a desktop file manager places an
 * absolute file path on the clipboard; deployed editor packages never gain
 * filesystem access from this demo-only server middleware.
 */
import { defineConfig } from "vite";
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

/** Reads a request body while enforcing the same bound as the editor fallback. */
async function readBoundedBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const raw of request) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    size += chunk.byteLength;
    if (size > LOCAL_FILE_MAX_BYTES) throw new RangeError("Clipboard file is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Produces a safe supplied filename or a UUID name with a useful extension. */
function clipboardFileName(name: string, contentType: string): string {
  const supplied = basename(name)
    .normalize("NFKC")
    .replace(/[\p{Cc}/\\:*?"<>|]+/gu, "-")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 100);
  if (supplied) return supplied;
  const extension = Object.entries(IMAGE_CONTENT_TYPES).find(([, type]) => type === contentType)?.[0] ?? ".bin";
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
  const contentType = String(request.headers["content-type"] ?? "").split(";", 1)[0]!.toLowerCase();
  const fileName = clipboardFileName(name, contentType);
  const contents = await readBoundedBody(request);
  if (!contents.byteLength) throw new TypeError("Clipboard file is empty");
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

/** Converts an accepted absolute path or file URI into a local filename. */
function localFilePath(uri: string): string | undefined {
  let result: string | undefined;
  try {
    const candidate = uri.startsWith("file://") ? fileURLToPath(uri) : uri;
    if (isAbsolute(candidate) || /^[a-z]:[\\/]/i.test(candidate)) result = candidate;
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
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer.exe" : "xdg-open";
  const args = [path];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
    child.once("error", reject);
  });
}

/**
 * Serves one bounded local file to the same-origin demo resolver.
 *
 * @param request - Incoming request handled by the demo middleware.
 * @param response - Response used for file bytes or validation errors.
 * @param next - Callback for routes not owned by the local file bridge.
 * @returns A promise that settles after the request is handled or delegated.
 */
async function serveLocalFile(
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname === CLIPBOARD_FILE_ROUTE) {
    try {
      if (request.method !== "POST") throw new TypeError("POST required");
      const uri = await storeClipboardFile(request, url.searchParams.get("name") ?? "");
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
    return;
  }
  if (url.pathname === OPEN_FILE_ROUTE) {
    try {
      if (request.method !== "POST") throw new TypeError("POST required");
      const path = localFilePath(url.searchParams.get("uri") ?? "");
      const metadata = path ? await stat(path) : undefined;
      if (!path || !metadata?.isFile()) throw new TypeError("Regular file required");
      await openNativeFile(path);
      response.writeHead(204, { "Cache-Control": "no-store" });
      response.end();
    } catch {
      response.writeHead(404, { "Cache-Control": "no-store", "Content-Type": "text/plain" });
      response.end("Local file could not be opened");
    }
    return;
  }
  if (url.pathname !== LOCAL_FILE_ROUTE) {
    next();
    return;
  }
  const path = localFilePath(url.searchParams.get("uri") ?? "");
  const contentType = path ? IMAGE_CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream" : undefined;
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

/** Registers the same local-file middleware for Vite dev and preview servers. */
function localFileBridgePlugin(): Plugin {
  const configure = (server: ViteDevServer | PreviewServer): void => {
    server.middlewares.use((request, response, next) => {
      void serveLocalFile(request, response, next);
    });
  };
  return {
    name: "rivto-demo-local-file-bridge",
    configureServer: configure,
    configurePreviewServer: configure,
  };
}

export default defineConfig({
  plugins: [localFileBridgePlugin()],
  resolve: {
    // The demo is a workspace development consumer. Resolve package entry
    // points directly to source so editing core or React code never requires a
    // parallel package build/watch process. Published consumers still use each
    // package's normal dist exports.
    alias: [
      {
        find: "@chulane/rivto-react/styles.css",
        replacement: fileURLToPath(new URL("../packages/react-rivto-editor/styles.css", import.meta.url)),
      },
      {
        find: /^@chulane\/rivto-react$/,
        replacement: fileURLToPath(new URL("../packages/react-rivto-editor/src/index.ts", import.meta.url)),
      },
      {
        find: /^@chulane\/rivto$/,
        replacement: fileURLToPath(new URL("../packages/rivto-editor-core/src/index.ts", import.meta.url)),
      },
      {
        find: /^@chulane\/crdt-doc$/,
        replacement: fileURLToPath(new URL("../packages/crdt-doc/src/index.ts", import.meta.url)),
      },
      {
        find: /^@chulane\/document-model$/,
        replacement: fileURLToPath(new URL("../packages/document-model/src/index.ts", import.meta.url)),
      },
    ],
    // Source imports originate in two workspace packages. Force both to share
    // the demo's React runtime rather than following package-local symlinks.
    dedupe: ["react", "react-dom"],
  },
  server: {
    // Polling keeps `pnpm demo` usable on machines whose shared inotify watcher
    // limit is already exhausted by editors, browsers, or other dev servers.
    watch: { usePolling: true, interval: 300 },
  },
});
