import type { KeyInput, PointerInput } from "@chulane/rivto-root";
import { PANEL_SELECTOR } from "../../../panels/panel-dom";
import { BLOCK_ID_ATTRIBUTE } from "../../../constants";
import { TABLE_BLOCK_TYPE, TABLE_ROW_BLOCK_TYPE } from "./table-behavior";
import {
  CELL_ITEM_ATTRIBUTE,
  COLUMN_WIDTH_PROPERTY,
  columnWidth,
  setTableColumnWidth,
  tableColumnCells,
  TABLE_RESIZE_HANDLE_SELECTOR,
} from "./table-column-width";
import type {
  TableColumnLocation,
  TableResizeGesture,
  TableResizeHost,
  TableResizeResource,
  TableResizeRoot,
  TableResizeStart,
  TableWidthPreview,
} from "./types";

/** Owns one cell's transient column width, capture and cancellation listeners. */
export class TableResizeController {
  private gesture: TableResizeGesture | undefined;

  /**
   * Borrows a live model boundary and one mounted document occurrence.
   *
   * The cell component creates this owner and cancels it on unmount. The current
   * Root is captured when a gesture begins; no gesture listeners exist while idle.
   *
   * @param panel - Addressed block reads and grouped writes; never destroyed here.
   * @param blockId - Persisted cell from which the column index is resolved live.
   * Keyboard width commands remain available without a mounted occurrence.
   */
  constructor(
    private readonly panel: TableResizeHost,
    private readonly blockId: string,
  ) {}

  /**
   * Starts a column resize from the hovered vertical boundary without a model write.
   *
   * Captures the column's current cells and mounted placements once. Subsequent
   * movement stays captured by the separator and touches only these inline styles.
   * The separator receives focus so history and arrow keys route to this occurrence.
   * Capture or listener failure rolls back the resources already installed.
   *
   * @param event - Normalized primary-button pointer press on the resize separator.
   * @param input - Occurrence-bound feedback for the mounted separator.
   * @returns A preview session is active, or no change for an invalid source/button.
   * @throws Model or DOM reads propagate; browser setup failures trigger attempted rollback.
   */
  start(event: PointerInput, input: TableResizeStart): void {
    const root = this.panel.inputRoot;
    if (event.button !== 0 || !root?.isConnected()) {
      return;
    }
    this.cancel();
    if (this.panel.inputRoot !== root || !root.isConnected()) {
      return;
    }
    const location = this.resolveColumn();
    if (!location) {
      return;
    }
    const ids = tableColumnCells(this.panel.blocks, location.tableId, location.column);
    const targets = this.captureTargets(root, ids);
    const gesture: TableResizeGesture = {
      root,
      pointerId: event.pointerId,
      location,
      ids,
      targets,
      startX: event.clientX,
      width: location.width,
    };
    this.gesture = gesture;
    try {
      if (this.panel.inputRoot !== root || !root.isConnected()) {
        this.cancel();
        return;
      }
      event.preventDefault();
      if (this.gesture !== gesture) {
        return;
      }
      event.stopPropagation();
      if (this.gesture !== gesture) {
        return;
      }
      this.activate(gesture, event, input);
    } catch (error) {
      try {
        this.cancel();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Table resize setup failed");
      }
      throw error;
    }
  }

  /**
   * Previews the shared column width without creating document transactions.
   *
   * The active gesture retains the latest width for release. Model traversal and
   * DOM queries happen at start and commit, never on each movement event.
   *
   * @param event - Captured pointer movement; unrelated pointers are ignored.
   * @returns Connected captured placements reflect the clamped pixel width.
   * @throws Style failures propagate after cancellation is attempted.
   */
  move(event: PointerInput): void {
    const active = this.gesture;
    if (!active || event.pointerId !== active.pointerId) {
      return;
    }
    active.width = columnWidth(active.location.width + event.clientX - active.startX);
    try {
      for (const { styles } of active.targets) {
        styles.set(`${active.width}px`);
      }
    } catch (error) {
      try {
        this.cancel();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Table resize preview failed");
      }
      throw error;
    }
  }

  /**
   * Ends pointer capture and optionally persists the previewed width once.
   *
   * Release coordinates are applied before cleanup. A changed source column or
   * membership cancels the write rather than resizing a different live column.
   * A successful write precedes style restoration, so cleanup never writes the old
   * width back between preview and the new model width. Cancellation clears the
   * active gesture before releasing capture and restores each placement.
   *
   * @param event - Pointer release, cancellation or lost-capture event.
   * @param commit - True saves a still-current column; false restores the preview.
   * @returns The matching session ends; unrelated pointers and cancelled sessions never write.
   * @throws Cleanup and delegated grouped-command failures propagate.
   */
  finish(event: PointerInput, commit: boolean): void {
    const active = this.gesture;
    if (!active || active.pointerId !== event.pointerId) {
      return;
    }
    try {
      if (commit) {
        this.move(event);
        if (this.isCurrentColumn(active)) {
          setTableColumnWidth(
            this.panel,
            active.location.tableId,
            active.location.column,
            active.width,
          );
        }
      }
    } catch (error) {
      try {
        this.cancel();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Table resize commit failed");
      }
      throw error;
    }
    this.cancel();
  }

