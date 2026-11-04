import type { ReactEditorApi } from "../../../editor/types";
import type {
  FilePreparation,
  FileHandler,
  FilePreparationContext,
  FileReference,
  PreparedFile,
} from "../../../attachments";
import type { FileIngestion } from "./file-ingestion";
import type { FileIngestionPoint, FileInputPanel, FileUploadContext } from "./types";
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
  readonly clipboard: Pick<ReactEditorApi["clipboard"], "selectFileHandler" | "getFileHandler">;
  readonly blocks: Pick<ReactEditorApi["blocks"], "getBlockNode" | "hasChildren">;
  readonly defaultWritingBlockFactory: Pick<
    ReactEditorApi["defaultWritingBlockFactory"],
    "createEmptyBlock" | "isEmptyBlock"
  >;
  readonly events: Pick<ReactEditorApi["events"], "register">;
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
    private readonly editor: FileInputEditor,
    private readonly ingestion: Pick<FileIngestion, "ingest" | "storeFile" | "signal">,
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
          this.upload(reactPanel, files, destination, "drop", point);
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
          this.upload(reactPanel, files, destination, "clipboard", point);
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
      execute: ({ blockId, reactPanel }) => {
        const input = document.createElement("input");
        input.className = FILE_INPUT_CLASS;
        input.type = "file";
        input.multiple = true;
        input.addEventListener(
          "change",
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
              "picker",
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
   * @param source - Browser interaction that supplied the files.
   * @param point - Viewport position for status feedback.
   * @returns Starts asynchronous preparation and commits successful files when safe.
   */
  private upload(
    reactPanel: FileInputPanel,
    files: readonly File[],
    destination: FileDestination,
    source: FileUploadContext["source"],
    point: FileIngestionPoint,
  ): void {
    this.ingestion.ingest<File>({
      panel: reactPanel,
      destination,
      items: files,
      point,
      name: (file) => file.name || "file",
      failureMessage: "Unable to upload file",
      staleMessage:
        "The destination changed while the file was uploading. Select a location and retry.",
      prepare: async (file, id, currentDestination) => {
        const mode = reactPanel.getSurfaceType();
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
          destination: currentDestination.kind,
          mode,
          source,
          statusId: id,
          name: reference.name,
        });
        if (this.editor.clipboard.getFileHandler(handler.id) !== handler) {
          throw new Error("Attachment handler was removed during upload");
        }
        return this.prepareFile(
          handler,
          { file, reference: { ...reference, uri } },
          { destination: currentDestination.kind, mode, signal: this.ingestion.signal },
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
      name: (uri) => createFileReferenceFromUri(uri).name,
      failureMessage: "Unable to load file",
      staleMessage:
        "The destination changed while the file was uploading. Select a location and retry.",
      prepare: async (uri, _id, currentDestination) => {
        const mode = reactPanel.getSurfaceType();
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
            mode,
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
   * @param context - Captured destination, surface, and cancellation signal.
   * @returns The prepared representation while the same handler remains installed.
   * @throws If preparation fails or the selected handler is removed or replaced.
   */
  private async prepareFile(
    handler: FileHandler,
    candidate: FilePreparation,
    context: FilePreparationContext,
  ): Promise<PreparedFile> {
    const prepared = await handler.prepare(candidate, context);
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
