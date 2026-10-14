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
  /**
   * Mounts an extension component at the requested editor position.
   *
   * @param component - Extension component to mount.
   * @param position - Extension mount position; defaults to beforeSurface.
   * @returns Owned cleanup that unmounts the component.
   */
  mount(component: ExtensionComponent, position?: ExtensionMountPosition): () => void;
  /**
   * Reads mounted extension components, optionally filtered by their surface position.
   *
   * @param position - Extension mount position to filter; omitted values include every mount.
   * @returns A defensive list of components in registration order for the requested scope.
   */
  getComponents(position?: ExtensionMountPosition): readonly ExtensionComponent[];
  /** Installs one extension after creation and returns its disposer. */
  install(extension: ReactEditorExtension): () => void;
  readonly revision: number;
  /**
   * Observes extension component mount changes.
   *
   * @param listener - Callback invoked when the observed state changes.
   * @returns A function that removes the listener.
   */
  subscribe(listener: () => void): () => void;
}
