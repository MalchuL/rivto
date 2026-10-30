import type { RegistrationOwner } from "../extensions/types";
import type { BlockListPropsManagerApi } from "@chulane/rivto";
import type { BlockListPropsApi, BlockListPropsRegistration } from "./block-list-props-api";

/** Owns extension registrations for persisted property defaults and validation. */
export class BlockListPropsManager implements BlockListPropsApi {
  private readonly disposers = new Set<() => void>();

  /** @param extensions - Extension lifecycle owner. @param core - Existing property validation manager. */
  constructor(
    private readonly extensions: RegistrationOwner,
    private readonly core: BlockListPropsManagerApi,
  ) {}

  /**
   * Registers property defaults and validation as one owned resource.
   * @param registration - Defaults and validation for persisted properties.
   * @returns Idempotent cleanup removing property defaults and validation.
   * @throws When the core rejects a duplicate or invalid registration.
   */
  register(registration: BlockListPropsRegistration): () => void {
    this.extensions.assertActive();
    const release = this.core.register({
      id: registration.id,
      defaults: registration.defaults,
      isValid: registration.isValid,
    });
    const dispose = this.extensions.registerCleanup(() => {
      this.disposers.delete(dispose);
      release();
    });
    this.disposers.add(dispose);
    return dispose;
  }

  /** Releases this React manager's registrations without removing caller-owned core policies. */
  destroy(): void {
    for (const dispose of this.disposers) {
      dispose();
    }
  }

  /** @param id - Property registration identity. @returns Whether it is installed. */
  has(id: string): boolean {
    return this.core.has(id);
  }
  /** @param candidate - Properties to validate. @returns The core validation result. */
  validate(
    candidate: Parameters<BlockListPropsManagerApi["validate"]>[0],
  ): ReturnType<BlockListPropsManagerApi["validate"]> {
    return this.core.validate(candidate);
  }
  /** @param candidate - Properties to merge with active defaults. @returns Prepared core properties. */
  prepare(
    candidate: Parameters<BlockListPropsManagerApi["prepare"]>[0],
  ): ReturnType<BlockListPropsManagerApi["prepare"]> {
    return this.core.prepare(candidate);
  }
}
