import type { ElementTreeApi, ElementManagerApi, EditorElementNode } from "@chulane/rivto";

/**
 * Copies element props and remaps connector references to destination identities.
 * References outside the copied set are removed; detached connector points retain
 * their geometry with the same canvas offset as the pasted objects.
 * Block presentation settings are copied without range boundaries or old Panel
 * root fields. The caller supplies boundaries from the imported blocks, so source
 * document references cannot overwrite the destination range.
 * @param element - Source element whose props remain unchanged.
 * @param ids - Source-to-destination identities allocated before insertion.
 * @param offset - Translation applied to pasted canvas coordinates.
 * @returns Detached props with destination-local references.
 */
export function copyElementProps(element: EditorElementNode, ids: ReadonlyMap<string, string>, offset = 24): Record<string, unknown> {
  const props = structuredClone(element.props);
  if (element.type === "block") {
    delete props.startBlockId;
    delete props.endBlockId;
    delete props.rootBlockId;
    delete props.rootElementId;
  }
  if (element.type === "connector") {
    for (const key of ["source", "target"] as const) {
      const source = props[key];
      if (!source || typeof source !== "object" || Array.isArray(source)) continue;
      const endpoint = { ...source } as Record<string, unknown>;
      const mapped = typeof endpoint.elementId === "string" ? ids.get(endpoint.elementId) : undefined;
      if (mapped) endpoint.elementId = mapped;
      else delete endpoint.elementId;
      const position = endpoint.position;
      if (position && typeof position === "object" && "x" in position && "y" in position) {
        endpoint.position = { x: Number(position.x) + offset, y: Number(position.y) + offset };
      }
      props[key] = endpoint;
    }
  }
  return props;
}


/**
 * Restores copied child lists after every destination record has been inserted.
 * References to elements omitted by the paste strategy are excluded. The caller
 * batches this operation with insertion so observers never see half a group.
 * @param elements - Destination operations and their existing processing pipeline.
 * @param sources - Original records carrying ordered child IDs.
 * @param ids - Complete source-to-destination identity map.
 */
export function restoreElementChildren(
  elements: ElementManagerApi | ElementTreeApi,
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
