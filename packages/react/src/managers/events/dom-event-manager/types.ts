import type {
  EditorMode,
  EditorSelection,
  RivtoEditorApi,
} from "@chulane/rivto";

/** Native listener owner supported by this editor event runtime. */
export type DOMEditorEventTarget = "root" | "document" | "window";

export type DOMEditorEventMap<Target extends DOMEditorEventTarget> =
  Target extends "document" ? DocumentEventMap :
  Target extends "window" ? WindowEventMap :
  HTMLElementEventMap;

export type DOMEditorEventName<Target extends DOMEditorEventTarget> =
  Extract<keyof DOMEditorEventMap<Target>, string>;

/** Values shared by DOM and keyboard event conditions and handlers. */
export interface DOMEditorEventContext<
  Target extends DOMEditorEventTarget = DOMEditorEventTarget,
  Type extends DOMEditorEventName<Target> = DOMEditorEventName<Target>,
> {
  /** Framework-neutral editor which owns commands and document state. */
  readonly editor: RivtoEditorApi;
  /** Currently committed surface root. */
  readonly root: HTMLElement;
  /** Mode captured when the native event was dispatched. */
  readonly mode: EditorMode;
  /** Detached core selection snapshot captured for this dispatch. */
  readonly selection: EditorSelection;
  /** Original native event without a React synthetic wrapper. */
  readonly event: DOMEditorEventMap<Target>[Type];
  /** Realm on which the listener was registered. */
  readonly eventTarget: Target;
  /** Whether the native target belongs to the active editor root. */
  readonly insideRoot: boolean;
  /** Nearest stable block container, only for targets inside the root. */
  readonly blockElement: HTMLElement | null;
  /** ID read from `blockElement`, when one was resolved. */
  readonly blockId: string | undefined;
  /** Nearest editable content host, only for targets inside the root. */
  readonly contentElement: HTMLElement | null;
}

/** Restricts and configures one native listener. */
export interface DOMEditorEventOptions<Target extends DOMEditorEventTarget = "root"> {
  /** Listener realm; defaults to the active surface root. */
  readonly target?: Target;
  /** Modes in which this registration participates in ordered dispatch. */
  readonly mode?: EditorMode | readonly EditorMode[];
  /** Native capture setting. Registrations with different values reconnect separately. */
  readonly capture?: boolean;
  /** Native passive setting. Use false when a handler may claim the event. */
  readonly passive?: boolean;
}