  /**
   * Offers keyboard resizing on the same accessible vertical separator.
   *
   * Each arrow resolves the current table column and persisted width. Active
   * pointer previews are cancelled before an independent keyboard adjustment.
   *
   * @param event - Left/right arrow input; Shift changes the step from 10 to 50 pixels.
   * @returns One width adjustment is persisted; other keys keep their native behavior.
   * @throws Delegated model-command failures propagate after pointer cleanup.
   */
  resizeWithKeyboard(event: KeyInput): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    this.cancel();
    const location = this.resolveColumn();
    if (!location) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    setTableColumnWidth(
      this.panel,
      location.tableId,
      location.column,
      location.width + direction * (event.shiftKey ? 50 : 10),
    );
  }

  /**
   * Restores resize-owned styles, releases capture and removes window listeners.
   *
   * Escape, blur, lost capture, replacement and component cleanup share this path.
   * Unrelated inline styles survive. A width changed in the model during the gesture
   * replaces the old preview instead of restoring an obsolete captured model width.
   *
   * @returns All resources have been offered cleanup; repeated cancellation is harmless.
   * @throws Aggregates cleanup failures after attempting the remaining resources.
   */
  readonly cancel = (): void => {
    const active = this.gesture;
    if (!active) {
      return;
    }
    this.gesture = undefined;
    const errors: unknown[] = [];
    for (const release of [active.releaseAvailability, active.releaseEscape, active.releaseBlur]) {
      try {
        release?.();
      } catch (error) {
        errors.push(error);
      }
    }
    this.restoreTargets(active.targets, errors);
    try {
      active.releaseMarker?.();
    } catch (error) {
      errors.push(error);
    }
    try {
      active.releasePointer?.();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length) {
      throw new AggregateError(errors, "Table resize cleanup failed");
    }
  };

  /**
   * Acquires pointer capture, visual feedback, and cancellation for one gesture.
   *
   * @param gesture - Gesture staged by the initiating pointer delivery.
   * @param event - Normalized input providing pointer capture and target focus.
   * @param input - Feedback region belonging to the mounted separator.
   * @returns The active gesture owns its resources, or releases them if replaced.
   * @throws Propagates capture, listener, focus, and cleanup failures.
   */
  private activate(
    gesture: TableResizeGesture,
    event: PointerInput,
    input: TableResizeStart,
  ): void {
    if (
      !this.retain(
        gesture,
        "releaseAvailability",
        this.panel.subscribeAvailability(() => {
          if (this.panel.inputRoot !== gesture.root || !gesture.root.isConnected()) {
            this.cancel();
          }
        }),
      )
    ) {
      return;
    }
    const pointer = event.captureTargetPointer(TABLE_RESIZE_HANDLE_SELECTOR);
    if (!this.retain(gesture, "releasePointer", pointer)) {
      return;
    }
    if (!pointer) {
      this.cancel();
      return;
    }
    if (
      !this.retain(
        gesture,
        "releaseMarker",
        input.feedback.setTemporaryAttribute("data-resizing", "true"),
      )
    ) {
      return;
    }
    if (!this.observeCancellation(gesture)) {
      return;
    }
    event.focusTargetAncestor(TABLE_RESIZE_HANDLE_SELECTOR);
  }

  /**
   * Observes window blur and Escape for the lifetime of one pointer gesture.
   *
   * @param gesture - Current gesture receiving the cancellation resources.
   * @returns True when both observations were retained by the current gesture.
   * @throws Propagates listener registration and cleanup failures.
   */
  private observeCancellation(gesture: TableResizeGesture): boolean {
    const blur = gesture.root.observeWindowInput("blur", "bubble", this.cancel);
    if (!this.retain(gesture, "releaseBlur", blur)) {
      return false;
    }
    const escape = gesture.root.observeWindowInput("keydown", "capture", this.cancelOnEscape);
    return this.retain(gesture, "releaseEscape", escape);
  }

  /**
   * Retains a newly acquired resource only while its gesture and Root remain current.
   *
   * @param gesture - Gesture that requested the resource.
   * @param slot - Cleanup field belonging to the resource.
   * @param release - Acquired cleanup, or undefined when unavailable.
   * @returns True when acquisition may continue; false after stale cleanup.
   * @throws Propagates Root checks and cleanup failures.
   */
  private retain(
    gesture: TableResizeGesture,
    slot: TableResizeResource,
    release?: () => void,
  ): boolean {
    gesture[slot] = release;
    if (this.gesture !== gesture) {
      release?.();
      return false;
    }
    if (
      this.panel.inputRoot !== gesture.root ||
      !gesture.root.isConnected() ||
      this.gesture !== gesture
    ) {
      if (this.gesture === gesture) {
        this.cancel();
      }
      return false;
    }
    return true;
  }

  /**
   * Locates the source cell's current table column and persisted width.
   *
   * @returns Current table identity/index/width, or undefined outside a valid table row.
   */
  private resolveColumn(): TableColumnLocation | undefined {
    const rowId = this.panel.blocks.getParentId(this.blockId);
    const tableId = rowId ? this.panel.blocks.getParentId(rowId) : undefined;
    const row = rowId ? this.panel.blocks.getBlockNode(rowId) : undefined;
    const table = tableId ? this.panel.blocks.getBlockNode(tableId) : undefined;
    const column = row?.childIds.indexOf(this.blockId) ?? -1;
    if (row?.type !== TABLE_ROW_BLOCK_TYPE || table?.type !== TABLE_BLOCK_TYPE || column < 0) {
      return;
    }
    return {
      tableId: table.id,
      column,
      width: columnWidth(this.panel.blocks.getBlockNode(this.blockId)?.props.tableColumnWidth),
    };
  }

  /**
   * Captures mounted column placements and their exact inline width declarations.
   *
   * @param root - Exact occurrence captured for this gesture.
   * @param ids - Captured canonical cell IDs, including unmounted cells.
   * @returns Mounted targets in this occurrence; absent cells require no DOM preview.
   */
  private captureTargets(root: TableResizeRoot, ids: readonly string[]): TableWidthPreview[] {
    const targets: TableWidthPreview[] = [];
    const identity = root.getElementIdentity?.();
    const boundary = identity && root.captureRegionByIdentity(identity);
    if (!boundary) {
      return targets;
    }
    const remaining = new Set(ids);
    try {
      for (const cell of root.findRegionsByAttribute(BLOCK_ID_ATTRIBUTE, ids, PANEL_SELECTOR)) {
        const id = cell.readAttribute(BLOCK_ID_ATTRIBUTE);
        if (!id || !remaining.has(id)) {
          continue;
        }
        remaining.delete(id);
        let placement = cell;
        const walked = cell.someAncestorWithin(boundary, (ancestor) => {
          if (ancestor.readAttribute(CELL_ITEM_ATTRIBUTE) !== undefined) {
            placement = ancestor;
            return true;
          }
          return false;
        });
        if (walked === undefined) {
          throw new Error("Table resize occurrence ended during target capture");
        }
        const modelWidth = columnWidth(this.panel.blocks.getBlockNode(id)?.props.tableColumnWidth);
        const styles = placement.captureInlineStyle(COLUMN_WIDTH_PROPERTY);
        if (styles) {
          targets.push({ id, styles, modelWidth });
        }
        if (!remaining.size) {
          break;
        }
      }
    } catch (error) {
      const errors: unknown[] = [error];
      this.restoreTargets(targets, errors);
      if (errors.length > 1) {
        throw new AggregateError(errors, "Table resize target capture failed");
      }
      throw error;
    }
    return targets;
  }

  /**
   * Checks captured column membership immediately before the grouped write.
   *
   * @param active - Completed pointer session whose model destination may have changed.
   * @returns True only while the source and all column cell IDs retain their positions.
   */
  private isCurrentColumn(active: TableResizeGesture): boolean {
    if (this.panel.inputRoot !== active.root || !active.root.isConnected()) {
      return false;
    }
    const location = this.resolveColumn();
    if (
      location?.tableId !== active.location.tableId ||
      location.column !== active.location.column
    ) {
      return false;
    }
    const ids = tableColumnCells(this.panel.blocks, location.tableId, location.column);
    return ids.length === active.ids.length && ids.every((id, index) => id === active.ids[index]);
  }

  /**
   * Restores captured inline widths without hiding failures from other placements.
   *
   * @param targets - Placements and declarations saved before the first preview.
   * @param errors - Cleanup failures collected by the owning cancellation operation.
   * @returns Every target was restored or its failure was appended to errors.
   */
  private restoreTargets(targets: readonly TableWidthPreview[], errors: unknown[]): void {
    for (const target of targets) {
      try {
        const current = columnWidth(
          this.panel.blocks.getBlockNode(target.id)?.props.tableColumnWidth,
        );
        target.styles.finish(current === target.modelWidth ? undefined : `${current}px`);
      } catch (error) {
        errors.push(error);
      }
    }
  }

  /**
   * Cancels the active pointer preview before editor Escape bindings receive it.
   *
   * @param event - Captured window keyboard input during the gesture.
   * @returns Escape is consumed after releasing resources; other keys are untouched.
   */
  private readonly cancelOnEscape = (event: KeyInput): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
    }
  };
}
