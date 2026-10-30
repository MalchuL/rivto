import type { ReactPanelApi } from "../../../panels/types";
import { isInPanel } from "../../../panels/panel-dom";
import { BLOCK_ID_ATTRIBUTE, BLOCK_ID_SELECTOR } from "../../../constants";
import { TABLE_BLOCK_TYPE, TABLE_ROW_BLOCK_TYPE } from "./table-behavior";
import {
  CELL_ITEM_ATTRIBUTE,
  COLUMN_WIDTH_PROPERTY,
  columnWidth,
  setTableColumnWidth,
  tableColumnCells,
} from "./table-column-width";

/** Addressed model reads and the existing grouped column-width write. */
type TableResizeBlocks = Pick<
  ReactPanelApi["blocks"],
  "getBlockNode" | "getParentId" | "updateBlocks"
>;

/** Panel occurrence narrowed to the block operations used by the resize owner. */
interface TableResizeHost {
  readonly blocks: TableResizeBlocks;
}

/** Current source identity within its real table column. */
interface TableColumnLocation {
  readonly tableId: string;
  readonly column: number;
  readonly width: number;
}

/** One mounted placement whose width declaration belongs temporarily to this gesture. */
interface TableWidthPreview {
  readonly id: string;
  readonly element: HTMLElement;
  readonly value: string;
  readonly priority: string;
  readonly modelWidth: number;
}

/** Captured column membership and mounted preview targets; movement does no DOM lookup. */
interface TableResizeGesture {
  readonly pointerId: number;
  readonly handle: HTMLElement;
  readonly location: TableColumnLocation;
  readonly ids: readonly string[];
  readonly targets: readonly TableWidthPreview[];
  readonly startX: number;
  width: number;
}

/** Owns one cell's transient column width, capture and cancellation listeners. */
export class TableResizeController {
  private gesture: TableResizeGesture | undefined;

  /**
   * Borrows a live model boundary and one mounted document occurrence.
   *
   * The cell component creates this owner in its attachment effect and cancels
   * it before replacing the occurrence or unmounting. No listeners exist while idle.
   *
   * @param panel - Addressed block reads and grouped writes; never destroyed here.
   * @param blockId - Persisted cell from which the column index is resolved live.
   * @param root - Mounted occurrence for pointer previews, or null before attachment.
   * Keyboard width commands remain available without a DOM root.
   */
  constructor(
    private readonly panel: TableResizeHost,
    private readonly blockId: string,
    private readonly root: HTMLElement | null,
  ) {}

  /**
   * Starts a column resize from the hovered vertical boundary without a model write.
   *
   * Captures the column's current cells and mounted placements once. Subsequent
   * movement stays captured by the separator and touches only these inline styles.
   * The separator receives focus so history and arrow keys route to this occurrence.
   * Capture or listener failure rolls back the resources already installed.
   *
   * @param event - Primary-button pointer press on the resize separator.
   * @param handle - Mounted separator receiving capture and active feedback.
   * @returns A preview session is active, or no change for an invalid source/button.
   * @throws Model or DOM reads propagate; browser setup failures trigger attempted rollback.
   */
  start(event: PointerEvent, handle: HTMLElement): void {
    if (event.button !== 0 || !this.root?.isConnected) {
      return;
    }
    this.cancel();
    const location = this.resolveColumn();
    if (!location) {
      return;
    }
    const ids = tableColumnCells(this.panel.blocks, location.tableId, location.column);
    const targets = this.captureTargets(ids);
    event.preventDefault();
    event.stopPropagation();
    this.gesture = {
      pointerId: event.pointerId,
      handle,
      location,
      ids,
      targets,
      startX: event.clientX,
      width: location.width,
    };
    try {
      handle.setPointerCapture(event.pointerId);
      handle.setAttribute("data-resizing", "true");
      const view = this.root?.ownerDocument.defaultView;
      view?.addEventListener("blur", this.cancel);
      view?.addEventListener("keydown", this.cancelOnEscape, true);
      handle.focus({ preventScroll: true });
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
  move(event: PointerEvent): void {
    const active = this.gesture;
    if (!active || event.pointerId !== active.pointerId) {
      return;
    }
    active.width = columnWidth(active.location.width + event.clientX - active.startX);
    try {
      for (const { element } of active.targets) {
        if (element.isConnected) {
          element.style.setProperty(COLUMN_WIDTH_PROPERTY, `${active.width}px`);
        }
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
  finish(event: PointerEvent, commit: boolean): void {
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
  resizeWithKeyboard(event: KeyboardEvent): void {
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
    const view = this.root?.ownerDocument.defaultView;
    for (const type of ["blur", "keydown"] as const) {
      try {
        if (type === "blur") {
          view?.removeEventListener(type, this.cancel);
        } else {
          view?.removeEventListener(type, this.cancelOnEscape, true);
        }
      } catch (error) {
        errors.push(error);
      }
    }
    this.restoreTargets(active.targets, errors);
    try {
      active.handle.removeAttribute("data-resizing");
    } catch (error) {
      errors.push(error);
    }
    try {
      if (active.handle.hasPointerCapture(active.pointerId)) {
        active.handle.releasePointerCapture(active.pointerId);
      }
    } catch (error) {
      errors.push(error);
    }
    if (errors.length) {
      throw new AggregateError(errors, "Table resize cleanup failed");
    }
  };

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
   * @param ids - Captured canonical cell IDs, including unmounted cells.
   * @returns Mounted targets in this occurrence; absent cells require no DOM preview.
   */
  private captureTargets(ids: readonly string[]): TableWidthPreview[] {
    const targets: TableWidthPreview[] = [];
    if (!this.root) {
      return targets;
    }
    const remaining = new Set(ids);
    for (const cell of this.root.querySelectorAll<HTMLElement>(BLOCK_ID_SELECTOR)) {
      const id = cell.getAttribute(BLOCK_ID_ATTRIBUTE)!;
      if (!remaining.has(id) || !isInPanel(this.root, cell)) {
        continue;
      }
      remaining.delete(id);
      const element = cell.closest<HTMLElement>(`[${CELL_ITEM_ATTRIBUTE}]`) ?? cell;
      targets.push({
        id,
        element,
        value: element.style.getPropertyValue(COLUMN_WIDTH_PROPERTY),
        priority: element.style.getPropertyPriority(COLUMN_WIDTH_PROPERTY),
        modelWidth: columnWidth(this.panel.blocks.getBlockNode(id)?.props.tableColumnWidth),
      });
      if (!remaining.size) {
        break;
      }
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
    if (!this.root?.isConnected) {
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
        const value = current === target.modelWidth ? target.value : `${current}px`;
        target.element.style.setProperty(COLUMN_WIDTH_PROPERTY, value, target.priority);
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
  private readonly cancelOnEscape = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
    }
  };
}
