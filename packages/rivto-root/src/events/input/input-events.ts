import { EventDispatcher } from "../event-dispatcher";
import type { BrowserInputMap, InputObserver } from "../types";
import type {
  InputEventAttachment,
  InputEventContext,
  InputEventDelivery,
  InputEventFactory,
  InputEventGroup,
  InputEventHandler,
  InputEventPayloads,
  InputEventsDefinition,
  InputEventsOwner,
  InputEventsRoot,
  MutableInputRegistrationState,
} from "./types";

/** Owns grouped occurrence input delivery and its observer attachment. */
export class InputEvents<EventValue, Root extends InputEventsRoot = InputEventsRoot> {
  private readonly groups = new Map<string, InputEventGroup>();
  private deliveries = new WeakMap<object, InputEventDelivery>();
  private attachment?: InputEventAttachment<Root>;
  private attaching = false;

  /**
   * Connects registration cleanup to the editor's extension scopes.
   *
   * @param owner - Borrowed registration guard and cleanup owner.
   * @param createEvent - Creates consumer context for each normalized input group.
   * @param dispatcher - Shared registration store; defaults to an independent store.
   */
  constructor(
    private readonly owner: InputEventsOwner,
    private readonly createEvent: InputEventFactory<EventValue, Root>,
    private readonly dispatcher: Pick<
      EventDispatcher<InputEventPayloads>,
      "register" | "observe" | "has" | "begin"
    > = new EventDispatcher(),
  ) {}

  /**
   * Registers a typed input handler and installs its listener if already attached.
   *
   * @param id - Unique nonblank registration identity.
   * @param definition - Native event configuration and finite dispatch priority.
   * @param handler - Callback receiving consumer context and registration eligibility.
   * @param observer - Whether delivery observes input without claiming it.
   * @returns Idempotent disposer releasing the registration and any unused listener.
   * @throws If the owner is inactive, identity is invalid, priority is not finite,
   * or setup fails. AggregateError retains both setup and rollback failures.
   */
  register<K extends keyof BrowserInputMap>(
    id: string,
    definition: InputEventsDefinition<K>,
    handler: InputEventHandler<EventValue>,
    observer = false,
  ): () => void {
    this.owner.assertActive();
    if (!id.trim() || !Number.isFinite(definition.priority)) {
      throw new Error("Input registration requires a unique ID and finite priority");
    }
    const config = { ...definition };
    const group = this.getGroup(config);
    const state: MutableInputRegistrationState = { active: true };
    const invoke = (input: unknown) => {
      // This group receives only the context created for its own input delivery.
      const context = input as InputEventContext<EventValue>;
      if (
        !state.active ||
        this.attachment !== context.attachment ||
        !context.attachment.root.isAttached() ||
        !state.active ||
        this.attachment !== context.attachment
      ) {
        return;
      }
      return handler(context.event, state);
    };
    let releaseEntry: () => void;
    try {
      const entry = { id, type: group.key, priority: config.priority };
      releaseEntry = observer
        ? this.dispatcher.observe(entry, invoke)
        : this.dispatcher.register(entry, invoke);
    } catch (error) {
      if (!this.dispatcher.has(group.key)) {
        this.groups.delete(group.key);
      }
      throw error;
    }
    try {
      this.connect(group);
      return this.owner.registerCleanup(() => this.remove(group, releaseEntry, state));
    } catch (error) {
      try {
        this.remove(group, releaseEntry, state);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Input registration rollback failed");
      }
      throw error;
    }
  }

  /**
   * Installs registered native listeners for one root.
   *
   * @param inputRoot - Browser capability borrowed from the mounted occurrence.
   * @returns Idempotent disposer retaining registrations for a subsequent mount.
   * @throws If input is already attached or native listener setup fails.
   */
  attach(inputRoot: Root): () => void {
    if (this.attachment || this.attaching) {
      throw new Error("Input listeners already attached");
    }
    this.attaching = true;
    let observer: InputObserver | undefined;
    try {
      observer = inputRoot.createInputObserver();
    } finally {
      this.attaching = false;
    }
    if (!observer) {
      throw new Error("Input listeners require an active Root");
    }
    this.deliveries = new WeakMap();
    const attachment = { root: inputRoot, observer };
    this.attachment = attachment;
    try {
      for (const group of this.groups.values()) {
        this.connect(group);
      }
      if (this.attachment !== attachment || !inputRoot.isAttached()) {
        throw new Error("Input Root detached during attachment");
      }
    } catch (error) {
      if (this.attachment === attachment) {
        this.attachment = undefined;
      }
      try {
        this.releaseAttachment(attachment);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Input attachment rollback failed");
      }
      throw error;
    }
    let active = true;
    return () => {
      if (active && this.attachment === attachment) {
        active = false;
        this.attachment = undefined;
        this.releaseAttachment(attachment);
      }
    };
  }

