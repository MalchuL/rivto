import type { CanvasTool } from "../core/tools/canvas-tool";

/** Common session operations used by a canvas view independently of application factories. */
export interface CanvasToolSession {
  readonly active: CanvasTool | undefined;
  readonly revision: number;
  /**
   * Observes active tool and registry changes.
   *
   * @param listener - Called synchronously when the session changes.
   * @returns Cleanup removing this observer.
   */
  subscribe(listener: () => void): () => void;
  /**
   * Activates one registered tool through its lifecycle.
   *
   * @param id - Available registration identity.
   * @returns The selected instance is active.
   * @throws If the registration is unavailable or activation fails.
   */
  activate(id: string): void;
  /**
   * Restores the registry-defined fallback and discards pending previews.
   *
   * @returns The default tool is active, or no tool when none is registered.
   */
  reset(): void;
  /**
   * Starts observing the shared registry for this mounted session.
   *
   * @returns Cleanup disposing this session's instances and subscriptions.
   */
  observeChanges(): () => void;
}
