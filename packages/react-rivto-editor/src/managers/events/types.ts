import type { DOMEventMap, DOMEventName, DOMEventScope, DOMEventTarget } from "./dom-types";
import type { EditorMode, Selection } from "@chulane/rivto";
import type { ReactPanelApi } from "../../types";
import type { PanelEventScope } from "./api";
import type { EditorEvent } from "./editor-event";
import type { PanelRegistryApi } from "../../editor/panel-registry-api";

/** Root lookup and subscriptions borrowed by the document's delegated event listeners. */
export interface EditorEventRoots extends Pick<PanelRegistryApi, "getSurfaceType"> {
  /**
   * Subscribes to changes to the mounted roots used for native listener attachment.
   *
   * @param listener - Called when roots are registered or removed.
   * @returns A disposer that removes this listener.
   */
  subscribeRoots(listener: () => void): () => void;
  /**
   * Captures the currently registered roots for native listener attachment.
   *
   * @returns A detached set containing both full-document and subtree roots.
   */
  getRoots(): ReadonlySet<HTMLElement>;
  /**
   * Chooses the receiving panel, retaining the origin of a continuing pointer gesture.
   * Hover routes without changing editing focus. Focus, input, and keyboard events
   * activate their panel and deactivate the previous occurrence's transient UI.
   * @param raw - Native event, shared between listener groups.
   * @param attachedRoot - Surface listener's root; omitted for document/window listeners.
   * @returns Receiving root, or undefined when another editor or surface owns the event.
   */
  resolveEventRoot(raw: Event, attachedRoot?: HTMLElement): HTMLElement | undefined;
  /**
   * Looks up the view that receives editing events for a mounted root.
   *
   * @param root - Surface element returned by event routing.
   * @returns Its API, or undefined for an unknown root or a registration without an API.
   */
  getApi(root: HTMLElement): ReactPanelApi | undefined;
}

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
 * PanelEventFactory resolves these values once per native listener group delivery.
 * The resulting event is then shared by availability predicates and ordered
 * handlers; later native groups capture their own current panel context.
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
  /** False immediately on removal, including in snapshots retained by an ongoing event. */
  active: boolean;
  readonly owner?: PanelEventScope;
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
