import {
  app,
  BrowserWindow,
  shell,
  type BrowserWindowConstructorOptions,
} from "electron";
import { createServer } from "node:http";

const DEV_URL = process.env.RIVTO_WEB_URL ?? "http://127.0.0.1:3000";
const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

function createWindowOptions(): BrowserWindowConstructorOptions {
  return {
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: "Rivto",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
}

async function waitForUrl(url: string, timeoutMs = 60_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok || response.status === 404) {
        return;
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow(createWindowOptions());

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowed = isDev ? DEV_URL : "http://127.0.0.1:";
    if (!url.startsWith(allowed) && !url.startsWith(DEV_URL)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  if (isDev) {
    await waitForUrl(DEV_URL);
    await mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // Production expects a local Next standalone server already running,
    // or RIVTO_WEB_URL pointing at the packaged web origin.
    const url = process.env.RIVTO_WEB_URL ?? "http://127.0.0.1:3000";
    await waitForUrl(url);
    await mainWindow.loadURL(url);
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    // Tiny local probe so packaged health checks can detect the shell process.
    createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("rivto-desktop");
    }).listen(0);

    await createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow();
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
