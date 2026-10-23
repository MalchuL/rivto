import type { TransformKind } from "@chulane/rivto-edgeless";
import type {
  CanvasControlsAdapter,
  CanvasControlHandle,
  ControlPreview,
} from "@chulane/rivto-edgeless/react";
import type { ReactPanelApi } from "../../panels/types";
import type { EdgelessTransformController } from "./edgeless-transform";

/** Binds document-specific transformation policies to generic canvas controls. */
export class EdgelessControlsAdapter implements CanvasControlsAdapter {
  /**
   * Captures one render's selection and DOM occurrence without starting subscriptions.
   *
   * @param controller - Owner of document previews, dependent connectors and undo.
   * @param panel - Receiving document occurrence.
   * @param root - Mounted surface root, absent during initial render.
   * @param plane - World layer containing this occurrence's mounted targets.
   * @param selectedIds - Selected document elements for this render.
   * @param groupRotation - Persisted group angle, absent for ordinary selections.
   */
  constructor(
    private readonly controller: EdgelessTransformController,
    private readonly panel: ReactPanelApi,
    private readonly root: HTMLElement | null | undefined,
    private readonly plane: HTMLElement | null | undefined,
    private readonly selectedIds: readonly string[],
    readonly groupRotation: number | undefined,
  ) {}
  /**
   * Resolves all selected leaves before virtualization filters their content.
   * @returns Concrete participant IDs, including offscreen group children.
   */
  getTargetIds() {
    return this.controller.getMoveTargetIds(this.panel, this.selectedIds);
  }
  /**
   * Expands selected groups into mounted leaves for the shared controls.
   * @returns Geometry hosts belonging to this occurrence.
   */
  getTargets() {
    return this.plane
      ? this.controller.getMoveTargets(this.panel, this.plane, this.selectedIds)
      : [];
  }
  /**
   * Reads the existing element marker without leaking it into the canvas package.
   *
   * @param target - Rivto geometry host.
   * @returns Stable document element ID.
   */
  targetId(target: HTMLElement | SVGElement) {
    return target.dataset.edgelessObjectId!;
  }
  /**
   * Connects controls to Rivto's delegated gesture admission.
   *
   * @param controls - Independent canvas control operations.
   * @returns Cleanup cancelling this occurrence's pending transform.
   */
  registerControls(controls: CanvasControlHandle) {
    return this.controller.registerControls(this.panel, controls);
  }
  /**
   * Checks whether editor selection has already admitted a move.
   * @returns True for a move owned by this occurrence.
   */
  isMoving() {
    return this.controller.isMoving(this.panel);
  }
  /**
   * Captures editor geometry and dependent connector previews.
   *
   * @param kind - Requested transformation.
   * @param stop - Cancels the independent control library.
   * @returns Whether the editor accepted the gesture.
   */
  begin(kind: TransformKind, stop: () => void) {
    return Boolean(
      this.root &&
      this.selectedIds.length &&
      this.controller.beginControls(this.panel, this.root, this.selectedIds, kind, stop),
    );
  }
  /**
   * Displays translated geometry without creating document history.
   *
   * @param dx - Horizontal world displacement.
   * @param dy - Vertical world displacement.
   * @returns Selected objects and attached connectors show the preview.
   */
  previewMove(dx: number, dy: number) {
    this.controller.previewMove(dx, dy);
  }
  /**
   * Displays resized or rotated geometry through editor-specific renderers.
   *
   * @param previews - Concrete leaf geometry.
   * @param rotationDelta - Rotation of the selected group in degrees.
   * @returns Preview geometry has been painted without persistence.
   */
  previewControls(previews: readonly ControlPreview[], rotationDelta?: number) {
    this.controller.previewControls(previews, rotationDelta);
  }
  /**
   * Commits one editor transaction or restores the source geometry.
   *
   * @param commit - Whether the gesture completed successfully.
   * @param detail - Click count preserving double-click editing.
   * @returns The document or cancelled preview reflects the outcome.
   */
  finish(commit: boolean, detail?: number) {
    this.controller.finishControls(this.panel, commit, detail);
  }
  /**
   * Preserves editor interaction markers and accessible names on library-owned controls.
   *
   * @param box - Mounted control box.
   * @param selectedId - Single selected document element, if any.
   * @returns Editor-specific selectors can identify the shared controls.
   */
  decorateControls(box: HTMLElement, selectedId?: string) {
    box.setAttribute("data-editor-control", "");
    box.setAttribute("data-edgeless-ui", "true");
    if (selectedId) {
      box.setAttribute("data-edgeless-controls-for", selectedId);
    } else {
      box.removeAttribute("data-edgeless-controls-for");
    }
    for (const handle of box.querySelectorAll<HTMLElement>("[data-canvas-resize-handle]")) {
      handle.dataset.edgelessResizeHandle = handle.dataset.canvasResizeHandle;
    }
    const rotate = box.querySelector<HTMLElement>("[data-canvas-rotation-handle]");
    if (rotate) {
      rotate.dataset.edgelessRotationHandle = "true";
    }
  }
}
