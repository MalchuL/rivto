import { EditorViewApi } from "./editor-view-api";
import { createEditorRuntime, type CreateEditorRuntimeOptions } from "./editor-runtime";
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
export function createTestReactEditor(options: Omit<CreateEditorRuntimeOptions, "editor"> & { readonly editor: RivtoEditorApi }): import("./types").EditorViewApi {
  const runtime = createEditorRuntime(options);
  let root: HTMLElement | null = null;
  let unregister: (() => void) | undefined;
  const disposers = new Set<() => void>();
  const editor = new EditorViewApi(runtime, {
    id: crypto.randomUUID(),
    getRoot: () => root,
    setRoot: (next) => {
      unregister?.();
      root = next;
      unregister = next ? runtime.events.registerDocumentView(next, runtime.getDocument(), undefined, editor) : undefined;
    },
    own: (dispose) => { disposers.add(dispose); return () => { disposers.delete(dispose); dispose(); }; },
  });
  const destroy = editor.destroy.bind(editor);
  runtime.extensions.own(destroy);
  editor.destroy = () => {
    const errors: unknown[] = [];
    for (const cleanup of [destroy, () => unregister?.(), ...disposers, () => runtime.destroy()]) {
      try { cleanup(); } catch (error) { errors.push(error); }
    }
    disposers.clear();
    if (errors.length === 1) throw errors[0];
    if (errors.length) throw new AggregateError(errors, "Test editor cleanup failed");
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
  await Promise.all(models.map((model) => runtime.getSingleEditor(model.id)));
  return runtime;
}
