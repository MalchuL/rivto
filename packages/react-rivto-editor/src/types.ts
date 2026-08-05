import type { EditorBlock, RivtoEditorApi as Editor } from "@chulane/rivto";
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
  /** Observes Markdown links and may prevent browser navigation for local routing. */
  readonly onMarkdownLinkClick?: (context: MarkdownLinkClick) => void;
  /** Edgeless block-to-element projection behavior. */
  readonly edgeless?: {
    /** Returns whether an unowned root block separates adjacent block elements. */
    readonly isBlockElementSeparator?: (block: EditorBlock) => boolean;
  };
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
  /** Predicate used only by React's root-block element reconciler. */
  readonly isBlockElementSeparator: (block: EditorBlock) => boolean;
  /** Subscribes to document, mode, and selection changes from the core editor. */
  subscribe(listener: () => void): () => void;
  destroy(): void;
}
