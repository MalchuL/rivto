import { PanelBlockContextMenuManager } from "../managers/block-context-menu/panel-manager";
import type { ReactPanel } from "./react-panel";
import type { DocumentModel } from "@chulane/document-model";
import type { PanelAPI, ModeManagerApi } from "@chulane/rivto";
import type { ReactEditorApi } from "../editor/types";
import type { PanelClipboardApi } from "../managers/clipboard/api";
import type { PanelEventsApi } from "../managers/events/api";
import type { KeyboardApi } from "../managers/keyboard/keyboard-api";
import type { PanelSelectionApi } from "../managers/selection/api";
import type { PanelSlashCommandsApi } from "../managers/slash/api";

/**
 * Public operations for one EditorPanel component displaying a document or subtree.
 *
 * Several panels can share the same runtime while using different DOM roots and
 * local event registrations. Use reactPanel.document.blocks, reactPanel.document.history, and the other
 * document managers for whole-document operations; reactPanel.editor owns registrations. Use this
 * panel's selection, clipboard, and slashCommands for browser interaction with its
 * own surface. Use reactPanel.blocks and reactPanel.elements for bounded editing; reactPanel.document.elements spans the document.
 * The interface exposes cleanup registration without exposing mutable registries or panel destruction.
 *
 * Writing-block factories are installed by defaultWritingBlockExtension or a host
 * extension through editor.installDefaultWriting. ReactPanel implements
 * this contract; components obtain it from useReactPanel rather than constructing it.
 */
export interface ReactPanelApi extends PanelAPI {
  /**
   * Adds synchronous cleanup to this panel's local registration list.
   * Other panels and the shared runtime retain their resources when this panel closes.
   * @param release - Cleanup for a resource owned by this panel occurrence.
   * @returns Idempotent disposer; panel destruction calls it if still retained.
   * @throws If panel destruction has started, or if the returned disposer's cleanup fails.
   */
  registerCleanup(release: () => void): () => void;
  /** Shared document infrastructure; this occurrence never destroys it. */
  readonly editor: ReactEditorApi;
  /** Panel-local mode by default; hosts can explicitly supply a shared ModeManager. */
  readonly mode: ModeManagerApi;
  /** Copy, cut, and paste using this occurrence's selection and destination. */
  readonly clipboard: PanelClipboardApi;
  /** Delegated native DOM event registration. */
  readonly events: PanelEventsApi;
  /** Semantic keyboard actions and runtime shortcut overrides. */
  readonly keyboard: KeyboardApi;
  /** Reads the selection owned by this panel and synchronizes its DOM caret and highlights. */
  readonly selection: PanelSelectionApi;
  /** Filters and executes shared command definitions using this panel as their context. */
  /** Menu actions bound to this panel and captured structural targets. */
  readonly blockContextMenu: PanelBlockContextMenuManager;
  readonly slashCommands: PanelSlashCommandsApi;
  /** Observes deactivation so transient UI closes when another occurrence receives focus. */
  subscribeDeactivation(listener: () => void): () => void;
}

/** Browser configuration around a framework-neutral panel. Presentation modes belong to each displayed occurrence. */
export interface PanelOptions {
  readonly mode?: ModeManagerApi;
}

/**
 * Loading and availability state returned to React through useSyncExternalStore.
 *
 * Before the hook's creation effect and after destruction, loading has no panel API.
 * A connected panel may also be loading while an embedded root has not arrived.
 * Available and missing states both keep
 * the document and panel API; missing means a previously observed root was removed.
 * Document loading failures belong to the host; this panel observes only root availability.
 * The snapshot is replaced on change; its model and API are live references.
 */
export type PanelSnapshot =
  | {
      readonly status: "loading";
      readonly document?: DocumentModel;
      readonly api?: ReactPanel;
      readonly retained?: boolean;
    }
  | {
      readonly status: "available" | "missing";
      readonly document: DocumentModel;
      readonly api: ReactPanel;
      readonly retained: boolean;
    };
