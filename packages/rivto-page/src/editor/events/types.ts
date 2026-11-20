import type {
  BrowserInputMap,
  EventResult,
  FocusBoundaryInputRoot,
  InputRoot,
  InputRegion,
  RegionIdentity,
} from "@chulane/rivto-root";

/** Region operations borrowed during a normalized region input delivery. */
export type BlockInputRegion = Pick<InputRegion, "setTemporaryAttribute">;

/** Region operations needed to attach and deliver one retained input observer. */
export type BlockRegionInputRegion = Pick<InputRegion, "observeInput" | "setTemporaryAttribute">;

/** Root operations borrowed to locate a mounted input region. */
export interface BlockRegionInputRoot {
  /**
   * Checks whether this occurrence remains attached.
   *
   * @returns False after the occurrence is detached or replaced.
   * @throws Propagates Root ownership-check failures.
   */
  isAttached(): boolean;
  /**
   * Captures a region for one retained registration.
   *
   * @param identity - Opaque identity of the mounted region.
   * @param isCurrent - Optional registration lifetime checked by each operation.
   * @returns Region input capability, or undefined when the identity is unavailable.
   * @throws Propagates Root ownership-check failures.
   */
  captureRegionByIdentity(
    identity: RegionIdentity,
    isCurrent?: () => boolean,
  ): BlockRegionInputRegion | undefined;
}

/**
 * Observes one input and its occurrence-owned receiving region.
 *
 * @param input - Normalized browser input during this synchronous delivery.
 * @param region - Receiving region bounded by the exact Page attachment.
 * @returns The observer's synchronous work has completed.
 */
export type BlockRegionInputObserver<K extends keyof BrowserInputMap> = (
  input: BrowserInputMap[K],
  region: BlockInputRegion,
) => void;

/** Region-scoped normalized input registration borrowed by rendered wrappers. */
export interface BlockRegionEventsApi {
  /**
   * Observes input on a mounted region in browser capture or bubble order.
   *
   * Registrations survive Page attachment replacement while the mounted region
   * identity remains registered. Return values do not claim input; default
   * prevention and propagation require explicit calls. The caller owns the disposer.
   *
   * @param identity - Opaque identity supplied by the region's mounting callback.
   * @param type - Browser input name to observe.
   * @param phase - Capture or bubble phase on the region.
   * @param observer - Receives normalized input and the owned region during synchronous delivery.
   * @returns Idempotent disposer releasing this region registration.
   * @throws Propagates editor lifecycle, listener setup, and cleanup failures.
   */
  observeRegion<K extends keyof BrowserInputMap>(
    identity: RegionIdentity,
    type: K,
    phase: "capture" | "bubble",
    observer: BlockRegionInputObserver<K>,
  ): () => void;
}

/** One Page attachment borrowed by region input registrations. */
export interface BlockRegionInputAttachment {
  /** Occurrence operations borrowed until this attachment is detached. */
  readonly root: BlockRegionInputRoot;
}

/** Listener and Page attachment that currently own one region binding. */
export interface BlockRegionInputBinding {
  /** Exact Page attachment that installed the listener. */
  readonly attachment: BlockRegionInputAttachment;
  /**
   * Removes this attachment's native listener.
   *
   * @returns The listener is released.
   * @throws Propagates browser cleanup failures.
   */
  release(): void;
}

/** Retained region registration independent of a particular Page attachment. */
export interface BlockRegionInputRegistration {
  /** Opaque region identity retained across occurrence reattachment. */
  readonly identity: RegionIdentity;
  /** Whether the caller still owns this registration. */
  active: boolean;
  /** Listener currently installed for an attached occurrence. */
  binding?: BlockRegionInputBinding;
  /**
   * Installs the typed observer on one captured region.
   *
   * @param region - Region bounded by the current Page attachment.
   * @returns Listener disposer, or undefined if ownership ended during setup.
   * @throws Propagates Root listener setup failures.
   */
  attach(region: BlockRegionInputRegion): (() => void) | undefined;
}

/** Focus observation bound to one mounted occurrence and its borrowed Root. */
export interface BlockFocusAttachment {
  readonly occurrence: Pick<
    FocusBoundaryInputRoot,
    "isAttached" | "hasFocusWithin" | "observeInput"
  >;
}

