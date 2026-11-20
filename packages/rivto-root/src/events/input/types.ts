import type {
  BrowserInputMap,
  BrowserInputTarget,
  EventDelivery,
  EventResult,
  InputObserver,
  InputRoot,
} from "../types";

/** Extension resource ownership borrowed by an input event runtime. */
export interface InputEventsOwner {
  /**
   * Rejects registration after its owner begins teardown.
   *
   * @returns Registration may proceed while the owner is active.
   * @throws If the resource owner is inactive.
   */
  assertActive(): void;
  /**
   * Retains cleanup in the current resource scope.
   *
   * @param release - Cleanup for the new input registration.
   * @returns Idempotent disposer releasing that registration.
   * @throws If cleanup ownership cannot be acquired.
   */
  registerCleanup(release: () => void): () => void;
}

/** Normalized input group and ordering for one registration. */
export interface InputEventsDefinition<K extends keyof BrowserInputMap> {
  /** Normalized input name observed by this group. */
  readonly type: K;
  /** Listener realm; defaults to the root. */
  readonly target?: BrowserInputTarget;
  /** Whether the listener uses capture; defaults to false. */
  readonly capture?: boolean;
  /** Finite priority ordering registrations within the group. */
  readonly priority: number;
}

/** Mutable eligibility for one registration during synchronous dispatch. */
export interface InputRegistrationState {
  readonly active: boolean;
}

/** Internal registration state invalidated by its resource owner. */
export interface MutableInputRegistrationState extends InputRegistrationState {
  active: boolean;
}

/** Occurrence operations needed to own and check one input observer. */
export type InputEventsRoot = Pick<InputRoot, "createInputObserver" | "isAttached">;

/**
 * Creates consumer context for a normalized occurrence input.
 *
 * @param target - Listener realm receiving the input.
 * @param input - Normalized input captured for the occurrence.
 * @param root - Root borrowed for the current attachment.
 * @param attachment - Opaque identity of the exact input attachment.
 * @returns Context shared by handlers in this listener group.
 * @throws Propagates consumer context creation failures.
 */
export type InputEventFactory<EventValue, Root extends InputEventsRoot = InputRoot> = (
  target: BrowserInputTarget,
  input: BrowserInputMap[keyof BrowserInputMap],
  root: Root,
  attachment: object,
) => EventValue;

/** Type-erased event payloads indexed by listener group identity. */
export interface InputEventPayloads {
  readonly [group: string]: unknown;
}

/** Native listener configuration and ordered registrations sharing that listener. */
export interface InputEventGroup {
  readonly key: string;
  readonly type: keyof BrowserInputMap;
  readonly target: BrowserInputTarget;
  readonly capture: boolean;
  /** Attachment owning the installed group listener. */
  attachment?: InputEventAttachment;
  /** Attachment currently installing this group, when registration is reentrant. */
  connecting?: InputEventAttachment;
  /** Releases the installed listener group. */
  detach?: () => void;
}

/** Root and input observer borrowed for one dispatcher attachment. */
export interface InputEventAttachment<Root extends InputEventsRoot = InputEventsRoot> {
  /** Borrowed Root whose lifetime bounds delivery. */
  readonly root: Root;
  /** Caller-owned observer shared by this attachment's listener groups. */
  readonly observer: InputObserver;
}

/** Delivery state shared across native phases for one occurrence. */
export interface InputEventDelivery {
  readonly snapshot: EventDelivery<InputEventPayloads>;
  readonly groups: Set<InputEventGroup>;
  claimed: boolean;
}

/** Consumer context retained with the exact attachment during one delivery. */
export interface InputEventContext<EventValue, Root extends InputEventsRoot = InputEventsRoot> {
  readonly event: EventValue;
  readonly attachment: InputEventAttachment<Root>;
}

/**
 * Receives one consumer context and its live registration eligibility.
 *
 * @param event - Context created for this listener group.
 * @param registration - Eligibility invalidated when this handler is removed.
 * @returns A handled result claims input; observer results are ignored.
 */
export type InputEventHandler<EventValue> = (
  event: EventValue,
  registration: InputRegistrationState,
) => EventResult | void;
