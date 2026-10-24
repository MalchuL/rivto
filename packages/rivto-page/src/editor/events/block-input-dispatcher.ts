import type { BlockEditorResourceOwner } from "../extensions/block-editor-resource-owner";
import { BlockInputListeners } from "./block-input-listeners";
import { BlockInputEvent } from "./block-input-event";
import type {
  BlockInputDefinition,
  BlockInputEventMap,
  BlockInputHandler,
  BlockInputObserver,
  BlockInputResult,
  BlockInputTarget,
} from "./block-input-event";

/** One type-erased registration retained by its native listener group. */
interface InputRegistration {
  readonly id: string;
  active: boolean;
  readonly priority: number;
  readonly observer: boolean;
  readonly order: number;
  /**
   * Normalizes and delivers an input to the typed registration.
   *
   * @param event - Shared context for this listener group's native event type.
   * @returns Whether the registration claims the input.
   */
  invoke(event: BlockInputEvent<keyof BlockInputEventMap>): BlockInputResult | void;
}

/** Native listener configuration and ordered registrations sharing that listener. */
interface InputGroup {
  readonly type: string;
  readonly target: BlockInputTarget;
  readonly capture: boolean;
  readonly registrations: InputRegistration[];
  detach?: () => void;
}

/** Delivery state shared across native phases for one occurrence. */
interface InputDelivery {
  readonly cutoff: number;
  readonly groups: Set<InputGroup>;
  claimed: boolean;
}

/** Orders scoped input delivery independently of native listener attachment. */
export class BlockInputDispatcher {
  private readonly groups = new Map<string, InputGroup>();
  private readonly ids = new Set<string>();
  private deliveries = new WeakMap<Event, InputDelivery>();
  private sequence = 0;
  private readonly native = new BlockInputListeners();

  /**
   * Connects registration cleanup to the editor's extension scopes.
   *
   * @param owner - Borrowed registration guard and cleanup owner.
   */
  constructor(private readonly owner: BlockEditorResourceOwner) {}

  /**
   * Registers a typed input handler and installs its listener if already attached.
   *
   * @param id - Unique nonblank registration identity.
   * @param definition - Native event configuration and finite dispatch priority.
   * @param handler - Callback explicitly controlling default prevention.
   * @param observer - Whether delivery observes input without claiming it.
   * @returns Idempotent disposer releasing the registration and any unused listener.
   * @throws If the owner is inactive, identity is invalid, or priority is not finite.
   */
  register<K extends keyof BlockInputEventMap>(
    id: string,
    definition: BlockInputDefinition<K>,
    handler: BlockInputHandler<K> | BlockInputObserver<K>,
    observer = false,
  ): () => void {
    this.owner.assertActive();
    if (!id.trim() || this.ids.has(id) || !Number.isFinite(definition.priority)) {
      throw new Error("Input registration requires a unique ID and finite priority");
    }
    const config = { ...definition };
    const group = this.getGroup(config);
    const registration: InputRegistration = {
      id,
      active: true,
      priority: config.priority,
      observer,
      order: ++this.sequence,
      /**
       * Adapts the native listener's event to its declared event-map key.
       *
       * @param input - Shared normalized context for the matching native event name.
       * @returns Whether the scoped handler claims input.
       */
      invoke(input) {
        // The group is keyed by this exact event-map name; erasure stays internal.
        const event = input as BlockInputEvent<K>;
        if (event.matches(config.scope) && (!config.when || config.when(event))) {
          return handler(event);
        }
      },
    };
    this.ids.add(id);
    group.registrations.push(registration);
    group.registrations.sort((left, right) => right.priority - left.priority);
    try {
      this.connect(group);
      return this.owner.registerCleanup(() => this.remove(group, registration));
    } catch (error) {
      this.remove(group, registration);
      throw error;
    }
  }

  /**
   * Installs registered native listeners for one root.
   *
   * @param root - Mounted occurrence root owned by the controller.
   * @returns Idempotent disposer retaining registrations for a subsequent mount.
   */
  attach(root: HTMLElement): () => void {
    this.deliveries = new WeakMap();
    return this.native.attach(root);
  }

  /**
   * Reuses a listener bucket for identical native options.
   *
   * @param definition - Registration's native configuration.
   * @returns Existing or newly allocated listener bucket.
   */
  private getGroup<K extends keyof BlockInputEventMap>(
    definition: BlockInputDefinition<K>,
  ): InputGroup {
    const target = definition.target ?? "root";
    const capture = definition.capture ?? false;
    const key = JSON.stringify([target, definition.type, capture]);
    let group = this.groups.get(key);
    if (!group) {
      group = { type: definition.type, target, capture, registrations: [] };
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
  private connect(group: InputGroup): void {
    if (group.detach || !group.registrations.length) {
      return;
    }
    group.detach = this.native.register(group, (raw, root) => this.dispatch(group, raw, root));
  }

  /**
   * Delivers a stable registration snapshot until a handler claims input.
   *
   * @param group - Listener group receiving the input.
   * @param raw - Original browser event.
   * @param root - Root captured by this attachment.
   * @returns Eligible handlers have run; native defaults and propagation are unchanged.
   * @throws Propagates a handler error without delivering to later handlers.
   */
  private dispatch(group: InputGroup, raw: Event, root: HTMLElement): void {
    let delivery = this.deliveries.get(raw);
    if (!delivery || delivery.groups.has(group)) {
      delivery = { cutoff: this.sequence, groups: new Set(), claimed: false };
      this.deliveries.set(raw, delivery);
    }
    delivery.groups.add(group);
    const event = new BlockInputEvent(raw, root, group.target);
    const registrations = group.registrations.filter(
      (registration) => registration.order <= delivery.cutoff,
    );
    for (const registration of registrations) {
      if (registration.active && registration.observer) {
        registration.invoke(event);
      }
    }
    if (delivery.claimed) {
      return;
    }
    try {
      for (const registration of registrations) {
        if (
          registration.active &&
          !registration.observer &&
          registration.invoke(event) === "handled"
        ) {
          delivery.claimed = true;
          return;
        }
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
   * @param registration - Exact registration identity to remove.
   * @returns Registration ID is reusable and empty groups are released.
   */
  private remove(group: InputGroup, registration: InputRegistration): void {
    const index = group.registrations.indexOf(registration);
    if (index < 0) {
      return;
    }
    registration.active = false;
    group.registrations.splice(index, 1);
    this.ids.delete(registration.id);
    if (!group.registrations.length) {
      const detach = group.detach;
      group.detach = undefined;
      for (const [key, value] of this.groups) {
        if (value === group) {
          this.groups.delete(key);
          break;
        }
      }
      detach?.();
    }
  }
}
