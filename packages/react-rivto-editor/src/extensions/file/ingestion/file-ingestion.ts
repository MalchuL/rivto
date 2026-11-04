import { createCaretSelection } from "@chulane/rivto";
import { validateBinaryUri, type BinaryProvider, type PreparedFile } from "../../../attachments";
import {
  isFileDestinationCurrent,
  retryFileDestination,
  type FileDestination,
} from "./file-destination";
import type {
  FileIngestionBatch,
  FileIngestionPanel,
  FileIngestionStatuses,
  FileUploadContext,
} from "./types";

/** Diagonal spacing in viewport pixels between upload status cards. */
const UPLOAD_STATUS_OFFSET = 12;
/** Diagonal spacing in canvas units between inserted elements. */
const INSERTED_ELEMENT_OFFSET = 24;

/** Owns local state and cancellation for batches started by one extension. */
export class FileIngestion {
  /** Shared cancellation for operations started by this instance. */
  private readonly abort = new AbortController();
  /** Counter for locally unique status identifiers. */
  private nextStatusId = 0;

  /**
   * Creates ingestion state for an extension.
   *
   * @param statuses - Extension-owned status feedback.
   * @param onError - Optional notification for failed operations.
   */
  constructor(
    /** Extension-owned feedback for active and failed operations. */
    private readonly statuses: FileIngestionStatuses,
    /** Optional host notification for failed operations. */
    private readonly onError?: (error: unknown) => void,
  ) {}

  /**
   * Provides the cancellation signal shared by this extension's operations.
   *
   * @returns A signal aborted when the ingestion instance is destroyed.
   */
  get signal(): AbortSignal {
    return this.abort.signal;
  }

  /**
   * Allocates a status identity unique to this ingestion instance.
   *
   * @returns Identity for an active or failed operation.
   */
  nextId(): string {
    return String(++this.nextStatusId);
  }

  /**
   * Cancels pending work when the owning extension is destroyed.
   *
   * @returns Signals cancellation to in-flight operations.
   */
  destroy(): void {
    this.abort.abort();
  }

  /**
   * Stores a file and validates the URI while publishing bounded progress.
   *
   * Cancellation is checked before and after the provider's asynchronous write. Progress
   * reported after cancellation is ignored.
   *
   * @param provider - Storage provider selected for this file.
   * @param file - Browser file to store.
   * @param context - Receiving panel, name and feedback identity.
   * @returns A promise resolving to the validated URI.
   * @throws If cancelled, storage fails, or the returned URI is invalid.
   */
  async storeFile(
    provider: BinaryProvider,
    file: File,
    context: FileUploadContext,
  ): Promise<string> {
    this.signal.throwIfAborted();
    const uri = validateBinaryUri(
      await provider.write(file, {
        documentId: context.panel.editor.getDocument().id,
        name: context.name,
        mimeType: file.type || "application/octet-stream",
        signal: this.signal,
        // Clamp provider progress and ignore updates after cancellation.
        reportProgress: (progress) => {
          if (!this.signal.aborted) {
            this.statuses.update(context.statusId, {
              progress: Math.max(0, Math.min(1, progress)),
            });
          }
        },
      }),
    );
    this.signal.throwIfAborted();
    return uri;
  }

  /**
   * Prepares a batch concurrently and commits successful items in source order.
   *
   * Status and retry state are local. A changed destination leaves successful jobs
   * available for retry, and cancellation prevents starting or committing a batch.
   * Failures received after cancellation are not reported to the host.
   *
   * @param batch - Captured destination and preparation callbacks.
   * @returns Starts preparation and commits the successful results when safe.
   */
  ingest<TInput>(batch: FileIngestionBatch<TInput>): void {
    if (this.signal.aborted) {
      return;
    }
    // Track successful statuses separately: preparation may settle out of order,
    // while Promise.all keeps the representations in their original input order.
    const preparedStatusIds: string[] = [];
    const preparationJobs = batch.items.map(
      async (item, index): Promise<PreparedFile | undefined> => {
        const statusId = this.nextId();
        this.statuses.set({
          id: statusId,
          name: batch.name(item),
          x: batch.point.x + index * UPLOAD_STATUS_OFFSET,
          y: batch.point.y + index * UPLOAD_STATUS_OFFSET,
          // Retry one input at a destination refreshed from the current panel state.
          retry: () => {
            this.statuses.delete(statusId);
            this.ingest({
              ...batch,
              items: [item],
              destination: retryFileDestination(batch.panel, batch.destination),
            });
          },
        });
        try {
          const preparedItem = await batch.prepare(item, statusId, batch.destination);
          preparedStatusIds.push(statusId);
          return preparedItem;
        } catch (error) {
          if (!this.signal.aborted) {
            this.statuses.update(statusId, {
              error: error instanceof Error ? error.message : batch.failureMessage,
            });
            this.onError?.(error);
          }
          return undefined;
        }
      },
    );
    // Commit after every preparation settles so successful results retain input order.
    void Promise.all(preparationJobs).then((preparedResults) => {
      this.commitPrepared(batch, preparedStatusIds, preparedResults);
    });
  }

