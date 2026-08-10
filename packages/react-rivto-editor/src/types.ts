import type { RivtoEditorApi as Editor } from "@chulane/rivto";
import type {
  BlockRenderer,
  KeymapOverrides,
  ReactBlockSlashCommand,
  ReactEditorExtension,
} from "./managers";
import type {
  BlocksCapability,
  EventsCapability,
  ExtensionsCapability,
  KeyboardCapability,
  RenderersCapability,
  SelectionCapability,
  SlashCommandsCapability,
  SurfacesCapability,
} from "./capabilities";
import type { MouseEvent } from "react";
import type { IsEmptyBlock } from "./extensions/page/empty-block";

/** Context supplied when a rendered Markdown link is activated. */
export interface MarkdownLinkClick {
  /** Block containing the rendered link. */
  readonly blockId: string;
  /** Sanitized standard URL or explicitly enabled custom-protocol URL. */
  readonly href: string;
  /** Native React click wrapper; prevent its default action for local routing. */
  readonly event: MouseEvent<HTMLAnchorElement>;
}

/** Configuration for the paragraph integration installed by default. */
export interface DefaultBlockOptions {
  /**
   * Overrides fields of the default paragraph conversion shown in the slash menu.
   *
   * The omitted fields retain their defaults: `Markdown`, `Turn into`, and the
   * `paragraph`/`text` search keywords.
   */
  readonly slashCommand?: Partial<ReactBlockSlashCommand>;
}

/** Creation options for the React presentation runtime. */
export interface CreateReactEditorOptions {
  /** Existing framework-neutral editor; ReactEditor never destroys it. */
  readonly editor: Editor;
  /** Functional extensions installed synchronously in declaration order. */
  readonly extensions?: readonly ReactEditorExtension[];
  /** Stable binding-ID overrides; empty arrays disable matching bindings. */
  readonly keymap?: KeymapOverrides;
  /** Renderer used for persisted block types unknown to this React runtime. */
  readonly unknownBlockRenderer?: BlockRenderer;
  /** Options for the built-in paragraph renderer and slash conversion. */
  readonly defaultBlock?: DefaultBlockOptions;
  /**
   * Predicate for empty-block keyboard behavior (Enter outdent, list reset, …).
   *
   * When `null` or omitted, the runtime uses the built-in empty paragraph check.
   */
  readonly isEmptyBlock?: IsEmptyBlock | null;
  /** Observes Markdown links and may prevent browser navigation for local routing. */
  readonly onMarkdownLinkClick?: (context: MarkdownLinkClick) => void;
}

/**
 * Coordinates React presentation managers around one core editor.
 *
 * Managers are public extension boundaries. Extensions register directly through
 * `blocks`, `renderers`, `surfaces`, `extensions`, `events`, `keyboard`,
 * `selection`, and `slashCommands`; ReactEditor deliberately exposes no
 * forwarding registry methods or mutable collections.
 */
export interface ReactEditor {
  readonly editor: Editor;
  /** Core editor revision forwarded for React's global invalidation boundary. */
  readonly revision: number;
  /**
   * Resolved empty-block predicate (`createReactEditor({ isEmptyBlock })` or the
   * built-in empty paragraph check when that option is null/undefined).
   */
  readonly isEmptyBlock: IsEmptyBlock;
  readonly renderers: RenderersCapability;
  readonly blocks: BlocksCapability;
  readonly surfaces: SurfacesCapability;
  readonly extensions: ExtensionsCapability;
  /** Delegated native DOM event registration. */
  readonly events: EventsCapability;
  /** Semantic keyboard actions and runtime shortcut overrides. */
  readonly keyboard: KeyboardCapability;
  readonly selection: SelectionCapability;
  readonly slashCommands: SlashCommandsCapability;
  /** Subscribes to document, mode, and selection changes from the core editor. */
  subscribe(listener: () => void): () => void;
  destroy(): void;
}
