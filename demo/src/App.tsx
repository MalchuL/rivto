import { useEffect, useState, useSyncExternalStore } from "react";
import {
  BlockDOMRenderer,
  type BlockDefinition,
  createSlashMenuPlugin,
  createRivtoEditor,
  defaultSlashItems,
  EdgelessCanvasRenderer,
  type EditorRendererProps,
  type EditorSnapshot,
  RIVTO_VERSION,
  RivtoEditor,
  type RivtoPlugin,
  YjsDoc,
} from "@chulane/rivto";

const STORAGE_KEY = "rivto-editor-v3-demo";

const initialContent = [
  { type: "paragraph", content: "# Rivto, block by block" },
  { type: "paragraph", content: "Select text to **format** it, or type / for block commands." },
  { type: "callout", content: "This custom block is registered by the demo plugin." },
  { type: "bulletListItem", content: "Switch between page and edgeless mode." },
  { type: "bulletListItem", content: "Drag blocks around on the canvas." },
  { type: "quote", content: "Both renderers share one DocumentModel backed by a CRDTDoc adapter." },
];

const calloutDefinition: BlockDefinition = {
  type: "callout",
  title: "Callout",
  render: ({ content }) => <aside className="demo-callout"><span aria-hidden="true">✦</span><div>{content}</div></aside>,
};

const demoPlugin: RivtoPlugin = {
  id: "rivto-demo-commands",
  blocks: [calloutDefinition],
  slashItems: [{ title: "Callout", aliases: ["note", "aside"], group: "Demo", block: { type: "callout" } }],
  events: {
    keydown: () => false,
  },
  blockEvents: { callout: { pointerdown: () => false } },
  commands: {
    "demo.addCallout": (editor) => editor.commands.execute("block.insert", {
      block: { type: "callout", content: "A block inserted through CommandRegistry." },
      afterId: editor.document.document.at(-1)?.id,
    }),
  },
  ui: [{ id: "demo.addCallout", slot: "toolbar", title: "Add callout", command: "demo.addCallout", modes: ["edgeless"] }],
};

function DemoPageRenderer(props: EditorRendererProps) {
  return <section className="renderer-frame" data-renderer="BlockDOMRenderer">
    <span className="renderer-label">BlockDOMRenderer</span>
    <BlockDOMRenderer {...props} />
  </section>;
}

function DemoCanvasRenderer(props: EditorRendererProps) {
  return <section className="renderer-frame" data-renderer="EdgelessCanvasRenderer">
    <span className="renderer-label">EdgelessCanvasRenderer</span>
    <EdgelessCanvasRenderer {...props} />
  </section>;
}

export function App() {
  const [instance] = useState(() => {
    const doc = new YjsDoc("rivto-v2-demo");
    const editor = createRivtoEditor({
      document: doc,
      plugins: [createSlashMenuPlugin(defaultSlashItems), demoPlugin],
    });
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        editor.commands.execute("document.load", { snapshot: JSON.parse(saved) as EditorSnapshot });
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        initialContent.forEach((block) => editor.commands.execute("block.insert", { block }));
      }
    } else {
      initialContent.forEach((block) => editor.commands.execute("block.insert", { block }));
    }
    return { doc, editor };
  });

  const revision = useSyncExternalStore(
    (listener) => instance.editor.subscribe(listener),
    () => instance.editor.revision,
    () => 0,
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(instance.editor.document.getSnapshot()));
  }, [instance, revision]);

  const runtime = useSyncExternalStore(
    (listener) => {
      const dispose = [
        instance.editor.subscribe(listener),
        instance.editor.commands.subscribe(listener),
        instance.editor.events.subscribe(listener),
      ];
      return () => dispose.forEach((unsubscribe) => unsubscribe());
    },
    () => JSON.stringify({
      mode: instance.editor.mode.get(),
      selection: instance.editor.selection.get()?.type ?? "none",
      event: instance.editor.events.lastEvent ?? "none",
      command: instance.editor.commands.lastExecuted ?? "none",
    }),
    () => "{}",
  );
  const runtimeState = JSON.parse(runtime) as Record<string, string>;

  useEffect(() => () => {
    instance.editor.destroy();
    instance.doc.destroy();
  }, [instance]);

  return (
    <main className="shell">
      <header>
        <div>
          <p className="eyebrow">Rivto playground · v{RIVTO_VERSION}</p>
          <h1>Collaborative block editor</h1>
        </div>
        <div className="header-actions">
          <button onClick={() => instance.editor.commands.execute<Record<string, () => unknown>>("demo.addCallout")}>Plugin command</button>
          <button onClick={() => {
            const blockIds = instance.editor.document.document.slice(0, 2).map((block) => block.id);
            if (blockIds.length) instance.editor.commands.execute("selection.set", { selection: {
              type: "block", blockIds, anchorBlockId: blockIds[0]!, focusBlockId: blockIds.at(-1)!,
            } });
          }}>Select blocks</button>
          <button
            onClick={() => {
              localStorage.removeItem(STORAGE_KEY);
              instance.editor.commands.execute("document.load", { snapshot: { version: 3, blocks: [], links: [] } });
              initialContent.forEach((block) => instance.editor.commands.execute("block.insert", { block }));
            }}
          >
            Reset document
          </button>
        </div>
      </header>

      <section className="architecture" aria-label="Editor architecture">
        <code>DocumentModel</code><span>→</span><code>EditorRuntime</code><span>→</span>
        <code>Renderer</code><span>→</span>
        <code>CRDTDoc</code><span>→</span><code>YjsDoc adapter</code>
      </section>

      <section className="runtime-inspector" aria-label="Runtime inspector">
        <strong>Runtime</strong>
        <span>Mode: <code>{runtimeState.mode}</code></span>
        <span>Selection: <code>{runtimeState.selection}</code></span>
        <span>Event: <code>{runtimeState.event}</code></span>
        <span>Command: <code>{runtimeState.command}</code></span>
      </section>

      <RivtoEditor
        editor={instance.editor}
        defaultBlockType="paragraph"
        renderers={{ page: DemoPageRenderer, edgeless: DemoCanvasRenderer }}
      />

      <div className="capabilities" aria-label="Enabled extension points">
        <span>Plugin: custom callout</span>
        <span>Events: plugin → block → fallback</span>
        <span>Clipboard: JSON + HTML + text</span>
        <span>Persistence: schema v3 snapshot</span>
      </div>

      <details className="snapshot">
        <summary>Schema v3 snapshot</summary>
        <pre>{JSON.stringify(instance.editor.document.getSnapshot(), null, 2)}</pre>
      </details>
      <p className="saved">Changes are saved to this browser automatically.</p>
    </main>
  );
}
