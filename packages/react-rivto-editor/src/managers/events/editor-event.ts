import type {
  RivtoEditorApi as Editor,
  EditorMode,
  EditorSelection,
} from "@chulane/rivto";
import type {
  DOMEventMap,
  DOMEventName,
  DOMEventTarget,
} from "./dom-types";

/**
 * Constructor values for one normalized editor event.
 *
 * Registries resolve these values once per native dispatch. The resulting
 * event is then shared by availability predicates and ordered handlers.
 */
export interface EditorEventInit<
  Target extends DOMEventTarget = DOMEventTarget,
  Type extends DOMEventName<Target> = DOMEventName<Target>,
> {
  /** Original native browser event. */
  readonly raw: DOMEventMap<Target>[Type];
  /** Framework-neutral editor owning document state and commands. */
  readonly editor: Editor;
  /** Root DOM element of the currently committed React surface. */
  readonly root: HTMLElement;
  /** Editor mode captured for this dispatch. */
  readonly mode: EditorMode;
  /** Detached structured selection captured for this dispatch. */
  readonly selection: EditorSelection;
  /** Realm on which the native listener is attached. */
  readonly eventTarget: Target;
  /** Whether the native target belongs to the active surface. */
  readonly insideRoot: boolean;
  /** Nearest stable block container inside the active surface. */
  readonly blockElement: HTMLElement | null;
  /** Persisted identity read from blockElement. */
  readonly blockId: string | undefined;
  /** Nearest editable content host inside the active surface. */
  readonly contentElement: HTMLElement | null;
}

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
  readonly editor: Editor;
  readonly root: HTMLElement;
  readonly mode: EditorMode;
  readonly selection: EditorSelection;
  readonly eventTarget: Target;
  readonly insideRoot: boolean;
  readonly blockElement: HTMLElement | null;
  readonly blockId: string | undefined;
  readonly contentElement: HTMLElement | null;

  /** Creates one normalized snapshot from registry-resolved values. */
  constructor(init: EditorEventInit<Target, Type>) {
    this.raw = init.raw;
    this.editor = init.editor;
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
