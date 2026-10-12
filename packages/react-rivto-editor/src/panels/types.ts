import type { DocumentModel } from "@chulane/document-model";
import type { DocumentViewScope } from "../managers/events/types";
import type { PanelBlocks } from "./panel-blocks";
import type { DocumentEditorAPI, ModeManagerApi } from "@chulane/rivto";
import type { ReactEditorApi } from "../editor/types";
import type { ViewClipboardApi } from "../managers/clipboard/api";
import type { ViewEventsApi } from "../managers/events/api";
import type { KeyboardApi } from "../managers/keyboard/keyboard-api";
import type { ViewSelectionApi } from "../managers/selection/api";
import type { ViewSlashCommandsApi } from "../managers/slash/api";
import type { PanelBlocksAPI } from "./panel-blocks-api";
import type { PanelElementsAPI } from "./panel-elements-api";

/**
 * Public operations for one EditorPanel component displaying a document or subtree.
 *
 * Several views can share the same runtime while using different DOM roots and
 * local event registrations. Use document.blocks, document.history, and the other
 * document managers for whole-document operations; editor owns registrations. Use this
 * view's selection, clipboard, and slashCommands for browser interaction with its
 * own surface. Use blocks and elements for bounded editing; document.elements spans the document.
 * The interface exposes neither mutable registries nor lifecycle methods.
 *
 * Writing-block factories are installed by defaultWritingBlockExtension or a host
 * extension through editor.installDefaultWriting. panel implementation implements
 * this contract; components obtain it from usePanel rather than constructing it.
 */
export interface PanelAPI {
  /** Shared document infrastructure; this occurrence never destroys it. */
  readonly editor: ReactEditorApi;
  /** Whole-document operations, independent of this panel boundary. */
  readonly document: DocumentEditorAPI;
  /** Reads and mutations constrained to the panel block tree. */
  readonly blocks: PanelBlocksAPI;
  /** Independent element container, excluded from panel operations. */
  readonly rootElementId: string | null;
  /** Elements of this view's canvas, with reads and writes restricted to it. */
  readonly elements: PanelElementsAPI;
  /** Panel-local mode by default; hosts can explicitly supply a shared ModeManager. */
  readonly mode: ModeManagerApi;
  /** Requests host navigation to a block; absent when navigation is not configured. */
  readonly openBlock?: OpenPanelBlock;
  /** Document identity exposed on a scoped view; document.getDocument always returns this editor's model. */
  readonly documentId: string;
  /**
   * Root block that bounds this subtree; undefined shows the full document.
   * An embedding displays the root and its descendants. A Panel displays only
   * its children, keeping the root available to the host as a title.
   */
  readonly rootBlockId?: string;
  /** Copy, cut, and paste using this occurrence's selection and destination. */
  readonly clipboard: ViewClipboardApi;
  /** Delegated native DOM event registration. */
  readonly events: ViewEventsApi;
  /** Semantic keyboard actions and runtime shortcut overrides. */
  readonly keyboard: KeyboardApi;
  /** Reads the selection owned by this view and synchronizes its DOM caret and highlights. */
  readonly selection: ViewSelectionApi;
  /** Filters and executes shared command definitions using this view as their context. */
  readonly slashCommands: ViewSlashCommandsApi;
  /** Observes deactivation so transient UI closes when another occurrence receives focus. */
  subscribeDeactivation(listener: () => void): () => void;
}

/** Configuration shared by the two concrete panel implementations. Roots select independent block and element trees. */
export interface PanelOptions {
  readonly rootBlockId?: string | null;
  readonly rootElementId?: string | null;
  readonly openBlock?: OpenPanelBlock;
  readonly mode?: ModeManagerApi;
}

/** Requests navigation without prescribing a window, tab, or persistence mechanism. */
export type OpenPanelBlock = (blockId: string) => void;

/**
 * Loading and availability state returned to React through useSyncExternalStore.
 *
 * Loading may include the borrowed document before local bindings are mounted, or
 * while an embedded root has not arrived. Available and missing states both keep
 * the document and view API; missing means a previously observed root was removed.
 * Document loading failures belong to the host; this panel observes only root availability.
 * The snapshot is replaced on change; its model and API are live references.
 */
export type PanelSnapshot =
  | { readonly status: "loading"; readonly document?: DocumentModel; readonly api?: PanelAPI; readonly retained?: boolean }
  | { readonly status: "available" | "missing"; readonly document: DocumentModel; readonly api: PanelAPI; readonly retained: boolean };

/** Internal panel instance with mount bindings; components expose only PanelAPI. */
export interface PanelInstance extends PanelAPI, DocumentViewScope {
  /** Concrete bounded operations used by internal lifecycle bindings. */
  readonly blocks: PanelBlocks;
  /** Returns the stable availability snapshot until a lifecycle or root change. */
  getSnapshot(): PanelSnapshot;
  /** Observes availability changes; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Connects local bindings; returns idempotent cleanup and supports a later mount. */
  mount(): () => void;
  /** Suspends hidden-panel interaction without releasing the shared editor. */
  setEnabled(enabled: boolean): void;
}
