import { BlockContextMenuRegistry } from "../managers/block-context-menu/registry";
import type { EdgelessToolbarApi } from "../managers/edgeless-toolbar/types";
import type { ElementTypesApi } from "../managers/elements/types";
import type { DocumentEditorAPI } from "@chulane/rivto";
import type {
  BlockRenderer,
  ClipboardFormatRegistry,
  ClipboardManager,
  EventManager,
  KeyboardManager,
  KeymapOverrides,
  ReactEditorExtension,
  SlashCommandRegistry,
} from "../managers";
import type { DocumentModel } from "@chulane/document-model";
import type { BlockReferenceOptions } from "@chulane/rivto";
import type { BlockElementProjection } from "../elements/block-element-projection";
import type { BlockFactory } from "../block-factories";
import type { BlockBehaviorsApi } from "../managers/blocks/block-behaviors-api";
import type { BlockListPropsApi } from "../managers/blocks/block-list-props-api";
import type { BlockTypesApi } from "../managers/blocks/block-types-api";
import type { RenderersApi } from "../managers/blocks/renderers-api";
import type { PanelRegistry } from "../panels/panel-registry";
import type { KeyboardApi } from "../managers/keyboard/keyboard-api";
import type { ExtensionsApi } from "../managers/extensions/api";
import type { SurfacesApi } from "../managers/surfaces/api";

/** Creation options for the React presentation runtime. */
export interface CreateReactEditorOptions {
  /** Existing fixed document editor; the caller or EditorStorage owns its destruction. */
  readonly editor: DocumentEditorAPI;
  /** Functional extensions installed synchronously in declaration order. */
  readonly extensions?: readonly ReactEditorExtension[];
  /** Stable binding-ID overrides; empty arrays disable matching bindings. */
  readonly keymap?: KeymapOverrides;
  /** Renderer used for persisted block types unknown to this React runtime. */
  readonly unknownBlockRenderer?: BlockRenderer;
}

/** Loading and construction policies; returned models become storage-owned. */
export interface EditorStorageOptions extends BlockReferenceOptions {
  /** Loads a model for this identity; defaults to creating an empty Yjs document. */
  readonly openDocument?: (documentId: string) => Promise<DocumentModel>;
  /**
   * Configures the supplied storage-owned core's definitions, defaults, and commands
   * and returns a React runtime wrapping that same core. Defaults to createReactEditor.
   * Storage creates and disposes the core; this callback must not replace it.
   */
  readonly createEditor?: (editor: DocumentEditorAPI) => ReactEditorApi;
  /** Optional registry metadata notifications used to retry unresolved embedding locations. */
  readonly subscribeDocumentIds?: (listener: () => void) => () => void;
  /** Reports asynchronous release failures from view cleanup. */
  readonly onError?: (error: unknown) => void;
}

/**
 * One retained reference to a shared runtime and its document model.
 *
 * Every successful acquireEditor call returns its own release function. Releasing
 * one acquisition leaves the others intact. Repeated release calls reuse the same
 * promise and do not decrement the consumer count again. The final release destroys
 * the React editor, core, and model when the final acquisition is released.
 */
export interface EditorAcquisition {
  readonly editor: ReactEditorApi;
  readonly document: DocumentModel;
  /** Releases this consumer once; closes runtime, core, and model only when no consumer remains. */
  release(): Promise<void>;
}

export interface Entry {
  consumers: number;
  pending: Promise<ReactEditorApi>;
  editor?: ReactEditorApi;
  core?: DocumentEditorAPI;
  closing?: Promise<void>;
}

/** Shared React registrations and the operations of one fixed document editor.
 * Document managers provide the following shared capabilities:
 * Creates and updates document elements, including canvas objects, through the core element manager.
 * The underlying core editor stays internal; every view uses these same managers.
 * Named core commands registered and invoked by extensions.
 * The manager is shared by all views without exposing the underlying core editor.
 * Core undo/redo history and synchronous transaction batching for this editor.
 * All views of the document share this local history; other editors keep their own.
 * Guarded mutations and delegated core block operations.
 * Model selection shared by occurrences; DOM adapters belong to each ReactPanelApi.
 */
