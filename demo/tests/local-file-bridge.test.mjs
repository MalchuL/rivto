import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { localFileBridgePlugin } from "../local-file-bridge.ts";

/**
 * Replaces the Linux opener with a temporary executable that records its argument.
 *
 * @returns Log path and an async disposer that restores the process environment.
 */
async function fakeNativeOpener() {
  const directory = await mkdtemp(join(tmpdir(), "rivto-open-test-"));
  const log = join(directory, "opened");
  const originalPath = process.env.PATH;
  const originalLog = process.env.RIVTO_TEST_OPEN_LOG;
  await writeFile(
    join(directory, "xdg-open"),
    '#!/bin/sh\nprintf "%s" "$1" > "$RIVTO_TEST_OPEN_LOG"\n',
    { mode: 0o755 },
  );
  process.env.PATH = `${directory}:${originalPath ?? ""}`;
  process.env.RIVTO_TEST_OPEN_LOG = log;
  return {
    log,
    /**
     * Removes the fake executable and restores the original environment.
     *
     * @returns A promise resolving after temporary files are removed.
     */
    async dispose() {
      await rm(directory, { recursive: true, force: true });
      if (originalPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = originalPath;
      }
      if (originalLog === undefined) {
        delete process.env.RIVTO_TEST_OPEN_LOG;
      } else {
        process.env.RIVTO_TEST_OPEN_LOG = originalLog;
      }
    },
  };
}

/**
 * Waits briefly for the fake opener's detached process to record the path.
 *
 * @param log - Path written by the fake executable.
 * @returns Recorded path, or undefined if the executable never writes it.
 * @throws If reading the log fails for a reason other than a missing file.
 */
async function readOpenedPath(log) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const path = await readFile(log, "utf8");
      if (path) {
        return path;
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * Starts the real bridge middleware on an ephemeral loopback port.
 *
 * @returns Server and its origin for the duration of the test.
 */
async function startFileBridge() {
  let middleware;
  localFileBridgePlugin().configureServer({
    middlewares: {
      /**
       * Installs the plugin middleware in the temporary HTTP server.
       *
       * @param handler - Middleware installed by the plugin.
       * @returns Retains the handler for incoming test requests.
       */
      use(handler) {
        middleware = handler;
      },
    },
  });
  // Route requests through the real middleware and return 404 for unhandled paths.
  const server = createServer((request, response) =>
    middleware(request, response, () => response.writeHead(404).end()),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { server, origin };
}

test(
  "native opening requires a trusted origin and a file stored by this server",
  { skip: process.platform !== "linux" },
  async () => {
    const opener = await fakeNativeOpener();
    const { server, origin } = await startFileBridge();
    let storedPath;
    try {
      const upload = `${origin}/__rivto_demo_clipboard_file?name=selected.txt`;
      const untrusted = await fetch(upload, {
        method: "POST",
        headers: { Origin: "https://attacker.example" },
        body: "data",
      });
      assert.equal(untrusted.status, 403);
      const stored = await fetch(upload, {
        method: "POST",
        headers: { Origin: origin },
        body: "data",
      });
      assert.equal(stored.status, 201);
      ({ uri: storedPath } = await stored.json());
      // Exercise native opening with both trusted and untrusted origins.
      const open = (uri, requestOrigin) =>
        fetch(`${origin}/__rivto_demo_open_file?uri=${encodeURIComponent(uri)}`, {
          method: "POST",
          headers: { Origin: requestOrigin },
        });
      assert.equal((await open(storedPath, "https://attacker.example")).status, 403);
      assert.equal((await open("/etc/passwd", origin)).status, 404);
      assert.equal((await open(storedPath, origin)).status, 204);
      assert.equal(await readOpenedPath(opener.log), storedPath);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      if (storedPath) {
        await rm(storedPath, { force: true });
      }
      await opener.dispose();
    }
  },
);
