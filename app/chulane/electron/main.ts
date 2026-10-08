/**
 * Owns the Chulane desktop window and the lifetime of its local Next.js server.
 * The server runs in Electron's Node utility process and chooses a loopback
 * port, allowing desktop and web development to run simultaneously. The
 * renderer is sandboxed and receives no Node or filesystem privileges.
 */
import { app, BrowserWindow, utilityProcess, type Event, type UtilityProcess, type WindowOpenHandlerResponse } from "electron";
import { fileURLToPath } from "node:url";

let server: UtilityProcess | undefined;
let origin: string | undefined;
let quitting = false;
let exitCode = 0;

/**
 * Opens the shared Next.js UI once the desktop-owned server is ready.
 * @returns Resolves after the initial page has loaded.
 */
async function createWindow(): Promise<void> {
  if (!origin) return;
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
  window.webContents.setWindowOpenHandler(denyNewWindow);
  window.webContents.on("will-navigate", restrictNavigation);
  await window.loadURL(origin);
}

/**
 * Prevents web content from opening additional privileged desktop windows.
 * @returns The instruction to reject the new window.
 */
function denyNewWindow(): WindowOpenHandlerResponse {
  return { action: "deny" };
}

/**
 * Keeps top-level navigation within this instance's local application origin.
 * @param event - Cancelable Electron navigation event.
 * @param url - Requested navigation destination.
 * @returns No value.
 */
function restrictNavigation(event: Event, url: string): void {
  if (new URL(url).origin !== origin) event.preventDefault();
}

/**
 * Receives the bound port directly from the owned server process.
 * @param port - Listening loopback port reported by the server.
 * @returns No value.
 */
function handleReady(port: unknown): void {
  // Startup may finish after the user has already requested desktop shutdown.
  if (quitting) return;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) {
    handleFailure(new Error("Invalid local server port."));
    return;
  }
  origin = `http://127.0.0.1:${port}`;
  void createWindow().catch(handleFailure);
}

/**
 * Starts a local Next.js runtime using Electron's bundled Node environment.
 * @returns No value.
 */
function startDesktop(): void {
  const mode = app.commandLine.hasSwitch("development") ? "development" : "production";
  server = utilityProcess.fork(
    fileURLToPath(new URL("../src/runtime/server.js", import.meta.url)),
    mode === "development" ? ["--development"] : [],
    {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      env: { ...process.env, NODE_ENV: mode },
      serviceName: "Chulane web runtime",
      stdio: "inherit",
    },
  );
  server.once("message", handleReady);
  server.once("exit", handleServerExit);
}

/**
 * Reports a failed local runtime instead of leaving an unusable desktop window.
 * @param code - Exit status of the desktop-owned server.
 * @returns No value.
 */
function handleServerExit(code: number): void {
  server = undefined;
  if (quitting) {
    app.exit(exitCode || code || 0);
  } else {
    handleFailure(new Error(`Local Next.js server exited (${code}).`));
  }
}

/**
 * Reports startup failures and closes the application with an error status.
 * @param error - Failure encountered while starting or loading the application.
 * @returns No value.
 */
function handleFailure(error: unknown): void {
  // Destroying a window during quit can reject its pending loadURL promise.
  if (quitting) return;
  console.error("Unable to start Chulane:", error);
  exitCode = 1;
  if (server) app.quit();
  else app.exit(exitCode);
}

/**
 * Holds desktop exit until the owned runtime acknowledges completed cleanup.
 * @param event - Cancelable Electron quit event.
 * @returns No value.
 */
function stopServer(event: Event): void {
  if (!server) return;
  event.preventDefault();
  if (quitting) return;
  quitting = true;
  // Killing the utility process would bypass asynchronous plugin disposal.
  server.postMessage("shutdown");
}

/**
 * Recreates the window when macOS activates an application without windows.
 * @returns No value.
 */
function handleActivate(): void {
  if (origin && BrowserWindow.getAllWindows().length === 0) {
    void createWindow().catch(handleFailure);
  }
}

/**
 * Follows platform conventions for quitting after the last window closes.
 * @returns No value.
 */
function handleWindowsClosed(): void {
  if (process.platform !== "darwin") app.quit();
}

app.whenReady().then(startDesktop).catch(handleFailure);
app.on("activate", handleActivate);
app.on("window-all-closed", handleWindowsClosed);
app.on("before-quit", stopServer);
