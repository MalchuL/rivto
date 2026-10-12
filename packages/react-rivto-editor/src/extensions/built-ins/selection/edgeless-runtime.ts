import type { ReactEditorApi } from "../../../editor/types";
import type { EdgelessSelectionRef, EdgelessSelectionSnapshot } from "./types";
/**
 * Projects the core generic selection into the edgeless selection API.
 *
 * Element IDs live in `Selection.elements`; the extension-owned active flag
 * lives in `Selection.pluginData`. This adapter keeps canvas hooks small while
 * core remains the only selection store.
 */
import { isStructuralSelection, type Selection } from "@chulane/rivto";
import { useSyncExternalStore } from "react";
import { useEditorContext } from "../../../hooks/editor/use-editor-context";
import type { PanelAPI } from "../../../panels/types";

const EDGELESS_SELECTION_PLUGIN_KEY = "edgelessSelection";

/**
 * Builds a generic selection with active edgeless element state.
 * @param current - Existing selection whose block and plugin data should survive.
 * @param active - Whether edgeless interaction owns selection focus.
 * @param elements - Selected first-class element IDs.
 * @returns Complete selection suitable for the core selection manager.
 */
export function createEdgelessSelection(
  current: Selection | undefined,
  active: boolean,
  elements: readonly string[] = [],
): Selection {
  return {
    type: "selection",
    blocks: current?.blocks ?? [],
    anchorBlockId: current?.anchorBlockId,
    focusBlockId: current?.focusBlockId,
    reversed: current?.reversed,
    elements: [...new Set(elements.filter(Boolean))],
    pluginData: {
      ...(current?.pluginData ?? {}),
      [EDGELESS_SELECTION_PLUGIN_KEY]: { active },
    },
  };
}

/**
 * Reads the extension-owned active bit from generic plugin data.
 * @param selection - Generic selection that may carry edgeless metadata.
 * @returns Whether edgeless interaction owns selection focus.
 */
function isActive(selection: Selection | undefined): boolean {
  const value = selection?.pluginData?.[EDGELESS_SELECTION_PLUGIN_KEY];
  return Boolean(value && typeof value === "object" && (value as { active?: unknown }).active === true);
}

/** Core-backed view used by edgeless gestures and React selection hooks. */
export class EdgelessSelectionRuntime {
  private snapshotSource: Selection | undefined;
  private snapshotValue: EdgelessSelectionSnapshot = { active: false, items: [] };

  /**
   * Creates an adapter over one editor's generic selection manager.
   * @param editor - Runtime whose core selection stores element state.
   */
  constructor(private readonly editor: PanelAPI | ReactEditorApi) {}

  private get selection() { return "editor" in this.editor ? this.editor.selection : this.editor.document.selection; }

  /** @returns Detached current canvas selection view. */
  get(): EdgelessSelectionSnapshot {
    const current = this.selection.get();
    return { active: isActive(current), items: [...(current?.elements ?? [])] };
  }

  /** @returns Stable snapshot until the underlying core selection changes. */
  snapshot(): EdgelessSelectionSnapshot {
    const current = this.selection.snapshot();
    if (current !== this.snapshotSource) {
      this.snapshotSource = current;
      this.snapshotValue = { active: isActive(current), items: current?.elements ?? [] };
    }
    return this.snapshotValue;
  }

  /**
   * Reports whether one canvas object is actively selected.
   * @param id - Stable first-class element ID.
   * @returns True while the edgeless selection is active and contains `id`.
   */
  isSelected(id: string): boolean {
    const current = this.snapshot();
    return current.active && current.items.includes(id);
  }

  /**
   * Replaces and activates selected elements in the generic selection.
   * Partial text and carets are cleared; structural blocks remain for mixed
   * Ctrl/Cmd selection with canvas elements.
   * @param items - Ordered element IDs.
   * @returns No value.
   */
  set(items: readonly EdgelessSelectionRef[]): void {
    const current = this.selection.get();
    const keepBlocks = current && isStructuralSelection(current);
    this.selection.set(createEdgelessSelection(
      keepBlocks ? current : undefined,
      true,
      items,
    ));
  }

  /**
   * Replaces block coverage while retaining an active element selection.
   * @param blocks - Structural block selection produced by a Ctrl/Cmd gesture.
   * @returns No value.
   */
  setBlocks(blocks: Selection): void {
    const current = this.selection.get();
    const active = isActive(current);
    this.selection.set({
      ...blocks,
      elements: active ? current?.elements ?? [] : [],
      pluginData: {
        ...(current?.pluginData ?? {}),
        ...(blocks.pluginData ?? {}),
        [EDGELESS_SELECTION_PLUGIN_KEY]: { active },
      },
    });
  }

