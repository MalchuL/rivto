import type { ComponentType } from "react";

/** Props shared by every registered block content renderer. */
export interface BlockRendererProps {
  /** Stable block ID resolved by the renderer through block hooks. */
  readonly blockId: string;
}

/** React component responsible only for one block's content UI. */
export type BlockRenderer = ComponentType<BlockRendererProps>;
