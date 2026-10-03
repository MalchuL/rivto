/**
 * Owns the Chulane desktop window and the lifetime of its local Next.js server.
 * The server runs in Electron's Node utility process and chooses a loopback
 * port, allowing desktop and web development to run simultaneously. The
 * renderer is sandboxed and receives no Node or filesystem privileges.
 */
const { app, BrowserWindow, utilityProcess } = require("electron");
const { join } = require("node:path");

let server;
let origin;
let quitting = false;

/**
 * Opens the shared Next.js UI once the desktop-owned server is ready.
 * @returns Resolves after the initial page has loaded.
 */
async function createWindow() {
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
function denyNewWindow() {
  return { action: "deny" };
}

/**
 * Keeps top-level navigation within this instance's local application origin.
 * @param event - Cancelable Electron navigation event.
 * @param url - Requested navigation destination.
 * @returns No value.
 */
function restrictNavigation(event, url) {
  if (new URL(url).origin !== origin) event.preventDefault();
}

/**
 * Receives the bound port directly from the owned server process.
 * @param port - Listening loopback port reported by the server.
 * @returns No value.
 */
function handleReady(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
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
function startDesktop() {
  const mode = app.commandLine.hasSwitch("development") ? "development" : "production";
  server = utilityProcess.fork(join(__dirname, "server.cjs"), [mode], {
    cwd: join(__dirname, ".."),
    env: { ...process.env, NODE_ENV: mode },
    serviceName: "Chulane web runtime",
  });
  server.once("message", handleReady);
  server.once("exit", handleServerExit);
}

/**
 * Reports a failed local runtime instead of leaving an unusable desktop window.
 * @param code - Exit status of the desktop-owned server.
 * @returns No value.
 */
function handleServerExit(code) {
  if (!quitting) handleFailure(new Error(`Local Next.js server exited (${code}).`));
}

/**
 * Reports startup failures and closes the application with an error status.
 * @param error - Failure encountered while starting or loading the application.
 * @returns No value.
 */
function handleFailure(error) {
  console.error("Unable to start Chulane:", error);
  stopServer();
  app.exit(1);
}

/**
 * Terminates the owned server when Electron quits, preventing orphan runtimes.
 * @returns No value.
 */
function stopServer() {
  quitting = true;
  server?.kill();
}

/**
 * Recreates the window when macOS activates an application without windows.
 * @returns No value.
 */
function handleActivate() {
  if (origin && BrowserWindow.getAllWindows().length === 0) {
    void createWindow().catch(handleFailure);
  }
}

/**
 * Follows platform conventions for quitting after the last window closes.
 * @returns No value.
 */
function handleWindowsClosed() {
  if (process.platform !== "darwin") app.quit();
}

app.whenReady().then(startDesktop).catch(handleFailure);
app.on("activate", handleActivate);
app.on("window-all-closed", handleWindowsClosed);
app.on("before-quit", stopServer);
