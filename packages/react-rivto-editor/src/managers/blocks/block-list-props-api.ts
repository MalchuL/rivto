import type { BlockListPropsManagerApi, EditorBlock, EditorBlockNode } from "@chulane/rivto";
import type { BlockBehaviorContext } from "../../block-behaviors/types";

/** Core list-property policy whose registrations are owned by the active React extension. */
export type BlockListPropsRegistration = Parameters<BlockListPropsManagerApi["register"]>[0] & {
  /** Returns inherited properties for the following split block; omitted leaves writing defaults intact. */
  readonly prepareSplit?: (block: EditorBlock) => Record<string, unknown>;
  /** Handles a split before the ordinary outline action. True stops the fallback; the caller owns the transaction. */
  readonly onSplit?: (context: BlockBehaviorContext) => boolean;
  /** Returns false to hide this block's children. Omitted leaves them visible. */
  readonly childrenVisible?: (block: Pick<EditorBlockNode, "listProps">) => boolean;
};

/** Core property validation combined with optional React outline behavior. */
export interface BlockListPropsApi extends Omit<BlockListPropsManagerApi, "destroy" | "register"> {
  /** Registers property validation and presentation behavior together; returns their owned cleanup. */
  register(registration: BlockListPropsRegistration): () => void;
  /** Returns merged split properties in registration order, or undefined when no extension supplies them. */
  prepareSplit(block: EditorBlock): Record<string, unknown> | undefined;
  /** Runs split handlers in registration order until one handles the request. */
  onSplit(context: BlockBehaviorContext): boolean;
  /** Returns true unless an installed behavior hides the block's children. */
  childrenVisible(block: Pick<EditorBlockNode, "listProps">): boolean;
}
