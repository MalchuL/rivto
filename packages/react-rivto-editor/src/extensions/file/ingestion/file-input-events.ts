import type { ReactEditorApi } from "../../../editor/types";
import type {
  FilePreparation,
  FileHandler,
  FilePreparationContext,
  FileReference,
  PreparedFile,
} from "../../../attachments";
import type { FileIngestion } from "./file-ingestion";
import type { FileIngestionPoint, FileInputPanel } from "./types";
import {
  fileDestinationAtPoint,
  filePasteDestination,
  filePickerPoint,
  type FileDestination,
} from "./file-destination";
import {
  FILE_DROP_EVENT_ID,
  FILE_PASTE_EVENT_ID,
  getTransferredFiles,
  findLocalFileUri,
  findTransferredLocalFileUri,
  createFileReferenceFromUri,
} from "../utils/file-input";

const FILE_INPUT_CLASS = "rivto-file-input";

/** Editor operations borrowed while routing generic file input. */
interface FileInputEditor {
  /** Selects and looks up registered file handlers. */
  readonly clipboard: Pick<ReactEditorApi["clipboard"], "selectFileHandler" | "getFileHandler">;
  /** Looks up block nodes and whether they contain children. */
  readonly blocks: Pick<ReactEditorApi["blocks"], "getBlockNode" | "hasChildren">;
  /** Creates and recognizes default empty writing blocks. */
  readonly defaultWritingBlockFactory: Pick<
    ReactEditorApi["defaultWritingBlockFactory"],
    "createEmptyBlock" | "isEmptyBlock"
  >;
  /** Registers file input listeners. */
  readonly events: Pick<ReactEditorApi["events"], "register">;
  /** Registers the file picker slash command. */
  readonly slashCommands: Pick<ReactEditorApi["slashCommands"], "register">;
}

/** Registers and routes generic file input for one extension installation. */
export class FileInputEvents {
  /**
   * Borrows the editor operations and ingestion coordinator for file input.
   *
   * The installing extension owns registrations and destroys the coordinator.
   *
   * @param editor - Narrow editor operations for routing and handler lookup.
   * @param ingestion - Coordinator that prepares, inserts, and cancels batches.
   * @param onError - Optional notification for failures reading a clipboard path.
   */
  constructor(
    /** Borrowed editor operations for routing and handler lookup. */
    private readonly editor: FileInputEditor,
    /** Coordinator for preparing, storing, and inserting files. */
    private readonly ingestion: Pick<FileIngestion, "ingest" | "storeFile" | "signal">,
    /** Optional notification for clipboard path failures. */
    private readonly onError?: (error: unknown) => void,
  ) {}

  /**
   * Registers file drag, paste, and picker interactions.
   *
   * @returns Installs the extension-owned event and slash-command registrations.
   * @throws If an event or slash-command registration fails.
   */
  register(): void {
    this.registerDragOver();
    this.registerDrop();
    this.registerPaste();
    this.registerPicker();
  }

  /**
   * Registers generic file drag-over feedback.
   *
   * @returns Installs the extension-owned registration.
   * @throws If the editor rejects the registration.
   */
  private registerDragOver(): void {
    this.editor.events.register(
      { id: "file.dragover", type: "dragover", capture: true },
      // Claim file drags only inside the receiving root and advertise a copy.
      ({ raw, root }) => {
        const accepts = raw.dataTransfer?.types.includes("Files") === true;
        if (accepts && raw.dataTransfer) {
          raw.dataTransfer.dropEffect = "copy";
        }
        return accepts && root.contains(raw.target as Node);
      },
    );
  }

  /**
   * Registers generic file drop routing.
   *
   * @returns Installs the extension-owned registration.
   * @throws If the editor rejects the registration.
   */
  private registerDrop(): void {
    this.editor.events.register(
      { id: FILE_DROP_EVENT_ID, type: "drop", capture: true },
      // Prefer transferred files; otherwise prepare the local URI as a reference.
      (event) => {
        const { raw, blockId, reactPanel } = event;
        const files = getTransferredFiles(raw.dataTransfer);
        const uri = findLocalFileUri(raw.dataTransfer?.getData("text/uri-list") ?? "");
        if (!files.length && !uri) {
          return false;
        }
        const point = { x: raw.clientX, y: raw.clientY };
        const destination = this.replaceEmptyDefault(
          fileDestinationAtPoint(event, point),
          files.length || Number(Boolean(uri)),
          blockId,
        );
        if (files.length) {
          this.upload(reactPanel, files, destination, point);
        } else if (uri) {
          this.insertReferences(reactPanel, [uri], destination, point);
        }
        return true;
      },
    );
  }

