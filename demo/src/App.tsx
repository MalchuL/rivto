import { useEffect, useState, useSyncExternalStore } from "react";
import {
  BlockDOMRenderer,
  type BlockDefinition,
  createRivtoEditor,
  EdgelessCanvasRenderer,
  type EditorRendererProps,
  type Snapshot,
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
  content: "inline",
  title: "Callout",
  slash: { title: "Callout", aliases: ["note", "aside"], group: "Demo" },
  render: ({ content }) => <aside className="demo-callout"><span aria-hidden="true">✦</span><div>{content}</div></aside>,
};

const demoPlugin: RivtoPlugin = {
  id: "rivto-demo-commands",
  commands: {
    "demo.addCallout": (editor) => editor.insertBlock(
      { type: "callout", content: "A block inserted through PluginManager." },
      editor.document.at(-1)?.id,
    ),
  },
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
    const editor = createRivtoEditor({ document: doc });
    editor.defineBlock(calloutDefinition);
    editor.use(demoPlugin);
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        editor.loadSnapshot(JSON.parse(saved) as Snapshot);
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
    (listener) => instance.editor.subscribe("document", listener),
    () => instance.editor.revision,
    () => 0,
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(instance.editor.getSnapshot()));
  }, [instance, revision]);

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
          <button onClick={() => instance.editor.runCommand("demo.addCallout")}>Plugin command</button>
          <button
            onClick={() => {
              localStorage.removeItem(STORAGE_KEY);
              instance.editor.loadSnapshot({ version: 3, blocks: [], links: [] });
              initialContent.forEach((block) => instance.editor.insertBlock(block));
            }}
          >
            Reset document
          </button>
        </div>
      </header>

      <section className="architecture" aria-label="Editor architecture">
        <code>RivtoEditor</code><span>→</span><code>BlockRegistry</code><span>→</span>
        <code>DocumentModelImpl</code><span>→</span>
        <code>CRDTDoc</code><span>→</span><code>YjsDoc adapter</code>
      </section>

      <RivtoEditor
        editor={instance.editor}
        defaultBlockType="paragraph"
        renderers={{ page: DemoPageRenderer, edgeless: DemoCanvasRenderer }}
      />

      <div className="capabilities" aria-label="Enabled extension points">
        <span>Plugin: custom callout</span>
        <span>Clipboard: JSON + HTML + text</span>
        <span>Persistence: schema v3 snapshot</span>
      </div>

      <details className="snapshot">
        <summary>Schema v3 snapshot</summary>
        <pre>{JSON.stringify(instance.editor.getSnapshot(), null, 2)}</pre>
      </details>
      <p className="saved">Changes are saved to this browser automatically.</p>
    </main>
  );
}
