import type { PanelEventsApi } from "../../managers/events/api";
import { CanvasMarquee, CanvasViewport } from "@chulane/rivto-edgeless/browser";
import type { ReactPanelApi } from "../../panels/types";
import type { EdgelessSelectionRuntime } from "../built-ins/selection/edgeless-runtime";
import { BLOCK_CONTENT_SELECTOR, EDITOR_CONTROL_SELECTOR } from "../../constants";
import { groupParentByChild, outermostGroupId } from "./edgeless-geometry";

const ROOT_SELECTOR = "[data-edgeless-root]";
const OBJECT_SELECTOR = "[data-edgeless-object-kind][data-edgeless-object-id]";
const HANDLE_SELECTOR = "[data-edgeless-resize-handle], [data-edgeless-rotation-handle]";
const RECTANGLE_CLASS = "edgeless-selection-rectangle";

/** Admits host object gestures while the independent canvas owns marquee mechanics. */
export class EdgelessSelectionController {
  readonly marquee: CanvasMarquee;
  private readonly releases: Array<() => void> = [];

  /**
   * Creates one host-styled marquee for this mounted occurrence.
   *
   * The host owns card admission and persisted group semantics. Canvas owns the
   * rectangle and captured gesture state; destruction removes its DOM node.
   *
   * @param root - Fixed mounted viewport receiving input.
   * @param elements - Borrowed group records, read once when a marquee crosses slop.
   * @param selection - Canonical host selection reads and writes, without teardown access.
   */
  constructor(
    private readonly root: HTMLElement,
    private readonly elements: Pick<ReactPanelApi["elements"], "getElementNodes">,
    private readonly selection: Pick<EdgelessSelectionRuntime, "get" | "set" | "clear">,
  ) {
    const rectangle = root.ownerDocument.createElement("div");
    rectangle.className = RECTANGLE_CLASS;
    rectangle.dataset.edgelessSelectionRectangle = "true";
    this.marquee = new CanvasMarquee(rectangle, {
      /**
       * Captures canvas bounds and lifts child hits to their persisted outermost group.
       *
       * @returns Host selection identities paired with each child's captured bounds.
       */
      capture: () => {
        const canvas = CanvasViewport.forElement(this.root)?.canvas;
        if (!canvas) {
          return [];
        }
        const parents = groupParentByChild(this.elements.getElementNodes());
        return CanvasMarquee.snapshot(this.root, canvas).map((hit) => ({
          ...hit,
          id: outermostGroupId(hit.id, parents),
        }));
      },
      /**
       * Commits marquee identities to the panel's authoritative selection.
       *
       * @param ids - Distinct base and intersecting object identities.
       * @returns Host selection and its observers reflect this pointer sample.
       */
      select: (ids) => this.selection.set(ids),
    });
  }

  /**
   * Registers occurrence-scoped pointer input after the viewport commits.
   *
   * @param events - Borrowed host event registration, without attachment or teardown access.
   * @returns Cleanup removing all installed listeners and the owned marquee node.
   * @throws Rolls back acquired resources if any registration fails.
   */
  install(events: Pick<PanelEventsApi, "register">): () => void {
    try {
      this.releases.push(
        events.register(
          {
            id: "edgeless.selection.pointer-start",
            type: "pointerdown",
            capture: true,
            mode: "edgeless",
          },
          ({ raw }) => this.start(raw),
        ),
      );
      this.releases.push(
        events.register(
          {
            id: "edgeless.selection.pointer-move",
            type: "pointermove",
            target: "window",
            mode: "edgeless",
            passive: false,
          },
          ({ raw }) => this.move(raw),
        ),
      );
      for (const type of ["pointerup", "pointercancel"] as const) {
        this.releases.push(
          events.register(
            { id: `edgeless.selection.${type}`, type, target: "window", mode: "edgeless" },
            this.marquee.stop,
          ),
        );
      }
      return () => this.destroy();
    } catch (error) {
      try {
        this.destroy();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Edgeless selection setup failed");
      }
      throw error;
    }
  }

