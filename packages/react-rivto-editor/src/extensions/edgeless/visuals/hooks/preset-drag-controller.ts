import type { CanvasPointerInput } from "@chulane/rivto-edgeless/browser";
import type { EdgelessCreationTool } from "../../../../managers/edgeless-tools/edgeless-creation-tool";
import { toolPointer } from "./tool-pointer";
import { acquirePresetPointer } from "./preset-pointer-subscription";
import { cancelPresetDrag, releasePresetDrag } from "./preset-drag-cleanup";
import type {
  PresetDrag,
  PresetDragEnvironment,
  PresetDragToolSession,
  PresetPointerHandlers,
  PresetPointerStart,
  PresetPlacement,
  SetPresetDragGuides,
  SetPresetDragPreview,
} from "./types";

/** Client-pixel movement required before a preset becomes a drag. */
const PRESET_DRAG_DISTANCE = 4;

/** Owns one toolbar placement gesture and its borrowed browser capabilities. */
export class PresetDragController implements PresetPointerHandlers {
  private active: PresetDrag | null = null;

  /**
   * Borrows the surface session and presentation updates without subscribing or mounting DOM.
   *
   * @param tools - Session supplying current tool identity and activation.
   * @param id - Unique Root registration prefix for this controller.
   * @param environment - Current viewport, attachment and canvas scale.
   * @param setPreview - Replaces the receiving surface's detached preview.
   * @param setGuides - Replaces the receiving surface's snapping feedback.
   */
  constructor(
    private readonly tools: PresetDragToolSession,
    private readonly id: string,
    private environment: PresetDragEnvironment,
    private readonly setPreview: SetPresetDragPreview,
    private readonly setGuides: SetPresetDragGuides,
  ) {}

  /**
   * Updates viewport input and coordinate conversion after a committed surface render.
   *
   * An active gesture keeps its original attachment capability, while later pointer
   * samples read the current snapping policy and zoom.
   *
   * @param environment - Current viewport, attachment and canvas scale.
   * @returns Later samples use the supplied environment.
   */
  update(environment: PresetDragEnvironment): void {
    this.environment = environment;
  }

  /**
   * Captures the primary pointer and records the preset drag's starting position.
   *
   * A gesture already owning a pointer cannot be replaced by another start.
   *
   * @param event - Detached pointer values and capabilities for the originating toolbar button.
   * @param tool - Registered surface instance whose placement contract supplies the draft.
   * @returns A primary pointer is captured only while its attachment is active.
   * @throws Browser capture or input registration failures, including failed rollback.
   */
  readonly start = (event: PresetPointerStart, tool: EdgelessCreationTool): void => {
    const { viewport, coordinates, inputRoot, rootIdentity } = this.environment;
    if (
      this.active ||
      event.button !== 0 ||
      !tool.supportsPlacement ||
      !viewport ||
      !coordinates?.isAttached() ||
      !inputRoot?.isAttached() ||
      !rootIdentity ||
      inputRoot.getElementIdentity?.() !== rootIdentity
    ) {
      return;
    }
    const clock = inputRoot.captureFrameClock();
    if (
      !clock ||
      !inputRoot.isAttached() ||
      inputRoot.getElementIdentity?.() !== rootIdentity ||
      !coordinates.isAttached()
    ) {
      return;
    }
    const resources = acquirePresetPointer(viewport, event, this, `edgeless.preset.${this.id}`);
    if (!resources) {
      return;
    }
    this.active = {
      pointerId: event.pointerId,
      ...resources,
      tool,
      coordinates,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      preview: null,
      createPreview: event.createPreview,
      clock,
    };
    if (
      !inputRoot.isAttached() ||
      inputRoot.getElementIdentity?.() !== rootIdentity ||
      !coordinates.isAttached()
    ) {
      this.cancel();
    }
  };

  /**
   * Reports whether a pointer is currently reserved by this controller.
   *
   * @returns True from accepted pointer-down until release or cancellation.
   */
  readonly isActive = (): boolean => Boolean(this.active);

  /**
   * Discards an active toolbar gesture and releases its captured pointer.
   *
   * @returns Whether a gesture existed; cancellation clears preview and guides.
   * @throws AggregateError after attempting every cleanup if any operation fails.
   */
  readonly cancel = (): boolean => {
    const active = this.active;
    if (!active) {
      return false;
    }
    this.active = null;
    cancelPresetDrag(
      active,
      () => this.setPreview(null),
      () => this.setGuides([]),
    );
    return true;
  };

  /**
   * Cancels placement if the session selects a different tool.
   *
   * @returns An obsolete gesture is canceled; the current tool remains unchanged.
   * @throws Propagates cancellation cleanup failures.
   */
  readonly cancelIfToolChanged = (): void => {
    if (this.active && this.tools.active !== this.active.tool) {
      this.cancel();
    }
  };

  /**
   * Starts the place tool after the movement threshold and updates its detached preview and snap guides.
   *
   * @param event - Detached pointer values for the current movement.
   * @returns The preview is updated, or a stale gesture is canceled.
   * @throws Tool, browser or cleanup failures; concurrent failures are aggregated.
   */
  move(event: CanvasPointerInput): void {
    const active = this.active;
    if (!active || active.pointerId !== event.pointerId) {
      return;
    }
    if (!active.coordinates.isAttached()) {
      this.cancel();
      return;
    }
    if (
      !active.moved &&
      Math.hypot(event.clientX - active.startX, event.clientY - active.startY) <
        PRESET_DRAG_DISTANCE
    ) {
      return;
    }
    try {
      if (!active.moved) {
        this.tools.activate(active.tool.id);
      }
      const draft = this.placement(event, active);
      if (!draft) {
        this.cancel();
        return;
      }
      this.updatePreview(active, draft);
    } catch (error) {
      this.cancelAfterFailure(error, active);
    }
  }

