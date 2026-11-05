import type { ClipboardManager } from "./clipboard-manager";
import type {
  ClipboardBundle,
  ClipboardPasteInput,
  EditorPosition,
  Selection,
} from "@chulane/rivto";

/** Clipboard operations bound to one rendered editor panel. */
export interface PanelClipboardApi {
  /**
   * Copies the supplied selection, or this panel's current selection, as structured data.
   * @param selection - Optional override read against this document; never changes selection.
   * @returns A detached clipboard bundle, or undefined when nothing can be copied.
   */
  copy(selection?: Selection): ClipboardBundle | undefined;
  /**
   * Copies an explicit text selection using current document content and offsets.
   * @param selection - Text range to serialize; a collapsed caret copies no content.
   * @returns A detached clipboard bundle, or undefined when the selection is empty.
   */
  copyText(selection: Selection): ClipboardBundle | undefined;
  /**
   * Copies this panel's selection, then deletes it through the selection manager.
   * @returns The copied bundle, or undefined when no copyable selection exists; nothing is deleted in that case.
   */
  cut(): ClipboardBundle | undefined;
  /**
   * Pastes through the shared strategies with this panel as the receiving surface.
   *
   * An explicit textTarget takes precedence over the panel's current selection.
   * Without either, an empty structural selection prevents borrowing another panel's
   * caret. Panel-aware strategies receive this panel even if a nested paste changes focus.
   * @param input - Structured bundle, text, and placement options; defaults to an empty input.
   * @returns The resulting caret position, or undefined when no strategy returns one.
   */
  paste(input?: ClipboardPasteInput): EditorPosition | undefined;
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
   * Subscribes to changes in file-handler registrations or the selected fallback.
   *
   * @param listener - Callback invoked after the handler selection may have changed.
   * @returns Disposer that removes the listener.
   */
  readonly subscribeFileHandlers: ClipboardManager["subscribeFileHandlers"];

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
   * @throws If a capability check, binary preparation, or browser clipboard write fails.
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
