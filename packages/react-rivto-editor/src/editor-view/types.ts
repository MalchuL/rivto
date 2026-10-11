import type { ElementTreeApi, ModeManagerApi } from "@chulane/rivto";
import type { Panel, OpenPanelBlock } from "./panel";
import type { EditorRuntime } from "../editor/editor-runtime";
import type { ViewClipboardApi } from "../managers/clipboard/api";
import type { ViewEventsApi } from "../managers/events/api";
import type { KeyboardApi } from "../managers/keyboard/keyboard-api";
import type { ViewSelectionApi } from "../managers/selection/api";
import type { ViewSlashCommandsApi } from "../managers/slash/api";

/**
 * Public operations for one EditorView component displaying a document or subtree.
 *
 * Several views can share the same runtime while using different DOM roots and
 * local event registrations. Use runtime.blocks, runtime.history, and the other
 * runtime managers for document operations and extension registration. Use this
 * view's selection, clipboard, and slashCommands for browser interaction with its
 * own surface. Use view.elements for its selected element subtree; runtime.elements spans the document.
 * The interface exposes neither mutable registries nor lifecycle methods.
 *
 * Writing-block factories are installed by defaultWritingBlockExtension or a host
 * extension through runtime.installDefaultWriting. EditorViewController implements
 * this contract; components obtain it from useEditorView rather than constructing it.
 */
export interface EditorViewApi {
  /** Shared document infrastructure; this occurrence never destroys it. */
  readonly runtime: EditorRuntime;
  /** Application-owned panel descriptor; absent for ordinary embeddings. */
  readonly panel?: Panel;
  /** Elements of this view's canvas, with reads and writes restricted to it. */
  readonly elements: ElementTreeApi;
  /** Panel-local mode, or the runtime mode for a plain EditorView. */
  readonly mode: ModeManagerApi;
  /** Ordered top-level blocks displayed by this view. */
  getRootBlockIds(): readonly string[];
  /** Requests host navigation to a block; absent when navigation is not configured. */
  readonly openBlock?: OpenPanelBlock;
  /** Document identity exposed on a scoped view; runtime.getDocument always returns this editor's model. */
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