/** Root operations needed to attach Page input and focus delivery. */
export type BlockEditorEventsRoot = BlockInputRoot &
  BlockFocusAttachment["occurrence"] &
  Pick<InputRoot, "createInputObserver">;

/** Normalized browser input names accepted by a Page occurrence. */
export type BlockInputEventMap = BrowserInputMap;

/** Root operations currently borrowed by Page input handlers and observers. */
export type BlockInputRoot = Pick<
  InputRoot,
  | "isAttached"
  | "isConnected"
  | "isInSameDocument"
  | "getElementIdentity"
  | "captureRegionByIdentity"
  | "captureDocument"
  | "captureDocumentAttribute"
  | "captureFrameClock"
  | "clearSelection"
  | "focus"
  | "findRegions"
  | "createLineOverlay"
  | "createTextOverlay"
>;

/** Custom event name and ordering, distinguished from browser input options. */
export interface BlockCustomEventDefinition<Key extends string> {
  /** Identifies the custom payload type. */
  readonly type: Key;
  /** Marks this registration as a custom event rather than browser input. */
  readonly kind: "custom";
  /** Higher priorities run first; equal priorities retain registration order. */
  readonly priority?: number;
}

/** Browser listener attachment realm relative to the mounted editor. */
export type BlockInputTarget = "root" | "document" | "window";
/** Optional requirement on the resolved target of an input event. */
export type BlockInputScope =
  "root" | "block" | "content" | "selection-anchor" | "including-nested";

/** Normalized input with occurrence-local block identity and cancellation capabilities. */
export interface BlockInputEvent<K extends keyof BlockInputEventMap> {
  /** Browser operations bound to this event's attachment, invalidated on detach. */
  readonly root: BlockInputRoot;
  /** Browser input data and synchronous capabilities for this delivery. */
  readonly input: BlockInputEventMap[K];
  /** Listener realm on which this delivery was received. */
  readonly eventTarget: BlockInputTarget;
  /** Whether the target belongs directly to this occurrence. */
  readonly insideRoot: boolean;
  /** Whether the input targeted the attached occurrence root itself. */
  readonly targetIsRoot: boolean;
  /** Stable owning block identity, or null outside a block. */
  readonly blockId: string | null;
  /**
   * Requests cancellation of the browser default for this delivery.
   *
   * @returns The browser default is prevented when the event is cancelable.
   */
  preventDefault(): void;
  /**
   * Stops propagation of this browser input after the current target.
   *
   * @returns The browser will not propagate this input to later targets.
   */
  stopPropagation(): void;
}

/** Input handler ordering and browser attachment configuration. */
export interface BlockInputDefinition<K extends keyof BlockInputEventMap> {
  readonly type: K;
  /** Defaults to root. Document and window listeners can observe outside events. */
  readonly target?: BlockInputTarget;
  readonly capture?: boolean;
  /** Finite priority; higher values run first, ties preserve installation order. */
  readonly priority: number;
  /** `including-nested` also delivers input from nested editor occurrences. */
  readonly scope?: BlockInputScope;
  /**
   * Evaluates live feature availability after scope matching.
   *
   * @param event - Normalized browser input for the current attachment.
   * @returns Whether the handler should run.
   */
  readonly when?: (event: BlockInputEvent<K>) => boolean;
}

/**
 * Handles input without implicitly preventing defaults or stopping DOM propagation.
 *
 * @param event - Normalized input and occurrence-local target context.
 * @returns "handled" to stop subsequent editor handlers, or "continue" to continue delivery.
 */
export type BlockInputHandler<K extends keyof BlockInputEventMap> = (
  event: BlockInputEvent<K>,
) => BlockInputResult;

/** Explicit result of editor input handling, separate from browser default prevention. */
export type BlockInputResult = "handled" | "continue";

/**
 * Observes input independently of whether a handler claims delivery.
 *
 * Return values are ignored; observers cannot consume the editor dispatch queue.
 *
 * @param event - Shared normalized occurrence context and browser input.
 * @returns Observation side effects have completed.
 */
export type BlockInputObserver<K extends keyof BlockInputEventMap> = (
  event: BlockInputEvent<K>,
) => void;

/** Input payloads indexed by native listener group identity. */
export interface BlockInputPayloads {
  readonly [group: string]: unknown;
}