export interface ReactEditorApi extends DocumentEditorAPI {
  /**
   * Adds synchronous runtime cleanup without replacing destroy.
   * Remaining callbacks run in reverse registration order even if another fails.
   * @param release - Cleanup for a resource owned by this React runtime.
   * @returns Idempotent disposer that runs cleanup and removes it from the list.
   * @throws If destruction has started, or if the returned disposer's cleanup fails.
   */
  registerCleanup(release: () => void): () => void;
  /** Shared definitions, renderers and editing contributions for canvas element types. */
  readonly elementTypes: ElementTypesApi;
  /** Shared creation-tool groups and extension contributions; interaction state is panel-local. */
  readonly edgelessToolbar: EdgelessToolbarApi;

  /** Creates input for an empty writing block using the installed writing extension.
   *
   * Enter, trailing insertion, separators, and clipboard operations share this factory.
   * The host configures it through {@link installDefaultWriting}.
   *
   * The creation method throws until {@link installDefaultWriting} runs.
   *
   * Checks whether a block is an empty writing block according to the installed extension.
   *
   * Enter outdent, list reset, and related operations share this predicate.
   * The host configures it through {@link installDefaultWriting}.
   *
   * The emptiness predicate throws until {@link installDefaultWriting} runs.
   *
   * The recognition method identifies this writing role without checking emptiness.
   * It also throws until {@link installDefaultWriting} runs.
   */
  readonly defaultWritingBlockFactory: BlockFactory;
  /** Content renderers indexed by persisted block type. */
  readonly renderers: RenderersApi;
  /** Operation-aware outline and drop behaviors selected from current block data. */
  readonly blockBehaviors: BlockBehaviorsApi;
  /** Atomic React block-type and presentation registration. */
  readonly blockTypes: BlockTypesApi;
  /** Registers persisted list-property defaults and validation with the core policy manager.
   * Registrations are removed when their React extension is disposed. */
  readonly blockListProps: BlockListPropsApi;
  /** React-owned portable clipboard formatter and parser registry. */
  readonly clipboardFormats: ClipboardFormatRegistry;
  /** Structured document operations; view-dependent paste receives its destination explicitly. */
  readonly clipboard: ClipboardManager;
  /** Core paste strategies extended by React clipboard integrations. */
  readonly pasteStrategies: DocumentEditorAPI["clipboard"]["pasteStrategies"];
  /** Root surfaces and their ordered block/editor wrappers. */
  readonly surfaces: SurfacesApi;
  /** Extension setup, mounted UI, registration ownership, and cleanup. */
  readonly extensions: ExtensionsApi;
  /** Delegated surface/document/window DOM event runtime. */
  readonly events: Pick<EventManager, "register" | "delete">;
  /** Mounted occurrences and explicit active/default view lookup. */
  readonly panels: Pick<
    PanelRegistry,
    | "getActive"
    | "getDefault"
    | "registerPanel"
    | "getSurfaceType"
    | "getActiveRoot"
    | "getDefaultRoot"
  >;
  /** Semantic keyboard bindings and runtime keymap overrides. */
  readonly keyboard: Pick<KeyboardManager, keyof KeyboardApi>;
  /** Dedicated extension-owned block menu contributions. */
  readonly blockContextMenu: BlockContextMenuRegistry;
  /** React-owned slash-command registry. */
  readonly slashCommands: SlashCommandRegistry;
  /** Maintains the document's block elements and their default canvas geometry.
   * Mounted surfaces share this projection instead of rebuilding it independently. */
  readonly blockElements: BlockElementProjection;
  /**
   * Installs writing factories used by keyboard, trailing, separator, and clipboard paths.
   *
   * Called by `defaultWritingBlockExtension` to configure empty writing blocks
   * for all rendered occurrences of this document.
   * @param defaultWritingBlockFactory - Replacement creation, recognition, and emptiness contract for empty writing blocks.
   * @returns Disposer that restores the previous factories.
   */
  installDefaultWriting(defaultWritingBlockFactory: BlockFactory): () => void;
  /**
   * Releases React managers while the lifecycle owner retains the core and document.
   *
   * Selection restoration is cancelled while its extension dependencies remain
   * available. ExtensionManager then runs extension cleanup and owned registrations.
   * Event listeners are detached through the existing manager registrations. All
   * runtime disposers run even if cleanup fails, with errors reported afterward.
   * Document/model disposal belongs to EditorStorage or the caller. Close the core
   * after this synchronous React cleanup, then await model destruction before
   * destroying the application's document registry and provider metadata.
   * @returns An already-resolved Promise after synchronous React cleanup; the borrowed core remains usable.
   * @throws Synchronously if cleanup fails, after all React disposers have run.
   */
  destroy(): Promise<void>;
}
