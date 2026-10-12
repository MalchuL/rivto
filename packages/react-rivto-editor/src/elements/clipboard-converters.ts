import { clipboardHTMLText, escapeClipboardHTML } from "../managers/clipboard/clipboard-format-registry";
import type { ElementClipboardConverter } from "../managers/clipboard/types";
import { blockIdsOf, blockRangeProps } from "./block-element-projection";

/**
 * Copies block presentation settings without retaining source range boundaries
 * or old Panel root fields. Boundaries come from the imported blocks, so source
 * document references cannot overwrite the destination range. Rotation, autoHeight,
 * and other presentation properties remain unchanged on the detached copy.
 */
export const blockElementClipboardConverter: ElementClipboardConverter = {
  getReferencedBlockIds: blockIdsOf,
  paste(element, context) {
    const props = { ...element.props };
    delete props.startBlockId; delete props.endBlockId;
    delete props.rootBlockId; delete props.rootElementId;
    const ids = blockIdsOf(element, context.sourceRootBlockIds).flatMap(id => context.blockIdMap.get(id) ?? []);
    return { props: { ...props, ...blockRangeProps(ids) } };
  },
  format: ({ blocks }) => blocks,
};

/**
 * Copies connector props and remaps references to destination identities.
 * References outside the copied set are removed; detached connector points retain
 * their geometry with the same canvas offset as the pasted objects.
 * Source props remain unchanged, and destination identities have already been
 * allocated for the entire copied set before this converter runs.
 */
export const connectorClipboardConverter: ElementClipboardConverter = {
  paste(element, { elementIdMap, offset }) {
    const props = structuredClone(element.props);
    for (const key of ["source", "target"] as const) {
      const source = props[key];
      if (!source || typeof source !== "object" || Array.isArray(source)) continue;
      const endpoint = { ...source } as Record<string, unknown>;
      const mapped = typeof endpoint.elementId === "string" ? elementIdMap.get(endpoint.elementId) : undefined;
      if (mapped) endpoint.elementId = mapped;
      else delete endpoint.elementId;
      const position = endpoint.position;
      if (position && typeof position === "object" && "x" in position && "y" in position) {
        endpoint.position = { x: Number(position.x) + offset.x, y: Number(position.y) + offset.y };
      }
      props[key] = endpoint;
    }
    return { props };
  },
};

/**
 * Supplies portable text for a built-in shape with a text label.
 * @param type - Persisted element type written into the exported HTML marker.
 * @returns A converter that recreates the shape in edgeless or its text in Page.
 */
export function textElementClipboardConverter(type: string): ElementClipboardConverter {
  return {
    format: ({ element }) => {
      const plain = typeof element.props.text === "string" ? element.props.text : "";
      return { plain, markdown: plain, html: `<p data-rivto-element="${escapeClipboardHTML(type)}">${escapeClipboardHTML(plain).replace(/\n/g, "<br>")}</p>` };
    },
    parseHTML(element, context) {
      if (element.getAttribute("data-rivto-element") !== type) return;
      const text = clipboardHTMLText(element);
      if (context.surface === "page") return { blocks: [{ type: context.defaultBlockType, content: text }] };
      return { elements: [{ type, zIndex: 0, props: { text }, frame: { x: 0, y: 0, width: 240, height: 120 } }] };
    },
  };
}
