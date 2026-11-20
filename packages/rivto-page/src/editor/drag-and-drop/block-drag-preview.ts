import { BLOCK_EDITOR_CLASSES } from "../../presentation/block-editor-classes";
import type { DocumentAttribute, InputRoot, TextOverlay } from "@chulane/rivto-root";
import type { BlockDragPreviewRow } from "./types";

/** Presentation class shared by the overlay and its document marker cleanup. */
const DRAG_PREVIEW_CLASS = "rivto-block-drag-preview";

/** Owns one occurrence's inert drag preview and its document cursor marker. */
export class BlockDragPreview {
  private readonly overlay: TextOverlay;
  private readonly marker: DocumentAttribute;

  /**
   * Borrows the mounted occurrence for preview creation and cleanup.
   *
   * @param inputRoot - Borrowed occurrence providing preview and document marker capabilities.
   */
  constructor(inputRoot: Pick<InputRoot, "captureDocumentAttribute" | "createTextOverlay">) {
    this.overlay = inputRoot.createTextOverlay();
    this.marker = inputRoot.captureDocumentAttribute("data-block-drag-active");
  }

  /**
   * Checks whether preview creation has begun for this gesture.
   *
   * @returns True while an overlay is retained, including after partial setup failure; false after removal.
   */
  isCreated(): boolean {
    return this.overlay.isCreated();
  }

  /**
   * Creates inert text feedback after the caller has read target geometry.
   *
   * At most four rows are rendered; text and indentation are bounded. The
   * document marker suppresses handle hover until the final preview is removed.
   * The owner must attempt both removal and marker cleanup after a failure.
   *
   * @param count - Number of captured source roots shown in the preview.
   * @param rows - Host-supplied text and relative depth for the bounded preview.
   * @returns A preview is appended while attached; its marker is set only while connected to the captured document.
   * @throws Propagates DOM creation, mutation, or attachment failures.
   */
  create(count: number, rows: readonly BlockDragPreviewRow[]): void {
    const created = this.overlay.create({
      className: DRAG_PREVIEW_CLASS,
      text: `${count} blocks`,
      lines: rows.slice(0, 4).map((row) => ({
        className: BLOCK_EDITOR_CLASSES.dragPreviewRow,
        text: row.text.slice(0, 240),
        indent: Math.max(0, Math.min(3, row.depth)) * 12,
      })),
    });
    if (created && !this.marker.set()) {
      this.overlay.remove();
    }
  }

  /**
   * Positions the existing preview without reading geometry or host data.
   *
   * @param x - Pointer X coordinate in viewport CSS pixels.
   * @param y - Pointer Y coordinate in viewport CSS pixels.
   * @returns The preview is offset from the pointer when it exists.
   */
  move(x: number, y: number): void {
    this.overlay.move(x + 12, y + 12);
  }

  /**
   * Removes the preview created for this gesture.
   *
   * @returns The preview has been offered removal, including after partial setup.
   * @throws Propagates DOM removal failures.
   */
  remove(): void {
    this.overlay.remove();
  }

  /**
   * Removes the document marker after the last occurrence's preview is gone.
   *
   * This check also runs when removing this preview failed, preserving the
   * marker while any preview is still mounted in the same document.
   *
   * @returns The marker is removed only when no preview remains.
   * @throws Propagates DOM query and attribute mutation failures.
   */
  releaseDocumentMarker(): void {
    this.marker.removeWhenAbsent(`.${DRAG_PREVIEW_CLASS}`);
  }

  /**
   * Removes the preview and attempts document-marker cleanup even if removal fails.
   *
   * @returns Both resources have been offered cleanup.
   * @throws AggregateError containing any removal or marker cleanup failures.
   */
  clear(): void {
    const errors: unknown[] = [];
    for (const release of [() => this.remove(), () => this.releaseDocumentMarker()]) {
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Block drag preview cleanup failed");
    }
  }
}
