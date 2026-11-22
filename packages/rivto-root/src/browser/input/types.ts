import type {
  BrowserInputMap,
  BrowserListenerGroup,
  BrowserListenerRoot,
} from "../../events/types";

/** One attached native listener and its group options. */
export interface BrowserListenerConnection extends BrowserListenerGroup {
  readonly nativeTarget: EventTarget;
  readonly listener: EventListener;
  /** Internal dispatch-boundary listener, absent for ordinary groups. */
  readonly boundary?: "window" | "root" | "pointer-window" | "pointer-root";
  /**
   * Releases this owner's reference to a shared pointer boundary.
   *
   * @returns The native boundary is removed when its last owner releases it.
   * @throws Propagates native listener removal failures.
   */
  readonly releaseBoundary?: () => void;
}

/** Shared native capture boundary retained by one or more listener owners. */
export interface SharedPointerBoundary {
  /** Number of listener owners retaining this boundary. */
  count: number;
  /** Whether the native listener is currently installed. */
  attached: boolean;
  /** Native capture listener installed on the shared target. */
  readonly listener: EventListener;
  /** Weak references to deliveries that may still be propagating. */
  readonly activeEvents: Set<WeakRef<Event>>;
}

/** One owner's reference to a shared pointer boundary. */
export interface PointerBoundaryLease {
  /** Native listener shared by the participating owners. */
  readonly listener: EventListener;
  /**
   * Releases this owner's reference to the boundary.
   *
   * @returns The native boundary is removed when its last owner releases it.
   * @throws Propagates native listener removal failures.
   */
  readonly release: () => void;
}

/**
 * Checks whether an attachment is still the owner's current registration.
 *
 * @returns Whether browser operations may use this attachment now.
 */
export type InputRootOwnerCheck = () => boolean;

/** One native listener attachment and its optional borrowed occurrence lifetime. */
export interface NativeInputAttachment {
  readonly root: HTMLElement;
  readonly isCurrent?: InputRootOwnerCheck;
}

/** One normalized listener attachment and its optional borrowed occurrence. */
export interface BrowserInputAttachment {
  readonly element: HTMLElement;
  readonly occurrence?: BrowserListenerRoot;
}

/** Browser element-like target that supports ancestor matching. */
export interface ClipboardClosestHost {
  closest: Element["closest"];
}

/** Browser node-like target used to resolve parent and focused element. */
export interface ClipboardEventNode {
  readonly parentElement: unknown;
  readonly ownerDocument: ClipboardTargetDocument | null;
}

/** Document-like source of the current clipboard focus. */
export interface ClipboardTargetDocument {
  readonly activeElement: unknown;
}

/** Private browser state backing an opaque input region. */
export interface InputRegionState {
  readonly root: HTMLElement;
  readonly element: Element;
  readonly owner: Element;
  readonly ownerSelector: string;
  readonly boundarySelector?: string;
  readonly isAttached: InputRootOwnerCheck;
}

/** Concurrent temporary owners of one browser attribute. */
export interface TemporaryAttributeState {
  readonly original: string | null;
  readonly owners: TemporaryAttributeOwner[];
}

/** One temporary value in acquisition order. */
export interface TemporaryAttributeOwner {
  readonly value: string;
}

/** Attachment ownership for a normalized browser input listener set. */
export interface BrowserInputListenersOptions {
  /**
   * Whether this listener set owns an occurrence boundary; defaults to true.
   *
   * A borrowing observer can set this to false when another integration owns
   * routing. It then receives root events without nested-occurrence filtering
   * and must apply its own scope rules; it does not create a boundary for peers.
   */
  readonly ownsRoot?: boolean;
  /**
   * Whether callbacks receive an opaque identity shared across listener groups.
   *
   * Defaults to false. When enabled, capture boundaries are retained for each
   * registered event name and identities are renewed on every native dispatch.
   */
  readonly trackDispatch?: boolean;
}

/** Retained dispatch-boundary listeners for one native event name. */
export interface BrowserInputBoundary {
  count: number;
  releases: readonly (() => void)[];
  /** Window phases already associated with an identity for the current dispatch. */
  readonly windowDispatches: WeakSet<Event>;
  /** Weak references used to retain boundary state only during active propagation. */
  readonly activeEvents: Set<WeakRef<Event>>;
}

/**
 * Native listener target relative to the currently attached editor root.
 *
 * - `root`: the attached element. Events from its descendants can reach it
 *   through the normal capture and bubble phases.
 * - `document`: the attached root's `ownerDocument`, including events outside
 *   the root that reach the document.
 * - `window`: the `defaultView` of the attached root's `ownerDocument`, including
 *   events outside the root that reach the window. When the document has no
 *   `defaultView`, the listener is attached to the document instead.
 *
 * The target selects where the native listener is installed; it does not filter
 * events by editor ownership. Callbacks also receive the attached root so their
 * consumer can apply its own routing or scope rules.
 */
export type NativeEventTarget = "root" | "document" | "window";

/** Native event name, realm and phase for one retained listener. */
export interface NativeEventDefinition {
  /** Browser event name installed on the selected target. */
  readonly type: string;
  /** Realm resolved from the attached root. */
  readonly target: NativeEventTarget;
  /** Whether the listener runs during capture. */
  readonly capture: boolean;
  /** Whether browser default prevention is disabled; defaults to false. */
  readonly passive?: boolean;
}

/**
 * Receives one native event from the currently attached root.
 *
 * @param event - Original browser event, with default prevention controlled by the consumer.
 * @param root - Root belonging to this attachment.
 * @param input - Normalized data and synchronous capabilities for this delivery.
 * @returns The consumer's native event delivery has completed.
 */
export type NativeEventListener = (
  event: Event,
  root: HTMLElement,
  input: BrowserInputMap[keyof BrowserInputMap],
) => void;

/** One retained callback and its current attachment's listener. */
export interface NativeRegistration {
  readonly definition: NativeEventDefinition;
  readonly deliver: NativeEventListener;
  active: boolean;
  detach?: () => void;
}

/** Browser-only data retained by one inline-style session. */
export interface InlineStyleState {
  readonly element: HTMLElement | SVGElement;
  readonly property: string;
  readonly original: string;
  readonly priority: string;
  readonly owners: Map<string, object>;
  readonly owner: object;
  /**
   * Checks whether the captured region still belongs to its occurrence.
   *
   * @returns True while preview writes remain valid.
   */
  isCurrent(): boolean;
}
