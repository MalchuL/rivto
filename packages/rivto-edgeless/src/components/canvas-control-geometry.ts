import type { OnResizeStart, OnRotateStart, OnResize, OnRotate } from "react-moveable";
import type { Canvas } from "../core/canvas";
import type { Rect } from "../types/canvas";
import type { CanvasControlsAdapter } from "../types/controls";

/** Converts Moveable geometry against a stable gesture origin. */
export class CanvasControlGeometry {
  private initial = new Map<string, { frame: Rect; rotation: number }>();

  /**
   * Binds geometry lookup to the receiving scene and its mounted measurement hosts.
   *
   * @param canvas - Scene supplying world frames and minimum dimensions.
   * @param adapter - Consumer identity policy for real DOM targets.
   * @param measurementIds - Identities of temporary offscreen measurement hosts.
   */
  constructor(
    private readonly canvas: Pick<Canvas, "getElement">,
    private readonly adapter: Pick<CanvasControlsAdapter, "targetId">,
    private readonly measurementIds: WeakMap<Element, string>,
  ) {}

  /**
   * Collects distinct world alignment lines from non-participating resizable elements.
   *
   * Mounted objects use native element guidelines so Moveable retains distance markers.
   * Offscreen objects still contribute deduplicated horizontal and vertical coordinates.
   *
   * @param canvas - Scene providing full geometry, including unmounted elements.
   * @param adapter - Current concrete transform participants to exclude.
   * @param plane - World layer whose element hosts can supply measured alignment.
   * @returns Mounted geometry hosts and deduplicated offscreen edge and center coordinates.
   */
  static getAlignmentGuidelines(
    canvas: Pick<Canvas, "getElements">,
    adapter: Pick<CanvasControlsAdapter, "getTargetIds">,
    plane: HTMLElement,
  ) {
    const participants = new Set(adapter.getTargetIds());
    const guidelines = canvas
      .getElements()
      .filter(
        (node) => !participants.has(node.id) && node.render !== false && node.resizable !== false,
      );
    const eligible = new Set(guidelines.map(({ id }) => id));
    const elements = [...plane.querySelectorAll<HTMLElement>("[data-canvas-element]")].filter(
      (host) => eligible.has(host.dataset.canvasElement!),
    );
    const mounted = new Set(elements.map((host) => host.dataset.canvasElement));
    const unmounted = guidelines.filter(({ id }) => !mounted.has(id));
    // Repeated rows and columns share alignment lines; Moveable scans each supplied line per sample.
    const horizontal = [
      ...new Set(
        unmounted.flatMap((node) => [
          node.frame.y,
          node.frame.y + node.frame.height / 2,
          node.frame.y + node.frame.height,
        ]),
      ),
    ];
    const vertical = [
      ...new Set(
        unmounted.flatMap((node) => [
          node.frame.x,
          node.frame.x + node.frame.width / 2,
          node.frame.x + node.frame.width,
        ]),
      ),
    ];
    return { horizontal, vertical, elements };
  }

  /**
   * Captures participant geometry once before the first preview sample.
   *
   * @param targets - Mounted targets, including offscreen measurement hosts.
   * @returns Subsequent conversions use these original frames and rotations.
   */
  capture(targets: readonly HTMLElement[]): void {
    this.initial = new Map(
      targets.map((host) => {
        const element = this.canvas.getElement(this.targetId(host))!;
        return [element.id, { frame: { ...element.frame }, rotation: element.rotation ?? 0 }];
      }),
    );
  }
  /**
   * Initializes minimum size and translation without changing the gesture origin.
   *
   * @param event - Library resize-start geometry.
   * @returns The library has consumer constraints and initial translation.
   */
  resizeStart = (event: OnResizeStart) => {
    const node = this.canvas.getElement(this.targetId(event.target));
    event.setMin(node?.minSize ? [...node.minSize] : [1, 1]);
    event.setOrigin(["50%", "50%"]);
    const base = this.initial.get(this.targetId(event.target))!.frame;
    if (event.dragStart) {
      event.dragStart.set([
        base.x - parseFloat(event.target.style.left),
        base.y - parseFloat(event.target.style.top),
      ]);
    }
  };
  /**
   * Initializes rotation and translation from the captured source geometry.
   *
   * @param event - Library rotation-start geometry.
   * @returns The library rotates around the original frame center.
   */
  rotateStart = (event: OnRotateStart) => {
    event.set(this.initial.get(this.targetId(event.target))!.rotation);
    const base = this.initial.get(this.targetId(event.target))!.frame;
    if (event.dragStart) {
      event.dragStart.set([
        base.x - parseFloat(event.target.style.left),
        base.y - parseFloat(event.target.style.top),
      ]);
    }
  };
  /**
   * Converts a library resize sample to consumer world geometry.
   *
   * @param event - Resized dimensions and translation relative to the original layout.
   * @returns Leaf identity, world frame, angle and relative CSS transform.
   */
  resizePreview = (event: OnResize) => {
    const { target, width, height, drag } = event;
    const id = this.targetId(target);
    const base = this.initial.get(id)!;
    return {
      id,
      frame: {
        x: parseFloat(target.style.left) + drag.beforeTranslate[0]!,
        y: parseFloat(target.style.top) + drag.beforeTranslate[1]!,
        width,
        height,
      },
      rotation: base.rotation,
      transform: drag.transform,
    };
  };
  /**
   * Converts a library rotation sample without feeding positions back into its origin.
   *
   * @param event - Rotation angle and translation computed by the library.
   * @returns Leaf geometry and relative CSS transform for this sample.
   */
  rotatePreview = (event: OnRotate) => {
    const { target, beforeRotate, drag } = event;
    const id = this.targetId(target);
    const base = this.initial.get(id)!;
    return {
      id,
      frame: {
        ...base.frame,
        x: parseFloat(target.style.left) + drag.beforeTranslate[0]!,
        y: parseFloat(target.style.top) + drag.beforeTranslate[1]!,
      },
      rotation: beforeRotate,
      transform: drag.transform,
    };
  };

  /**
   * Resolves offscreen measurement identity before delegating to the consumer.
   *
   * @param host - Real or temporary transform target.
   * @returns Stable scene element identity.
   */
  private targetId(host: HTMLElement | SVGElement): string {
    return this.measurementIds.get(host) ?? this.adapter.targetId(host);
  }
}