/** Whole-editor focus transitions; movement between descendants emits neither event. */
export type BlockEditorEventType = "focus" | "blur";

/** Observable whole-editor focus transitions, independent of document updates. */
export interface BlockEditorEventsApi<
  CustomEvents extends object = object,
> extends BlockRegionEventsApi {
  /**
   * Observes attachment loss to cancel active gestures and scheduled work.
   *
   * @param listener - Callback invoked before native input listeners detach.
   * @returns Idempotent disposer captured by the extension setup scope.
   * @throws If the editor is destroyed or cleanup ownership fails.
   */
  onDetach(listener: () => void): () => void;

  /**
   * Registers native input behavior independently of focus observers.
   *
   * Priority orders handlers sharing native options; browser propagation orders
   * different realms and capture phases. Returning "handled" claims input without
   * calling preventDefault or stopPropagation. Registrations survive remounts;
   * a delivery stops invoking callbacks when its exact attachment or Root is released.
   * A predicate that removes its own registration prevents that callback from running.
   *
   * @param id - Unique registration identity within this editor.
   * @param definition - Event type, native options, scope, and finite priority.
   * @param handler - Typed callback; call event.preventDefault explicitly when needed.
   * @returns Idempotent disposer captured by the current extension setup scope.
   * @throws If the editor is destroyed, ID duplicates, or priority is not finite.
   */
  register<K extends keyof BlockInputEventMap>(
    id: string,
    definition: BlockInputDefinition<K>,
    handler: BlockInputHandler<K>,
  ): () => void;

  /**
   * Registers a typed custom event handler in the current extension scope.
   *
   * @param id - Identity shared with browser input registrations.
   * @param definition - Custom event name and optional priority.
   * @param handler - Callback returning handled to stop later handlers.
   * @returns Idempotent disposer releasing this registration.
   * @throws If the editor is destroyed, the identity is invalid or duplicate, or priority is invalid.
   */
  register<K extends Extract<keyof CustomEvents, string>>(
    id: string,
    definition: BlockCustomEventDefinition<K>,
    handler: (event: CustomEvents[K]) => EventResult | void,
  ): () => void;

  /**
   * Observes native input before handlers in the same phase and target.
   *
   * Observers still run after another queue claims the event. Return values never
   * claim input; native default prevention and propagation remain explicit actions.
   * A detached or replaced attachment stops later callbacks in the current delivery.
   * A predicate that removes its own observation prevents the observer from running.
   *
   * @param id - Unique identity shared with input handler registrations.
   * @param definition - Event type, target, phase, scope and finite priority.
   * @param observer - Callback receiving the shared occurrence context.
   * @returns Idempotent disposer captured by the extension setup scope.
   * @throws If registration identity or priority is invalid, or the owner is destroyed.
   */
  observe<K extends keyof BlockInputEventMap>(
    id: string,
    definition: BlockInputDefinition<K>,
    observer: BlockInputObserver<K>,
  ): () => void;

  /**
   * Observes a typed custom event before its handlers without claiming it.
   *
   * @param id - Identity shared with browser input registrations.
   * @param definition - Custom event name and optional priority.
   * @param observer - Callback receiving the producer's payload.
   * @returns Idempotent disposer captured by the current extension setup scope.
   * @throws If the editor is destroyed, the identity is invalid or duplicate, or priority is invalid.
   */
  observe<K extends Extract<keyof CustomEvents, string>>(
    id: string,
    definition: BlockCustomEventDefinition<K>,
    observer: (event: CustomEvents[K]) => void,
  ): () => void;

  /**
   * Observes focus entering or leaving the attached editor's owned DOM subtree.
   *
   * Internal focus moves emit neither transition; nested editor roots form separate
   * focus boundaries. View detachment stops DOM
   * delivery; subscriptions remain installed until disposed or the editor ends.
   * Observers do not consume input or replace behavior/keyboard dispatch.
   *
   * @param type - Whole-editor focus transition to observe.
   * @param listener - Callback invoked for a boundary transition or when attachment
   * finds focus already inside the root. Initial notification is delivered directly,
   * without dispatching a DOM event.
   * @returns Idempotent disposer removing this individual subscription.
   * @throws If the editor is destroyed.
   */
  on(type: BlockEditorEventType, listener: () => void): () => void;
}
