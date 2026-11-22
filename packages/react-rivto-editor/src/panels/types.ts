import type { PanelBlockContextMenuManager } from "./managers/block-context-menu/panel-block-context-menu-manager";
import type { ReactPanel } from "./react-panel";
import type { DocumentModel } from "@chulane/document-model";
import type { PanelAPI, ModeManagerApi, EditorMode } from "@chulane/rivto";
import type { ReactEditorApi } from "../editor/types";
import type { PanelClipboardApi } from "./managers/clipboard/panel-clipboard-api";
import type { PanelEventsApi } from "../managers/events/api";
import type { KeyboardApi } from "../managers/keyboard/keyboard-api";
import type { PanelSelectionApi } from "../managers/selection/api";
import type { PanelSlashCommandsApi } from "./managers/slash/panel-slash-commands-api";
import type { BlockDropTargetsApi, BlockEditorNodeApi } from "@chulane/rivto-page";
import type { ReactNode } from "react";

/** Properties shared by document, subtree and embedding panels. */
export interface ReactPanelProps {
  /** React runtime owned by useReactEditor or managed EditorStorage; React components must not create instances manually. */
  readonly editor: ReactEditorApi;
  /** Independent element container; null or omitted selects document element roots. */
  readonly rootElementId?: string | null;
  /** Optional Panel-local presentation mode retained by the host. */
  readonly mode?: ModeManagerApi;
  /** False suspends hidden-tab interaction while retaining local bindings; defaults to true. */
  readonly active?: boolean;
  /**
   * Notifies the host after this panel mounts with its borrowed model.
   *
   * @param document - Model retained by the editor owner throughout the callback.
   * @returns After the host has observed the mounted document.
   */
  readonly onReady?: (document: DocumentModel) => void;
  /** Explicit PageSurface or EdgelessSurface, plus optional application chrome; extensions are registered at runtime creation. */
  readonly children?: ReactNode;
  /** False disables page virtualization, true always enables it, and a number sets the minimum root count; defaults to false. */
  readonly virtualizePageThreshold?: boolean | number;
  /** Extra mounted roots on each side of the viewport; defaults to 8. */
  readonly virtualizePageOverscan?: number;
}

/** Page placement lookup borrowed by panel interaction handlers. */
export interface PanelPageApi {
  /** Resolves a point using the mounted Page drop regions. */
  readonly dropTargets: Pick<BlockDropTargetsApi, "resolve">;
  /**
   * Borrows the occurrence's ID-bound theme operations without lifecycle ownership.
   *
   * @param id - Persisted block ID in the panel's accessible boundary.
   * @returns Stable node providing current theme reads and updates.
   * @throws If the page controller has been destroyed.
   */
  getNode(id: string): Pick<BlockEditorNodeApi, "getStyle" | "setStyle">;
}

/**
 * Public operations for one EditorPanel component displaying a document or subtree.
 *
 * Several panels can share the same runtime while using different DOM roots and
 * local event registrations. Use reactPanel.document.blocks, reactPanel.document.history, and the other
 * document managers for whole-document operations; reactPanel.editor owns registrations. Use this
 * panel's selection, clipboard, and slashCommands for browser interaction with its
 * own surface. Use reactPanel.blocks and reactPanel.elements for bounded editing; reactPanel.document.elements spans the document.
 * Shared registration methods delegate to the React editor; destroy releases only
 * this occurrence's resources and does not destroy the shared editor.
 *
 * Writing-block factories are installed by defaultWritingBlockExtension or a host
 * extension through editor.installDefaultWriting. ReactPanel implements
 * this contract; components obtain it from useReactPanel rather than constructing it.
 */
export interface ReactPanelApi extends PanelAPI, ReactEditorApi {
  /** Occurrence-local Page placement without attachment or registration ownership. */
  readonly page: PanelPageApi;
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
  /**
   * Reads the DOM root available to this panel's interaction handlers.
   *
   * @returns Mounted root, or null when unmounted or disabled.
   */
  getRoot(): HTMLElement | null;
  /**
   * Reads the rendered surface of this panel without changing shared document mode.
   * Unlike the panel's declared `mode.get()`, this reads markers on the mounted
   * root to describe the receiving DOM surface: a page embedding returns `block` even
   * when its document's core mode is `edgeless`. No additional mode is stored.
   * Event dispatch captures this value in `event.mode`; handlers should use that
   * snapshot. Use this method for panel-specific commands outside event handlers,
   * and the core mode manager for document-wide presentation choices.
   *
   * @returns Mounted panel's surface type, or the panel's declared mode when unmounted.
   * Unrecognized mounted roots use the registry's panel-mode fallback.
   */
  getSurfaceType(): EditorMode;
  /** Semantic keyboard actions and runtime shortcut overrides. */
  readonly keyboard: KeyboardApi;
  /** Reads the selection owned by this panel and synchronizes its DOM caret and highlights. */
  readonly selection: PanelSelectionApi;
  /** Menu actions bound to this panel and captured structural targets. */
  readonly blockContextMenu: Pick<
    PanelBlockContextMenuManager,
    keyof ReactEditorApi["blockContextMenu"] | "execute"
  >;
  /** Filters and executes shared command definitions using this panel as their context. */
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
