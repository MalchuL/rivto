/**
 * Hosts one Chulane application runtime and its Next.js HTTP surface in Node.
 * Browser commands and Electron's utility process share this entry point.
 * Requests are admitted only after Cordis and Next.js finish startup. Signals
 * and desktop shutdown messages drain HTTP work and await plugin cleanup before
 * exiting; application services stay outside the renderer's privileges.
 */
import next from "next";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { toNodeHandler } from "better-auth/node";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { Fiber } from "@deepseek-ai/cordis";
import type { ParentPort } from "electron";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { createApplicationRuntime } from "./application.ts";
import { LocalServicesPlugin } from "./local-services.ts";

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
/** Owns HTTP, Next.js, and Cordis startup and coordinated host shutdown. */
class LocalServer {
  private readonly application = next({
    dev: development,
    // Execution uses dist/src/runtime/server.js, three levels below the app root.
    dir: fileURLToPath(new URL("../../..", import.meta.url)),
    hostname: "127.0.0.1",
  });
  private readonly nextHandler = this.application.getRequestHandler();
  private readonly server: ReturnType<typeof createServer>;
  private localHandler: ReturnType<typeof toNodeHandler> | undefined;
  private readonly upgradedSockets = new Set<Duplex>();
  private runtime: Fiber | undefined;
  private stopping = false;
  private exitCode = 0;
  private started: Promise<void> = Promise.resolve();

  /** Creates the HTTP listener after the bound request callback is initialized. */
  constructor() {
    this.server = createServer(this.handleRequest);
  }

  /** @returns No value after registering host lifecycle hooks and starting initialization. */
  start(): void {
    if (development) this.server.on("upgrade", this.trackUpgrade);
    this.server.on("error", this.handleFailure);
    process.once("SIGINT", this.handleShutdown);
    process.once("SIGTERM", this.handleShutdown);
    parentPort?.on("message", this.handleMessage);
    this.started = this.startServer();
    void this.started.catch(this.handleFailure);
  }

  /**
   * Boots composition before preparing Next.js or opening the loopback listener.
   * @returns Resolves when this host can admit requests.
   */
  private readonly startServer = async (): Promise<void> => {
    this.runtime = await createApplicationRuntime([
      new LocalServicesPlugin(join(process.env.CHULANE_DATA_DIR ?? ".data", "app.sqlite")),
    ]);
    this.localHandler = toNodeHandler(this.runtime.ctx.get("localHandler")!);
    console.info("Chulane runtime ready.");
    await this.application.prepare();
    const listening = once(this.server, "listening");
    this.server.listen(port, "127.0.0.1");
    await listening;
    const address = this.server.address() as AddressInfo;
    console.info(`Chulane listening at http://127.0.0.1:${address.port}`);
    parentPort?.postMessage(address.port);
  };

  /**
   * Routes local services within the same host and origin as Next.js.
   * @param request - Incoming browser or desktop HTTP request.
   * @param response - Node response owned by this request.
   * @returns Resolves when the selected handler has processed the request.
   */
  private readonly handleRequest = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      if (pathname === "/api/local" || pathname.startsWith("/api/auth/")) {
        const address = this.server.address() as AddressInfo | null;
        // Reject forged hosts before the auth library derives its local origin.
        if (!address || request.headers.host !== `127.0.0.1:${address.port}`) {
          response.writeHead(403).end();
        } else if (!this.localHandler || this.stopping) {
          response.writeHead(503).end();
        } else {
          // Only the actual socket determines the rate-limit address.
          request.headers["x-chulane-client-ip"] = request.socket.remoteAddress;
          await this.localHandler(request, response);
        }
      } else {
        await this.nextHandler(request, response);
      }
    } catch (error) {
      console.error("Chulane request failed:", error);
      if (response.headersSent) response.destroy();
      else response.writeHead(500).end("The request could not be completed.");
    }
  };

  /**
   * Completes pending HTTP work and releases both host and application resources.
   * @returns Resolves only by exiting after cleanup has finished.
   */
  private readonly stopServer = async (): Promise<void> => {
    if (this.stopping) return;
    this.stopping = true;
    // A quit during startup must not outlive a plugin still acquiring resources.
    await this.started.catch(() => {});
    if (this.server.listening) {
      const closed = once(this.server, "close");
      this.server.close();
      if (development) {
        this.server.closeAllConnections();
        // Node's helper excludes upgraded HMR connections, which would keep the
        // listener alive and block desktop exit after the page has hydrated.
        for (const socket of this.upgradedSockets) socket.destroy();
      }
      await closed;
    }
    const results = await Promise.allSettled([this.application.close(), this.runtime?.dispose()]);
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("Chulane cleanup failed:", result.reason);
        this.exitCode = 1;
      }
    }
    if (this.runtime && results[1].status === "fulfilled") console.info("Chulane runtime stopped.");
    process.exit(this.exitCode);
  };

  /**
   * Reports host failures while still allowing Cordis-owned resources to unwind.
   * @param error - Failure encountered while starting or serving the host.
   * @returns No value.
   */
  private readonly handleFailure = (error: unknown): void => {
    console.error("Chulane web runtime failed:", error);
    this.exitCode = 1;
    void this.stopServer();
  };

  /**
   * Requests graceful cleanup for an operating-system shutdown signal.
   * @returns No value.
   */
  private readonly handleShutdown = (): void => { void this.stopServer(); };

  /**
   * Handles the owning Electron process's explicit shutdown request.
   * @param event - A message received from the desktop host.
   * @returns No value.
   */
  private readonly handleMessage = (event: { data: unknown }): void => {
    if (event.data === "shutdown") this.handleShutdown();
  };

  /**
   * Tracks development connections upgraded by Next.js for graceful host teardown.
   * @param request - The upgrade request.
   * @param socket - Connection owned by the HTTP host.
   * @returns No value.
   */
  private readonly trackUpgrade = (request: IncomingMessage, socket: Duplex): void => {
    this.upgradedSockets.add(socket);
    /**
     * Drops the closed connection from this host's teardown set.
     * @returns No value.
     */
    socket.once("close", () => { this.upgradedSockets.delete(socket); });
  };
}

new LocalServer().start();
