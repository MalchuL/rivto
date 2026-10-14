import type { BlockRenderer } from "./renderer-types";

/** Registration, lookup, and change notifications for block renderers. */
export interface RenderersApi {
  /**
   * Registers a renderer for a block type.
   *
   * @param type - Block type name whose renderer is registered.
   * @param renderer - React block renderer associated with the type.
   * @returns A function that unregisters the owned renderer.
   * @throws If the type is empty, already registered, or registration ownership is inactive.
   */
  register(type: string, renderer: BlockRenderer): () => void;
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
