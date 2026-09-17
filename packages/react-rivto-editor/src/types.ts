import type {
  CommandRegistry,
  ElementManager,
  ModeManager,
  RivtoEditorApi,
  UndoManager,
} from "@chulane/rivto";
import type {
  BlockRenderer,
  KeymapOverrides,
  ReactEditorExtension,
} from "./managers";
import type {
  BlocksCapability,
  ClipboardCapability,
  EventsCapability,
  ExtensionsCapability,
  KeyboardCapability,
  RenderersCapability,
  SelectionCapability,
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
export interface CreateReactEditorOptions {
  /** Existing framework-neutral editor; ReactEditor never destroys it. */
  readonly editor: RivtoEditorApi;
  /** Functional extensions installed synchronously in declaration order. */
  readonly extensions?: readonly ReactEditorExtension[];
  /** Stable binding-ID overrides; empty arrays disable matching bindings. */
  readonly keymap?: KeymapOverrides;
  /** Renderer used for persisted block types unknown to this React runtime. */
  readonly unknownBlockRenderer?: BlockRenderer;
}

/**
 * Coordinates React presentation managers around one core editor.
 *
 * Managers are public extension boundaries. Extensions register directly through
 * `blocks`, `renderers`, `views`, `surfaces`, `extensions`, `events`, `keyboard`,
 * `selection`, and `slashCommands`; ReactEditor deliberately exposes no
 * forwarding registry methods or mutable collections.
 *
 * Writing-block factories are installed by `defaultWritingBlockExtension`
 * (or a host equivalent) via {@link installDefaultWriting}.
 */
export interface ReactEditor {
  /** Core first-class element operations. */
  readonly elements: ElementManager;
  /** Local presentation mode. */
  readonly mode: ModeManager;
  /** Named command registry used by extensions. */
  readonly commands: CommandRegistry;
  /** Local undo and redo history. */
  readonly history: UndoManager;
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
  readonly blocks: BlocksCapability;
  /** React-owned portable clipboard formatter and parser registry. */
  readonly clipboard: ClipboardCapability;
  readonly surfaces: SurfacesCapability;
  readonly extensions: ExtensionsCapability;
  /** Delegated native DOM event registration. */
  readonly events: EventsCapability;
  /** Semantic keyboard actions and runtime shortcut overrides. */
  readonly keyboard: KeyboardCapability;
  readonly selection: SelectionCapability;
  readonly slashCommands: SlashCommandsCapability;
  /** Groups synchronous mutations into one transaction and undo item. */
  batchUpdates<Result>(operation: () => Result): Result;
  /** Groups synchronous mutations into one transaction excluded from undo history. */
  batchUpdatesWithoutHistory<Result>(operation: () => Result): Result;
  /** Subscribes to document, mode, and selection changes from the core editor. */
  subscribe(listener: () => void): () => void;
  destroy(): void;
}
