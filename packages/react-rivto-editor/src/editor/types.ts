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
import type {
  AttachmentOptions,
  BinaryProvider,
  FileOpenHandler,
  FileReference,
  FileRequestContext,
} from "../attachments";
import type { SurfacesApi } from "../managers/surfaces/api";

/** Creation options for the React presentation runtime. */
export interface CreateReactEditorOptions {
  /** Existing fixed document editor; the caller or EditorStorage owns its destruction. */
  readonly editor: DocumentEditorAPI;
  /** Functional extensions installed synchronously in declaration order. */
  readonly extensions?: readonly ReactEditorExtension[];
  /** Stable binding-ID overrides; empty arrays disable matching bindings. */
  readonly keymap?: KeymapOverrides;
  /** Attachment URI resolution settings. */
  readonly attachments?: AttachmentOptions;
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

/** Clipboard operations available to editor components and extensions. */
export interface ClipboardApi {
  /**
   * Registers a file handler for matching, lookup, or explicit default selection.
   *
   * Matching handlers are tried in registration order before the single default.
   * Registrations are released by the extension lifecycle or the returned disposer.
   *
   * @param handler - File preparation, provider, matcher, and optional inline view.
   * @returns Disposer that unregisters the handler.
   * @throws If the runtime is inactive, the provider is invalid, the ID is empty or
   * duplicated.
   */
  readonly registerFileHandler: ClipboardManager["registerFileHandler"];

  /**
   * Sets a registered file handler as the default when no handler matches.
   *
   * Selecting another default replaces the previous selection. Removing the
   * selected registration clears it; no earlier selection is restored.
   *
   * @param id - ID of the registered handler to use as the default.
   * @returns Completion of the default selection.
   * @throws If the runtime is inactive or no handler has the supplied ID.
   */
  readonly setDefaultFileHandler: ClipboardManager["setDefaultFileHandler"];

  /**
   * Selects the first matching handler, falling back to the generic attachment handler.
   *
   * @param candidate - File or reference to classify.
   * @returns Matching handler, or undefined when no handler is installed.
   */
  readonly selectFileHandler: ClipboardManager["selectFileHandler"];

  /**
   * Looks up a registered attachment handler by its stable identifier.
   *
   * @param id - Attachment handler identifier.
   * @returns Registered handler, if present.
   */
  readonly getFileHandler: ClipboardManager["getFileHandler"];

  /**
   * Registers one ordered final clipboard refinement.
   *
   * @param postprocessor - Single-object binary contribution hook.
   * @returns Lifecycle-owned disposer.
   * @throws If the runtime is inactive or the postprocessor ID is invalid or duplicated.
   */
  readonly registerPostprocessor: ClipboardManager["registerPostprocessor"];

  /**
   * Registers the single host binary writer used before the browser fallback.
   *
   * @param writer - Privileged host clipboard bridge.
   * @returns Lifecycle-owned disposer.
   * @throws If the runtime is inactive, the writer ID is empty, or a writer is already registered.
   */
  readonly registerWriter: ClipboardManager["registerWriter"];

  /**
   * Reports whether a registered host or the current browser can attempt a binary write.
   *
   * @param mimeType - Exact file MIME type proposed for copying.
   * @returns Whether the custom copy menu should handle this type.
   */
  readonly canWriteBinary: ClipboardManager["canWriteBinary"];

  /**
   * Runs postprocessors and starts a binary write without delaying the copy event.
   *
   * @param bundle - Structured selected objects.
   * @param formats - Synchronous portable clipboard formats.
   * @returns Starts any supported binary write without delaying the copy event.
   */
  readonly writeProcessed: ClipboardManager["writeProcessed"];

  /**
   * Writes exact MIME bytes, falling back to application/octet-stream.
   *
   * @param binary - Named attachment bytes and original MIME type.
   * @param formats - Portable representations included beside binary data.
   * @returns A promise resolving to true when a host or browser writer accepted the payload, or false when unsupported.
   * @throws If the browser clipboard write fails.
   */
  readonly writeBinary: ClipboardManager["writeBinary"];

  /**
   * Installs one block converter and disposes it with its owning extension.
   *
   * @param type - Persisted block type; only one converter may be registered per type.
   * @param converter - Optional copy, paste, formatting and external parsing methods.
   * @returns Idempotent disposer for this registration.
   * @throws If the type is empty, already registered, or the runtime is destroyed.
   */
  readonly registerBlockConverter: ClipboardManager["registerBlockConverter"];

