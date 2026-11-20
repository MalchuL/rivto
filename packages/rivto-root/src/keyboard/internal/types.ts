import type {
  KeyboardDefinition,
  KeyboardInput,
  KeyboardRegistrationOptions,
  ParsedShortcut,
} from "../types";

/** Runtime registration with parsed effective keys and optional occurrence eligibility. */
export interface KeyboardRegistration<E extends KeyboardInput, D extends KeyboardDefinition<E>> {
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

/** Logical and physical labels copied from one held key. */
export interface HeldKey {
  readonly key: string;
  readonly code: string;
}
