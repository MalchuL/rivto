import type { BlockDefinition } from "@chulane/rivto";
import type { ReactBlockRegistration } from "./types";

/** Atomic React block-type and presentation registration. */
export interface BlockTypesApi {
  /**
   * Registers a block definition with its React presentation and optional interaction behavior.
   *
   * The registration owns the complete core definition, including its metadata.
   * The supplied object is registered directly without copying or merging fields.
   * An already registered native type is a conflict; definitions installed separately
   * or by another React runtime cannot be supplemented through this method.
   * Cleanup removes the owned definition together with its React presentation.
   * Cleanup attempts every release before reporting errors, including when a
   * definition observer throws.
   *
   * @param registration - Block definition, renderer, and optional React integrations to register.
   * @returns Idempotent function releasing this registration's owned resources.
   * @throws If definitions are invalid, registrations conflict, or the runtime is destroyed;
   * installed resources roll back on registration failure.
   * The disposer rethrows one cleanup failure or aggregates multiple failures
   * after releasing all owned resources. Rollback preserves setup failures too.
   */
  register(registration: ReactBlockRegistration): () => void;
  /**
   * Unregisters the React block integration and releases the resources owned by that registration.
   *
   * @param type - Persisted block type registered through this manager.
   * @returns Whether a registration was removed.
   * @throws If the runtime is destroyed or cleanup fails; all owned releases run
   * before cleanup failures are rethrown, with multiple failures aggregated.
   */
  delete(type: string): boolean;
  /**
   * Observes creation and removal of complete definitions, including their metadata.
   *
   * Listeners remain active during block-registration teardown, then disconnect
   * automatically when their React runtime is destroyed. Other presentations of
   * the same core registry keep their own subscriptions.
   *
   * @param listener - Callback invoked when a complete definition is registered or removed.
   * @returns Idempotent cleanup removing this subscription before automatic teardown.
   * @throws If the React runtime has started destruction.
   */
  subscribe(listener: () => void): () => void;
  /** Reports whether a registered type partitions root block elements. */
  separatesBlockElements(type: string): boolean;
  /** Returns the first separator type registered for automatic card creation. */
  getDefaultBlockElementSeparatorType(): string | undefined;
  /**
   * Reads a stable core definition with the metadata supplied by its registration.
   *
   * @param type - Persisted native block type.
   * @returns Registered definition, or undefined for an unknown type.
   */
  getDefinition(type: string): BlockDefinition | undefined;
  /** Validates and returns native block properties. */
  validateBlockProps(type: string, props: Record<string, unknown>): Record<string, unknown>;
}
