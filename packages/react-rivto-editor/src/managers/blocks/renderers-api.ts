import type { BlockRenderer } from "./renderer-types";

/** Registration, lookup, and change notifications for block renderers. */
export interface RenderersApi {
  register(type: string, renderer: BlockRenderer): () => void;
  delete(type: string): boolean;
  get(type: string): BlockRenderer | undefined;
  has(type: string): boolean;
  readonly revision: number;
  subscribe(listener: () => void): () => void;
}
