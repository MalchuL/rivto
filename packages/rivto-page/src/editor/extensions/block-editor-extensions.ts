import type { BlockEditorResourceOwner } from "./block-editor-resource-owner";
import type { BlockEditorApi } from "../block-editor-api";
import type { BlockEditorExtension, BlockEditorExtensionsApi } from "./types";

/** Owns editor registrations and nested synchronous extension setup scopes. */
export class BlockEditorExtensions implements BlockEditorExtensionsApi, BlockEditorResourceOwner {
  private readonly registrations = new Set<() => void>();
  private readonly ids = new Set<string>();
  private activeScope: Set<() => void> | undefined;
  private destroyed = false;

  /**
   * Binds feature setup to an existing editor without installing resources.
   *
   * @param editor - Editor supplied to each synchronous setup callback.
   */
  constructor(private readonly editor: BlockEditorApi) {}

  /**
   * Installs a uniquely named extension and captures its synchronous registrations.
   *
   * Nested setup restores its parent's scope. Failed setup releases its captured
   * resources, including nested extensions, and permits retrying the same ID.
   * Reusing an extension under another ID creates an independent setup scope.
   *
   * @param id - Nonempty installation ID, unique within this editor.
   * @param extension - Reusable extension whose synchronous setup runs for this ID.
   * @returns Idempotent disposer running cleanup before owned registrations.
   * @throws If destroyed, the ID is empty/duplicate, setup fails, or cleanup fails.
   */
  register(id: string, extension: BlockEditorExtension): () => void {
    this.assertActive();
    if (!id.trim() || this.ids.has(id)) {
      throw new Error(`Invalid or duplicate block editor extension ID: ${id}`);
    }
    const owned = new Set<() => void>();
    const previous = this.activeScope;
    this.ids.add(id);
    this.activeScope = owned;
    let cleanup: void | (() => void) = undefined;
    try {
      cleanup = extension.setup(this.editor);
      if (cleanup !== undefined && typeof cleanup !== "function") {
        throw new TypeError(
          "Block editor extension setup must return synchronous cleanup or undefined",
        );
      }
    } catch (error) {
      this.ids.delete(id);
      this.releaseAll(owned, [error]);
    } finally {
      this.activeScope = previous;
    }
    return this.registerCleanup(() => {
      this.ids.delete(id);
      const releases = [...owned];
      if (cleanup) {
        releases.push(cleanup);
      }
      this.releaseAll(releases);
    });
  }

  /**
   * Gives a resource editor ownership and the currently active setup scope.
   *
   * Resources registered after setup belong to the editor; extensions must keep
   * their disposers in their returned cleanup when earlier removal is required.
   * The resource is marked released before cleanup, including when cleanup throws.
   *
   * @param release - Synchronous cleanup for one resource.
   * @returns Idempotent disposer releasing this resource and removing ownership.
   * @throws If destroyed or the returned disposer's delegated cleanup fails.
   */
  registerCleanup(release: () => void): () => void {
    this.assertActive();
    const scope = this.activeScope;
    const dispose = () => {
      if (!this.registrations.delete(dispose)) {
        return;
      }
      scope?.delete(dispose);
      release();
    };
    this.registrations.add(dispose);
    scope?.add(dispose);
    return dispose;
  }

  /**
   * Rejects new resources after editor teardown has begun.
   *
   * @returns The owner is still active.
   * @throws If this editor's registrations have been destroyed.
   * @internal Used by owned managers before changing their stores.
   */
  assertActive(): void {
    if (this.destroyed) {
      throw new Error("BlockEditorApi is destroyed");
    }
  }

  /**
   * Prevents teardown while synchronous feature setup is still capturing resources.
   *
   * @returns No setup callback is currently active.
   * @throws If teardown is attempted from inside extension setup.
   * @internal Checked before the editor changes its lifecycle state.
   */
  assertCanDestroy(): void {
    if (this.activeScope) {
      throw new Error("Cannot destroy a block editor during extension setup");
    }
  }

  /**
   * Releases every remaining registration in reverse order despite cleanup failures.
   *
   * @returns All resources have been attempted and later registrations are rejected.
   * @throws If called during setup, or AggregateError containing cleanup failures.
   * @internal The editor owns final destruction of this manager.
   */
  destroy(): void {
    this.assertCanDestroy();
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.releaseAll(this.registrations);
  }

  /**
   * Attempts captured resources in reverse order and reports all failures together.
   *
   * @param releases - Resources captured before cleanup mutates ownership sets.
   * @param errors - Existing failures to retain, including the original setup error.
   * @returns Every captured release has run when no failures were collected.
   * @throws AggregateError containing setup and cleanup failures after all attempts.
   */
  private releaseAll(releases: Iterable<() => void>, errors: unknown[] = []): void {
    for (const release of [...releases].reverse()) {
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "Block editor registration cleanup failed");
    }
  }
}
