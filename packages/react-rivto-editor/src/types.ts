import type { DocumentViewScope } from "./managers/events/document-view";
import type { EditorRuntime } from "./editor-runtime";
import type { ReactSelectionManager } from "./managers/selection/selection-manager";
import type { BlockElementProjection } from "./elements/block-element-projection";
import type {
  CommandRegistryApi,
  ElementManagerApi,
  RivtoEditorApi,
  HistoryManagerApi,
  ModeManagerApi,
} from "@chulane/rivto";
import type { DocumentModel } from "@chulane/document-model";
import type {
  BlockRenderer,
  KeymapOverrides,
  ReactEditorExtension,
} from "./managers";
import type {
  BlockListPropsCapability,
  BlockTypesCapability,
  BlocksCapability,
  ClipboardCapability,
  EventsCapability,
  ExtensionsCapability,
  KeyboardCapability,
  RenderersCapability,
  SlashCommandsCapability,
  SurfacesCapability,
  ViewsCapability,
} from "./capabilities";
import type { MouseEvent } from "react";
import type { CreateDefaultBlock, IsEmptyBlock } from "./extensions/built-ins/page/default-writing-block";

/** Context supplied when a rendered Markdown link is activated. */
export interface MarkdownLinkClick {
  /** Block containing the rendered link. */
  readonly blockId: string;
  /** Sanitized standard URL or explicitly enabled custom-protocol URL. */
  readonly href: string;
  /** Native React click wrapper; prevent its default action for local routing. */
  readonly event: MouseEvent<HTMLAnchorElement>;
}

/** Creation options for the React presentation runtime. */
export interface CreateEditorRuntimeOptions {
  /** Existing fixed document editor; the caller or EditorStorage owns its destruction. */
  readonly editor: RivtoEditorApi;
  /** Functional extensions installed synchronously in declaration order. */
  readonly extensions?: readonly ReactEditorExtension[];
  /** Stable binding-ID overrides; empty arrays disable matching bindings. */
  readonly keymap?: KeymapOverrides;
  /** Renderer used for persisted block types unknown to this React runtime. */
  readonly unknownBlockRenderer?: BlockRenderer;
}

/**
 * Coordinates React presentation managers around one permanently bound core editor.
 *
 * Managers are public extension boundaries. Extensions register directly through
 * `blocks`, `renderers`, `views`, `surfaces`, `extensions`, `events`, `keyboard`,
 * `selection`, and `slashCommands`; EditorViewApi deliberately exposes no
 * forwarding registry methods or mutable collections.
 *
 * Writing-block factories are installed by `defaultWritingBlockExtension`
 * (or a host equivalent) via {@link installDefaultWriting}.
 */
export interface EditorViewApi {
  /** Shared document infrastructure; this occurrence never destroys it. */
  readonly runtime: EditorRuntime;
  /** Stable occurrence identity, root, and registration ownership. */
  readonly view: DocumentViewScope;
  /** Core first-class element operations. */
  readonly elements: ElementManagerApi;
  /** Shared block-card projection and defaults for this document. */
  readonly blockElements: Pick<BlockElementProjection, "reconcile" | "schedule" | "setDefaultWidth" | "setOverlapAvoidance">;
  /** Document identity exposed on a scoped view; getDocument always returns this editor's model. */
  readonly documentId: string;
  /**
   * Root block of the displayed subtree, including the block and its descendants.
   * Used to show a subtree in views such as embeddings; undefined shows the full document.
   */
  readonly rootBlockId?: string;
  /** Named command registry used by extensions. */
  readonly commands: CommandRegistryApi;
  /** Core presentation mode; shared by this document's views and local to this editor. */
  readonly mode: ModeManagerApi;
  /** Local history and transaction batching. */
  readonly history: HistoryManagerApi;
  /** Core editor revision forwarded for React's global invalidation boundary. */
  readonly revision: number;
  /**
   * Factory for empty writing blocks (Enter, trailing insert, separator, …).
   *
   * Throws until {@link installDefaultWriting} runs.
   */
  createDefaultBlock: CreateDefaultBlock;
  /**
   * Empty-block predicate for Enter outdent, list reset, and related paths.
   *
   * Throws until {@link installDefaultWriting} runs.
   */
  isEmptyBlock: IsEmptyBlock;
  /**
   * Installs writing factories. Called by `defaultWritingBlockExtension`.
   *
   * @returns Disposer that restores the previous factories.
   */
  installDefaultWriting(options: {
    createDefaultBlock: CreateDefaultBlock;
    isEmptyBlock: IsEmptyBlock;
  }): () => void;
  readonly renderers: RenderersCapability;
  /** Per-type outline and drop behavior resolved by page dispatchers. */
  readonly views: ViewsCapability;
  /** Guarded mutations and delegated core block operations. */
  readonly blocks: BlocksCapability;
  /** Atomic React block-type and presentation registration. */
  readonly blockTypes: BlockTypesCapability;
  /** Core list-property policy registered with React extension lifecycle ownership. */
  readonly blockListProps: BlockListPropsCapability;
  /** React-owned portable clipboard formatter and parser registry. */
  readonly clipboard: ClipboardCapability;
  readonly surfaces: SurfacesCapability;
  readonly extensions: ExtensionsCapability;
  /** Delegated native DOM event registration. */
  readonly events: EventsCapability;
  /** Semantic keyboard actions and runtime shortcut overrides. */
  readonly keyboard: KeyboardCapability;
  readonly selection: ReactSelectionManager;
  readonly slashCommands: SlashCommandsCapability;
  /** Subscribes to this document, its local mode, and core definitions; selection has its own stream. */
  subscribe(listener: () => void): () => void;
  /**
   * @returns The permanently bound model used by every manager in this editor.
   */
  getDocument(): DocumentModel;
  destroy(): void;
}

/**
 * Document managers and registrations shared by EditorRuntime and EditorViewApi.
 *
 * Use this contract for operations independent of a mounted occurrence. DOM
 * events, selection, clipboard/slash execution, and destruction have different
 * contracts on runtime and view and are deliberately excluded.
 */
export type SharedEditorApi = Pick<EditorViewApi,
  | "blocks" | "elements" | "history" | "commands" | "mode"
  | "blockTypes" | "blockListProps" | "blockElements"
  | "renderers" | "views" | "surfaces" | "extensions"
  | "createDefaultBlock" | "isEmptyBlock" | "installDefaultWriting"
  | "revision" | "subscribe" | "getDocument"
>;
