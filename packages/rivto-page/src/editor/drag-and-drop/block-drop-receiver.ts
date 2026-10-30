import { Listeners } from "@chulane/rivto-utils";
import { BlockDropFeedback } from "./block-drop-feedback";
import type { DropSurface, DropSurfaceRegistry } from "./drop-surface-registry";
import type { ResolvedBlockDropTarget } from "./types";

/** Owns one receiving registration, feedback, and cancellation subscriptions. */
export class BlockDropReceiver<T extends DropSurface> {
  private readonly feedback: BlockDropFeedback;
  private readonly listeners = new Listeners<{ detach: void }>();
  private readonly unregister: () => void;
  private disposed = false;

  /**
   * Registers a host's receiving identity without acquiring its model or commands.
   *
   * @param scope - Borrowed receiver identity and mounted root.
   * @param registry - Registration capability shared by participating drag engines.
   * @throws If the registry cannot install the attachment.
   */
  constructor(scope: T, registry: Pick<DropSurfaceRegistry<T>, "register">) {
    this.feedback = new BlockDropFeedback(scope.root);
    this.unregister = registry.register(scope);
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
    return this.listeners.subscribe("detach", listener);
  }

  /**
   * Displays already resolved geometry without reading the model or DOM layout.
   *
   * @param target - Accepted target, or undefined to release visible feedback.
   * @returns Feedback is updated while active; calls after destruction do nothing.
   * @throws Propagates feedback DOM-write failures.
   */
  update(target?: ResolvedBlockDropTarget): void {
    if (!this.disposed) {
      this.feedback.update(target);
    }
  }

  /**
   * Unregisters this identity, clears feedback and notifies every subscribed source.
   *
   * @returns Every cleanup is attempted once, including when another cleanup fails.
   * @throws AggregateError containing registration, feedback or listener failures.
   */
  destroy(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    const listeners = this.listeners.snapshot("detach");
    this.listeners.clear();
    const errors: unknown[] = [];
    for (const release of [this.unregister, () => this.feedback.clear(), ...listeners]) {
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
