/** Resource lifetime required by editor managers, without extension registration or teardown. */
export interface BlockEditorResourceOwner {
  /**
   * Rejects new resources after editor teardown has begun.
   *
   * Managers check this before mutating their stores or acquiring resources.
   *
   * @returns The owner is still active.
   * @throws If this editor's registrations have been destroyed.
   */
  assertActive(): void;

  /**
   * Adds cleanup to the editor and the currently active synchronous setup scope.
   *
   * Resources created outside setup belong to the editor. Features requiring
   * earlier cleanup must retain and call their returned disposers explicitly.
   * Cleanup is attempted once even when it throws.
   *
   * @param release - Synchronous cleanup for one resource.
   * @returns Idempotent disposer executing cleanup and removing resource ownership.
   * @throws If destroyed or delegated cleanup fails.
   */
  registerCleanup(release: () => void): () => void;
}