  /**
   * Installs one canvas converter and disposes it with its owning extension.
   *
   * @param type - Persisted element type; only one converter may be registered per type.
   * @param converter - Optional conversion methods and referenced-block collection.
   * @returns Idempotent disposer for this registration.
   * @throws If the type is empty, already registered, or the runtime is destroyed.
   */
  readonly registerElementConverter: ClipboardManager["registerElementConverter"];

  /** Core paste strategies extended by React clipboard integrations. */
  readonly pasteStrategies: ClipboardManager["pasteStrategies"];

  /**
   * Copies selected block subtrees, text ranges and canvas subtrees through type converters.
   *
   * @param selection - Explicit selection, or omitted to read the panel/runtime selection.
   * @param reactPanel - Source panel defining Panel roots; omitted for a document-only copy.
   * @param operation - Copy, cut or duplicate intent supplied to converters; defaults to copy.
   * @returns Detached payload, or undefined for an empty selection. Does not write the document.
   * @throws If a converter rejects the copied data.
   */
  readonly copy: ClipboardManager["copy"];

  /**
   * Copies an explicit text selection through block converters, excluding unselected children.
   *
   * @param selection - Block text ranges to copy.
   * @param reactPanel - Optional source panel supplied to converters.
   * @returns Detached partial-text bundle, or undefined when there is no text to copy.
   */
  readonly copyText: ClipboardManager["copyText"];

  /**
   * Copies the runtime selection and checks portable formats before deleting it.
   *
   * @returns Detached copied bundle, or undefined for an empty selection.
   * @throws If copy or formatting rejects the data; deletion has not started in that case.
   */
  readonly cut: ClipboardManager["cut"];

  /**
   * Prepares structured data through type converters, then invokes core paste strategies.
   *
   * ID allocation and converters run before import. Creation processors and validation run
   * during insertion. On failure, new records are removed and the error is rethrown; changes
   * to existing text are not reverted by this cleanup. A malformed
   * serialized bundle falls back to plain text; an invalid explicit bundle throws.
   *
   * @param input - Clipboard data, selection override and placement; plain text keeps core behavior.
   * @param reactPanel - Receiving panel, or runtime for document-only commands without a mounted panel; defaults to this editor.
   * @param operation - Paste or duplicate intent; defaults to paste.
   * @returns Core paste result, including the resulting caret when text was inserted.
   * @throws If a converter, creation processor or validator rejects the payload.
   */
  readonly paste: ClipboardManager["paste"];

  /**
   * Collects selected canvas subtrees and referenced block trees before applying copy hooks once.
   *
   * @param ids - Selected element IDs; overlapping subtrees are visited only once.
   * @param reactPanel - Source panel restricting elements and block roots, or the owning runtime.
   * @param operation - Copy, cut or duplicate intent; defaults to copy.
   * @returns Detached bundle with source identities and ordered referenced block roots.
   */
  readonly copyElements: ClipboardManager["copyElements"];

  /**
   * Converts selected canvas records without writing either document forest.
   *
   * Empty block cards are omitted. Other elements retain their type and child order; creation
   * processors run later through ordinary insertion. Copied frames move by 24 document units on each axis.
   *
   * @param bundle - Detached source records and referenced block roots.
   * @param reactPanel - Destination panel or document runtime used for placement and processors.
   * @param blockIdMap - Already allocated source-to-destination block IDs.
   * @param ids - Preallocated element IDs, or omitted to allocate them here.
   * @param operation - Paste or duplicate intent; defaults to paste.
   * @returns Converted records, element ID map and remapped block dependencies; insertion still validates them.
   * @throws If a type converter rejects the source data.
   */
  readonly convertElements: ClipboardManager["convertElements"];
}

/** Attachment operations available to editor components and extensions. */
export interface AttachmentApi {
  /**
   * Registers a file opener for matching or explicit default selection.
   *
   * Typed handlers always take priority over the fallback, so a later PDF or
   * audio extension can replace generic native opening without registration-order coupling.
   *
   * @param handler - File matcher and opening operation.
   * @returns Disposer that unregisters the handler.
   * @throws If the runtime is inactive or the ID is empty or duplicated.
   */
  registerFileOpenHandler(handler: FileOpenHandler): () => void;

