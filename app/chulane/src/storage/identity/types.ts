/**
 * Defines the storage-independent profile repository used by identity services.
 * Adapters map their records to domain users; callers retain validation and policy.
 * Transaction-scoped instances share the atomic operation supplied by storage.
 */
import type { User } from "../../domain/identity/types.ts";
import type { Pagination } from "../../lib/pagination/types.ts";

export interface IdentityRepository {
  /**
   * Finds a profile by its stable identity.
   * @param id - Stable record identity.
   * @returns The operation result, or rejects when it cannot be completed.
   */
  find(id: string): Promise<User | undefined>;
  /**
   * Lists persisted records in stable order.
   * @param pagination - Optional pagination bounds.
   * @returns The operation result, or rejects when it cannot be completed.
   */
  list(pagination?: Pagination): Promise<User[]>;
  /**
   * Persists a new record and required associations.
   * @param user - Profile record to persist.
   * @returns The operation result, or rejects when it cannot be completed.
   */
  insert(user: User): Promise<void>;
  /**
   * Changes an existing profile’s editable name.
   * @param id - Stable record identity.
   * @param name - Validated display name.
   * @returns The operation result, or rejects when it cannot be completed.
   */
  update(id: string, name: string): Promise<User>;
}
