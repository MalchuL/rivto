import type { DOMEventMap, DOMEventName, DOMEventScope, DOMEventTarget } from "./dom-types";
import type { EditorMode, Selection } from "@chulane/rivto";
import type { PanelRegistration, ReactPanelApi } from "../../panels/types";
import type { EditorEvent } from "./editor-event";

/** Callback used by DOM and keyboard event registrations. */
export type EditorEventHandler<EventValue> = (event: EventValue) => boolean | void;

/** Native listener options that must match before registrations can share a listener. */
export interface NativeListenerGroup {
  readonly target: DOMEventTarget;
  readonly type: string;
  readonly capture: boolean;
  readonly passive: boolean;
}

export interface ConnectedListener extends NativeListenerGroup {
  readonly nativeTarget: EventTarget;
  readonly listener: EventListener;
}

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
  /** React editor owning browser interaction and focused document capabilities. */
  readonly reactPanel: ReactPanelApi;
  /** Root DOM element of the currently committed React surface. */
  readonly root: HTMLElement;
  /** Editor mode captured for this dispatch, supplied by the receiving panel's rendered surface. */
  readonly mode: EditorMode;
  /** Detached structured selection captured for this dispatch. */
  readonly selection: Selection | undefined;
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

export type AnyEditorEvent = EditorEvent<DOMEventTarget, never>;

export interface DOMRegistration {
  readonly id: string;
  readonly owner?: Pick<PanelRegistration, "id" | "getRoot">;
  readonly type: string;
  readonly target: DOMEventTarget;
  readonly scope?: DOMEventScope;
  readonly listener: EditorEventHandler<AnyEditorEvent>;
  readonly mode?: EditorMode | readonly EditorMode[];
  readonly capture: boolean;
  readonly passive: boolean;
  readonly preventDefault: boolean;
  readonly when?: (event: AnyEditorEvent) => boolean;
}
