/**
 * Implements authenticated profile operations through storage-independent repositories.
 * Profile edits are bound to the verified actor and validated before persistence.
 * Provisioning preserves existing names and runs atomically through storage.
 */
import type { AuthenticatedUser, IdentityService, User, UserUpdate, UserProvisioning } from "./types.ts";
import { DomainError, normalizeName } from "../workspaces/access.ts";
import { assertPagination, type Pagination } from "../../lib/pagination/index.ts";
import type { ApplicationStorage } from "../../storage/types.ts";
import type { IdentityRepository } from "../../storage/identity/types.ts";

/**
 * Requires an existing profile without exposing adapter-specific errors.
 * @param repository - Profile lookup in the current storage context.
 * @param id - Stable identity of the requested profile.
 * @returns The profile, or throws when it is missing.
 */
export async function requireUser(repository: IdentityRepository, id: string): Promise<User> {
  const user = await repository.find(id);
  if (!user) throw new DomainError("not-found", "User not found.");
  return user;
}

export class IdentityServiceImpl implements IdentityService {
  private readonly userId: string;
  private readonly storage: ApplicationStorage;
  /**
   * Connects the dependencies required by this instance.
   * @param storage - Storage providing transactional repository access.
   * @param user - Authenticated actor or profile record.
   */
  constructor(storage: ApplicationStorage, user: AuthenticatedUser) { this.storage = storage; this.userId = user.userId; }
  /**
   * Persists validated editable fields for the requested record.
   * @param changes - Validated editable fields.
   * @returns The requested result after the operation completes.
   */
  async update(changes: UserUpdate): Promise<User> {
    const name = normalizeName(changes.name);
    return this.storage.transaction(async ({ identity }) => {
      await requireUser(identity, this.userId);
      return identity.update(this.userId, name);
    });
  }
  /**
   * Lists matching persisted records in stable order.
   * @param pagination - Optional bounds applied after filtering.
   * @returns The requested result after the operation completes.
   */
  async list(pagination?: Pagination): Promise<User[]> { assertPagination(pagination); return this.storage.identity.list(pagination); }
  /**
   * Returns a record after the required access checks.
   * @param userId - Stable user identity.
   * @returns The requested result after the operation completes.
   */
  async get(userId: string): Promise<User> { return requireUser(this.storage.identity, userId); }
}

/** Provisions verified profiles once, preserving their independently edited names. */
export class UserProvisioner implements UserProvisioning {
  private readonly storage: ApplicationStorage;
  /**
   * Connects the dependencies required by this instance.
   * @param storage - Storage providing transactional repository access.
   */
  constructor(storage: ApplicationStorage) { this.storage = storage; }
  /**
   * Creates a missing profile without overwriting an existing name.
   * @param input - Verified identity used to initialize a missing profile.
   * @returns The requested result after the operation completes.
   */
  async provision(input: User): Promise<User> {
    if (typeof input.id !== "string" || !input.id.trim()) throw new DomainError("invalid", "Invalid user ID.");
    return this.storage.transaction(async ({ identity }) => {
      let user = await identity.find(input.id);
      if (!user) { user = { id: input.id, name: normalizeName(input.name) }; await identity.insert(user); }
      return user;
    });
  }
}
