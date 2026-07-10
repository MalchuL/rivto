import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  createDefaultViewRegistries,
  createRivtoEditor,
  EditorView,
  type EditorSnapshot,
  RIVTO_VERSION,
  YjsDoc,
} from "@chulane/rivto";

const STORAGE_KEY = "rivto-editor-v3-demo";

const initialContent = [
  { type: "paragraph", content: "# Rivto, block by block" },
  { type: "paragraph", content: "This demo uses the new React EditorView path." },
  { type: "heading2", content: "Current architecture" },
  { type: "bulletListItem", content: "EditorRuntime owns document state and commands." },
  { type: "bulletListItem", content: "EditorView subscribes to editor revisions." },
  { type: "quote", content: "Surfaces choose layout; block renderers draw content." },
];

export function App() {
  const view = useMemo(() => createDefaultViewRegistries(), []);
  const [instance] = useState(() => {
    const doc = new YjsDoc("rivto-v3-demo");
    const editor = createRivtoEditor({ document: doc });
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved) {
      try {
        editor.load(JSON.parse(saved) as EditorSnapshot);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        initialContent.forEach((block) => editor.insertBlock(block));
      }
    } else {
      initialContent.forEach((block) => editor.insertBlock(block));
    }

    return { doc, editor };
  });

  const revision = useSyncExternalStore(
    (listener) => instance.editor.subscribe(listener),
    () => instance.editor.revision,
    () => 0,
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(instance.editor.dump()));
  }, [instance, revision]);

  useEffect(() => () => {
    instance.editor.destroy();
    instance.doc.destroy();
  }, [instance]);

  const mode = instance.editor.mode.get();

  return (
    <main className="shell">
      <header>
        <div>
          <p className="eyebrow">Rivto playground · v{RIVTO_VERSION}</p>
          <h1>Collaborative block editor</h1>
        </div>
        <div className="header-actions">
          <button onClick={() => instance.editor.insertBlock({ type: "paragraph", content: "New paragraph" })}>
            Add paragraph
          </button>
          <button onClick={() => instance.editor.mode.set(mode === "block" ? "edgeless" : "block")}>
            Mode: {mode}
          </button>
          <button
            onClick={() => {
              localStorage.removeItem(STORAGE_KEY);
              instance.editor.load({ version: 3, blocks: [], links: [] });
              initialContent.forEach((block) => instance.editor.insertBlock(block));
            }}
          >
            Reset document
          </button>
        </div>
      </header>

      <section className="architecture" aria-label="Editor architecture">
        <code>DocumentModel</code><span>→</span><code>EditorRuntime</code><span>→</span>
        <code>EditorView</code><span>→</span><code>Surface</code><span>→</span><code>BlockRenderer</code>
      </section>

      <section className="runtime-inspector" aria-label="Runtime inspector">
        <strong>Runtime</strong>
        <span>Mode: <code>{mode}</code></span>
        <span>Revision: <code>{revision}</code></span>
        <span>Blocks: <code>{instance.editor.getBlocks().length}</code></span>
        <span>Links: <code>{instance.editor.getLinks().length}</code></span>
      </section>

      <section className="renderer-frame" data-renderer="EditorView">
        <span className="renderer-label">EditorView</span>
        <EditorView editor={instance.editor} {...view} />
      </section>

      <div className="capabilities" aria-label="Enabled extension points">
        <span>Default surfaces</span>
        <span>Default block renderers</span>
        <span>Persistence: schema v3 snapshot</span>
      </div>

      <details className="snapshot">
        <summary>Schema v3 snapshot</summary>
        <pre>{JSON.stringify(instance.editor.dump(), null, 2)}</pre>
      </details>
      <p className="saved">Changes are saved to this browser automatically.</p>
    </main>
  );
}
