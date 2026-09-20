/**
 * Owns editor-wide list-property defaults and semantic validation.
 *
 * Document storage still enforces portable persisted values. This registry adds
 * active editor policy shared by core block insertion, updates, clipboard
 * imports, and presentation integrations.
 */
import { validateBlockListProps, type BlockListProps } from "@chulane/document-model";

/** One ordered list-property policy registered with an editor runtime. */
export interface ListPropsRegistration {
  /** Stable identity used for capability checks and duplicate prevention. */
  readonly id: string;
  /** Defaults shallowly merged in registration order. */
  readonly defaults?: BlockListProps;
  /** Reports whether the complete prepared property record is acceptable. */
  readonly isValid?: (candidate: BlockListProps) => boolean;
}

/** Public editor-wide list-property policy contract. */
export interface BlockListPropsManagerApi {
  /** @param registration - Policy to install. @returns Idempotent disposer. */
  register(registration: ListPropsRegistration): () => void;
  /** @param id - Registration identity. @returns Whether it is active. */
  has(id: string): boolean;
  /** @param candidate - Complete candidate record. @returns No value when every policy accepts it. */
  validate(candidate: BlockListProps): void;
  /** @param candidate - Input record. @returns Detached record with defaults, or throws when invalid. */
  prepare(candidate?: BlockListProps): BlockListProps;
  /** @returns No value after removing every registration. */
  destroy(): void;
}

/** Runtime-owned registry for list-property defaults and validation. */
export class BlockListPropsManager implements BlockListPropsManagerApi {
  private readonly registrations: ListPropsRegistration[] = [];

  /**
   * Registers one ordered policy.
   * @param registration - Stable identity, optional defaults, and validator.
   * @returns Idempotent disposer for this registration.
   */
  register(registration: ListPropsRegistration): () => void {
    if (!registration.id) throw new Error("List property registration ID is required");
    if (this.has(registration.id)) {
      throw new Error(`List property registration ${registration.id} is already registered`);
    }
    this.registrations.push(registration);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const index = this.registrations.indexOf(registration);
      if (index >= 0) this.registrations.splice(index, 1);
    };
  }

  /** @param id - Registration identity. @returns Whether it is active. */
  has(id: string): boolean {
    return this.registrations.some((registration) => registration.id === id);
  }

  /**
   * Validates a record after virtually filling active defaults.
   * @param candidate - Complete or partial persisted list-property record.
   * @returns No value when portability and every semantic predicate accept it.
   * @throws {Error} When the record is not portable or a policy rejects it.
   */
  validate(candidate: BlockListProps): void {
    this.prepare(candidate);
  }

  /**
   * Applies active defaults and rejects invalid results.
   * @param candidate - Detached list-property record to prepare.
   * @returns Detached prepared record.
   */
  prepare(candidate: BlockListProps = {}): BlockListProps {
    validateBlockListProps(candidate);
    const prepared = this.applyDefaults(candidate);
    validateBlockListProps(prepared);
    try {
      if (this.registrations.some(({ isValid }) => isValid && !isValid(prepared))) {
        throw new Error("Invalid block list properties");
      }
    } catch {
      throw new Error("Invalid block list properties");
    }
    return prepared;
  }

  /** @returns No value after removing all active policy registrations. */
  destroy(): void {
    this.registrations.length = 0;
  }

  /**
   * Shallowly merges active defaults without overwriting caller values.
   * @param candidate - Detached record supplied by a caller.
   * @returns Detached record with defaults applied in registration order.
   */
  private applyDefaults(candidate: BlockListProps): BlockListProps {
    return Object.assign({}, ...this.registrations.map(({ defaults }) => defaults ?? {}), candidate);
  }
}
