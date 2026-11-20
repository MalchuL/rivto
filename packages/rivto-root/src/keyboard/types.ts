/** Single-stroke shortcut understood by the portable parser. */
export type KeyboardShortcut = string;
/** Parsed exact shortcut used internally by KeyboardManager. */
export interface ParsedShortcut {
  readonly source: string;
  readonly key: string;
  readonly modifier: "primary" | "ctrl" | "meta" | "none";
  readonly alt: boolean;
  readonly shift: boolean;
}
/** Replacement keys by semantic binding ID; empty arrays disable actions. */
export type KeymapOverrides = Readonly<Record<string, readonly KeyboardShortcut[]>>;
/** Platform modifier represented by a Primary shortcut. */
export type PrimaryModifier = "ctrl" | "meta";
/** Keyboard input phase. */
export type KeyboardEventPhase = "keydown" | "keyup";
/** Policy for input during IME composition. */
export type KeyboardCompositionPolicy = "ignore" | "handle" | "prevent";

/** Modifier state shared by keyboard input and other input transports. */
export interface KeyboardModifiers {
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

/** Logical and physical key labels with the modifiers active for that input. */
export interface KeyboardKey extends KeyboardModifiers {
  readonly key: string;
  readonly code: string;
}

/** Key data captured at dispatch, including IME composition state. */
export interface KeyboardKeyInput extends KeyboardKey {
  readonly isComposing: boolean;
}

/** Live browser target properties used by keyboard interaction policies. */
export interface KeyboardTargetState {
  /** Whether the target is an HTML element in the current JavaScript realm. */
  readonly isCurrentRealmHTMLElement: boolean;
  /** Whether the target inherits contenteditable state. */
  readonly isEditable: boolean;
  /** Whether the target is an input, textarea, select, or button. */
  readonly isFormControl: boolean;
  /** Whether the target is an anchor. */
  readonly isLink: boolean;
}

/** Live queries of the target captured for one keyboard delivery. */
export interface KeyboardTarget {
  /**
   * Checks whether the native target is the receiving occurrence itself.
   *
   * @returns True only for the exact surface, excluding descendants.
   */
  isRoot(): boolean;
  /**
   * Checks whether the target is an element in the current JavaScript realm.
   *
   * @returns False for text nodes and elements belonging to another realm.
   */
  isCurrentRealmElement(): boolean;
  /**
   * Reads an attribute from an ancestor of the closest matching target ancestor.
   *
   * @param selector - Selector for the nearest starting ancestor.
   * @param ancestorSelector - Selector for an ancestor of that starting element.
   * @param attribute - Attribute to read from the resulting ancestor.
   * @returns Attribute value, or undefined when an element or attribute is missing.
   * @throws If the browser rejects an evaluated selector.
   */
  closestAncestorAttribute(
    selector: string,
    ancestorSelector: string,
    attribute: string,
  ): string | undefined;
  /**
   * Reads live editability and control properties for an element target.
   *
   * @returns Copied properties, or undefined for a non-element target.
   */
  read(): KeyboardTargetState | undefined;
  /**
   * Checks the current target and its ancestors against a selector.
   *
   * Text targets are checked through their parent element.
   *
   * @param selector - Selector for the target or an ancestor.
   * @returns Whether an ancestor matches; false without element ancestry.
   * @throws If the browser rejects the selector.
   */
  hasAncestor(selector: string): boolean;
}

/** Minimal normalized input context supplied by a host transport. */
export interface KeyboardInput<Target extends string = string> {
  readonly keyboard: KeyboardKeyInput;
  readonly phase: KeyboardEventPhase;
  readonly eventTarget: Target;
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
   * @throws If the owner cannot retain the cleanup.
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
  /** Platform modifier supplied by the host transport. */
  readonly primaryModifier: PrimaryModifier;
  /**
   * Connects host keyboard input delivery for the lifetime of the runtime.
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
