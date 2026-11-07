/**
 * Defines repository access and a shared transaction boundary for application services.
 * Identity and workspace operations in a callback use the same atomic context.
 * Concrete connection lifecycles and transaction mechanics belong to adapters.
 */
import type { IdentityRepository } from "./identity/types.ts";
import type { WorkspaceRepository } from "./workspaces/types.ts";

export interface Repositories { identity: IdentityRepository; workspaces: WorkspaceRepository }
export interface ApplicationStorage extends Repositories {
  /**
   * Runs work atomically using repositories bound to one transaction.
   * @param operation - Work performed against one transaction.
   * @returns The operation result, or rejects when it cannot be completed.
   */
  transaction<T>(operation: (repositories: Repositories) => Promise<T>): Promise<T>;
}
