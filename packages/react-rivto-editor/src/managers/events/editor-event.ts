import type { EditorEventInit } from "./types";
/**
 * Editor interaction contracts and operations. Browser editing context is separate from core whole-block selection; document mutations use core managers.
 */
import type { EditorMode, Selection } from "@chulane/rivto";
import type { ReactPanelApi } from "../../panels/types";
import type { DOMEventDefinition, DOMEventMap, DOMEventName, DOMEventTarget } from "./dom-types";

/**
 * Immutable-by-convention value passed through one editor event dispatch.
 *
 * This class stores captured context and evaluates mode/scope filters against it.
 * Registration, ordering, claiming, and cleanup remain responsibilities of EventManager.
 */
export class EditorEvent<
  Target extends DOMEventTarget = DOMEventTarget,
  Type extends DOMEventName<Target> = DOMEventName<Target>,
> {
  readonly raw: DOMEventMap<Target>[Type];
  readonly reactPanel: ReactPanelApi;
  readonly root: HTMLElement;
  readonly mode: EditorMode;
  readonly selection: Selection | undefined;
  readonly eventTarget: Target;
  readonly insideRoot: boolean;
  readonly blockElement: HTMLElement | null;
  readonly blockId: string | undefined;
  readonly contentElement: HTMLElement | null;

  /**
   * Creates one normalized snapshot from registry-resolved values.
   *
   * Values are retained as supplied, without querying live panel state or cloning
   * the selection. The caller supplies the detached selection snapshot.
   *
   * @param init - Captured panel, DOM and selection context for this delivery.
   */
  constructor(init: EditorEventInit<Target, Type>) {
    this.raw = init.raw;
    this.reactPanel = init.reactPanel;
    this.root = init.root;
    this.mode = init.mode;
    this.selection = init.selection;
    this.eventTarget = init.eventTarget;
    this.insideRoot = init.insideRoot;
    this.blockElement = init.blockElement;
    this.blockId = init.blockId;
    this.contentElement = init.contentElement;
  }
  /**
   * Checks host mode and DOM scope restrictions against this captured context.
   *
   * Omitted restrictions accept every mode or scope, including outside-root events.
   * Dynamic availability predicates remain the dispatcher's responsibility.
   *
   * @param definition - Optional mode and scope restrictions from a DOM or keyboard registration.
   * @returns Whether both restrictions match the receiving panel and target markers.
   */
  matches(definition: Pick<DOMEventDefinition, "mode" | "scope">): boolean {
    const { mode, scope } = definition;
    if (mode && !(Array.isArray(mode) ? mode.includes(this.mode) : mode === this.mode)) {
      return false;
    }
    if (!scope) {
      return true;
    }
    if (scope === "surface") {
      return this.insideRoot;
    }
    if (scope === "block") {
      return Boolean(this.blockElement);
    }
    return Boolean(this.contentElement);
  }
}