  /**
   * Releases the preset drag preview and capture, creating an element only for a committed drop inside the canvas.
   *
   * A drag inserts only over the canvas outside editor controls. A click activates
   * placement for the next canvas gesture without inserting an element.
   *
   * @param event - Detached pointer values for the release or cancellation.
   * @param commit - Whether to commit the gesture; false cancels without creating or updating document entities.
   * @returns Capture and preview are released; an eligible attached drop may create an element.
   * @throws AggregateError after attempting all release cleanup if any operation fails;
   * tool placement or commit failures also propagate.
   */
  end(event: CanvasPointerInput, commit: boolean): void {
    const active = this.active;
    if (!active || active.pointerId !== event.pointerId) {
      return;
    }
    this.active = null;
    releasePresetDrag(
      active,
      () => this.setPreview(null),
      () => this.setGuides([]),
    );
    if (!commit || !active.coordinates.isAttached()) {
      active.tool.cancel();
      return;
    }
    try {
      if (active.moved) {
        this.commitPlacement(event, active);
      }
      // A click selects placement mode without creating at the viewport center.
      this.tools.activate(active.tool.id);
    } finally {
      active.tool.cancel();
      this.setGuides([]);
    }
  }

  /**
   * Prepares a toolbar draft and displays the tool's snapping feedback.
   *
   * @param event - Detached button pointer sample normalized into canvas coordinates.
   * @param active - Gesture whose tool owns prospective creation data.
   * @returns Detached draft supplied by the tool, or undefined when the captured attachment is unavailable.
   * @throws If the creation tool rejects draft preparation.
   */
  private placement(event: CanvasPointerInput, active: PresetDrag) {
    const { viewport, zoom } = this.environment;
    const input = toolPointer(event, viewport, active.coordinates, zoom);
    if (!input) {
      return undefined;
    }
    const draft = active.tool.preparePlacement(input);
    this.setGuides(draft.guides ?? []);
    return draft;
  }

  /**
   * Creates and schedules detached preview feedback for a prepared placement.
   *
   * @param active - Gesture retaining the original browser preview operations.
   * @param draft - Prepared creation input, frame and snapping feedback.
   * @returns Preview creation is requested once and one positioning frame is pending.
   * @throws Propagates preview creation or browser scheduling failures.
   */
  private updatePreview(active: PresetDrag, draft: PresetPlacement): void {
    active.frame = draft.frame;
    if (!active.moved) {
      const preview = active.createPreview();
      if (!preview) {
        if (this.active === active) {
          this.cancel();
        }
        return;
      }
      if (this.active !== active || !active.coordinates.isAttached() || this.active !== active) {
        preview.remove();
        if (this.active === active) {
          this.cancel();
        }
        return;
      }
      active.moved = true;
      active.preview = preview;
      this.setPreview({ preview, input: draft.input, frame: draft.frame });
    }
    if (!active.cancelFrame) {
      const zoom = this.environment.zoom;
      const cancelFrame = active.clock.requestFrame(() => this.placePresetGhost(active, zoom));
      if (this.active !== active) {
        cancelFrame?.();
        return;
      }
      active.cancelFrame = cancelFrame;
      if (!cancelFrame) {
        this.cancel();
      }
    }
  }

  /**
   * Positions the detached preview host using the canvas transform captured for this frame.
   *
   * @param active - Gesture with a prepared frame and optional preview host.
   * @param zoom - Canvas scale captured when the frame was scheduled.
   * @returns Updates host styles when both the host and viewport are available.
   * @throws Propagates browser geometry or DOM write failures.
   */
  private placePresetGhost(active: PresetDrag, zoom: number): void {
    active.cancelFrame = undefined;
    if (
      this.active !== active ||
      active.clock.now() === undefined ||
      !active.coordinates.isAttached() ||
      !active.preview ||
      !active.frame
    ) {
      return;
    }
    const origin = active.coordinates.getWorldOriginInClient();
    if (origin && active.clock.now() !== undefined && this.active === active) {
      active.preview.position(active.frame, origin, zoom);
    }
  }

  /**
   * Commits a moved preset only when its release hits eligible canvas content.
   *
   * @param event - Detached pointer release coordinates and modifiers.
   * @param active - Gesture holding the original attachment and creation tool.
   * @returns A valid draft is committed when the canvas accepts the release.
   * @throws Propagates hit testing, placement and document mutation failures.
   */
  private commitPlacement(event: CanvasPointerInput, active: PresetDrag): void {
    if (
      active.coordinates.containsClientPoint(
        { x: event.clientX, y: event.clientY },
        "[data-edgeless-ui]",
      )
    ) {
      const draft = this.placement(event, active);
      if (draft) {
        active.tool.commitPlacement(draft);
      }
    }
  }

  /**
   * Cancels a failed gesture while retaining any cleanup failure alongside it.
   *
   * @param error - Original preview, placement or browser failure.
   * @param active - Exact gesture whose operation failed.
   * @returns Never returns; the failure is propagated after cleanup.
   * @throws The original failure or AggregateError containing it and cleanup failure.
   */
  private cancelAfterFailure(error: unknown, active: PresetDrag): never {
    try {
      if (this.active === active) {
        this.cancel();
      }
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Preset drag failed during cleanup");
    }
    throw error;
  }
}