  /** Deactivates selected elements while retaining their IDs. */
  deactivate(): void {
    const current = this.selection.get();
    if (!current || !isActive(current)) return;
    this.selection.set(createEdgelessSelection(current, false, current.elements));
  }

  /** Clears selected elements and keeps edgeless selection active. */
  clear(): void {
    const current = this.selection.get();
    this.selection.set(createEdgelessSelection(current, true));
  }

  /**
   * Subscribes to the core selection manager.
   * @param listener - Change callback.
   * @returns Subscription disposer.
   */
  subscribe(listener: () => void): () => void {
    return this.selection.subscribe(listener);
  }

  /** Removes edgeless-owned data while retaining other generic selection data. */
  destroy(): void {
    const editor = { selection: this.selection };
    const current = editor.selection.get();
    if (!current || (!(current.elements?.length) && !(EDGELESS_SELECTION_PLUGIN_KEY in (current.pluginData ?? {})))) return;
    const pluginData = { ...current.pluginData };
    delete pluginData[EDGELESS_SELECTION_PLUGIN_KEY];
    if (current.blocks.length || Object.keys(pluginData).length) {
      editor.selection.set({ ...current, elements: [], pluginData });
    } else {
      editor.selection.clear();
    }
  }
}

// Installation belongs to the shared editor; adapters read through each view's
// bound selection API so identical element IDs in other views stay unselected.
const runtimes = new WeakMap<ReactEditorApi["extensions"], WeakMap<PanelAPI | ReactEditorApi, EdgelessSelectionRuntime>>();

/**
 * Installs the core-backed canvas selection adapter for one React editor.
 * @param editor - Owning React editor instance.
 * @returns Disposer that removes the adapter.
 */
export function installEdgelessRuntime(editor: PanelAPI | ReactEditorApi): () => void {
  const documentEditor = "editor" in editor ? editor.editor : editor;
  if (runtimes.has(documentEditor.extensions)) throw new Error("Edgeless selection runtime is already installed");
  const runtime = new EdgelessSelectionRuntime(editor);
  const adapters = new WeakMap<PanelAPI | ReactEditorApi, EdgelessSelectionRuntime>();
  adapters.set(editor, runtime);
  runtimes.set(documentEditor.extensions, adapters);
  return () => {
    if (runtimes.get(documentEditor.extensions) !== adapters) return;
    runtimes.delete(documentEditor.extensions);
    runtime.destroy();
  };
}

/**
 * Returns the installed canvas selection adapter.
 * View-bound APIs receive a cached adapter that reads their local selection;
 * installation and cleanup remain owned by the shared extension runtime.
 * @param editor - Owning React editor instance or its document-bound view API.
 * @returns Installed adapter.
 */
export function getEdgelessRuntime(editor: PanelAPI | ReactEditorApi): EdgelessSelectionRuntime {
  const runtime = findEdgelessRuntime(editor);
  if (!runtime) throw new Error("Install edgelessSelectionExtension before edgeless interactions");
  return runtime;
}

/**
 * Returns the optional installed adapter.
 * View-bound APIs receive a cached adapter while the shared extension is installed.
 * @param editor - Owning React editor instance or its document-bound view API.
 * @returns Installed adapter, or undefined.
 */
export function findEdgelessRuntime(editor: PanelAPI | ReactEditorApi): EdgelessSelectionRuntime | undefined {
  const documentEditor = "editor" in editor ? editor.editor : editor;
  const adapters = runtimes.get(documentEditor.extensions);
  if (!adapters) return undefined;
  let runtime = adapters.get(editor);
  if (!runtime) {
    runtime = new EdgelessSelectionRuntime(editor);
    adapters.set(editor, runtime);
  }
  return runtime;
}

/** @returns Reactive full canvas selection for ordered element consumers. */
export function useEdgelessSelection(): EdgelessSelectionSnapshot {
  const { panel } = useEditorContext();
  const runtime = getEdgelessRuntime(panel);
  return useSyncExternalStore(
    (listener) => runtime.subscribe(listener),
    () => runtime.snapshot(),
    () => runtime.snapshot(),
  );
}

/**
 * Returns the reactive selected bit for one canvas object.
 * @param id - Stable first-class element ID.
 * @returns Whether that element is actively selected.
 */
export function useEdgelessSelected(id: string): boolean {
  const { panel } = useEditorContext();
  const runtime = getEdgelessRuntime(panel);
  return useSyncExternalStore(
    (listener) => runtime.subscribe(listener),
    () => runtime.isSelected(id),
    () => runtime.isSelected(id),
  );
}
