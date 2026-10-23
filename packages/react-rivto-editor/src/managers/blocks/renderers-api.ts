import type { BlockLayout } from "@chulane/rivto-page";
import type { BlockRenderer, BlockRendererRegistration } from "./renderer-types";

/** Registration, lookup, and change notifications for block renderers. */
export interface RenderersApi {
  /**
   * Registers a renderer for a block type.
   *
   * @param type - Block type name whose renderer is registered.
   * @param renderer - React block renderer associated with the type.
   * @param layout - Optional Page layout installed and removed with the renderer.
   * @returns A function that unregisters the owned renderer.
   * @throws If the type is empty, already registered, or registration ownership is inactive.
   */
  register(type: string, renderer: BlockRenderer, layout?: BlockLayout): () => void;
  /**
   * Removes a renderer registered for the block type.
   *
   * @param type - Block type name whose renderer is removed.
   * @returns Whether a renderer was removed.
   */
  delete(type: string): boolean;
  /**
   * Looks up the renderer for a block type.
   *
   * @param type - Block type name to look up.
   * @returns Registered renderer, the configured fallback when the type is unregistered, or
   * undefined when neither is available.
   */
  get(type: string): BlockRenderer | undefined;
  /** Fixed fallback supplied when the host registry is created. */
  readonly fallback?: BlockRenderer;
  /**
   * Reads concrete renderer and layout contributions with stable entry identities.
   *
   * @returns Defensive list of immutable registrations in installation order.
   */
  getRegistrations(): readonly BlockRendererRegistration[];
  /**
   * Checks whether a block type has a registered renderer.
   *
   * @param type - Block type name to check.
   * @returns Whether a renderer is registered.
   */
  has(type: string): boolean;
  readonly revision: number;
  /**
   * Observes renderer registration changes.
   *
   * @param listener - Callback invoked when the observed state changes.
   * @returns A function that removes the listener.
   */
  subscribe(listener: () => void): () => void;
}
