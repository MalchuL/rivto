import type { ExtensionComponent, ExtensionMountPosition, ReactEditorExtension } from "./types";

/** Extension installation, mounted components, and revision subscriptions. */
export interface ExtensionsApi {
  /**
   * Adds cleanup to the runtime and, during setup, to the active extension.
   * Extension cleanup runs before its registrations; remaining registrations
   * are released in reverse order when the manager is destroyed.
   * @param release - Synchronous cleanup for this exact resource registration.
   * @returns Idempotent disposer that runs cleanup and removes the registration.
   * @throws If manager destruction has started, or if the returned disposer's cleanup fails.
   */
  registerCleanup(release: () => void): () => void;
  mount(
    component: ExtensionComponent,
    position?: ExtensionMountPosition,
  ): () => void;
  getComponents(
    position?: ExtensionMountPosition,
  ): readonly ExtensionComponent[];
  /** Installs one extension after creation and returns its disposer. */
  install(extension: ReactEditorExtension): () => void;
  readonly revision: number;
  subscribe(listener: () => void): () => void;
}
