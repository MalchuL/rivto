import { createCaretSelection } from "@chulane/rivto";
import type { PreparedFile } from "../../attachments";
import type { ReactPanelApi } from "../../panels/types";
import {
  isFileDestinationCurrent,
  retryFileDestination,
  type FileDestination,
} from "./file-destination";
import type { FileIngestionBatch } from "./types";

/** Diagonal spacing in viewport pixels between upload status cards. */
const UPLOAD_STATUS_OFFSET = 12;
/** Diagonal spacing in canvas units between inserted elements. */
const INSERTED_ELEMENT_OFFSET = 24;

/**
 * Prepares a batch concurrently and commits successful items in source order.
 *
 * Status and retry state are local. A changed destination leaves successful jobs
 * available for retry, and cancellation prevents the final commit.
 *
 * @param batch - Captured destination, preparation callbacks, and feedback state.
 * @returns Starts preparation and commits the successful results when safe.
 */
export function ingestFileBatch<TInput, TResult>(batch: FileIngestionBatch<TInput, TResult>): void {
  const completedIds: string[] = [];
  const jobs = batch.items.map(async (item, index): Promise<TResult | undefined> => {
    const id = batch.nextId();
    batch.statuses.set({
      id,
      name: batch.name(item),
      x: batch.point.x + index * UPLOAD_STATUS_OFFSET,
      y: batch.point.y + index * UPLOAD_STATUS_OFFSET,
      retry: () => {
        batch.statuses.delete(id);
        batch.retry(item, retryFileDestination(batch.panel, batch.destination));
      },
    });
    try {
      const result = await batch.prepare(item, id);
      completedIds.push(id);
      return result;
    } catch (error) {
      batch.statuses.update(id, {
        error: error instanceof Error ? error.message : batch.failureMessage,
      });
      batch.onError?.(error);
      return undefined;
    }
  });
  void Promise.all(jobs).then((results) => {
    if (batch.signal.aborted || !completedIds.length) {
      return;
    }
    if (!isFileDestinationCurrent(batch.panel, batch.destination)) {
      const error = new Error(batch.staleMessage);
      completedIds.forEach((id) => batch.statuses.update(id, { error: error.message }));
      batch.onError?.(error);
      return;
    }
    completedIds.forEach((id) => batch.statuses.delete(id));
    batch.commit(results.filter((result): result is Awaited<TResult> => result !== undefined));
  });
}

/**
 * Commits prepared file representations without persisting pending state.
 * @param reactPanel - Panel supplying the destination and document commands.
 * @param prepared - Successful handler results in source order.
 * @param destination - Captured insertion destination.
 * @returns Inserts the prepared files and schedules selection restoration.
 */
export function insertPrepared(
  reactPanel: ReactPanelApi,
  prepared: readonly PreparedFile[],
  destination: FileDestination,
): void {
  if (!prepared.length) {
    return;
  }
  const editor = reactPanel.editor;
  reactPanel.batchUpdates(() => {
    if (destination.kind === "inline") {
      const block = editor.blocks.getBlock(destination.blockId);
      if (!block) {
        return;
      }
      const inline = prepared.map((item) => item.inline).join(" ");
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
  reactPanel.selection.scheduleIfSelectionUnchanged(() => reactPanel.selection.restoreDOM());
}

/**
 * Inserts prepared blocks in order, optionally replacing the captured empty block.
 *
 * @param panel - Panel that owns the block destination.
 * @param prepared - Representations in source order.
 * @param destination - Captured block destination.
 * @returns Inserts or replaces blocks in the current batch.
 */
function insertPreparedBlocks(
  panel: ReactPanelApi,
  prepared: readonly PreparedFile[],
  destination: Extract<FileDestination, { kind: "block" }>,
): void {
  let afterId = destination.afterId;
  prepared.forEach((item, index) => {
    if (index === 0 && destination.replaceId) {
      panel.editor.blocks.setBlockType(destination.replaceId, item.block.type);
      panel.editor.blocks.updateBlock(destination.replaceId, { props: item.block.props });
      afterId = destination.replaceId;
    } else {
      afterId = panel.blocks.insertBlock(
        { type: item.block.type, props: item.block.props },
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
 */
function insertPreparedElements(
  panel: ReactPanelApi,
  prepared: readonly PreparedFile[],
  destination: Extract<FileDestination, { kind: "element" }>,
): void {
  const zIndex = Math.max(0, ...panel.elements.getElements().map((element) => element.zIndex)) + 1;
  const ids = prepared.map(
    (item, index) =>
      panel.elements.insertElement({
        type: item.element.type,
        frame: {
          x: destination.x + index * INSERTED_ELEMENT_OFFSET,
          y: destination.y + index * INSERTED_ELEMENT_OFFSET,
          width: item.element.width,
          height: item.element.height,
        },
        zIndex: zIndex + index,
        props: item.element.props,
      }).id,
  );
  panel.selection.set({ type: "selection", blocks: [], elements: ids });
}
