import { useContext } from "react";
import { BlockChildrenIdContext } from "./block-children-id-context";

/**
 * Names a child region within one mounted editor, including repeated source embeds.
 * @param blockId - Stable persisted identity; may appear in several editor views.
 * @returns A DOM ID shared by the child region and its collapse control.
 * @throws If used outside the owning Page slot context.
 */
export function useBlockChildrenId(blockId: string): string {
  const occurrence = useContext(BlockChildrenIdContext);
  if (occurrence?.blockId === blockId) {
    return occurrence.childrenId;
  }
  throw new Error("Block child identity requires its Page slot context");
}
