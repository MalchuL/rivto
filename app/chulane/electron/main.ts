/**
 * Owns the Chulane desktop window and the lifetime of its local Next.js server.
 * The server runs in Electron's Node utility process and chooses a loopback
 * port, allowing desktop and web development to run simultaneously. The
 * renderer is sandboxed and receives no Node or filesystem privileges.
 */
import { app, BrowserWindow, utilityProcess, type Event, type UtilityProcess, type WindowOpenHandlerResponse } from "electron";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/** Owns the desktop window, utility process, and coordinated quit lifecycle. */
class DesktopApplication {
  private server: UtilityProcess | undefined;
  private origin: string | undefined;
  private quitting = false;
  private exitCode = 0;

  /** @returns No value after registering Electron lifecycle callbacks. */
  start(): void {
    app.whenReady().then(this.startDesktop).catch(this.handleFailure);
    app.on("activate", this.handleActivate);
    app.on("window-all-closed", this.handleWindowsClosed);
    app.on("before-quit", this.stopServer);
  }

  /**
   * Opens the shared Next.js UI once the desktop-owned server is ready.
   * @returns Resolves after the initial page has loaded.
   */
  private readonly createWindow = async (): Promise<void> => {
    if (!this.origin) return;
    const window = new BrowserWindow({
      title: "Chulane",
      width: 1280,
      height: 840,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    window.webContents.setWindowOpenHandler(this.denyNewWindow);
    window.webContents.on("will-navigate", this.restrictNavigation);
    await window.loadURL(this.origin);
  };

  /**
   * Prevents web content from opening additional privileged desktop windows.
   * @returns The instruction to reject the new window.
   */
  private readonly denyNewWindow = (): WindowOpenHandlerResponse => {
    return { action: "deny" };
  };

  /**
   * Keeps top-level navigation within this instance's local application origin.
   * @param event - Cancelable Electron navigation event.
   * @param url - Requested navigation destination.
   * @returns No value.
   */
  private readonly restrictNavigation = (event: Event, url: string): void => {
    if (new URL(url).origin !== this.origin) event.preventDefault();
  };

  /**
   * Receives the bound port directly from the owned server process.
   * @param port - Listening loopback port reported by the server.
   * @returns No value.
   */
  private readonly handleReady = (port: unknown): void => {
    // Startup may finish after the user has already requested desktop shutdown.
    if (this.quitting) return;
    if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) {
      this.handleFailure(new Error("Invalid local server port."));
      return;
    }
    this.origin = `http://127.0.0.1:${port}`;
    void this.createWindow().catch(this.handleFailure);
  };

  /**
   * Starts a local Next.js runtime using Electron's bundled Node environment.
   * @returns No value.
   */
  private readonly startDesktop = (): void => {
    const mode = app.commandLine.hasSwitch("development") ? "development" : "production";
    this.server = utilityProcess.fork(
      fileURLToPath(new URL("../src/runtime/server.js", import.meta.url)),
      mode === "development" ? ["--development"] : [],
      {
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        env: { ...process.env, NODE_ENV: mode, CHULANE_DATA_DIR: process.env.CHULANE_DATA_DIR ?? join(app.getPath("userData"), "data") },
        serviceName: "Chulane web runtime",
        stdio: "inherit",
      },
    );
    this.server.once("message", this.handleReady);
    this.server.once("exit", this.handleServerExit);
  };

  /**
   * Reports a failed local runtime instead of leaving an unusable desktop window.
   * @param code - Exit status of the desktop-owned server.
   * @returns No value.
   */
  private readonly handleServerExit = (code: number): void => {
    this.server = undefined;
    if (this.quitting) {
      app.exit(this.exitCode || code || 0);
    } else {
      this.handleFailure(new Error(`Local Next.js server exited (${code}).`));
    }
  };

  /**
   * Reports startup failures and closes the application with an error status.
   * @param error - Failure encountered while starting or loading the application.
   * @returns No value.
   */
  private readonly handleFailure = (error: unknown): void => {
    // Destroying a window during quit can reject its pending loadURL promise.
    if (this.quitting) return;
    console.error("Unable to start Chulane:", error);
    this.exitCode = 1;
    if (this.server) app.quit();
    else app.exit(this.exitCode);
  };

  /**
   * Holds desktop exit until the owned runtime acknowledges completed cleanup.
   * @param event - Cancelable Electron quit event.
   * @returns No value.
   */
  private readonly stopServer = (event: Event): void => {
    if (!this.server) return;
    event.preventDefault();
    if (this.quitting) return;
    this.quitting = true;
    // Killing the utility process would bypass asynchronous plugin disposal.
    this.server.postMessage("shutdown");
  };

  /**
   * Recreates the window when macOS activates an application without windows.
   * @returns No value.
   */
  private readonly handleActivate = (): void => {
    if (this.origin && BrowserWindow.getAllWindows().length === 0) {
      void this.createWindow().catch(this.handleFailure);
    }
  };

  /**
   * Follows platform conventions for quitting after the last window closes.
   * @returns No value.
   */
  private readonly handleWindowsClosed = (): void => {
    if (process.platform !== "darwin") app.quit();
  };
}

new DesktopApplication().start();
