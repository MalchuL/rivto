/**
 * Local-first desktop composition of the demo's public editor APIs. This host
 * owns title, file identity, recovery, settings and commands; persisted editor
 * data and editing behavior remain entirely in the existing packages.
 * Save completion compares the exact serialized revision, preserving dirty state
 * when typing continues during a native file dialog or asynchronous disk write.
 */
import { Component, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createRivtoEditor, DocumentModelImpl, YjsDoc } from '@chulane/rivto';
import { createReactEditor, EditorView, standardPreset, pageDragExtension, edgelessPreset, edgelessVisualsExtension, kanbanExtension, tableExtension, columnsExtension, bentoExtension, createKanbanBlockInput, createTableBlockInput, createColumnsBlockInput, createBentoBlockInput } from '@chulane/rivto-react';
import { parseDocument, exportMarkdown, type DocumentFile } from './documents';
import { DEFAULT_SETTINGS, SettingsDialog, type Settings } from './settings';
import '@chulane/rivto-react/styles.css';
import './styles.css';

const APP_CLASS = 'desktop-app';
const SIDEBAR_CLASS = 'sidebar';
const WORKSPACE_CLASS = 'workspace';
const PAPER_CLASS = 'paper';
const TOOLBAR_CLASS = 'toolbar';
const STATUS_CLASS = 'status-bar';
const ERROR_CLASS = 'error-banner';
const TITLE_CLASS = 'document-title';
const DRAFT_KEY = 'rivto.desktop.draft.v1';
const SETTINGS_KEY = 'rivto.desktop.settings.v1';

/** Reads bounded settings defensively; corrupt preferences use defaults.
 * @returns Valid settings that can be applied through the public keymap API.
 */
function readSettings(): Settings {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    if (value && Number.isFinite(value.width) && value.width >= 560 && value.width <= 1440 && value.keymap && typeof value.keymap === 'object' && !Array.isArray(value.keymap) && Object.values(value.keymap).every((keys) => Array.isArray(keys) && keys.every((key) => typeof key === 'string'))) return value;
  } catch { /* Invalid preferences must never prevent opening a document. */ }
  return DEFAULT_SETTINGS;
}

/** Creates the standard editor and restores a crash-recovery draft if available.
 * @returns Owned runtimes and initial document metadata.
 */
function createSession() {
  const settings = readSettings();
  const editor = createRivtoEditor({ document: new DocumentModelImpl(new YjsDoc(`rivto-desktop-${crypto.randomUUID()}`)) });
  const reactEditor = createReactEditor({ editor, extensions: [standardPreset(), pageDragExtension(), ...edgelessPreset(), edgelessVisualsExtension(), kanbanExtension(), tableExtension(), columnsExtension(), bentoExtension()] });
  let error = '';
  for (const [id, keys] of Object.entries(settings.keymap)) {
    try { reactEditor.keyboard.setKeymapOverride(id, keys); }
    catch { delete settings.keymap[id]; }
  }
  let title = 'Untitled';
  let recovered = false;
  try {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      const document = parseDocument(draft);
      editor.load({ ...document.snapshot, pluginData: document.snapshot.pluginData ?? {} });
      title = document.title;
      recovered = true;
    }
  } catch { error = 'The recovery draft could not be loaded. It has been retained in local storage; open a saved JSON document to continue.'; }
  if (!recovered) editor.blocks.insertBlock({ type: 'paragraph', content: '' });
  editor.history.clear();
  return { editor, reactEditor, settings, title, recovered, error };
}

/** Keeps a rendering failure visible while leaving the recovery draft intact. */
class EditorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  /** Marks a failed subtree for fallback rendering.
   * @returns Error state.
   */
  static getDerivedStateFromError() { return { failed: true }; }
  /** Renders the editor or recovery instructions.
   * @returns Safe fallback when editor rendering fails.
   */
  render() { return this.state.failed ? <p role="alert">The editor could not render this document. Your recovery draft is retained. Restart Rivto or open another JSON file.</p> : this.props.children; }
}

/** Renders application chrome and manages asynchronous file operations.
 * @returns The desktop editor with native file controls and persistent settings.
 */
