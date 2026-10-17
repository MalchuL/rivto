import type { ReactPanelApi } from "./panels/types";
import { createBlockOutlineContext } from "./block-behaviors/utils/context";
import { ReactPanel } from "./panels/react-panel";
import { YjsDoc } from "@chulane/crdt-doc";
import {
  DocumentModelImpl,
  type DocumentModel,
  type DocumentStorage,
} from "@chulane/document-model";
import {
  createDocumentEditor,
  type CreateDocumentEditorOptions,
  type DocumentEditorAPI,
  ModeManager,
  type EditorMode,
} from "@chulane/rivto";
import { ChildrenPanel } from "@chulane/rivto";
import { createReactEditor, type CreateReactEditorOptions } from "./editor/react-editor";
import { EditorStorage } from "./editor/editor-storage";
import { DEFAULT_WRITING_BLOCK_TYPE } from "./extensions/built-ins/page/default-writing-block";
import { createElement, type ReactNode } from "react";
import { ReactPanelContext } from "./components/editor-panel/react-panel-context";
import { EditorRootContext } from "./components/editor-panel/editor-root-context";
import { BlockElementRefBoundary } from "./blocks/block-wrapper/block-wrapper";

/**
 * Supplies an already constructed test panel to synchronous renderer and hook tests.
 * This fixture does not exercise the production component's effect lifecycle.
 * @param props - Test-owned panel and children; the test must destroy the panel after use.
 * @returns Internal contexts for rendering hooks without mounting a browser component.
 */
export function TestPanel({ panel, children }: { panel: ReactPanel; children?: ReactNode }) {
  return createElement(
    ReactPanelContext.Provider,
    {
      value: {
        reactPanel: panel,
        document: panel.document.getDocument(),
        documentId: panel.documentId,
        rootBlockId: panel.rootBlockId,
        domIdPrefix: panel.id,
        enabled: true,
      },
    },
    createElement(
      EditorRootContext.Provider,
      { value: { element: null, ref: panel.setRoot } },
      createElement(BlockElementRefBoundary, null, children),
    ),
  );
}

const modes = new WeakMap<DocumentEditorAPI, EditorMode>();

/**
 * Core editor for React package tests with a local writing type registered.
 *
 * Core no longer auto-installs a writing block; production hosts use
 * defaultWritingBlockExtension / standardPreset.
 * Set registerWritingBlock to false when the React extensions own this type;
 * their complete registration must not collide with a fixture definition.
 *
 * @param options - Optional model and test presentation kind; defaults to an owned empty model.
 * @param options.registerWritingBlock - Whether to define the fixture paragraph type in core; defaults to true.
 * @returns Document API whose test destruction closes the core and owned document.
 */
