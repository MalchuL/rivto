/**
 * Defines local profile operations consumed by UI and application capabilities.
 * Workspace creation is a separate user-initiated operation.
 * Profiles describe identity; authentication belongs to the host session layer.
 */
import type { Pagination } from "../../lib/pagination/index.ts";

export interface User { id: string; name: string }

/** Identity established by the trusted authentication boundary. */
export interface AuthenticatedUser { userId: string }

/** Editable Chulane profile fields; authentication credentials remain separate. */
export interface UserUpdate { name: string }

/** Creates an application profile for an authenticated provider identity. */
export interface UserProvisioning {
  /**
   * Ensures a profile exists without replacing an existing application name.
   * @param input - Verified identity used only to initialize a missing profile.
   * @returns The persisted profile.
   */
  provision(input: User): Promise<User>;
}

export interface IdentityService {
  /**
   * Updates the acting user's application profile without changing auth data.
   * @param changes - Editable profile fields; names are trimmed and validated.
   * @returns The persisted profile with its stable identity.
   */
  update(changes: UserUpdate): Promise<User>;
  /**
   * Lists local profiles ordered by name and stable identity.
   * @param pagination - Optional bounds; omitted returns all profiles.
   * @returns Local profiles available to the local profile chooser.
   */
  list(pagination?: Pagination): Promise<User[]>;
  /**
   * Resolves an existing local profile.
   * @param userId - Stable local identity.
   * @returns The profile, or rejects if it does not exist.
   */
  get(userId: string): Promise<User>;
}