function App() {
  const [session] = useState(createSession);
  const { editor, reactEditor } = session;
  const [title, setTitle] = useState(session.title);
  const [path, setPath] = useState<string>();
  const [settings, setSettings] = useState(session.settings);
  const [showSettings, setShowSettings] = useState(false);
  const [mode, setMode] = useState<'block' | 'edgeless'>('block');
  const [error, setError] = useState(session.error);
  const [status, setStatus] = useState(session.recovered ? 'Recovered local draft — save to a JSON file' : 'Ready to write');
  const [dirty, setDirty] = useState(session.recovered);
  const [busy, setBusy] = useState(false);
  const [words, setWords] = useState(() => exportMarkdown({ format: 'rivto-document', version: 1, title: session.title, snapshot: editor.dump() }).match(/[\p{L}\p{N}]+/gu)?.length ?? 0);
  const working = useRef(false);
  const saved = useRef('');
  const latestTitle = useRef(title);
  latestTitle.current = title;

  /** Captures the latest title and editor data, including hidden descendants.
   * @returns Complete application document.
   */
  function documentValue(): DocumentFile { return { format: 'rivto-document', version: 1, title: latestTitle.current, snapshot: editor.dump() }; }
  /** Serializes a stable revision used for both disk writes and dirty comparisons.
   * @returns Full document JSON.
   */
  function serialize(): string { return JSON.stringify(documentValue(), null, 2); }
  if (!saved.current && !session.recovered) saved.current = serialize();

  /** Persists a recovery draft and updates document statistics.
   * @returns No value; storage failures are visible and never mark the file saved.
   */
  function updateDraft(): void {
    const text = serialize();
    setDirty(text !== saved.current);
    // ponytail: one synchronous recovery draft; use IndexedDB for documents beyond the localStorage quota.
    try { localStorage.setItem(DRAFT_KEY, text); }
    catch { setError('Local recovery storage is full or unavailable. Save your document to a JSON file now.'); }
    const markdown = exportMarkdown(documentValue());
    setWords(markdown.match(/[\p{L}\p{N}]+/gu)?.length ?? 0);
  }

  useEffect(() => {
    const unsubscribe = editor.subscribe(updateDraft);
    return () => { unsubscribe(); reactEditor.destroy(); void editor.destroy(); };
  }, [editor, reactEditor]);

  /** Saves a captured revision; cancellation leaves all dirty state intact.
   * @param saveAs - Whether to request a new destination.
   * @returns True only when the current revision is safely saved.
   */
  async function save(saveAs = false): Promise<boolean> {
    const text = serialize();
    const result = await window.desktop.save({ path: saveAs ? undefined : path, name: title || 'Untitled', text });
    if (result) {
      saved.current = text;
      setPath(result.path);
      const stillDirty = serialize() !== text;
      setDirty(stillDirty);
      setStatus(stillDirty ? 'Saved earlier revision — newer edits remain' : `Saved ${result.name}`);
    }
    return !!result && serialize() === text;
  }

  /** Resolves unsaved work before replacing or closing the document.
   * @returns Whether the requested destructive transition may continue.
   */
  async function canReplace(): Promise<boolean> {
    if (serialize() === saved.current) return true;
    const choice = await window.desktop.confirmReplace();
    return choice === 1 || (choice === 0 && await save());
  }

  /** Serializes commands to avoid overlapping dialogs and document replacements.
   * @param action - Requested application command.
   * @returns Resolves after completion or a visible error.
   */
  async function command(action: string): Promise<void> {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      if (action === 'save' || action === 'save-as') await save(action === 'save-as');
      else if (action === 'export') {
        const result = await window.desktop.save({ name: title || 'Untitled', text: exportMarkdown(documentValue()), markdown: true });
        if (result) setStatus(`Exported ${result.name} — canvas geometry stays in JSON`);
      } else if (action === 'settings') setShowSettings(true);
      else if (action === 'open') {
        if (await canReplace()) {
          const file = await window.desktop.open();
          if (file) {
            const document = parseDocument(file.text);
            // Core validation completes before mutation. Supplying every section
            // ensures plugin state from the previous file cannot leak into this one.
            editor.load({ ...document.snapshot, pluginData: document.snapshot.pluginData ?? {} });
            latestTitle.current = document.title;
            setTitle(document.title);
            setPath(file.path);
            saved.current = serialize();
            setDirty(false);
            updateDraft();
            setStatus(`Opened ${file.name}`);
          }
        }
      } else if (action === 'new') {
        if (await canReplace()) {
          editor.load({ version: 6, blocks: [], elements: [], pluginData: {} });
          editor.blocks.insertBlock({ type: 'paragraph', content: '' });
          editor.history.clear();
          latestTitle.current = 'Untitled';
          setTitle('Untitled'); setPath(undefined);
          saved.current = serialize();
          updateDraft(); setStatus('New document');
        }
      } else if (action === 'close' && await canReplace()) {
        localStorage.removeItem(DRAFT_KEY);
        await window.desktop.close();
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The operation failed. Your document is still open.'); }
    finally { working.current = false; setBusy(false); }
  }

  useEffect(() => {
    document.title = `${dirty ? '● ' : ''}${title || 'Untitled'} — Rivto`;
    const removeClose = window.desktop.onClose(() => { void command('close'); });
    /** Handles app chords before the editor so file actions work in all modes.
     * @param event - Window keyboard event.
     * @returns No value.
     */
    function keydown(event: KeyboardEvent): void {
      if (showSettings || !(event.ctrlKey || event.metaKey) || event.altKey || event.repeat) return;
      const key = event.key.toLowerCase();
      const action = key === 's' ? (event.shiftKey ? 'save-as' : 'save') : key === 'o' ? 'open' : key === 'n' ? 'new' : key === ',' ? 'settings' : key === 'e' && event.shiftKey ? 'export' : undefined;
      if (action) { event.preventDefault(); event.stopImmediatePropagation(); void command(action); }
    }
    window.addEventListener('keydown', keydown, true);
    return () => { removeClose(); window.removeEventListener('keydown', keydown, true); };
  });

  /** Applies preferences immediately and persists them independently of documents.
   * @param next - Validated dialog settings.
   * @returns No value.
   */
  function changeSettings(next: Settings): void {
    setSettings(next);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); }
    catch { setError('Settings could not be saved to local storage.'); }
  }

  return <div className={APP_CLASS}>
    <aside className={SIDEBAR_CLASS}>
      <header><strong>r<span>i</span>vto</strong><small>YOUR SPACE TO THINK</small></header>
      <button onClick={() => void command('new')} disabled={busy}>＋ New document</button>
      <button onClick={() => void command('open')} disabled={busy}>↗ Open document</button>
      <hr /><small>WORKSPACE</small><p aria-current="page">▤ {title || 'Untitled'}</p>
      <section><small>A LITTLE MOMENTUM</small><p>One thought.<br />Then the next.</p><span>Type / to explore blocks.<br />Tab to nest an idea.</span></section>
      <footer><button onClick={() => setShowSettings(true)}>⚙ Settings & shortcuts</button><small>Local files. Your ideas stay yours.</small></footer>
    </aside>
    <main className={WORKSPACE_CLASS}>
      <header className={TOOLBAR_CLASS}>
        <div role="group" aria-label="Editor mode">{(['block', 'edgeless'] as const).map((value) => <button key={value} aria-pressed={mode === value} onClick={() => { editor.mode.set(value); setMode(value); }}>{value === 'block' ? 'Page' : 'Canvas'}</button>)}</div>
        <span>{dirty ? 'Unsaved changes' : path ? 'All changes saved' : 'Local document'}</span>
        <button disabled={busy} onClick={() => void command('export')}>Export Markdown</button>
        <button disabled={busy} onClick={() => void command('save-as')}>Save as…</button>
        <button disabled={busy} onClick={() => void command('save')}>Save</button>
      </header>
      {error && <div role="alert" className={ERROR_CLASS}>{error}<button aria-label="Dismiss error" onClick={() => setError('')}>✕</button></div>}
      <article className={PAPER_CLASS} inert={busy} data-mode={mode} style={{ '--editor-width': `${settings.width}px` } as CSSProperties}>
        <div className={TITLE_CLASS}><small>MAKE SOMETHING WORTH KEEPING</small><input aria-label="Document title" maxLength={240} value={title} onChange={(event) => { latestTitle.current = event.target.value; setTitle(event.target.value); updateDraft(); }} placeholder="Untitled" />
          <nav aria-label="Insert block"><button onClick={() => editor.history.undo()}>Undo</button><button onClick={() => editor.history.redo()}>Redo</button>{Object.entries({ Kanban: createKanbanBlockInput, Table: createTableBlockInput, Columns: createColumnsBlockInput, Bento: createBentoBlockInput }).map(([label, create]) => <button key={label} onClick={() => editor.blocks.insertBlock(create(), editor.blocks.getRootIds().at(-1))}>＋ {label}</button>)}</nav>
        </div>
        <EditorBoundary key={path ?? 'untitled'}><EditorView reactEditor={reactEditor} /></EditorBoundary>
      </article>
      <footer className={STATUS_CLASS}><span role="status">{status}</span><span>{words} words · {mode === 'block' ? `${settings.width} px` : 'Infinite canvas'}</span></footer>
    </main>
    {showSettings && <SettingsDialog editor={reactEditor} settings={settings} onChange={changeSettings} onClose={() => setShowSettings(false)} />}
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
