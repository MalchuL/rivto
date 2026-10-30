import type { EditorBlockNode as Block } from "@chulane/rivto";
import type { ComponentType, ReactNode } from "react";

/**
 * Props received by each ordered block decorator.
 *
 * Decorators may add handles, overlays, React context boundaries, or measurement, but must
 * render `children` exactly once. They do not choose content renderers or
 * traverse descendants.
 */
export interface BlockWrapperProps {
  /** Latest detached node snapshot supplied by the host model cache. */
  readonly block: Block;
  /** Next decorator, or the shared block shell at the end of the chain. */
  readonly children: ReactNode;
}

/** React component decorating an already-rendered block layer. */
export type BlockWrapperComponent = ComponentType<BlockWrapperProps>;
