import { createReactEditor, type CreateReactEditorOptions, type ReactEditor } from "./react-editor";
import { createRivtoEditor, type CreateRivtoEditorOptions, type RivtoEditorApi } from "@chulane/rivto";
import { DocumentModelImpl, type DocumentModel, type DocumentStorage } from "@chulane/document-model";
import { YjsDoc } from "@chulane/crdt-doc";
import { EditorStorage } from "./editor-storage";
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
export function createTestReactEditor(options: Omit<CreateReactEditorOptions, "editor"> & { readonly editor: RivtoEditorApi }): ReactEditor {
  return createReactEditor(options);
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
  await Promise.all(models.map((model) => runtime.getSingleEditor(model.id)));
  return runtime;
}