  /**
   * Sets a registered file opener as the default when no opener matches.
   *
   * Selecting another default replaces the previous selection. Removing the
   * selected registration clears it; no earlier selection is restored.
   *
   * @param id - ID of the registered opener to use as the default.
   * @returns Completion of the default selection.
   * @throws If the runtime is inactive or no opener has the supplied ID.
   */
  setDefaultFileOpenHandler(id: string): void;

  /**
   * Resolves a reference through its provider or a browser-readable URI.
   *
   * Use this when a caller can display or inspect either a Blob or a URL, such
   * as an image view. It does not fetch browser-readable URLs or open a file.
   * The provider is consulted first: its Blob is returned directly, while
   * `undefined` means it does not own the reference. Provider failures propagate
   * rather than falling back to the browser. Without a provider result, HTTP(S),
   * data, and blob URLs are returned after validation; relative references are
   * resolved against the configured document base URI.
   *
   * The document ID and surface mode are captured when this method starts.
   * Cancellation is checked before and after the provider's asynchronous read.
   *
   * @param provider - Storage provider to consult first, if installed.
   * @param uri - Persisted reference to resolve.
   * @param context - Optional surface mode and required cancellation signal.
   * @returns A promise resolving to the provider's Blob or a browser-readable URI.
   * @throws If cancelled, the provider fails or returns a non-Blob value, or the
   * unclaimed URI is unsafe, unsupported, or relative without a configured base.
   *
   * @example
   * const source = await editor.attachments.resolveBinary(provider, uri, { signal });
   * // source is a Blob from the provider, or a URL the browser can display.
   */
  resolveBinary(
    provider: BinaryProvider<string, Blob> | undefined,
    uri: string,
    context: FileRequestContext,
  ): Promise<string | Blob>;

  /**
   * Reads attachment bytes as a Blob for copying or other byte-based operations.
   *
   * Unlike `resolveBinary`, this always produces bytes: it first resolves the
   * reference, then fetches it if the result is a URL. A provider-supplied Blob
   * is reused unless a different MIME hint was supplied, in which case a new
   * Blob wraps the same bytes with that type. It does not open the file.
   *
   * @param provider - Storage provider to consult first, if installed.
   * @param uri - Persisted reference to read.
   * @param mimeType - Optional MIME type to apply to the returned Blob.
   * @param context - Optional surface mode and required cancellation signal.
   * @returns A promise resolving to a Blob after resolution and any fetch complete.
   * @throws If resolution, fetching, or response reading fails, or cancellation occurs.
   *
   * @example
   * const bytes = await editor.attachments.readBinary(provider, uri, "image/png", { signal });
   * // bytes is a Blob, including when the provider declined an HTTP URL.
   */
  readBinary(
    provider: BinaryProvider<string, Blob> | undefined,
    uri: string,
    mimeType: string | undefined,
    context: FileRequestContext,
  ): Promise<Blob>;

  /**
   * Opens an attachment with a registered host opener or a browser link.
   *
   * Unlike `resolveBinary` and `readBinary`, this performs an opening action
   * and returns no content. The first matching registered opener takes priority,
   * followed by the explicitly selected default opener. A selected opener receives
   * the reference and operation context; the provider is not read in that path.
   * Without an opener, the reference is resolved and a browser link is clicked.
   * Resolved Blobs use an object URL scheduled for revocation after 60 seconds.
   *
   * @param provider - Storage provider for the attachment.
   * @param reference - Persisted attachment metadata.
   * @param context - Optional surface mode and required cancellation signal.
   * @returns A promise resolving after the opener completes or browser link is clicked.
   * @throws If cancelled, the host opener fails, or the attachment cannot be resolved.
   *
   * @example
   * await editor.attachments.openBinary(provider, reference, { signal });
   * // The selected host opener has completed, or the browser link was clicked.
   */
  openBinary(
    provider: BinaryProvider<string, Blob>,
    reference: FileReference,
    context: FileRequestContext,
  ): Promise<void>;
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
  readonly clipboard: ClipboardApi;
  /** Attachment handlers, binary resolution, and opening shared across views. */
  readonly attachments: AttachmentApi;
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
