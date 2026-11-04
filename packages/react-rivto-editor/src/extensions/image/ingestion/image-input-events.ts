import type { ReactEditorApi } from "../../../editor/types";
import type { BinaryProvider, PreparedFile } from "../../../attachments";
import type { FileIngestion } from "../../file/ingestion/file-ingestion";
import type {
  FileIngestionPoint,
  FileInputPanel,
  FileUploadContext,
} from "../../file/ingestion/types";
import type { FileUploadStatusStore } from "../../file/ingestion/file-upload-status";
import {
  fileDestinationAtPoint,
  filePasteDestination,
  filePickerPoint,
  type FileDestination,
} from "../../file/ingestion/file-destination";
import {
  FILE_DROP_EVENT_ID,
  FILE_PASTE_EVENT_ID,
  getTransferredFiles,
} from "../../file/utils/file-input";
import { prepareImageAsset } from "./image-asset";
import {
  inspectImage,
  isImageFile,
  findImageUri,
  findTransferredImageUri,
} from "../utils/image-input";

const IMAGE_FILE_INPUT_CLASS = "rivto-image-file-input";

/** Image URI and alternative text supplied by a transfer. */
interface RemoteImage {
  /** Image URI supplied by the transfer. */
  readonly uri: string;
  /** Alternative text supplied with the URI. */
  readonly alt: string;
}

/** Editor operations borrowed while routing image input. */
interface ImageInputEditor {
  /** Resolves image references to readable binary content. */
  readonly attachments: Pick<ReactEditorApi["attachments"], "resolveBinary">;
  /** Looks up registered element definitions. */
  readonly elementRegistry: Pick<ReactEditorApi["elementRegistry"], "get">;
  /** Recognizes empty default writing blocks. */
  readonly defaultWritingBlockFactory: Pick<
    ReactEditorApi["defaultWritingBlockFactory"],
    "isEmptyBlock"
  >;
  /** Registers input listeners and checks existing registrations. */
  readonly events: Pick<ReactEditorApi["events"], "register" | "has">;
  /** Registers the image picker slash command. */
  readonly slashCommands: Pick<ReactEditorApi["slashCommands"], "register">;
}

/** Registers and routes image input for one extension installation. */
export class ImageInputEvents {
  /**
   * Borrows the editor operations and local state used by image input.
   *
   * The installing extension owns registrations, status presentation, and cleanup.
   *
   * @param editor - Narrow editor operations for routing and resolving images.
   * @param ingestion - Coordinator that prepares, inserts, and cancels batches.
   * @param statuses - Local feedback used for input and clipboard failures.
   * @param provider - Storage provider used for image references and uploads.
   * @param onError - Optional notification for asynchronous image failures.
   */
  constructor(
    /** Borrowed editor operations for routing and resolving images. */
    private readonly editor: ImageInputEditor,
    /** Coordinator for preparing, storing, and inserting images. */
    private readonly ingestion: Pick<FileIngestion, "ingest" | "storeFile" | "signal" | "nextId">,
    /** Local feedback for input and clipboard failures. */
    private readonly statuses: Pick<FileUploadStatusStore, "set" | "update" | "delete">,
    /** Provider used to store and resolve image content. */
    private readonly provider: BinaryProvider,
    /** Optional host notification for asynchronous image failures. */
    private readonly onError?: (error: unknown) => void,
  ) {}

  /**
   * Registers image drag, paste, and picker interactions.
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
   * Registers image drag-over feedback.
   *
   * @returns Installs the extension-owned registration.
   * @throws If the editor rejects the registration.
   */
  private registerDragOver(): void {
    this.editor.events.register(
      { id: "image.dragover", type: "dragover", capture: true },
      // Claim compatible drags inside the receiving root and advertise a copy.
      ({ raw, root }) => {
        const data = raw.dataTransfer;
        if (!data) {
          return false;
        }
        const accepts =
          [...data.files].some((file) => file.type.startsWith("image/")) ||
          data.types.includes("Files") ||
          data.types.includes("text/uri-list");
        if (accepts) {
          data.dropEffect = "copy";
        }
        return accepts && root.contains(raw.target as Node);
      },
    );
  }

  /**
   * Registers image drop routing.
   *
   * @returns Installs the extension-owned registration.
   * @throws If the editor rejects the registration.
   */
  private registerDrop(): void {
    // Defer to generic file input when it owns the same transfer.
    this.editor.events.register({ id: "image.drop", type: "drop", capture: true }, (event) => {
      const { raw, reactPanel } = event;
      if (this.hasGenericFileInput(FILE_DROP_EVENT_ID, raw, raw.dataTransfer)) {
        return false;
      }
      const files = getTransferredFiles(raw.dataTransfer, isImageFile);
      const remote = findTransferredImageUri(raw.dataTransfer);
      if (!files.length && !remote) {
        return false;
      }
      const point = { x: raw.clientX, y: raw.clientY };
      const destination = fileDestinationAtPoint(event, point);
      if (files.length) {
        this.upload(reactPanel, files, destination, "drop", point);
      } else if (remote) {
        this.insertRemote(reactPanel, remote, destination, point);
      }
      return true;
    });
  }

