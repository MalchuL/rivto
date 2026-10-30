import type { ComponentType } from "react";

/** Content renderer inputs, compatible with the existing host renderer contract. */
export interface BlockRendererProps {
  /** Stable identity resolved through the surrounding limited block context. */
  readonly blockId: string;
}

/** Content-only renderer; the Page package supplies the shell and descendants. */
export type BlockRenderer = ComponentType<BlockRendererProps>;

/** Inputs of a host layout composing Page primitives in its own JSX order. */
export interface BlockLayoutProps {
  /** Stable identity for host-specific hooks; Page primitives resolve their local occurrence. */
  readonly blockId: string;
}

/** Composition of one block interior; Page retains the block shell and recursive traversal. */
export type BlockLayout = ComponentType<BlockLayoutProps>;

/** Stable components installed together for one block type. */
export interface BlockRendererRegistration {
  /** Renders the block's own content through BlockContent (e.g. text or a board title); omission leaves it empty. */
  readonly content?: BlockRenderer;
  /** Arranges content, slots, and children through Page primitives; omission selects DefaultBlockLayout. */
  readonly layout?: BlockLayout;
}
