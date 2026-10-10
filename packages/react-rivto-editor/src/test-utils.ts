import { YjsDoc } from "@chulane/crdt-doc";
import { DocumentModelImpl, type DocumentModel, type DocumentStorage } from "@chulane/document-model";
import { createRivtoEditor, type CreateRivtoEditorOptions, type RivtoEditorApi } from "@chulane/rivto";
import { EditorViewController } from "./editor-view/editor-view-controller";
import { createEditorRuntime, type CreateEditorRuntimeOptions } from "./editor/editor-runtime";
import { EditorStorage } from "./editor/editor-storage";
import { DEFAULT_WRITING_BLOCK_TYPE } from "./extensions/built-ins/page/default-writing-block";

/**
 * Core editor for React package tests with a local writing type registered.
 *
 * Core no longer auto-installs a writing block; production hosts use
 * defaultWritingBlockExtension / standardPreset.
 * @param options - Optional model and test presentation kind; defaults to an owned empty model.
 * @returns Document API whose test destruction closes the core and owned document.
 */
export async function createTestCoreEditor(options: Partial<CreateRivtoEditorOptions> = {}): Promise<RivtoEditorApi> {
  const document = options.document ?? new DocumentModelImpl(new YjsDoc(`rivto-react-test-${crypto.randomUUID()}`));
  const core = createRivtoEditor({ ...options, document });
  core.blockRegistry.defineBlock({ type: DEFAULT_WRITING_BLOCK_TYPE, title: "Paragraph" });
  return new Proxy(core, { get(target, key) {
    if (key === "destroy") return async () => { core.destroy(); await document.destroy(); };
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}

/** Creates a React runtime bound directly to the fixture's document. */
export function createTestReactEditor(options: Omit<CreateEditorRuntimeOptions, "editor"> & { readonly editor: RivtoEditorApi }): import("./types").EditorViewApi {
  const runtime = createEditorRuntime(options);
  const editor = new EditorViewController(runtime);
  // Headless fixtures have no registered root; cancel their view before shared cleanup.
  const destroyRuntime = runtime.destroy.bind(runtime);
  runtime.destroy = () => {
    try { editor.cancelPendingSelection(); }
    finally { destroyRuntime(); }
  };
  return editor;
}

/** Opens seeded test models under one cache; storage only loads later identities. */
export async function createTestMultiEditor(models: readonly DocumentModel[], storage?: DocumentStorage, options: Omit<CreateEditorRuntimeOptions, "editor"> | (() => Omit<CreateEditorRuntimeOptions, "editor">) = {}): Promise<EditorStorage> {
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
      return createEditorRuntime({ ...configuration, editor });
    },
    lookupDocumentIds: storage ? (id, lookupOptions) => storage.findDocumentIdsWithBlock(id, lookupOptions) : undefined,
    subscribeDocumentIds: storage ? (listener) => storage.subscribe(listener) : undefined,
  });
  await Promise.all(models.map((model) => runtime.openCoreEditor(model.id)));
  return runtime;
}
