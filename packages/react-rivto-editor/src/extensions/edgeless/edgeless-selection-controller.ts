import type { PanelEventsApi } from "../../managers/events/api";
import type { EditorEvent } from "../../managers/events/editor-event";
import type { InputRoot, PointerInput } from "@chulane/rivto-root";
import type { CanvasMarquee } from "@chulane/rivto-edgeless";
import type { EdgelessSelectionRuntime } from "../built-ins/selection/edgeless-runtime";
import type { PanelInputRegistration } from "../../panels/types";
import { BLOCK_CONTENT_SELECTOR, EDITOR_CONTROL_SELECTOR } from "../../constants";

const ROOT_SELECTOR = "[data-edgeless-root]";
const OBJECT_SELECTOR = "[data-edgeless-object-kind][data-edgeless-object-id]";
const HANDLE_SELECTOR = "[data-edgeless-resize-handle], [data-edgeless-rotation-handle]";

/** Admits host object gestures while the independent canvas owns marquee mechanics. */
export class EdgelessSelectionController {
  private readonly releases: Array<() => void> = [];

  /**
   * Takes ownership of one mounted marquee and borrows canonical selection.
   *
   * The host owns card admission and persisted group semantics. Canvas owns the
   * rectangle and captured gesture state; destruction removes its DOM node.
   *
   * @param marquee - Occurrence-bound marquee owned until controller destruction.
   * @param inputRoot - Exact originating occurrence borrowed for marker reads.
   * @param selection - Canonical host selection reads and writes, without teardown access.
   * @param inputRegistration - Routing lifetime that owns this controller.
   */
  constructor(
    readonly marquee: Pick<CanvasMarquee, "start" | "move" | "stop" | "destroy">,
    private readonly inputRoot: Pick<InputRoot, "isAttached" | "readAttribute">,
    private readonly selection: Pick<EdgelessSelectionRuntime, "get" | "set" | "clear">,
    private readonly inputRegistration: PanelInputRegistration,
  ) {}

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
          (event) => this.start(event),
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
          (event) => this.move(event),
        ),
      );
      for (const type of ["pointerup", "pointercancel"] as const) {
        this.releases.push(
          events.register(
            { id: `edgeless.selection.${type}`, type, target: "window", mode: "edgeless" },
            (event) => {
              if (
                event.inputRegistration !== this.inputRegistration ||
                !this.inputRegistration.isCurrent(this.inputRoot)
              ) {
                return false;
              }
              return this.marquee.stop();
            },
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
   * @param event - Normalized primary-button sample before block content handles it.
   * @returns Whether host object selection consumed the event.
   * @throws Propagates Root ownership checks and host selection failures.
   */
  private start(event: EditorEvent<"surface", "pointerdown">): boolean {
    const input = event.pointerInput;
    const target = input?.target;
    const root = this.inputRoot;
    if (
      event.inputRoot !== root ||
      event.inputRegistration !== this.inputRegistration ||
      !this.inputRegistration.isCurrent(root) ||
      !input ||
      input.button !== 0 ||
      !input.isCurrentRealmElement() ||
      !target ||
      !root.isAttached()
    ) {
      return false;
    }
    if (
      root.readAttribute("data-panning-ready") === "true" ||
      root.readAttribute("data-edgeless-pan-tool") === "true" ||
      !root.isAttached() ||
      !this.inputRegistration.isCurrent(root) ||
      target.hasAncestor(HANDLE_SELECTOR)
    ) {
      return false;
    }
    const card = target.hasAncestor(ROOT_SELECTOR);
    const objectId = target.ancestorAttribute(OBJECT_SELECTOR, "data-edgeless-object-id");
    const primary = input.ctrlKey || input.metaKey;
    if (objectId && !card) {
      this.selectObject(objectId, primary);
      if (!this.inputRegistration.isCurrent(root)) {
        return true;
      }
      event.inputRoot.clearSelection();
      if (primary) {
        input.stopPropagation();
      }
      return primary;
    }
    if (card) {
      return this.selectCard(input, event.inputRoot, primary);
    }
    if (target.hasAncestor("[data-edgeless-ui], .edgeless-drawing-capture[data-active]")) {
      return false;
    }
    event.inputRoot.focus();
    if (!this.inputRegistration.isCurrent(root)) {
      return false;
    }
    if (!primary) {
      this.selection.clear();
    }
    if (!this.inputRegistration.isCurrent(root)) {
      return false;
    }
    this.marquee.start(input.clientX, input.clientY, primary ? this.selection.get().items : []);
    return true;
  }

  /**
   * Forwards admitted pointer movement while reserving active pan gestures for the camera.
   *
   * @param event - Window pointer sample in client coordinates.
   * @returns Whether the marquee consumed this sample.
   * @throws Propagates Root ownership checks, geometry, and selection failures.
   */
  private move(event: EditorEvent<"window", "pointermove">): boolean {
    const input = event.pointerInput;
    return Boolean(
      input &&
      event.inputRoot === this.inputRoot &&
      event.inputRegistration === this.inputRegistration &&
      this.inputRegistration.isCurrent(this.inputRoot) &&
      this.inputRoot.isAttached() &&
      this.inputRoot.readAttribute("data-panning") !== "true" &&
      this.inputRoot.isAttached() &&
      this.inputRegistration.isCurrent(this.inputRoot) &&
      this.marquee.move(input.clientX, input.clientY),
    );
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
   * Controls retain their ordinary interaction; only a non-interactive card
   * background changes object selection and receives focus.
   *
   * @param input - Normalized pointer input identifying the card and editable content.
   * @param inputRoot - Occurrence capability used to clear native selection.
   * @param primary - Whether to toggle the card instead of replacing selection.
   * @returns Whether the card background consumed the click.
   */
  private selectCard(
    input: PointerInput,
    inputRoot: Pick<InputRoot, "clearSelection">,
    primary: boolean,
  ): boolean {
    if (input.target?.hasAncestor(`${BLOCK_CONTENT_SELECTOR}, ${EDITOR_CONTROL_SELECTOR}`)) {
      return false;
    }
    const id = input.target?.ancestorAttribute(ROOT_SELECTOR, "data-edgeless-root");
    if (id) {
      this.selectObject(id, primary);
      if (!this.inputRegistration.isCurrent(this.inputRoot)) {
        return true;
      }
      if (primary) {
        inputRoot.clearSelection();
      }
    } else {
      this.selection.set([]);
    }
    if (this.inputRegistration.isCurrent(this.inputRoot)) {
      input.focusTargetAncestor(ROOT_SELECTOR);
    }
    return true;
  }
}
