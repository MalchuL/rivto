import type { EditorEventInit } from "./types";
/**
 * Editor interaction contracts and operations. Browser editing context is separate from core whole-block selection; document mutations use core managers.
 */
import type {
  EditorMode,
  Selection,
} from "@chulane/rivto";
import type { ReactPanelApi } from "../../panels/types";
import type {
  DOMEventMap,
  DOMEventName,
  DOMEventTarget,
} from "./dom-types";

/**
 * Immutable-by-convention value passed through one editor event dispatch.
 *
 * This class is deliberately data-only. Registration, ordering, claiming, and
 * cleanup remain responsibilities of EventManager.
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

  /** Creates one normalized snapshot from registry-resolved values. */
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
}