  /**
   * Registers image paste routing.
   *
   * @returns Installs the extension-owned registration.
   * @throws If the editor rejects the registration.
   */
  private registerPaste(): void {
    // Defer to generic file input before resolving image files or URIs.
    this.editor.events.register({ id: "image.paste", type: "paste", capture: true }, (event) => {
      const { raw, root, reactPanel } = event;
      if (this.hasGenericFileInput(FILE_PASTE_EVENT_ID, raw, raw.clipboardData)) {
        return false;
      }
      const files = getTransferredFiles(raw.clipboardData, isImageFile);
      const remote = findTransferredImageUri(raw.clipboardData);
      if (!files.length && !remote && !raw.clipboardData?.types.includes("text/uri-list")) {
        return false;
      }
      const location = filePasteDestination(event);
      if (!location) {
        return false;
      }
      const { destination, point } = location;
      if (files.length) {
        this.upload(reactPanel, files, destination, "clipboard", point);
      } else if (remote) {
        this.insertRemote(reactPanel, remote, destination, point);
      } else {
        this.readClipboardPath(root, reactPanel, destination, point);
      }
      return true;
    });
  }

  /**
   * Registers the native image picker slash command.
   *
   * @returns Installs the extension-owned registration.
   * @throws If the editor rejects the registration.
   */
  private registerPicker(): void {
    this.editor.slashCommands.register({
      id: "image.insert",
      title: "Image",
      group: "Insert",
      keywords: ["picture", "photo", "upload"],
      // Capture the insertion destination before opening the native picker.
      execute: ({ blockId, reactPanel }) => {
        const block = reactPanel.blocks.getBlockNode(blockId);
        const destination: FileDestination =
          block &&
          !reactPanel.blocks.hasChildren(block.id) &&
          this.editor.defaultWritingBlockFactory.isEmptyBlock(block)
            ? { kind: "block", afterId: blockId, replaceId: blockId, content: block.content }
            : { kind: "block", afterId: blockId };
        const input = document.createElement("input");
        input.className = IMAGE_FILE_INPUT_CLASS;
        input.type = "file";
        input.accept = "image/*";
        input.multiple = true;
        input.addEventListener(
          "change",
          // Upload the chosen images using the captured destination.
          () => {
            this.upload(
              reactPanel,
              [...(input.files ?? [])],
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
   * Reads a redacted clipboard image path with retryable local feedback.
   *
   * @param root - Surface whose window supplies clipboard access.
   * @param reactPanel - Panel receiving the resolved image.
   * @param destination - Captured insertion destination.
   * @param point - Viewport position for local status feedback.
   * @returns Starts the clipboard read and publishes failures in the status card.
   */
  private readClipboardPath(
    root: HTMLElement,
    reactPanel: FileInputPanel,
    destination: FileDestination,
    point: FileIngestionPoint,
  ): void {
    const id = this.ingestion.nextId();
    // Reuse the status ID on retry and ignore reads completed after destruction.
    const read = (): void => {
      this.statuses.set({ id, name: "clipboard image", x: point.x, y: point.y, retry: read });
      const clipboard = root.ownerDocument.defaultView?.navigator.clipboard;
      void clipboard
        ?.readText()
        // Validate the clipboard path before replacing the retryable status.
        .then((text) => {
          if (this.ingestion.signal.aborted) {
            return;
          }
          const uri = findImageUri(text);
          if (!uri) {
            throw new TypeError("Clipboard does not contain a readable image path");
          }
          this.statuses.delete(id);
          this.insertRemote(reactPanel, { uri, alt: "" }, destination, point);
        })
        // Keep the status retryable unless the owning ingestion was destroyed.
        .catch((error: unknown) => {
          if (this.ingestion.signal.aborted) {
            return;
          }
          this.statuses.update(id, {
            error:
              error instanceof Error ? error.message : "Unable to read the clipboard image path",
          });
          this.onError?.(error);
        });
      if (!clipboard) {
        this.statuses.update(id, {
          error: "This browser does not provide clipboard read access",
        });
      }
    };
    read();
  }

  /**
   * Uploads image files concurrently and inserts successful results in source order.
   *
   * Each attempt decodes the image before storage, and pending feedback stays local.
   *
   * @param reactPanel - Panel receiving the prepared images.
   * @param files - Browser files to inspect and store.
   * @param destination - Captured insertion destination.
   * @param source - Browser interaction that supplied the files.
   * @param point - Viewport position for status feedback.
   * @returns Starts preparation and inserts successful images when the destination remains valid.
   */
  private upload(
    reactPanel: FileInputPanel,
    files: readonly File[],
    destination: FileDestination,
    source: FileUploadContext["source"],
    point: FileIngestionPoint,
  ): void {
    if (!this.canInsert(destination, point, files[0]?.name ?? "image")) {
      return;
    }
    this.ingestion.ingest<File>({
      panel: reactPanel,
      destination,
      items: files.filter(isImageFile),
      point,
      name: (file) => file.name || "image",
      failureMessage: "Unable to upload image",
      staleMessage:
        "The destination changed while the image was uploading. Select a location and retry.",
      // Decode before storage, then prepare the requested representation.
      prepare: async (file, id, currentDestination): Promise<PreparedFile> => {
        const mode = reactPanel.getSurfaceType();
        const dimensions = await inspectImage(file);
        this.ingestion.signal.throwIfAborted();
        const uri = await this.ingestion.storeFile(this.provider, file, {
          panel: reactPanel,
          destination: currentDestination.kind,
          mode,
          source,
          statusId: id,
          name: file.name || "image",
        });
        return prepareImageAsset(
          {
            uri,
            name: file.name || "image",
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            alt: file.name || "Image",
            intrinsicWidth: dimensions.width,
            intrinsicHeight: dimensions.height,
          },
          currentDestination.kind,
        );
      },
    });
  }

  /**
   * Resolves and inserts an existing image reference without uploading it.
   *
   * The reference must decode as an image before it is inserted.
   *
   * @param reactPanel - Panel receiving the image.
   * @param remote - Image URI and its supplied alternative text.
   * @param destination - Captured insertion destination.
   * @param point - Viewport position for status feedback.
   * @returns Starts resolution and inserts the image when the destination remains valid.
   */
  private insertRemote(
    reactPanel: FileInputPanel,
    remote: RemoteImage,
    destination: FileDestination,
    point: FileIngestionPoint,
  ): void {
    if (!this.canInsert(destination, point, remote.uri)) {
      return;
    }
    this.ingestion.ingest<RemoteImage>({
      panel: reactPanel,
      destination,
      items: [remote],
      point,
      name: (item) => item.uri,
      failureMessage: "Unable to load image",
      staleMessage:
        "The destination changed while the image was loading. Select a location and retry.",
      // Resolve and decode an existing reference without uploading it again.
      prepare: async (item, _id, currentDestination) => {
        const resolved = await this.editor.attachments.resolveBinary(this.provider, item.uri, {
          signal: this.ingestion.signal,
          mode: reactPanel.getSurfaceType(),
        });
        const dimensions = await inspectImage(resolved);
        this.ingestion.signal.throwIfAborted();
        let name = "image";
        try {
          const url = new URL(item.uri, location.href);
          name = decodeURIComponent(url.pathname.split("/").pop() || "image");
        } catch {
          // Invalid or non-URL references retain the generic name.
        }
        return prepareImageAsset(
          {
            uri: item.uri,
            name,
            mimeType:
              resolved instanceof Blob && resolved.type
                ? resolved.type
                : "application/octet-stream",
            ...(resolved instanceof Blob ? { size: resolved.size } : {}),
            alt: item.alt,
            intrinsicWidth: dimensions.width,
            intrinsicHeight: dimensions.height,
          },
          currentDestination.kind,
        );
      },
    });
  }
  /**
   * Checks canvas image support and publishes an error when the renderer is absent.
   *
   * @param destination - Captured insertion destination.
   * @param point - Viewport position for local status feedback.
   * @param name - Image name shown in the status card.
   * @returns Whether the receiving surface can accept the image.
   */
  private canInsert(
    destination: FileDestination,
    point: FileIngestionPoint,
    name: string,
  ): boolean {
    if (destination.kind !== "element" || this.editor.elementRegistry.get("image")) {
      return true;
    }
    const id = this.ingestion.nextId();
    this.statuses.set({
      id,
      name,
      x: point.x,
      y: point.y,
      error: "Canvas images require edgelessVisualsExtension()",
      retry: () => this.statuses.delete(id),
    });
    return false;
  }

  /**
   * Checks whether generic file routing is registered for this transfer.
   *
   * The event manager uses the dispatch snapshot, so registrations added during
   * this event do not prevent image handling. Removed registrations are ignored.
   *
   * @param registrationId - Generic paste or drop registration ID.
   * @param event - Native event whose registration snapshot is inspected.
   * @param data - Transferred data, or null when unavailable.
   * @returns True when an active generic handler is registered and files are present.
   */
  private hasGenericFileInput(
    registrationId: string,
    event: Event,
    data: DataTransfer | null,
  ): boolean {
    return this.editor.events.has(registrationId, event) && getTransferredFiles(data).length > 0;
  }
}