  /**
   * Reads the identity of the currently attached input observer.
   *
   * @returns Opaque attachment identity, or undefined after detachment.
   */
  get currentAttachment(): object | undefined {
    return this.attachment;
  }

  /**
   * Reuses a listener bucket for identical native options.
   *
   * @param definition - Registration's native configuration.
   * @returns Existing or newly allocated listener bucket.
   */
  private getGroup<K extends keyof BrowserInputMap>(
    definition: InputEventsDefinition<K>,
  ): InputEventGroup {
    const target = definition.target ?? "root";
    const capture = definition.capture ?? false;
    const key = JSON.stringify([target, definition.type, capture]);
    let group = this.groups.get(key);
    if (!group) {
      group = { key, type: definition.type, target, capture };
      this.groups.set(key, group);
    }
    return group;
  }

  /**
   * Connects one group to its attachment realm without duplicating native listeners.
   *
   * @param group - Group requiring a listener when mounted and nonempty.
   * @returns Listener is installed or the existing attachment remains unchanged.
   */
  private connect(group: InputEventGroup): void {
    const attachment = this.attachment;
    if (
      !attachment ||
      group.detach ||
      group.connecting === attachment ||
      !this.dispatcher.has(group.key)
    ) {
      return;
    }
    group.connecting = attachment;
    try {
      const release = attachment.observer.observe(group, (input, identity) => {
        if (this.attachment === attachment) {
          this.dispatch(group, input, identity ?? input);
        }
      });
      if (this.attachment !== attachment || this.groups.get(group.key) !== group) {
        release();
        return;
      }
      group.attachment = attachment;
      group.detach = release;
    } finally {
      if (group.connecting === attachment) {
        group.connecting = undefined;
      }
    }
  }

  /**
   * Delivers a stable registration snapshot until a handler claims input.
   *
   * @param group - Listener group receiving the input.
   * @param input - Root-normalized input for this native delivery.
   * @param identity - Opaque identity shared by listener groups in this dispatch.
   * @returns Eligible handlers have run; native defaults and propagation are unchanged.
   * @throws Propagates a handler error without delivering to later handlers.
   */
  private dispatch(
    group: InputEventGroup,
    input: BrowserInputMap[keyof BrowserInputMap],
    identity: object,
  ): void {
    let delivery = this.deliveries.get(identity);
    if (!delivery || delivery.groups.has(group)) {
      delivery = { snapshot: this.dispatcher.begin(), groups: new Set(), claimed: false };
      this.deliveries.set(identity, delivery);
    }
    delivery.groups.add(group);
    const attachment = this.attachment;
    if (!attachment || !attachment.root.isAttached() || this.attachment !== attachment) {
      return;
    }
    const event = this.createEvent(group.target, input, attachment.root, attachment);
    if (
      this.attachment !== attachment ||
      !attachment.root.isAttached() ||
      this.attachment !== attachment
    ) {
      return;
    }
    const context: InputEventContext<EventValue> = { event, attachment };
    delivery.snapshot.observe(group.key, context);
    if (delivery.claimed) {
      return;
    }
    try {
      if (delivery.snapshot.dispatch(group.key, context) === "handled") {
        delivery.claimed = true;
      }
    } catch (error) {
      delivery.claimed = true;
      throw error;
    }
  }

  /**
   * Removes a registration and its native listener when no consumers remain.
   *
   * @param group - Owning listener group.
   * @param releaseEntry - Exact dispatcher registration to remove once.
   * @param state - Registration state invalidated before releasing its dispatcher entry.
   * @returns Registration ID is reusable and empty groups are released.
   * @throws Propagates native listener removal failures after releasing the registration.
   */
  private remove(
    group: InputEventGroup,
    releaseEntry: () => void,
    state: MutableInputRegistrationState,
  ): void {
    state.active = false;
    releaseEntry();
    if (!this.dispatcher.has(group.key) && this.groups.get(group.key) === group) {
      const detach = group.detach;
      group.detach = undefined;
      group.attachment = undefined;
      this.groups.delete(group.key);
      detach?.();
    }
  }

  /**
   * Releases only the listener groups and observer owned by one attachment.
   *
   * @param attachment - Exact borrowed Root and its caller-owned observer.
   * @returns Every matching group and the observer have been offered cleanup.
   * @throws Cleanup failures, aggregated when multiple releases fail.
   */
  private releaseAttachment(attachment: InputEventAttachment): void {
    const releases: Array<() => void> = [];
    for (const group of this.groups.values()) {
      if (group.attachment === attachment && group.detach) {
        releases.push(group.detach);
        group.detach = undefined;
        group.attachment = undefined;
      }
    }
    releases.push(() => attachment.observer.dispose());
    const errors: unknown[] = [];
    for (const release of releases) {
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Input attachment cleanup failed");
    }
  }
}
