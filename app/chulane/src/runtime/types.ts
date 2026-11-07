/**
 * Defines the local HTTP state and handler registered with Cordis. Domain
 * contracts remain storage-independent; this runtime boundary combines
 * accessible workspace metadata and the current membership for UI consumers.
 */
import type { User } from "../domain/identity/types.ts";
import type { Membership, Workspace, WorkspaceRole } from "../domain/workspaces/types.ts";

/** Active workspace data assembled for authenticated management controls. */
export interface LocalWorkspace extends Workspace {
  role: WorkspaceRole;
  members: Membership[];
}

export interface LocalState {
  user: User;
  users: User[];
  workspaces: LocalWorkspace[];
  deletedWorkspaces: Workspace[];
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    localHandler: (request: Request) => Promise<Response>;
  }
}