  /**
   * Registers generic file paste routing.
   *
   * @returns Installs the extension-owned registration.
   * @throws If the editor rejects the registration.
   */
  private registerPaste(): void {
    this.editor.events.register(
      { id: FILE_PASTE_EVENT_ID, type: "paste", capture: true },
      // Route files or local paths to the captured paste destination.
      (event) => {
        const { raw, blockId, root, reactPanel } = event;
        const files = getTransferredFiles(raw.clipboardData);
        const uri = findTransferredLocalFileUri(raw.clipboardData);
        if (!files.length && !uri && !raw.clipboardData?.types.includes("text/uri-list")) {
          return false;
        }
        const location = filePasteDestination(event);
        if (!location) {
          return false;
        }
        const destination = this.replaceEmptyDefault(
          location.destination,
          files.length || 1,
          blockId,
        );
        const { point } = location;
        if (files.length) {
          this.upload(reactPanel, files, destination, point);
        } else if (uri) {
          this.insertReferences(reactPanel, [uri], destination, point);
        } else {
          this.readClipboardPath(root, reactPanel, destination, point);
        }
        return true;
      },
    );
  }

  /**
   * Registers the native file picker slash command.
   *
   * @returns Installs the extension-owned registration.
   * @throws If the editor rejects the registration.
   */
  private registerPicker(): void {
    this.editor.slashCommands.register({
      id: "file.insert",
      title: "File",
      group: "Insert",
      keywords: ["attachment", "upload"],
      // Open a multiple-file picker for the block that invoked the command.
      execute: ({ blockId, reactPanel }) => {
        const input = document.createElement("input");
        input.className = FILE_INPUT_CLASS;
        input.type = "file";
        input.multiple = true;
        input.addEventListener(
          "change",
          // Replace an empty leaf only when exactly one file was selected.
          () => {
            const files = [...(input.files ?? [])];
            const block = reactPanel.blocks.getBlockNode(blockId);
            const destination: FileDestination =
              files.length === 1 &&
              block &&
              !reactPanel.blocks.hasChildren(block.id) &&
              this.editor.defaultWritingBlockFactory.isEmptyBlock(block)
                ? { kind: "block", afterId: blockId, replaceId: blockId, content: block.content }
                : { kind: "block", afterId: blockId };
            this.upload(
              reactPanel,
              files,
              destination,
              filePickerPoint(reactPanel.getRoot(), blockId),
            );
          },
          { once: true },
        );
        input.click();
      },
    });
  }

  /**
   * Reads a redacted clipboard path and starts file preparation.
   *
   * @param root - Surface whose window supplies clipboard access.
   * @param reactPanel - Panel receiving the resolved reference.
   * @param destination - Captured insertion destination.
   * @param point - Viewport position for local status feedback.
   * @returns Starts the clipboard read or reports an unavailable clipboard.
   */
  private readClipboardPath(
    root: HTMLElement,
    reactPanel: FileInputPanel,
    destination: FileDestination,
    point: FileIngestionPoint,
  ): void {
    const clipboard = root.ownerDocument.defaultView?.navigator.clipboard;
    void clipboard
      ?.readText()
      // Ignore results after teardown and reject text that is not a local path.
      .then((text) => {
        if (this.ingestion.signal.aborted) {
          return;
        }
        const local = findLocalFileUri(text);
        if (!local) {
          throw new TypeError("Clipboard does not contain a readable local file path");
        }
        this.insertReferences(reactPanel, [local], destination, point);
      })
      // Only notify the host while this ingestion instance remains active.
      .catch((error: unknown) => {
        if (!this.ingestion.signal.aborted) {
          this.onError?.(error);
        }
      });
    if (!clipboard) {
      this.onError?.(new TypeError("This browser does not provide clipboard read access"));
    }
  }