  /**
   * Removes this occurrence's marquee and releases its captured geometry.
   *
   * @returns Listeners and the owned rectangle are detached; repeated destruction is harmless.
   * @throws Aggregates failures after attempting every release.
   */
  destroy(): void {
    const errors: unknown[] = [];
    for (const release of [...this.releases.splice(0).reverse(), () => this.marquee.destroy()]) {
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Edgeless selection cleanup failed");
    }
  }

  /**
   * Selects host objects or begins a marquee when empty canvas admits the pointer.
   *
   * @param event - Native primary-button sample before block content handles it.
   * @returns Whether host object selection consumed the event.
   */
  private start(event: PointerEvent): boolean {
    const target = event.target;
    const root = this.root;
    if (event.button !== 0 || !(target instanceof Element)) {
      return false;
    }
    if (
      root.dataset.panningReady === "true" ||
      root.dataset.edgelessPanTool === "true" ||
      target.closest(HANDLE_SELECTOR)
    ) {
      return false;
    }
    const card = target.closest<HTMLElement>(ROOT_SELECTOR);
    const objectId = target.closest<HTMLElement>(OBJECT_SELECTOR)?.dataset.edgelessObjectId;
    const primary = event.ctrlKey || event.metaKey;
    if (objectId && !card) {
      this.selectObject(objectId, primary);
      root.ownerDocument.getSelection()?.removeAllRanges();
      if (primary) {
        event.stopPropagation();
      }
      return primary;
    }
    if (card) {
      return this.selectCard(card, target, primary);
    }
    if (target.closest("[data-edgeless-ui], .edgeless-drawing-capture[data-active]")) {
      return false;
    }
    root.focus({ preventScroll: true });
    if (!primary) {
      this.selection.clear();
    }
    this.marquee.start(event.clientX, event.clientY, primary ? this.selection.get().items : []);
    return true;
  }

  /**
   * Forwards admitted pointer movement while reserving active pan gestures for the camera.
   *
   * @param event - Window pointer sample in client coordinates.
   * @returns Whether the marquee consumed this sample.
   */
  private move(event: PointerEvent): boolean {
    return this.root.dataset.panning !== "true" && this.marquee.move(event.clientX, event.clientY);
  }

  /**
   * Toggles an object with Primary or retains an existing multi-object selection.
   *
   * @param id - Projected object selected by the host hit.
   * @param primary - Whether the additive selection modifier is held.
   * @returns The canonical object selection reflects the click.
   */
  private selectObject(id: string, primary: boolean): void {
    const current = this.selection.get().items;
    const exists = current.includes(id);
    let next = current;
    if (primary) {
      next = exists ? current.filter((item) => item !== id) : [...current, id];
    } else if (!exists) {
      next = [id];
    }
    this.selection.set(next);
  }

  /**
   * Selects a card background while preserving native editable content and marked controls.
   *
   * @param card - Mounted root card that owns the hit.
   * @param target - Original pointer target used to identify editable content.
   * @param primary - Whether to toggle the card instead of replacing selection.
   * @returns Whether the card background consumed the click.
   */
  private selectCard(card: HTMLElement, target: Element, primary: boolean): boolean {
    if (this.isInteractive(target)) {
      return false;
    }
    const id = card.dataset.edgelessRoot;
    if (id) {
      this.selectObject(id, primary);
      if (primary) {
        this.root.ownerDocument.getSelection()?.removeAllRanges();
      }
    } else {
      this.selection.set([]);
    }
    card.focus({ preventScroll: true });
    return true;
  }

  /**
   * Returns true for controls that retain their normal interaction without Primary.
   *
   * @param target - Event target under the pointer.
   * @returns True when the target is editable content or a marked control.
   */
  private isInteractive(target: Element): boolean {
    return Boolean(target.closest(`${BLOCK_CONTENT_SELECTOR}, ${EDITOR_CONTROL_SELECTOR}`));
  }
}
