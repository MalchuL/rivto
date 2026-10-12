import type { PanelElementsAPI } from "../panels/panel-elements-api";
import type { ElementManagerApi, EditorElementNode } from "@chulane/rivto";

/**
 * Restores copied child lists after every destination record has been inserted.
 * References to elements omitted by the paste strategy are excluded. The caller
 * batches this operation with insertion so observers never see half a group.
 * @param elements - Destination operations and their existing processing pipeline.
 * @param sources - Original records carrying ordered child IDs.
 * @param ids - Complete source-to-destination identity map.
 */
export function restoreElementChildren(
  elements: ElementManagerApi | PanelElementsAPI,
  sources: readonly EditorElementNode[],
  ids: ReadonlyMap<string, string>,
): void {
  for (const source of sources) {
    const parentId = ids.get(source.id);
    if (!parentId || !elements.hasElement(parentId)) continue;
    const children = source.childIds.flatMap((id) => {
      const mapped = ids.get(id);
      return mapped && elements.hasElement(mapped) ? [mapped] : [];
    });
    if (children.length) elements.moveElements(children, { parentId });
  }
}