  /**
   * Uploads and prepares one file batch in source order.
   *
   * @param reactPanel - Panel receiving the prepared files.
   * @param files - Browser files to store and dispatch.
   * @param destination - Captured insertion destination.
   * @param point - Viewport position for status feedback.
   * @returns Starts asynchronous preparation and commits successful files when safe.
   */
  private upload(
    reactPanel: FileInputPanel,
    files: readonly File[],
    destination: FileDestination,
    point: FileIngestionPoint,
  ): void {
    this.ingestion.ingest<File>({
      panel: reactPanel,
      destination,
      items: files,
      point,
      // Use a stable display fallback for unnamed browser files.
      name: (file) => file.name || "file",
      failureMessage: "Unable to upload file",
      staleMessage:
        "The destination changed while the file was uploading. Select a location and retry.",
      // Select the handler before storage and verify it remains installed afterward.
      prepare: async (file, id, currentDestination) => {
        const reference: Omit<FileReference, "uri"> = {
          name: file.name || "file",
          mimeType: file.type || "application/octet-stream",
          size: file.size,
        };
        const handler = this.editor.clipboard.selectFileHandler({ file, reference });
        if (!handler) {
          throw new TypeError(`No attachment handler accepted ${reference.name}`);
        }
        const uri = await this.ingestion.storeFile(handler.provider, file, {
          panel: reactPanel,
          statusId: id,
          name: reference.name,
        });
        // A removed or replaced handler must not finish an upload it no longer owns.
        if (this.editor.clipboard.getFileHandler(handler.id) !== handler) {
          throw new Error("Attachment handler was removed during upload");
        }
        return this.prepareFile(
          handler,
          { file, reference: { ...reference, uri } },
          { destination: currentDestination.kind, signal: this.ingestion.signal },
        );
      },
    });
  }

  /**
   * Resolves and prepares already-addressable local file references.
   *
   * @param reactPanel - Panel receiving the prepared references.
   * @param uris - Absolute paths or file URIs in source order.
   * @param destination - Captured insertion destination.
   * @param point - Viewport position for status feedback.
   * @returns Starts asynchronous preparation and commits successful files when safe.
   */
  private insertReferences(
    reactPanel: FileInputPanel,
    uris: readonly string[],
    destination: FileDestination,
    point: FileIngestionPoint,
  ): void {
    this.ingestion.ingest<string>({
      panel: reactPanel,
      destination,
      items: uris,
      point,
      // Derive status text from the file reference.
      name: (uri) => createFileReferenceFromUri(uri).name,
      failureMessage: "Unable to load file",
      staleMessage:
        "The destination changed while the file was uploading. Select a location and retry.",
      // Prepare an existing reference without uploading its bytes again.
      prepare: async (uri, _id, currentDestination) => {
        const reference = createFileReferenceFromUri(uri);
        const handler = this.editor.clipboard.selectFileHandler({ reference });
        if (!handler) {
          throw new TypeError(`No attachment handler accepted ${reference.name}`);
        }
        return this.prepareFile(
          handler,
          { reference },
          {
            destination: currentDestination.kind,
            signal: this.ingestion.signal,
          },
        );
      },
    });
  }

  /**
   * Prepares a file and verifies that its selected handler is still registered.
   *
   * @param handler - Handler selected for the candidate before preparation.
   * @param candidate - Stored file or already-addressable reference.
   * @param context - Captured destination and cancellation signal.
   * @returns The prepared representation while the same handler remains installed.
   * @throws If preparation fails or the selected handler is removed or replaced.
   */
  private async prepareFile(
    handler: FileHandler,
    candidate: FilePreparation,
    context: FilePreparationContext,
  ): Promise<PreparedFile> {
    const prepared = await handler.prepare(candidate, context);
    // Check identity again after asynchronous preparation, including ID reuse.
    if (this.editor.clipboard.getFileHandler(handler.id) !== handler) {
      throw new Error("Attachment handler was removed during preparation");
    }
    return prepared;
  }

  /**
   * Replaces an empty default block for one file, otherwise keeps inline placement.
   *
   * @param destination - Initially resolved placement.
   * @param fileCount - Number of incoming files.
   * @param blockId - Block under the event.
   * @returns Final placement.
   */
  private replaceEmptyDefault(
    destination: FileDestination,
    fileCount: number,
    blockId?: string,
  ): FileDestination {
    if (destination.kind !== "inline" || fileCount !== 1 || !blockId) {
      return destination;
    }
    const block = this.editor.blocks.getBlockNode(blockId);
    const defaultType = this.editor.defaultWritingBlockFactory.createEmptyBlock().type;
    return block?.type === defaultType &&
      !this.editor.blocks.hasChildren(block.id) &&
      this.editor.defaultWritingBlockFactory.isEmptyBlock(block)
      ? { kind: "block", afterId: blockId, replaceId: blockId, content: block.content }
      : destination;
  }
}
