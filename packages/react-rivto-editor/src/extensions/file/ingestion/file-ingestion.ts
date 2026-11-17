import { createCaretSelection, type PanelDestination } from "@chulane/rivto";
import { validateBinaryUri, type BinaryProvider, type PreparedFile } from "../../../attachments";
import { isFileDestinationCurrent, retryFileDestination } from "./file-destination";
import type { FileIngestionBatch, FileIngestionStatuses, FileUploadContext } from "./types";

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
   * The panel checks the captured destination again once preparation settles.
   * Valid results share one synchronous history batch. A failed insertion can
   * leave earlier items in the document, so retry feedback tells the user to check.
   * DOM selection restoration runs only while the committed selection is current.
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
        const { panel, destination } = batch;
        const prepared = preparedResults.filter((result) => result !== undefined);
        if (prepared.length) {
          if (prepared.some((item) => item.kind !== destination.kind)) {
            throw new TypeError("Prepared file does not match its insertion destination");
          }
          let blockIds: string[] | undefined;
          // Validate the actual prepared types and IDs before opening the history batch.
          if (destination.kind === "block" && destination.placement) {
            const placement = destination.placement;
            const sources = prepared.map((item) => {
              if (item.kind !== "block") {
                throw new TypeError("Expected a prepared block");
              }
              return {
                id: crypto.randomUUID(),
                type: item.type,
                props: item.props,
                content: "",
                listProps: {},
                pluginData: {},
              };
            });
            const placementInDocument = {
              parentId: placement.parentId,
              beforeId: placement.kind === "between" ? (placement.nextId ?? undefined) : undefined,
            };
            if (!panel.editor.blocks.canMove({ sources, destination: placementInDocument })) {
              throw new Error("Files cannot be inserted at this destination");
            }
            blockIds = sources.map((source) => source.id);
          }
          const editor = panel.editor;
          // Apply one history group without rolling back earlier mutations on failure.
          panel.batchUpdates(() => {
            if (destination.kind === "inline") {
              const block = editor.blocks.getBlock(destination.blockId);
              if (!block) {
                return;
              }
              const inline = prepared
                .map((item) => (item.kind === "inline" ? item.content : ""))
                .join(" ");
              editor.blocks.updateBlock(block.id, {
                content:
                  block.content.slice(0, destination.start) +
                  inline +
                  block.content.slice(destination.end),
              });
              panel.selection.set(
                createCaretSelection(block.id, destination.start + inline.length),
              );
              return;
            }
            if (destination.kind === "block") {
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
                  let placement: PanelDestination;
                  if (destination.placement) {
                    const { parentId } = destination.placement;
                    const nextId =
                      destination.placement.kind === "between"
                        ? destination.placement.nextId
                        : null;
                    placement = {
                      parentId: parentId === panel.rootBlockId ? null : parentId,
                      beforeId: nextId ?? undefined,
                    };
                  } else {
                    placement = panel.blocks.getInsertionDestinationAfter(afterId);
                  }
                  afterId = panel.blocks.insertBlock(
                    { id: blockIds?.[index], type: item.type, props: item.props },
                    placement,
                  ).id;
                }
              });
              return;
            }
            const zIndex =
              Math.max(0, ...panel.elements.getElements().map((element) => element.zIndex)) + 1;
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
          });
          // Restore the DOM selection only if the user has not changed it in the meantime.
          panel.selection.scheduleIfSelectionUnchanged(() => panel.selection.restoreDOM());
        }
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
    });
  }
}
