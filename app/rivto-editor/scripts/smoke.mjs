/**
 * Exercises the built Electron app through real renderer and filesystem flows.
 * Native dialogs are replaced inside the test process with temporary paths;
 * production preload and IPC handlers remain in use. No user files are touched.
 */
import process from 'node:process';
import console from 'node:console';
import { _electron } from '@playwright/test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const directory = await mkdtemp(join(tmpdir(), 'rivto-smoke-'));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const errors = [];
const packaged = process.argv[2];
const app = await _electron.launch({ executablePath: packaged || require('electron'), args: [...(packaged ? [] : [resolve(import.meta.dirname, '..')]), `--user-data-dir=${directory}/profile`], env });
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') console.error(message.text()); });
  await page.reload();
  await page.getByRole('textbox', { name: 'Document title', exact: true }).fill('Smoke notes');
  const editable = page.locator('[data-block-content]').first();
  await editable.click();
  await page.keyboard.type('Hello from the desktop');
  await page.getByRole('button', { name: '＋ Kanban', exact: true }).click();
  await app.evaluate(({ dialog }, directory) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: `${directory}/notes.json` });
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  }, directory);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Saved notes.json', { exact: true }).waitFor();
  const saved = JSON.parse(await readFile(join(directory, 'notes.json'), 'utf8'));
  assert.equal(saved.title, 'Smoke notes');
  assert(saved.snapshot.blocks.some((block) => block.content.includes('Hello from the desktop')));
  assert(saved.snapshot.blocks.some((block) => block.type === 'kanban'));
  await page.getByRole('button', { name: '⚙ Settings & shortcuts' }).click();
  await page.getByRole('slider', { name: 'Editor width' }).fill('1000');
  const shortcut = page.getByRole('textbox', { name: /Shortcut for/ }).first();
  await shortcut.fill('Primary+Shift+K');
  await shortcut.press('Enter');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.reload();
  await page.getByRole('textbox', { name: 'Document title', exact: true }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Document title', exact: true }).inputValue(), 'Smoke notes');
  assert.match(await page.locator('body').innerText(), /1000 px/);
  await page.getByRole('button', { name: '⚙ Settings & shortcuts' }).click();
  assert.equal(await page.getByRole('textbox', { name: /Shortcut for/ }).first().inputValue(), 'Primary+Shift+k');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const parent = saved.snapshot.blocks.find((block) => block.type === 'paragraph');
  parent.listProps = { collapsed: true };
  parent.children = [{ ...parent, id: 'smoke-child', content: 'Hidden child', children: [{ ...parent, id: 'smoke-deep', content: 'Deep thought', children: [] }] }];
  await writeFile(join(directory, 'notes.json'), JSON.stringify(saved));
  await app.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [`${directory}/notes.json`] });
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: `${directory}/notes.md` });
  }, directory);
  await page.getByRole('button', { name: '↗ Open document' }).click();
  await page.getByText('Opened notes.json', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Export Markdown', exact: true }).click();
  await page.getByText('Exported notes.md — canvas geometry stays in JSON', { exact: true }).waitFor();
  assert.match(await readFile(join(directory, 'notes.md'), 'utf8'), /Hello from the desktop/);
  assert.match(await readFile(join(directory, 'notes.md'), 'utf8'), /\| To do \| In progress \| Done \|/);
  assert.match(await readFile(join(directory, 'notes.md'), 'utf8'), /- Hidden child\n\n {4}- Deep thought/);
  await page.getByRole('textbox', { name: 'Document title', exact: true }).fill('Unsaved title');
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 2, checkboxChecked: false });
    dialog.showSaveDialog = async () => ({ canceled: true });
  });
  await page.getByRole('button', { name: 'Save as…', exact: true }).click();
  await page.getByText('Unsaved changes', { exact: true }).waitFor();
  await page.getByRole('button', { name: '＋ New document', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: 'Document title', exact: true }).inputValue(), 'Unsaved title');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await page.waitForTimeout(200);
  assert.equal(await page.getByRole('textbox', { name: 'Document title', exact: true }).inputValue(), 'Unsaved title');
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
  await writeFile(join(directory, 'notes.json'), 'external change');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'changed outside Rivto' }).waitFor();
  assert.equal(await readFile(join(directory, 'notes.json'), 'utf8'), 'external change');
  await page.getByRole('button', { name: '↗ Open document' }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Document title', exact: true }).inputValue(), 'Unsaved title');
  await page.getByRole('button', { name: 'Canvas', exact: true }).click();
  await page.getByRole('button', { name: 'Page', exact: true }).click();
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
  await page.screenshot({ path: join(directory, 'screenshot.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: editing, JSON save/open, Markdown export, settings persistence, draft recovery, external-edit conflict, invalid import, canceled save/new/close, collapsed export, page/canvas.');
  console.log(`Screenshot: ${directory}/screenshot.png`);
} catch (error) {
  const page = await app.firstWindow();
  console.error('Renderer errors:', errors, 'Body:', (await page.locator('body').innerText()).slice(0, 2500));
  await page.screenshot({ path: '/tmp/rivto-smoke-failure.png' });
  throw error;
} finally {
  await app.evaluate(({ app }) => app.exit());
  // Keep only the screenshot for review; all test documents are disposable.
  await rm(join(directory, 'profile'), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
