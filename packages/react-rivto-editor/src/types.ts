import type { RivtoEditorApi as Editor } from "@chulane/rivto";
import type {
  BlockRenderer,
  KeymapOverrides,
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
  /** Subscribes to document, mode, and selection changes from the core editor. */
  subscribe(listener: () => void): () => void;
  destroy(): void;
}
