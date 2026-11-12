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
import { useReactPanelContext } from "../../../hooks/editor/use-react-panel-context";
import type { ReactPanelApi } from "../../../panels/types";
import { EDGELESS_SELECTION_RUNTIMES_KEY, type EdgelessSelectionRuntimes } from "./shared";

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
export function isEdgelessSelectionActive(selection: Selection | undefined): boolean {
  const value = selection?.pluginData?.[EDGELESS_SELECTION_PLUGIN_KEY];
  return Boolean(
    value && typeof value === "object" && (value as { active?: unknown }).active === true,
  );
}

/** Core-backed panel used by edgeless gestures and React selection hooks. */
export class EdgelessSelectionRuntime {
  private snapshotSource: Selection | undefined;
  private snapshotValue: EdgelessSelectionSnapshot = { active: false, items: [] };

  /**
   * Creates an adapter over one editor's generic selection manager.
   * @param editor - Runtime whose core selection stores element state.
   */
  constructor(private readonly editor: ReactPanelApi | ReactEditorApi) {}

  /**
   * Reads the selection manager backing this edgeless runtime.
   *
   * @returns The editor selection API.
   */
  private get selection() {
    return this.editor.selection;
  }

  /** @returns Detached current canvas selection panel. */
  get(): EdgelessSelectionSnapshot {
    const current = this.selection.get();
    return { active: isEdgelessSelectionActive(current), items: [...(current?.elements ?? [])] };
  }

  /** @returns Stable snapshot until the underlying core selection changes. */
  snapshot(): EdgelessSelectionSnapshot {
    const current = this.selection.snapshot();
    if (current !== this.snapshotSource) {
      this.snapshotSource = current;
      this.snapshotValue = {
        active: isEdgelessSelectionActive(current),
        items: current?.elements ?? [],
      };
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
    this.selection.set(createEdgelessSelection(keepBlocks ? current : undefined, true, items));
  }

  /**
   * Replaces block coverage while retaining an active element selection.
   * @param blocks - Structural block selection produced by a Ctrl/Cmd gesture.
   * @returns No value.
   */
  setBlocks(blocks: Selection): void {
    const current = this.selection.get();
    const active = isEdgelessSelectionActive(current);
    this.selection.set({
      ...blocks,
      elements: active ? (current?.elements ?? []) : [],
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
    if (!current || !isEdgelessSelectionActive(current)) {
      return;
    }
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
    if (
      !current ||
      (!current.elements?.length && !(EDGELESS_SELECTION_PLUGIN_KEY in (current.pluginData ?? {})))
    ) {
      return;
    }
    const pluginData = { ...current.pluginData };
    delete pluginData[EDGELESS_SELECTION_PLUGIN_KEY];
    if (current.blocks.length || Object.keys(pluginData).length) {
      editor.selection.set({ ...current, elements: [], pluginData });
    } else {
      editor.selection.clear();
    }
  }
}

/** Tracks the optional extension's ownership of selection cleanup. */
const EDGELESS_SELECTION_INSTALLATION_KEY = "rivto.edgeless.selection-installation";

/**
 * Installs optional selection cleanup for one React editor or panel.
 *
 * Adapters remain editor-owned and available independently of this installation.
 * Removing the installation clears its selection data without destroying the
 * shared adapters used by other consumers.
 *
 * @param editor - Owning React editor instance or panel occurrence.
 * @returns Idempotent disposer that clears this installation's selection state.
 * @throws If selection cleanup is already installed or the editor is destroyed.
 */
export function installEdgelessRuntime(editor: ReactPanelApi | ReactEditorApi): () => void {
  const documentEditor = "editor" in editor ? editor.editor : editor;
  const space = documentEditor.extensions.shared;
  if (space.getValue<symbol>(EDGELESS_SELECTION_INSTALLATION_KEY)?.get()) {
    throw new Error("Edgeless selection runtime is already installed");
  }
  const runtime = getEdgelessRuntime(editor);
  const release = space.reserve(EDGELESS_SELECTION_INSTALLATION_KEY, "value");
  const installation = space.getValue<symbol>(EDGELESS_SELECTION_INSTALLATION_KEY)!;
  const token = Symbol("edgeless selection installation");
  installation.set(token);
  return () => {
    try {
      if (space.getValue<symbol>(EDGELESS_SELECTION_INSTALLATION_KEY)?.get() === token) {
        installation.set(undefined);
        runtime.destroy();
      }
    } finally {
      release();
    }
  };
}

/**
 * Returns the editor-owned canvas selection adapter.
 * Panel-bound APIs receive a cached adapter that reads their local selection;
 * adapters remain available independently of optional extension installation.
 * @param editor - Owning React editor instance or its document-bound panel API.
 * @returns The adapter for this editor or panel occurrence.
 * @throws If the owning editor's shared space has been destroyed.
 */
export function getEdgelessRuntime(
  editor: ReactPanelApi | ReactEditorApi,
): EdgelessSelectionRuntime {
  const runtime = findEdgelessRuntime(editor);
  if (!runtime) {
    throw new Error("Edgeless selection runtime is unavailable after editor destruction");
  }
  return runtime;
}

/**
 * Returns the editor-owned adapter while the shared runtime is active.
 * Panel-bound APIs receive a cached adapter independently of optional extensions.
 * @param editor - Owning React editor instance or its document-bound panel API.
 * @returns The adapter, or undefined after its editor's shared space is destroyed.
 */
export function findEdgelessRuntime(
  editor: ReactPanelApi | ReactEditorApi,
): EdgelessSelectionRuntime | undefined {
  const documentEditor = "editor" in editor ? editor.editor : editor;
  const adapters = documentEditor.extensions.shared
    .getValue<EdgelessSelectionRuntimes>(EDGELESS_SELECTION_RUNTIMES_KEY)
    ?.get();
  if (!adapters) {
    return undefined;
  }
  let runtime = adapters.get(editor);
  if (!runtime) {
    runtime = new EdgelessSelectionRuntime(editor);
    adapters.set(editor, runtime);
  }
  return runtime;
}

/** @returns Reactive full canvas selection for ordered element consumers. */
export function useEdgelessSelection(): EdgelessSelectionSnapshot {
  const { reactPanel } = useReactPanelContext();
  const runtime = getEdgelessRuntime(reactPanel);
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
  const { reactPanel } = useReactPanelContext();
  const runtime = getEdgelessRuntime(reactPanel);
  return useSyncExternalStore(
    (listener) => runtime.subscribe(listener),
    () => runtime.isSelected(id),
    () => runtime.isSelected(id),
  );
}
