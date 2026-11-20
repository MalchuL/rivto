import type { InputRoot, PathOverlay } from "@chulane/rivto-root";
import type { PanelInputRegistration } from "../../panels/types";
import type { ThreadOverlayPanel } from "./types";

/** Owns the overlay and observations for one panel input registration. */
export class ThreadOverlayAttachment {
  private active = true;
  private unsubscribe: (() => void) | undefined;

  /**
   * Retains the resources acquired while mounting the overlay.
   *
   * @param inputRoot - Root used by the overlay and observations.
   * @param inputRegistration - Routing lifetime that owns the overlay.
   * @param stop - Releases frame and browser observations.
   * @param overlay - Body-hosted path to remove during cleanup.
   */
  constructor(
    private readonly inputRoot: Pick<InputRoot, "isAttached">,
    private readonly inputRegistration: PanelInputRegistration,
    private readonly stop: () => void,
    private readonly overlay: Pick<PathOverlay, "remove">,
  ) {}

  /**
   * Observes routing changes and releases the overlay when its registration ends.
   *
   * @param panel - Borrowed availability subscription for the owning occurrence.
   * @returns The subscription is active or the stale attachment has been released.
   * @throws Propagates validation and cleanup failures, combining both when necessary.
   */
  observe(panel: Pick<ThreadOverlayPanel, "subscribeAvailability">): void {
    try {
      this.unsubscribe = panel.subscribeAvailability(this.reconcile);
      this.reconcile();
    } catch (error) {
      try {
        this.destroy();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Thread overlay setup and cleanup failed");
      }
      throw error;
    }
  }

  /**
   * Releases the subscription, observation, and overlay once.
   *
   * @returns Every retained resource has been offered cleanup.
   * @throws AggregateError if any cleanup fails.
   */
  readonly destroy = (): void => {
    if (!this.active) {
      return;
    }
    this.active = false;
    const errors: unknown[] = [];
    for (const release of [this.unsubscribe, this.stop, () => this.overlay.remove()]) {
      try {
        release?.();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Thread overlay cleanup failed");
    }
  };

  /**
   * Ends the attachment when its input lifetime expires or cannot be checked.
   *
   * @returns The overlay remains mounted only while its registration is current.
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
        throw new AggregateError([error, cleanupError], "Thread overlay validation cleanup failed");
      }
      throw error;
    }
  };
}
