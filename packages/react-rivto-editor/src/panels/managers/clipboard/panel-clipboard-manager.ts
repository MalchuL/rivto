import type { ReactPanelApi } from "../../types";
import type { ClipboardApi, SharedClipboardOperations } from "../../../managers/clipboard/api";
import type { PanelClipboardApi } from "./panel-clipboard-api";
import type { Selection } from "@chulane/rivto";

/** Clipboard operations use this panel; parsers, formatters, and strategies stay document-owned. */
export class PanelClipboardManager implements PanelClipboardApi {
  /**
   * Reads the live paste registry shared by the editor and its panels.
   *
   * @returns The source editor's registry; this panel does not own its lifetime.
   */
  get pasteStrategies(): ClipboardApi["pasteStrategies"] {
    return this.clipboard.pasteStrategies;
  }
  /**
   * Binds shared structured clipboard operations to one panel occurrence.
   *
   * The panel owns its selection and scope; this manager borrows the shared
   * clipboard and does not own its registrations or lifetime.
   *
   * @param clipboard - Shared structured clipboard operations.
   * @param reactPanel - Receiving panel occurrence.
   */
  constructor(
    /** Shared clipboard operations borrowed from the document runtime. */
    private readonly clipboard: SharedClipboardOperations,
    private readonly reactPanel: ReactPanelApi,
  ) {}
  /**
   * Registers a file handler with the shared clipboard.
   *
   * @param handler - Handler definition, passed unchanged to the owning editor.
   * @returns Disposer for the shared registration.
   */
  readonly registerFileHandler: ClipboardApi["registerFileHandler"] = (handler) =>
    this.clipboard.registerFileHandler(handler);
  /**
   * Selects the shared default file handler.
   *
   * @param id - Registered handler ID, passed unchanged to the owning editor.
   * @returns After the default handler is selected.
   */
  readonly setDefaultFileHandler: ClipboardApi["setDefaultFileHandler"] = (id) =>
    this.clipboard.setDefaultFileHandler(id);
  /**
   * Selects a shared file handler for a candidate.
   *
   * @param candidate - File candidate to classify.
   * @returns Matching or default handler, or undefined when none is installed.
   */
  readonly selectFileHandler: ClipboardApi["selectFileHandler"] = (candidate) =>
    this.clipboard.selectFileHandler(candidate);
  /**
   * Subscribes to shared file handler changes.
   *
   * @param listener - Listener invoked after the handler selection changes.
   * @returns Disposer for the subscription.
   */
  readonly subscribeFileHandlers: ClipboardApi["subscribeFileHandlers"] = (listener) =>
    this.clipboard.subscribeFileHandlers(listener);
  /**
   * Looks up a shared file handler by ID.
   *
   * @param id - Handler ID to find.
   * @returns Registered handler, or undefined when absent.
   */
  readonly getFileHandler: ClipboardApi["getFileHandler"] = (id) =>
    this.clipboard.getFileHandler(id);
  /**
   * Registers a shared clipboard postprocessor.
   *
   * @param postprocessor - Postprocessor definition passed to the owning editor.
   * @returns Disposer for the shared registration.
   */
  readonly registerPostprocessor: ClipboardApi["registerPostprocessor"] = (postprocessor) =>
    this.clipboard.registerPostprocessor(postprocessor);
  /**
   * Registers the shared clipboard writer.
   *
   * @param writer - Writer definition passed to the owning editor.
   * @returns Disposer for the shared registration.
   */
  readonly registerWriter: ClipboardApi["registerWriter"] = (writer) =>
    this.clipboard.registerWriter(writer);
  /**
   * Checks whether the shared clipboard can write a binary MIME type.
   *
   * @param mimeType - Exact MIME type to check.
   * @returns Whether a writer or browser supports the type.
   */
  readonly canWriteBinary: ClipboardApi["canWriteBinary"] = (mimeType) =>
    this.clipboard.canWriteBinary(mimeType);
  /**
   * Starts the shared processed clipboard write.
   *
   * @param bundle - Selected structured objects.
   * @param formats - Portable clipboard representations.
   * @returns After the shared write has been started.
   */
  readonly writeProcessed: ClipboardApi["writeProcessed"] = (bundle, formats) =>
    this.clipboard.writeProcessed(bundle, formats);
  /**
   * Writes binary content through the shared clipboard.
   *
   * @param binary - Named attachment bytes and MIME type.
   * @param formats - Portable clipboard representations.
   * @returns Promise resolving to whether a writer accepted the content.
   */
  readonly writeBinary: ClipboardApi["writeBinary"] = (binary, formats) =>
    this.clipboard.writeBinary(binary, formats);
  /**
   * Registers a shared converter for one block type.
   *
   * @param type - Persisted block type.
   * @param converter - Clipboard conversion methods.
   * @returns Disposer for the shared registration.
   */
  readonly registerBlockConverter: ClipboardApi["registerBlockConverter"] = (type, converter) =>
    this.clipboard.registerBlockConverter(type, converter);
  /**
   * Registers a shared converter for one element type.
   *
   * @param type - Persisted element type.
   * @param converter - Clipboard conversion methods.
   * @returns Disposer for the shared registration.
   */
  readonly registerElementConverter: ClipboardApi["registerElementConverter"] = (type, converter) =>
    this.clipboard.registerElementConverter(type, converter);
  /**
   * Copies selected element subtrees through this panel's converters.
   *
   * @param ids - Element roots that must belong to this panel.
   * @param _panel - Compatibility argument; this manager always uses its own panel.
   * @param operation - Copy, cut, or duplicate intent; defaults to copy.
   * @returns Detached bundle containing selected elements and referenced blocks.
   * @throws If an element is outside the panel or a converter fails.
   */
  readonly copyElements: ClipboardApi["copyElements"] = (ids, _panel, operation) => {
    if (ids.some((id) => !this.reactPanel.elements.hasElement(id))) {
      throw new Error("Clipboard selection is outside panel");
    }
    return this.clipboard.copyElements(ids, this.reactPanel, operation);
  };
  /**
   * Converts clipboard element records for insertion into this panel.
   *
   * @param bundle - Detached source records and referenced blocks.
   * @param _panel - Compatibility argument; this manager always uses its own panel.
   * @param ids - Source-to-destination block identity mapping.
   * @param elementIds - Optional preallocated element identity mapping.
   * @param operation - Paste or duplicate intent; defaults to paste.
   * @returns Converted records and their mappings without inserting them.
   * @throws If a converter rejects the source records.
   */
  readonly convertElements: ClipboardApi["convertElements"] = (
    bundle,
    _panel,
    ids,
    elementIds,
    operation,
  ) => this.clipboard.convertElements(bundle, this.reactPanel, ids, elementIds, operation);
  /**
   * Copies the supplied selection, defaulting to this panel's current selection.
   *
   * @param selection - Selection to inspect or copy; copy methods default to the panel's current selection when omitted.
   * @param _panel - Compatibility argument; this manager always uses its own panel.
   * @param operation - Copy, cut, or duplicate intent; defaults to copy.
   * @returns Clipboard bundle, or undefined when no selection can be copied.
   * @throws If the selection is outside the panel or a converter fails.
   */
  copy: ClipboardApi["copy"] = (selection, _panel, operation) => {
    const current = selection ?? this.reactPanel.selection.get();
    if (!current) {
      // There is no panel selection to serialize.
      return undefined;
    }
    this.requireSelection(current);
    return this.clipboard.copy(current, this.reactPanel, operation);
  };
  /**
   * Copies an explicit text selection through this panel's block converters, excluding unselected children.
   *
   * @param selection - Explicit block text ranges to copy; a collapsed caret copies no content.
   * @returns Detached partial-text clipboard bundle, or undefined when there is no text to copy.
   * @throws If the selection is outside the panel or a converter fails.
   */
  copyText: ClipboardApi["copyText"] = (selection) => {
    this.requireSelection(selection);
    return this.clipboard.copyText(selection, this.reactPanel);
  };
  /**
   * Formats a cut bundle before deleting the panel selection so formatting failures leave content intact.
   *
   * @returns Cut bundle, or undefined when no selection can be copied.
   * @throws If conversion or formatting fails before deletion.
   */
  cut: PanelClipboardApi["cut"] = () => {
    const selection = this.reactPanel.selection.get();
    if (!selection) {
      // There is no panel selection to cut.
      return;
    }
    const bundle = this.clipboard.copy(selection, this.reactPanel, "cut");
    if (!bundle) {
      // An empty copy must leave the original content intact.
      return;
    }
    this.reactPanel.editor.clipboardFormats.formatBundle(bundle);
    this.reactPanel.selection.delete();
    return bundle;
  };
  /**
   * Pastes clipboard input through this panel's scoped operations.
   *
   * @param input - Structured bundle, text, and placement options; defaults to an empty input.
   * @param _panel - Compatibility argument; this manager always uses its own panel.
   * @param operation - Paste or duplicate intent; defaults to paste.
   * @returns Resulting caret position, or undefined when no paste strategy returns one.
   * @throws If the target is outside the panel or a strategy or converter fails.
   */
  paste: ClipboardApi["paste"] = (input, _panel, operation) =>
    this.clipboard.paste(input, this.reactPanel, operation);

  /**
   * Rejects explicit selections containing records outside this occurrence.
   *
   * @param selection - Candidate clipboard source selection.
   * @returns After every selected record is found inside this panel.
   * @throws If any selected block or element is outside the panel.
   */
  private requireSelection(selection: Selection): void {
    if (
      selection.blocks.some(({ id }) => !this.reactPanel.blocks.hasBlock(id)) ||
      selection.elements?.some((id) => !this.reactPanel.elements.hasElement(id))
    ) {
      throw new Error("Clipboard selection is outside panel");
    }
  }
}
