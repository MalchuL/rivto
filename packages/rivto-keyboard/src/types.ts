/** Single-stroke shortcut understood by the portable parser. */
export type KeyboardShortcut = string;
/** Replacement keys by semantic binding ID; empty arrays disable actions. */
export type KeymapOverrides = Readonly<Record<string, readonly KeyboardShortcut[]>>;
/** Native keyboard phase. */
export type KeyboardEventPhase = "keydown" | "keyup";
/** Policy for input during IME composition. */
export type KeyboardCompositionPolicy = "ignore" | "handle" | "prevent";

/** Minimal input context supplied by a host transport. */
export interface KeyboardInput {
  readonly raw: KeyboardEvent;
  readonly phase: KeyboardEventPhase;
  readonly eventTarget: string;
}

/** Semantic action; host-specific eligibility belongs in the transport policy. */
export interface KeyboardDefinition<E extends KeyboardInput> {
  readonly id: string;
  readonly keys: string | readonly string[];
  readonly phase?: KeyboardEventPhase;
  readonly target?: string;
  readonly composing?: KeyboardCompositionPolicy;
  readonly priority?: number;
  /**
   * Checks live action availability after shortcut matching.
   *
   * @param event - Host input context shared with the handler.
   * @returns Whether the action is available.
   */
  readonly when?: (event: E) => boolean;
}

/** Stable inventory entry, including overrides without an installed action. */
export interface KeyboardBindingSnapshot {
  readonly id: string;
  readonly defaultKeys: readonly string[];
  readonly keys: readonly string[];
  readonly overridden: boolean;
  readonly disabled: boolean;
  readonly installed: boolean;
  readonly phase: KeyboardEventPhase;
  readonly target: string;
  readonly priority: number;
  readonly conflicts: readonly string[];
}

/** Borrowed extension scope used to release registrations. */
export interface KeyboardResourceOwner {
  /**
   * Rejects operations after the owner ends.
   *
   * @returns Owner is active.
   * @throws If the owner has ended.
   */
  assertActive(): void;
  /**
   * Captures cleanup in the current extension scope.
   *
   * @param cleanup - Callback releasing one registration.
   * @returns Idempotent disposer owned by that scope.
   */
  registerCleanup(cleanup: () => void): () => void;
}

/** Host-specific transport and eligibility without editor dependencies in the runtime. */
export interface KeyboardTransport<
  E extends KeyboardInput,
  D extends KeyboardDefinition<E>,
  S extends KeyboardBindingSnapshot,
> {
  readonly defaultTarget: string;
  /**
   * Connects native keyboard delivery for the lifetime of the runtime.
   *
   * @param dispatch - Receiver returning whether an action claimed input.
   * @returns Disposer releasing transport subscriptions.
   */
  connect(dispatch: (event: E) => boolean): () => void;
  /**
   * Checks host-owned scope and context filters.
   *
   * @param definition - Installed action definition.
   * @param event - Current host context.
   * @returns Whether host filters permit dispatch.
   */
  matches(definition: D, event: E): boolean;
  /**
   * Adds host inventory metadata to an immutable runtime entry.
   *
   * @param snapshot - Runtime-owned inventory values.
   * @param definition - Installed definition, absent for orphan overrides.
   * @returns Host inventory entry preserving the runtime values.
   */
  describe(snapshot: KeyboardBindingSnapshot, definition: D | undefined): S;
  /**
   * Checks whether host filters can overlap for two inventory entries.
   *
   * @param left - First inventory entry.
   * @param right - Second inventory entry.
   * @returns Whether host filters may match the same input.
   */
  overlaps(left: S, right: S): boolean;
}

/** Registration-specific occurrence filter and resource identity. */
export interface KeyboardRegistrationOptions<E> {
  readonly id: string;
  /**
   * Checks whether an event belongs to this registration's occurrence.
   *
   * @param event - Current host input.
   * @returns Whether the occurrence accepts the input.
   */
  readonly accepts?: (event: E) => boolean;
}
