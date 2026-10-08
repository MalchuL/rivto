/**
 * Hosts one Chulane application runtime and its Next.js HTTP surface in Node.
 * Browser commands and Electron's utility process share this entry point.
 * Requests are admitted only after Cordis and Next.js finish startup. Signals
 * and desktop shutdown messages drain HTTP work and await plugin cleanup before
 * exiting; application services stay outside the renderer's privileges.
 */
import next from "next";
import { createServer, type IncomingMessage } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { Fiber } from "@deepseek-ai/cordis";
import type { ParentPort } from "electron";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { createApplicationRuntime } from "./application.ts";

const { values } = parseArgs({
  options: { development: { type: "boolean" }, port: { type: "string" } },
});
const development = values.development ?? false;
const parentPort: ParentPort | undefined = process.parentPort;
const port = Number(values.port ?? (parentPort ? 0 : 3000));
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error("The application port must be an integer between 0 and 65535.");
}
// Next.js declares NODE_ENV readonly for consumers; this host sets it before
// preparing the framework so both launch modes initialize the correct runtime.
Object.assign(process.env, {
  NODE_ENV: development ? "development" : "production",
  CHULANE_DESKTOP_DEV: parentPort && development ? "1" : "0",
});
const application = next({
  dev: development,
  // Execution uses dist/src/runtime/server.js, three levels below the app root.
  dir: fileURLToPath(new URL("../../..", import.meta.url)),
  hostname: "127.0.0.1",
});
const server = createServer(application.getRequestHandler());
const upgradedSockets = new Set<Duplex>();
let runtime: Fiber | undefined;
let stopping = false;
let exitCode = 0;

/**
 * Boots composition before preparing Next.js or opening the loopback listener.
 * @returns Resolves when this host can admit requests.
 */
async function startServer(): Promise<void> {
  runtime = await createApplicationRuntime();
  console.info("Chulane runtime ready.");
  await application.prepare();
  const listening = once(server, "listening");
  server.listen(port, "127.0.0.1");
  await listening;
  const address = server.address() as AddressInfo;
  console.info(`Chulane listening at http://127.0.0.1:${address.port}`);
  parentPort?.postMessage(address.port);
}

/**
 * Completes pending HTTP work and releases both host and application resources.
 * @returns Resolves only by exiting after cleanup has finished.
 */
async function stopServer(): Promise<void> {
  if (stopping) return;
  stopping = true;
  // A quit during startup must not outlive a plugin still acquiring resources.
  await started.catch(() => {});
  if (server.listening) {
    const closed = once(server, "close");
    server.close();
    if (development) {
      server.closeAllConnections();
      // Node's helper excludes upgraded HMR connections, which would keep the
      // listener alive and block desktop exit after the page has hydrated.
      for (const socket of upgradedSockets) socket.destroy();
    }
    await closed;
  }
  const results = await Promise.allSettled([application.close(), runtime?.dispose()]);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Chulane cleanup failed:", result.reason);
      exitCode = 1;
    }
  }
  if (runtime && results[1].status === "fulfilled") console.info("Chulane runtime stopped.");
  process.exit(exitCode);
}

/**
 * Reports host failures while still allowing Cordis-owned resources to unwind.
 * @param error - Failure encountered while starting or serving the host.
 * @returns No value.
 */
function handleFailure(error: unknown): void {
  console.error("Chulane web runtime failed:", error);
  exitCode = 1;
  void stopServer();
}

/**
 * Requests graceful cleanup for an operating-system shutdown signal.
 * @returns No value.
 */
function handleShutdown(): void { void stopServer(); }

/**
 * Handles the owning Electron process's explicit shutdown request.
 * @param event - A message received from the desktop host.
 * @returns No value.
 */
function handleMessage(event: { data: unknown }): void {
  if (event.data === "shutdown") handleShutdown();
}

/**
 * Tracks development connections upgraded by Next.js for graceful host teardown.
 * @param request - The upgrade request.
 * @param socket - Connection owned by the HTTP host.
 * @returns No value.
 */
function trackUpgrade(request: IncomingMessage, socket: Duplex): void {
  upgradedSockets.add(socket);
  /**
   * Drops the closed connection from this host's teardown set.
   * @returns No value.
   */
  socket.once("close", () => { upgradedSockets.delete(socket); });
}

if (development) server.on("upgrade", trackUpgrade);
server.on("error", handleFailure);
process.once("SIGINT", handleShutdown);
process.once("SIGTERM", handleShutdown);
parentPort?.on("message", handleMessage);
const started = startServer();
void started.catch(handleFailure);
