import { useEditorContext } from "../../editor-view/editor-context";

/**
 * Names a child region within one mounted editor, including repeated source embeds.
 * @param blockId - Stable persisted identity; may appear in several editor views.
 * @returns A DOM ID shared by the child region and its collapse control.
 */
export function useBlockChildrenId(blockId: string): string {
  const { domIdPrefix } = useEditorContext();
  return `${domIdPrefix ?? "rivto"}-block-children-${blockId}`;
}
