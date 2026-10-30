import { Listeners } from "@chulane/rivto-utils";

import { matchesShortcut, parseShortcut, type ParsedShortcut } from "./shortcut";
import type {
  KeyboardInput,
  KeyboardDefinition,
  KeyboardBindingSnapshot,
  KeyboardResourceOwner,
  KeyboardTransport,
  KeyboardRegistrationOptions,
  KeyboardShortcut,
  KeymapOverrides,
} from "./types";

/** Runtime registration with parsed effective keys and optional occurrence eligibility. */
interface KeyboardRegistration<E extends KeyboardInput, D extends KeyboardDefinition<E>> {
  readonly definition: D;
  readonly options?: KeyboardRegistrationOptions<E>;
  shortcuts: ParsedShortcut[];
  /**
   * Delivers a matched action.
   *
   * @param event - Host event context.
   * @returns Whether input was consumed.
   */
  readonly listener: (event: E) => boolean | void;
}

/** Owns semantic keyboard bindings while EventManager owns native transport. */
export class KeyboardRuntime<
  E extends KeyboardInput,
  D extends KeyboardDefinition<E>,
  S extends KeyboardBindingSnapshot,
> {
  private readonly registrations: KeyboardRegistration<E, D>[] = [];
  private readonly registrationIds = new Set<string>();
  private readonly registrationDisposers = new Map<string, () => void>();
  private readonly transportDisposers: Array<() => void>;
  private keymap: KeymapOverrides;
  private snapshot: readonly S[] = [];
  private value = 0;
  private readonly listeners = new Listeners<{ changed: void }>();
  private destroyed = false;

  /**
   * Creates keyboard transport before extensions register DOM or keyboard behavior.
   *
   * @param transport - Host-owned event delivery and eligibility policy.
   * @param keymap - Initial semantic binding overrides.
   * @param extensions - Internal registration ownership and destruction guard.
   */
  constructor(
    private readonly transport: KeyboardTransport<E, D, S>,
    private readonly extensions: KeyboardResourceOwner,
    keymap: KeymapOverrides = {},
  ) {
    this.keymap = this.cloneKeymap(keymap);
    this.validateKeymap(this.keymap);
    this.publish();
    this.transportDisposers = [transport.connect((event) => this.dispatch(event))];
  }

  /**
   * Registers one semantic keyboard action in declaration order.
   *
   * @param definition - Stable ID, default keys, filters, and composition policy.
   * @param listener - Handler returning true when it claims the native event.
   * @returns Idempotent disposer which releases the keyboard ID for reuse.
   */
  register(definition: D, listener: (event: E) => boolean | void): () => void {
    return this.registerBinding(definition, listener);
  }

  /**
   * Registers a host-scoped copy of a semantic action.
   *
   * @param definition - Semantic action with shared override identity.
   * @param listener - Handler receiving matched input.
   * @param options - Host occurrence identity and eligibility predicate.
   * @returns Idempotent registration disposer.
   * @throws If identity is duplicate or keys are invalid.
   */
  protected registerBinding(
    definition: D,
    listener: (event: E) => boolean | void,
    options?: KeyboardRegistrationOptions<E>,
  ): () => void {
    this.assertActive();
    const semanticId = definition.id.trim();
    const id = options?.id ?? semanticId;
    if (!semanticId) {
      throw new Error("Keyboard registration ID is required");
    }
    if (this.registrationIds.has(id)) {
      throw new Error(`Keyboard registration ${id} is already registered`);
    }
    const normalized = {
      ...definition,
      id: semanticId,
      keys: typeof definition.keys === "string" ? definition.keys : [...definition.keys],
    };
    const registration: KeyboardRegistration<E, D> = {
      options,
      definition: normalized,
      shortcuts: this.resolveShortcuts(normalized, this.keymap),
      listener,
    };
    this.registrationIds.add(id);
    this.registrations.push(registration);

    let active = true;
    let dispose: () => void = () => undefined;
    dispose = this.extensions.registerCleanup(() => {
      if (!active) {
        return;
      }
      active = false;
      const index = this.registrations.indexOf(registration);
      if (index >= 0) {
        this.registrations.splice(index, 1);
      }
      this.registrationIds.delete(id);
      if (this.registrationDisposers.get(id) === dispose) {
        this.registrationDisposers.delete(id);
      }
      if (!this.destroyed) {
        this.publish();
      }
    });
    this.registrationDisposers.set(id, dispose);
    this.publish();
    return dispose;
  }

  /**
   * Returns a stable inventory of installed bindings and orphan overrides.
   *
   * Panel-local copies of an action share one inventory row and keymap override;
   * the first installed definition supplies that row's defaults.
   * @returns Immutable snapshots until the next registry or override revision.
   */
  list(): readonly S[] {
    return this.snapshot;
  }

  /**
   * Reads the keyboard registry's observable revision.
   *
   * @returns Current revision number.
   */
  get revision(): number {
    return this.value;
  }

  /**
   * Subscribes to inventory revisions.
   *
   * @param listener - Callback invoked after register, delete, or override changes.
   * @returns Function that removes the subscription.
   */
  subscribe(listener: () => void): () => void {
    return this.listeners.subscribe("changed", listener);
  }

  /**
   * Deletes one keyboard registration by its stable semantic ID.
   *
   * @param id - Identity supplied to register().
   * @returns True when a registration existed and was disposed.
   */
  delete(id: string): boolean {
    const dispose = this.registrationDisposers.get(id);
    if (!dispose) {
      return false;
    }
    dispose();
    return true;
  }

  /**
   * Atomically replaces every override and restores defaults for omitted IDs.
   *
   * @param keymap - Complete next override map; empty arrays disable bindings.
   */
  replaceKeymap(keymap: KeymapOverrides): void {
    this.assertActive();
    this.applyKeymap(this.cloneKeymap(keymap));
  }

  /**
   * Atomically replaces one override without reinstalling its handler.
   *
   * @param id - Existing or future semantic binding ID.
   * @param keys - Replacement shortcuts, an empty array to disable, or undefined
   * to restore the binding's declared defaults.
   */
  setKeymapOverride(id: string, keys: readonly KeyboardShortcut[] | undefined): void {
    this.assertActive();
    const next = this.cloneKeymap(this.keymap);
    if (keys === undefined) {
      delete next[id];
    } else {
      next[id] = [...keys];
    }
    this.applyKeymap(next);
  }

  /**
   * Releases semantic registrations and native keyboard transport.
   *
   * @returns Every resource has been attempted and observers are released; repeat calls do nothing.
   * @throws AggregateError when one or more resource disposers fail.
   */
  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    const errors: unknown[] = [];
    for (const dispose of [...this.registrationDisposers.values()]
      .reverse()
      .concat([...this.transportDisposers].reverse())) {
      try {
        dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    this.registrationDisposers.clear();
    this.registrationIds.clear();
    this.registrations.length = 0;
    this.listeners.clear();
    if (errors.length) {
      throw new AggregateError(errors, "Keyboard cleanup failed");
    }
  }

  /**
   * Validates replacement key bindings, reparses registered shortcuts, and publishes the new keymap.
   *
   * @param keymap - Complete shortcut override map keyed by command ID.
   * @throws If keymap entries or shortcut strings are invalid.
   */
  private applyKeymap(keymap: KeymapOverrides): void {
    this.validateKeymap(keymap);
    const shortcuts = this.registrations.map(({ definition }) =>
      this.resolveShortcuts(definition, keymap),
    );
    this.keymap = keymap;
    this.registrations.forEach((registration, index) => {
      registration.shortcuts = shortcuts[index]!;
    });
    this.publish();
  }

  /**
   * Rebuilds the cached inventory, including uninstalled override IDs.
   *
   * @returns Cached inventory is replaced and revision observers have been notified.
   */
  private publish(): void {
    const actions = new Map<string, KeyboardRegistration<E, D>>();
    this.registrations.forEach((registration) => {
      if (!actions.has(registration.definition.id)) {
        actions.set(registration.definition.id, registration);
      }
    });
    const snapshots: S[] = [...actions.values()].map((registration) => {
      const definition = registration.definition;
      const defaultKeys =
        typeof definition.keys === "string" ? [definition.keys] : [...definition.keys];
      const overridden = Object.prototype.hasOwnProperty.call(this.keymap, definition.id);
      const keys = overridden ? [...(this.keymap[definition.id] ?? [])] : defaultKeys;
      return this.transport.describe(
        {
          id: definition.id,
          defaultKeys,
          keys,
          overridden,
          disabled: overridden && keys.length === 0,
          installed: true,
          phase: definition.phase ?? "keydown",
          target: definition.target ?? this.transport.defaultTarget,
          priority: definition.priority ?? 0,
          conflicts: [] as string[],
        },
        definition,
      );
    });
    Object.keys(this.keymap).forEach((id) => {
      if (actions.has(id)) {
        return;
      }
      snapshots.push(
        this.transport.describe(
          {
            id,
            defaultKeys: [],
            keys: [...(this.keymap[id] ?? [])],
            overridden: true,
            disabled: (this.keymap[id] ?? []).length === 0,
            installed: false,
            phase: "keydown",
            target: this.transport.defaultTarget,
            priority: 0,
            conflicts: [],
          },
          undefined,
        ),
      );
    });
    this.snapshot = snapshots.map((snapshot) => ({
      ...snapshot,
      conflicts: snapshots
        .filter((other) => other.id !== snapshot.id && this.sameConflictBucket(snapshot, other))
        .map((other) => other.id),
    }));
    this.value += 1;
    this.listeners.emit("changed");
  }

  /**
   * Resolves a command's override or default key bindings and parses each shortcut.
   *
   * @param definition - Registration definition with its stable ID, filters, and options.
   * @param keymap - Complete shortcut override map keyed by command ID.
   * @returns Parsed shortcuts; an explicit nullish override disables the command's bindings.
   * @throws If a shortcut cannot be parsed.
   */
  private resolveShortcuts(definition: D, keymap: KeymapOverrides): ParsedShortcut[] {
    let configured: readonly string[];
    if (Object.prototype.hasOwnProperty.call(keymap, definition.id)) {
      configured = keymap[definition.id] ?? [];
    } else {
      configured = typeof definition.keys === "string" ? [definition.keys] : definition.keys;
    }
    return configured.map(parseShortcut);
  }

  /**
   * Dispatches keyboard input by priority, host eligibility, phase, and composition policy.
   *
   * @param event - Host context containing native input, its phase, and attachment target.
   * @returns Whether a matching handler or composition policy consumed the event.
   */
  private dispatch(event: E): boolean {
    const raw = event.raw;
    const phase = event.phase;
    const registrations = [...this.registrations].sort(
      (left, right) => (right.definition.priority ?? 0) - (left.definition.priority ?? 0),
    );
    let handled = false;
    for (const registration of registrations) {
      if (registration.options?.accepts && !registration.options.accepts(event)) {
        continue;
      }
      const definition = registration.definition;
      if (
        (definition.phase ?? "keydown") !== phase ||
        (definition.target ?? this.transport.defaultTarget) !== event.eventTarget ||
        !this.transport.matches(definition, event) ||
        !registration.shortcuts.some((shortcut) => matchesShortcut(shortcut, raw))
      ) {
        continue;
      }
      const composition = definition.composing ?? "ignore";
      if (raw.isComposing && composition === "ignore") {
        continue;
      }
      if (raw.isComposing && composition === "prevent") {
        handled = true;
        break;
      }
      if (definition.when && !definition.when(event)) {
        continue;
      }
      if (registration.listener(event)) {
        handled = true;
        break;
      }
    }
    return handled;
  }

  /**
   * Guards keyboard operations after runtime or extension destruction.
   *
   * @throws If the keyboard runtime or its registration owner is inactive.
   */
  private assertActive(): void {
    if (this.destroyed) {
      throw new Error("Keyboard runtime is destroyed");
    }
    this.extensions.assertActive();
  }
  /**
   * Copies overrides so callers cannot mutate the active configuration.
   *
   * @param keymap - Caller-owned replacement bindings.
   * @returns Detached override map.
   */
  private cloneKeymap(keymap: KeymapOverrides): Record<string, readonly string[]> {
    return Object.fromEntries(Object.entries(keymap).map(([id, keys]) => [id, [...keys]]));
  }

  /**
   * Parses every override before publishing any replacement.
   *
   * @param keymap - Candidate override map.
   * @returns Every shortcut is valid.
   * @throws If a shortcut is malformed.
   */
  private validateKeymap(keymap: KeymapOverrides): void {
    Object.values(keymap).forEach((keys) => keys.forEach(parseShortcut));
  }

  /**
   * Compares effective shortcuts and host filters for inventory conflicts.
   *
   * @param left - First action inventory entry.
   * @param right - Second action inventory entry.
   * @returns Whether declaration order could choose between these actions.
   */
  private sameConflictBucket(left: S, right: S): boolean {
    if (
      left.phase !== right.phase ||
      left.target !== right.target ||
      left.priority !== right.priority ||
      !this.transport.overlaps(left, right)
    ) {
      return false;
    }
    const rightKeys = new Set(right.keys);
    return left.keys.some((key) => rightKeys.has(key));
  }
}