  /**
   * Commits successful results when their captured destination remains current.
   *
   * Cancellation prevents insertion. A stale destination or insertion failure
   * keeps the corresponding local statuses available for retry.
   *
   * @param batch - Original destination and error messages.
   * @param preparedStatusIds - Status identities for successfully prepared items.
   * @param preparedResults - Prepared items in source order, including failed slots.
   * @returns Inserts current results or publishes retryable failure feedback.
   */
  private commitPrepared<TInput>(
    batch: FileIngestionBatch<TInput>,
    preparedStatusIds: readonly string[],
    preparedResults: readonly (PreparedFile | undefined)[],
  ): void {
    if (this.signal.aborted || !preparedStatusIds.length) {
      return;
    }
    // Async preparation must not overwrite text changed since the drop or paste.
    if (!isFileDestinationCurrent(batch.panel, batch.destination)) {
      const error = new Error(batch.staleMessage);
      preparedStatusIds.forEach((id) => this.statuses.update(id, { error: error.message }));
      this.onError?.(error);
      return;
    }
    try {
      insertPrepared(
        batch.panel,
        preparedResults.filter((result): result is PreparedFile => result !== undefined),
        batch.destination,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : batch.failureMessage;
      preparedStatusIds.forEach((id) =>
        this.statuses.update(id, {
          error: `${message}. Some files may already have been inserted; check before retrying.`,
        }),
      );
      this.onError?.(error);
      return;
    }
    preparedStatusIds.forEach((id) => this.statuses.delete(id));
  }
}

/**
 * Commits prepared file representations without persisting pending state.
 *
 * Insertions run in one synchronous history batch. Empty batches do nothing;
 * already applied mutations are not rolled back if an insertion fails.
 *
 * @param reactPanel - Panel supplying the destination and document commands.
 * @param prepared - Successful handler results in source order.
 * @param destination - Captured insertion destination.
 * @returns Inserts the prepared files and schedules selection restoration.
 * @throws If a representation does not match the destination or insertion fails.
 */
function insertPrepared(
  reactPanel: FileIngestionPanel,
  prepared: readonly PreparedFile[],
  destination: FileDestination,
): void {
  if (!prepared.length) {
    return;
  }
  if (prepared.some((item) => item.kind !== destination.kind)) {
    throw new TypeError("Prepared file does not match its insertion destination");
  }
  const editor = reactPanel.editor;
  // Apply one history group without rolling back earlier mutations on failure.
  reactPanel.batchUpdates(() => {
    if (destination.kind === "inline") {
      const block = editor.blocks.getBlock(destination.blockId);
      if (!block) {
        return;
      }
      const inline = prepared.map((item) => (item.kind === "inline" ? item.content : "")).join(" ");
      editor.blocks.updateBlock(block.id, {
        content:
          block.content.slice(0, destination.start) + inline + block.content.slice(destination.end),
      });
      reactPanel.selection.set(createCaretSelection(block.id, destination.start + inline.length));
      return;
    }
    if (destination.kind === "block") {
      insertPreparedBlocks(reactPanel, prepared, destination);
      return;
    }
    insertPreparedElements(reactPanel, prepared, destination);
  });
  // Restore the DOM selection only if the user has not changed it in the meantime.
  reactPanel.selection.scheduleIfSelectionUnchanged(() => reactPanel.selection.restoreDOM());
}

/**
 * Inserts prepared blocks in order, optionally replacing the captured empty block.
 *
 * @param panel - Panel that owns the block destination.
 * @param prepared - Representations in source order.
 * @param destination - Captured block destination.
 * @returns Inserts or replaces blocks in the current batch.
 * @throws If a representation is not a block or a document operation fails.
 */
function insertPreparedBlocks(
  panel: FileIngestionPanel,
  prepared: readonly PreparedFile[],
  destination: Extract<FileDestination, { kind: "block" }>,
): void {
  let afterId = destination.afterId;
  // Reuse the captured empty block for the first item; append subsequent blocks in order.
  prepared.forEach((item, index) => {
    if (item.kind !== "block") {
      throw new TypeError("Expected a prepared block");
    }
    if (index === 0 && destination.replaceId) {
      panel.editor.blocks.setBlockType(destination.replaceId, item.type);
      panel.editor.blocks.updateBlock(destination.replaceId, { props: item.props });
      afterId = destination.replaceId;
    } else {
      afterId = panel.blocks.insertBlock(
        { type: item.type, props: item.props },
        panel.blocks.getInsertionDestinationAfter(afterId),
      ).id;
    }
  });
}

/**
 * Inserts prepared canvas elements and selects them in the active panel.
 *
 * @param panel - Panel owning the canvas destination.
 * @param prepared - Representations in source order.
 * @param destination - Captured canvas coordinates.
 * @returns Inserts and selects the new elements in the current batch.
 * @throws If a representation is not an element or a document operation fails.
 */
function insertPreparedElements(
  panel: FileIngestionPanel,
  prepared: readonly PreparedFile[],
  destination: Extract<FileDestination, { kind: "element" }>,
): void {
  const zIndex = Math.max(0, ...panel.elements.getElements().map((element) => element.zIndex)) + 1;
  // Offset each inserted element and place the batch above existing canvas elements.
  const ids = prepared.map((item, index) => {
    if (item.kind !== "element") {
      throw new TypeError("Expected a prepared element");
    }
    return panel.elements.insertElement({
      type: item.type,
      frame: {
        x: destination.x + index * INSERTED_ELEMENT_OFFSET,
        y: destination.y + index * INSERTED_ELEMENT_OFFSET,
        width: item.width,
        height: item.height,
      },
      zIndex: zIndex + index,
      props: item.props,
    }).id;
  });
  panel.selection.set({ type: "selection", blocks: [], elements: ids });
}