export async function createTestCoreEditor(
  options: Partial<CreateDocumentEditorOptions> & {
    mode?: EditorMode;
    registerWritingBlock?: boolean;
  } = {},
): Promise<DocumentEditorAPI> {
  const document =
    options.document ??
    new DocumentModelImpl(new YjsDoc(`rivto-react-test-${crypto.randomUUID()}`));
  const { registerWritingBlock = true, ...coreOptions } = options;
  const core = createDocumentEditor({ ...coreOptions, document });
  if (registerWritingBlock) {
    core.blockRegistry.defineBlock({
      type: DEFAULT_WRITING_BLOCK_TYPE,
      title: "Paragraph",
    });
  }
  const proxy = new Proxy(core, {
    /**
     * Binds fixture editor members and provides destruction that also releases the fixture document.
     *
     * @param target - DOM host or proxied owner being accessed.
     * @param key - Property or attribute key to access.
     * @returns Bound editor member, or the combined asynchronous destroy operation.
     */
    get(target, key) {
      if (key === "destroy") {
        return async () => {
          core.destroy();
          await document.destroy();
        };
      }
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  modes.set(proxy, options.mode ?? "block");
  return proxy;
}

/** Creates a React runtime bound directly to the fixture's document. */
export function createTestReactEditor(
  options: Omit<CreateReactEditorOptions, "editor"> & {
    readonly editor: DocumentEditorAPI;
  },
): ReactPanel {
  const runtime = createReactEditor(options);
  const editor = new ReactPanel(runtime, new ChildrenPanel(options.editor, {}), {
    mode: new ModeManager(modes.get(options.editor)),
  });
  // Headless fixtures have no registered root; destroy their panel before shared cleanup.
  runtime.registerCleanup(editor.destroy);
  return editor;
}

/**
 * Opens seeded test models under one cache; storage only loads later identities.
 *
 * React extensions register their complete definitions first. A fixture paragraph
 * definition is added afterward only when the extensions did not install one.
 *
 * @param models - Already loaded models consumed once before delegating to storage.
 * @param storage - Optional owner used to open and discover later document identities.
 * @param options - React settings or a factory evaluated for each new runtime.
 * @returns Initialized editor cache with every seeded model acquired.
 * @throws If delegated editor creation, definition registration, or model acquisition fails.
 */
export async function createTestMultiEditor(
  models: readonly DocumentModel[],
  storage?: DocumentStorage,
  options:
    | Omit<CreateReactEditorOptions, "editor">
    | (() => Omit<CreateReactEditorOptions, "editor">) = {},
): Promise<EditorStorage> {
  const seeds = new Map(models.map((model) => [model.id, model]));
  const runtime = new EditorStorage({
    openDocument: async (id) => {
      const seeded = seeds.get(id);
      seeds.delete(id);
      if (seeded) {
        return seeded;
      }
      return storage ? storage.openDocument(id) : new DocumentModelImpl(new YjsDoc(id));
    },
    /**
     * Creates React registrations before filling in the fixture writing type.
     *
     * @param editor - Core runtime owned by the cache.
     * @returns Runtime with a paragraph definition supplied by extensions or the fixture.
     * @throws If extension setup or definition registration fails.
     */
    createEditor: (editor) => {
      const configuration = typeof options === "function" ? options() : options;
      const runtime = createReactEditor({ ...configuration, editor });
      if (!editor.blockRegistry.has(DEFAULT_WRITING_BLOCK_TYPE)) {
        editor.blockRegistry.defineBlock({ type: DEFAULT_WRITING_BLOCK_TYPE });
      }
      return runtime;
    },
    lookupDocumentIds: storage
      ? (id, lookupOptions) => storage.findDocumentIdsWithBlock(id, lookupOptions)
      : undefined,
    subscribeDocumentIds: storage ? (listener) => storage.subscribe(listener) : undefined,
  });
  await Promise.all(models.map((model) => runtime.acquireEditor(model.id)));
  return runtime;
}

/**
 * Dispatches a headless test indent through parent and child behaviors in one panel batch.
 *
 * The first requested block selects the parent and child chains, preserving
 * the existing group anchor. Missing leading blocks produce no mutation.
 *
 * @param reactPanel - Occurrence providing current shallow block fields and commands.
 * @param ids - Complete group identifiers, passed unchanged to the handlers.
 * @returns After the claimed operation or standard indent completes.
 * @throws If a behavior or delegated block mutation fails.
 */
export function indentBlocks(reactPanel: ReactPanelApi, ids: readonly string[]): void {
  const context = createBlockOutlineContext(reactPanel, ids[0], reactPanel.selection.get());
  if (!context) {
    return;
  }
  reactPanel.batchUpdates(() =>
    reactPanel.editor.blockBehaviors.dispatch("onIndent", context, ids),
  );
}

/**
 * Dispatches a headless test outdent through parent and child behaviors in one panel batch.
 *
 * Exercises the same parent interception as Enter and Backspace without DOM setup.
 * The first requested block remains the operation's group anchor.
 *
 * @param reactPanel - Occurrence providing current shallow block fields and commands.
 * @param ids - Complete group identifiers, passed unchanged to the handlers.
 * @returns After the claimed operation or standard outdent completes; empty groups and missing leading blocks are ignored.
 * @throws If a behavior or delegated block mutation fails.
 */
export function outdentBlocks(reactPanel: ReactPanelApi, ids: readonly string[]): void {
  const context = createBlockOutlineContext(reactPanel, ids[0], reactPanel.selection.get());
  if (!context) {
    return;
  }
  reactPanel.batchUpdates(() =>
    reactPanel.editor.blockBehaviors.dispatch("onOutdent", context, ids),
  );
}
