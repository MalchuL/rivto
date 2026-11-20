import type { TransformKind } from "@chulane/rivto-edgeless";
import type {
  CanvasControlsAdapter,
  CanvasControlHandle,
  CanvasControlMarkers,
  ControlPreview,
} from "@chulane/rivto-edgeless/react";
import type { PanelInputRegistration, ReactPanelApi } from "../../panels/types";
import type { InputRoot } from "@chulane/rivto-root";
import type { EdgelessTransformController } from "./edgeless-transform";

/** Binds document-specific transformation policies to generic canvas controls. */
export class EdgelessControlsAdapter implements CanvasControlsAdapter {
  /**
   * Captures one render's selection and input occurrence without starting subscriptions.
   *
   * @param controller - Owner of document previews, dependent connectors and undo.
   * @param panel - Receiving document occurrence.
   * @param inputRoot - Registration that owns these controls, absent during initial render.
   * @param selectedIds - Selected document elements for this render.
   * @param groupRotation - Persisted group angle, absent for ordinary selections.
   * @param inputRegistration - Routing lifetime captured by this render, absent before registration.
   */
  constructor(
    private readonly controller: EdgelessTransformController,
    private readonly panel: ReactPanelApi,
    private readonly inputRoot:
      Pick<InputRoot, "focus" | "isAttached" | "setTemporaryAttribute" | "findRegions"> | undefined,
    private readonly selectedIds: readonly string[],
    readonly groupRotation: number | undefined,
    private readonly inputRegistration: PanelInputRegistration | undefined,
  ) {}
  /**
   * Resolves all selected leaves before virtualization filters their content.
   * @returns Concrete participant IDs, including offscreen group children.
   */
  getTargetIds() {
    if (!this.isCurrent()) {
      return [];
    }
    return this.controller.getMoveTargetIds(this.panel, this.selectedIds);
  }
  /**
   * Connects controls to Rivto's delegated gesture admission.
   *
   * @param controls - Independent canvas control operations.
   * @returns Cleanup cancelling this occurrence's pending transform.
   */
  registerControls(controls: CanvasControlHandle) {
    const inputRoot = this.inputRoot;
    if (!inputRoot || !this.inputRegistration || !this.isCurrent()) {
      return () => {};
    }
    return this.controller.registerControls(
      this.panel,
      controls,
      inputRoot,
      this.inputRegistration,
    );
  }
  /**
   * Checks whether editor selection has already admitted a move.
   * @returns True for a move owned by this occurrence.
   */
  isMoving() {
    return this.isCurrent() && this.controller.isMoving(this.panel);
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
      this.inputRoot &&
      this.isCurrent() &&
      this.selectedIds.length &&
      this.controller.beginControls(
        this.panel,
        this.inputRoot,
        this.selectedIds,
        kind,
        stop,
        this.inputRegistration,
      ),
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
    if (this.isCurrent()) {
      this.controller.previewMove(dx, dy);
    }
  }
  /**
   * Displays resized or rotated geometry through editor-specific renderers.
   *
   * @param previews - Concrete leaf geometry.
   * @param rotationDelta - Rotation of the selected group in degrees.
   * @returns Preview geometry has been painted without persistence.
   */
  previewControls(previews: readonly ControlPreview[], rotationDelta?: number) {
    if (this.isCurrent()) {
      this.controller.previewControls(previews, rotationDelta);
    }
  }
  /**
   * Commits one editor transaction or restores the source geometry.
   *
   * @param commit - Whether the gesture completed successfully.
   * @param detail - Click count preserving double-click editing.
   * @returns The document or cancelled preview reflects the outcome.
   */
  finish(commit: boolean, detail?: number) {
    if (this.isCurrent()) {
      this.controller.finishControls(this.panel, commit, detail, this.inputRegistration);
    }
  }
  /**
   * Describes editor interaction markers for canvas-owned controls.
   *
   * @param selectedId - Single selected document element, if any.
   * @returns Editor-specific data attributes for the control box and its handles.
   */
  getControlMarkers(selectedId?: string): CanvasControlMarkers {
    const box: Record<`data-${string}`, string> = {
      "data-editor-control": "",
      "data-edgeless-ui": "true",
    };
    if (selectedId) {
      box["data-edgeless-controls-for"] = selectedId;
    }
    return {
      box,
      resizeHandle: "data-edgeless-resize-handle",
      rotationHandle: "data-edgeless-rotation-handle",
    };
  }

  /**
   * Checks whether these controls still belong to the current panel registration.
   *
   * @returns False after the captured registration is detached or replaced.
   */
  private isCurrent(): boolean {
    return Boolean(
      this.inputRoot &&
      this.inputRegistration?.isCurrent(this.inputRoot) &&
      this.panel.inputRoot === this.inputRoot &&
      this.inputRoot.isAttached() &&
      this.inputRegistration.isCurrent(this.inputRoot) &&
      this.panel.inputRoot === this.inputRoot,
    );
  }
}
