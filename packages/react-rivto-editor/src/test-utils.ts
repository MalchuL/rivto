import { YjsDoc } from "@chulane/crdt-doc";
import { DocumentModelImpl, type DocumentModel, type DocumentStorage } from "@chulane/document-model";
import { createDocumentEditor, type CreateDocumentEditorOptions, type DocumentEditorAPI, ModeManager, type EditorMode } from "@chulane/rivto";
import { ChildrenPanel } from "./panels/children-panel";
import { createReactEditor, type CreateReactEditorOptions } from "./editor/react-editor";
import { EditorStorage } from "./editor/editor-storage";
import { DEFAULT_WRITING_BLOCK_TYPE } from "./extensions/built-ins/page/default-writing-block";

const modes = new WeakMap<DocumentEditorAPI, EditorMode>();

/**
 * Core editor for React package tests with a local writing type registered.
 *
 * Core no longer auto-installs a writing block; production hosts use
 * defaultWritingBlockExtension / standardPreset.
 * @param options - Optional model and test presentation kind; defaults to an owned empty model.
 * @returns Document API whose test destruction closes the core and owned document.
 */
export async function createTestCoreEditor(options: Partial<CreateDocumentEditorOptions> & { mode?: EditorMode } = {}): Promise<DocumentEditorAPI> {
  const document = options.document ?? new DocumentModelImpl(new YjsDoc(`rivto-react-test-${crypto.randomUUID()}`));
  const core = createDocumentEditor({ ...options, document });
  core.blockRegistry.defineBlock({ type: DEFAULT_WRITING_BLOCK_TYPE, title: "Paragraph" });
  const proxy = new Proxy(core, { get(target, key) {
    if (key === "destroy") return async () => { core.destroy(); await document.destroy(); };
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  modes.set(proxy, options.mode ?? "block");
  return proxy;
}

/** Creates a React runtime bound directly to the fixture's document. */
export function createTestReactEditor(options: Omit<CreateReactEditorOptions, "editor"> & { readonly editor: DocumentEditorAPI }): import("./types").PanelAPI {
  const runtime = createReactEditor(options);
  const editor = new ChildrenPanel(runtime, { mode: new ModeManager(modes.get(options.editor)) });
  // Headless fixtures have no registered root; release their mount before shared cleanup.
  const closePanel = editor.mount();
  const destroyRuntime = runtime.destroy.bind(runtime);
  runtime.destroy = () => {
    try { closePanel(); }
    finally { destroyRuntime(); }
  };
  return editor;
}

/** Opens seeded test models under one cache; storage only loads later identities. */
export async function createTestMultiEditor(models: readonly DocumentModel[], storage?: DocumentStorage, options: Omit<CreateReactEditorOptions, "editor"> | (() => Omit<CreateReactEditorOptions, "editor">) = {}): Promise<EditorStorage> {
  const seeds = new Map(models.map((model) => [model.id, model]));
  const runtime = new EditorStorage({
    openDocument: async (id) => {
      const seeded = seeds.get(id);
      seeds.delete(id);
      if (seeded) return seeded;
      return storage ? storage.openDocument(id) : new DocumentModelImpl(new YjsDoc(id));
    },
    createEditor: (editor) => {
      editor.blockRegistry.defineBlock({ type: DEFAULT_WRITING_BLOCK_TYPE });
      const configuration = typeof options === "function" ? options() : options;
      return createReactEditor({ ...configuration, editor });
    },
    lookupDocumentIds: storage ? (id, lookupOptions) => storage.findDocumentIdsWithBlock(id, lookupOptions) : undefined,
    subscribeDocumentIds: storage ? (listener) => storage.subscribe(listener) : undefined,
  });
  await Promise.all(models.map((model) => runtime.acquireEditor(model.id)));
  return runtime;
}
