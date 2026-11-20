import type { InputRoot } from "@chulane/rivto-root";
import type { PanelInputRegistration, ReactPanelSurfaceApi } from "../../panels/types";

/** Owns the input subscription and cleanup for one installed Page drag extension. */
export class PageDragAttachment {
  private active = true;
  private unsubscribe: (() => void) | undefined;

  /**
   * Retains the two cleanup operations for an installed drag extension.
   *
   * @param inputRoot - Root that received the drag installation.
   * @param inputRegistration - Routing lifetime that owns the installation.
   * @param stop - Removes the Page extension and cancels its active gesture.
   * @param detach - Releases the receiving occurrence and notifies foreign sources.
   */
  constructor(
    private readonly inputRoot: Pick<InputRoot, "isAttached">,
    private readonly inputRegistration: PanelInputRegistration,
    private readonly stop: () => void,
    private readonly detach: () => void,
  ) {}

  /**
   * Observes panel availability and releases the installation when routing ends.
   *
   * @param panel - Borrowed availability subscription for the owning occurrence.
   * @returns The subscription is installed or the stale installation has been released.
   * @throws Propagates validation and cleanup failures, combining both when necessary.
   */
  observe(panel: Pick<ReactPanelSurfaceApi, "subscribeAvailability">): void {
    try {
      this.unsubscribe = panel.subscribeAvailability(this.reconcile);
      this.reconcile();
    } catch (error) {
      try {
        this.destroy();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Page drag setup failed during cleanup");
      }
      throw error;
    }
  }

  /**
   * Releases this exact drag installation and its availability subscription.
   *
   * @returns Every acquired resource is offered cleanup once.
   * @throws AggregateError if any cleanup fails.
   */
  readonly destroy = (): void => {
    if (!this.active) {
      return;
    }
    this.active = false;
    const errors: unknown[] = [];
    for (const release of [this.unsubscribe, this.stop, this.detach]) {
      try {
        release?.();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Page drag cleanup failed");
    }
  };

  /**
   * Stops the installation when its captured registration expires or cannot be checked.
   *
   * @returns The installation remains active only while its registration is current.
   * @throws Propagates validity or cleanup failures, combining both when necessary.
   */
  private readonly reconcile = (): void => {
    try {
      if (!this.inputRegistration.isCurrent(this.inputRoot)) {
        this.destroy();
      }
    } catch (error) {
      try {
        this.destroy();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Page drag validation cleanup failed");
      }
      throw error;
    }
  };
}
