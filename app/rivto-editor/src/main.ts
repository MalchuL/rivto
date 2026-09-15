/**
 * Owns the local desktop window and filesystem privileges. The sandboxed
 * renderer receives only explicit document operations, never arbitrary IPC or
 * filesystem access. File grants originate in native dialogs, writes are
 * atomic, and replacing an externally changed file requires a fresh Save As.
 */
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type IpcMainInvokeEvent } from 'electron';
import { join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { atomicWrite, fingerprint, MAX_FILE_BYTES, readDocument } from './files';

// Respect an explicit profile directory for isolated QA and portable launches.
const profile = app.commandLine.getSwitchValue('user-data-dir');
if (profile) app.setPath('userData', profile);

let mainWindow: BrowserWindow;
let closing = false;
const grants = new Map<string, string>();
const rendererPath = join(__dirname, 'renderer/index.html');
const rendererUrl = pathToFileURL(rendererPath).href;

/** Rejects privileged calls from any frame other than the app's main frame.
 * @param event - Incoming IPC invocation.
 * @returns No value; throws for an untrusted sender.
 */
function assertSender(event: IpcMainInvokeEvent): void {
  if (event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || event.senderFrame.url !== rendererUrl) {
    throw new Error('Untrusted document operation.');
  }
}

/** Validates bounded IPC text before it reaches disk.
 * @param text - Untrusted renderer payload.
 * @returns Validated text.
 */
function checkedText(text: unknown): string {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_FILE_BYTES) throw new Error('Invalid file contents or document exceeds 32 MB.');
  return text;
}

/** Creates the offline editor and wires native file operations.
 * @returns Resolves once the renderer has loaded.
 */
async function createWindow(): Promise<void> {
  closing = false;
  grants.clear();
  mainWindow = new BrowserWindow({
    title: 'Rivto', width: 1280, height: 880, minWidth: 760, minHeight: 560,
    backgroundColor: '#f5f4f0', show: false,
    webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });
  mainWindow.on('close', (event) => {
    if (!closing && !mainWindow.webContents.isCrashed()) {
      event.preventDefault();
      mainWindow.webContents.send('request-close');
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { role: 'editMenu' }, { role: 'windowMenu' },
  ]));
  await mainWindow.loadFile(rendererPath);
}

ipcMain.handle('open-document', async (event) => {
  assertSender(event);
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: 'Rivto documents', extensions: ['json'] }] });
  if (result.canceled) return null;
  const path = result.filePaths[0];
  const text = await readDocument(path);
  grants.set(path, fingerprint(text));
  return { path, name: basename(path), text };
});

ipcMain.handle('save-document', async (event, input: { path?: string; name?: string; text: string; markdown?: boolean }) => {
  assertSender(event);
  if (!input || typeof input !== 'object') throw new Error('Invalid save request.');
  const text = checkedText(input.text);
  const markdown = input.markdown === true;
  let path = input.path;
  if (path !== undefined && (typeof path !== 'string' || !grants.has(path) || markdown)) throw new Error('Choose a destination with Save As.');
  if (path) {
    const current = await readDocument(path);
    if (fingerprint(current) !== grants.get(path)) throw new Error('This file changed outside Rivto. Use Save As to preserve both versions.');
  } else {
    const extension = markdown ? 'md' : 'json';
    // eslint-disable-next-line no-control-regex -- Strip forbidden filename control characters at the IPC boundary.
    const name = typeof input.name === 'string' ? basename(input.name).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 120) : 'Untitled';
    const result = await dialog.showSaveDialog(mainWindow, { defaultPath: `${name}.${extension}`, filters: [{ name: markdown ? 'Markdown' : 'Rivto document', extensions: [extension] }] });
    if (result.canceled || !result.filePath) return null;
    path = result.filePath;
  }
  await atomicWrite(path, text);
  if (!markdown) grants.set(path, fingerprint(text));
  return { path, name: basename(path) };
});

ipcMain.handle('confirm-replace', async (event) => {
  assertSender(event);
  const result = await dialog.showMessageBox(mainWindow, { type: 'question', message: 'Save your changes?', detail: 'Your document has changes that have not been saved to its JSON file.', buttons: ['Save', 'Discard changes', 'Cancel'], defaultId: 0, cancelId: 2, noLink: true });
  return result.response;
});

ipcMain.handle('close-window', (event) => {
  assertSender(event);
  closing = true;
  mainWindow.close();
});

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow?.isMinimized()) mainWindow.restore(); mainWindow?.focus(); });
  app.whenReady().then(createWindow).catch((error: Error) => { dialog.showErrorBox('Unable to start Rivto', error.message); app.quit(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
}
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
