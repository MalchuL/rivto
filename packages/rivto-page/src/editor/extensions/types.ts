import type { BlockEditorApi } from "../block-editor-api";

/** Reusable synchronous setup of presentation and behavior in a block editor. */
export interface BlockEditorExtension {
  /**
   * Installs contributions and subscriptions for this editor instance.
   *
   * Slot/renderer/wrapper registrations, their subscriptions, editor event observers, and
   * nested extensions installed synchronously during setup are owned automatically.
   * Node/data subscriptions require registerCleanup or returned setup cleanup.
   * Return cleanup for external resources and registrations made later in callbacks.
   * Cleanup runs before the captured registrations are released in reverse order.
   * Setup must not destroy its editor or return a promise.
   *
   * @param editor - Borrowed editor API without attachment or destruction; its adapter remains host-owned.
   * @returns Optional synchronous cleanup, called once on removal or destruction.
   * @throws Delegated setup failures; captured registrations are released before rethrow.
   */
  setup(editor: BlockEditorApi): void | (() => void);
}

/** Feature installation and explicit resource cleanup owned by one block editor. */
export interface BlockEditorExtensionsApi {
  /**
   * Installs a unique feature and captures synchronous manager registrations.
   *
   * Failed setup releases captured resources. Successful removal runs the returned
   * setup cleanup before captured registrations in reverse installation order.
   * The same extension object may be installed under different IDs; each setup
   * invocation owns its resources independently.
   *
   * @param id - Nonempty registration ID, unique among installations in this editor.
   * @param extension - Reusable feature whose synchronous setup runs for this installation.
   * @returns Idempotent disposer uninstalling this feature and its owned resources.
   * @throws If destroyed, the ID is invalid/duplicate, or setup/cleanup fails.
   */
  register(id: string, extension: BlockEditorExtension): () => void;
  /**
   * Adds cleanup to the editor and the currently active synchronous setup scope.
   *
   * Later asynchronous callbacks have no implicit feature scope; include their
   * disposers in the feature's returned cleanup if they must end with that feature.
   *
   * @param release - Synchronous cleanup for one external resource.
   * @returns Idempotent disposer executing cleanup and removing resource ownership.
   * @throws If destroyed or delegated cleanup fails.
   */
  registerCleanup(release: () => void): () => void;
}
