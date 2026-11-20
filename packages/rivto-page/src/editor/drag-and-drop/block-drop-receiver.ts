import type { DropSurfaceRegistry } from "./drop-surface-registry";
import type { BlockDropSurfaceRoot } from "./types";

/** Owns one receiving registration and cancellation subscriptions. */
export class BlockDropReceiver<T extends object> {
  private readonly listeners = new Set<() => void>();
  private readonly unregister: () => void;
  private disposed = false;

  /**
   * Registers a host's receiving identity without acquiring its model or commands.
   *
   * @param root - Root capability for the mounted receiving occurrence.
   * @param scope - Borrowed receiver identity.
   * @param registry - Registration capability shared by participating drag engines.
   * @throws If the registry cannot install the attachment.
   */
  constructor(
    root: BlockDropSurfaceRoot,
    scope: T,
    registry: Pick<DropSurfaceRegistry<T>, "register">,
  ) {
    this.unregister = registry.register(root, scope);
  }

  /**
   * Reports whether this receiving attachment can still accept resolution.
   *
   * @returns False after destruction, independently of DOM connection state.
   */
  get active(): boolean {
    return !this.disposed;
  }

  /**
   * Subscribes a source gesture to this exact receiver's destruction.
   *
   * @param listener - Called immediately if already destroyed; otherwise called once on destruction.
   * @returns Disposer removing only this subscription.
   */
  onDetach(listener: () => void): () => void {
    if (this.disposed) {
      listener();
      return () => {};
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Unregisters this identity and notifies every subscribed source.
   *
   * @returns Every cleanup is attempted once, including when another cleanup fails.
   * @throws AggregateError containing registration or listener failures.
   */
  destroy(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    const listeners = [...this.listeners];
    this.listeners.clear();
    const errors: unknown[] = [];
    for (const release of [this.unregister, ...listeners]) {
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Drop receiver cleanup failed");
    }
  }
}
