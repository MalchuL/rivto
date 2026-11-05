import {
  CLIPBOARD_BUNDLE_VERSION,
  type ClipboardBundle,
  type EditorBlock,
  type EditorBlockInput,
  type EditorElementInput,
  type EditorElementNode,
} from "@chulane/rivto";
import type { ClipboardContent } from "./types";

/**
 * Collects selected element subtrees once, retaining source record order.
 *
 * When explicit selected IDs are absent, every element record is a root.
 * Unknown IDs and repeated or cyclic child references are ignored.
 *
 * @param bundle - Clipboard bundle containing element records and optional selected IDs.
 * @returns Included element records in their original bundle order.
 */
export function selectedClipboardElements(bundle: ClipboardBundle): EditorElementNode[] {
  const nodes = new Map(bundle.elements?.map((node) => [node.id, node]));
  const included = new Set<string>();
  // Include each reachable element and its descendants at most once.
  const visit = (id: string) => {
    const node = nodes.get(id);
    if (!node || included.has(id)) {
      return;
    }
    included.add(id);
    node.childIds.forEach(visit);
  };
  (bundle.selectedElementIds ?? [...nodes.keys()]).forEach(visit);
  return [...nodes.values()].filter((node) => included.has(node.id));
}

/**
 * Reads properties when exactly one selected clipboard object has the requested type.
 *
 * Unselected canvas descendants do not count as selected objects. Missing or
 * duplicate selected records leave no single matching object.
 *
 * @param bundle - Detached clipboard records and selected canvas IDs.
 * @param blockType - Persisted block type accepted by the caller.
 * @param elementType - Persisted canvas element type accepted by the caller.
 * @returns The matching object's properties, or undefined for any other selection.
 */
export function singleSelectedClipboardProps(
  bundle: ClipboardBundle,
  blockType: string,
  elementType: string,
): Record<string, unknown> | undefined {
  const blocks = bundle.blocks.filter((block) => block.type === blockType);
  const selected = new Set(bundle.selectedElementIds ?? []);
  const elements = (bundle.elements ?? []).filter(
    (element) => selected.has(element.id) && element.type === elementType,
  );
  if (blocks.length + elements.length !== 1 || bundle.blocks.length + selected.size !== 1) {
    return undefined;
  }
  return (blocks[0] ?? elements[0])?.props;
}

/**
 * Converts parser creation inputs into a clipboard bundle; generated IDs are source-local only.
 *
 * Missing IDs are generated, missing block properties receive defaults, and
 * nested elements are flattened while preserving their child references. Supplied
 * property objects are reused rather than cloned.
 *
 * @param content - Parsed block and element creation inputs.
 * @returns A versioned clipboard bundle containing the converted records and selected element IDs.
 * @throws If ID generation or input traversal fails.
 */
export function clipboardContentBundle(content: ClipboardContent): ClipboardBundle {
  // Convert nested block inputs using source-local IDs and defaults.
  const block = (input: EditorBlockInput): EditorBlock => ({
    ...input,
    id: input.id ?? crypto.randomUUID(),
    content: input.content ?? "",
    props: input.props ?? {},
    listProps: input.listProps ?? {},
    pluginData: input.pluginData ?? {},
    children: input.children?.map(block) ?? [],
  });
  const elements: EditorElementNode[] = [];
  // Flatten nested elements and return each existing or generated source-local ID.
  const element = (input: EditorElementInput): string => {
    const id = input.id ?? crypto.randomUUID();
    const childIds = input.children?.map(element) ?? [...(input.childIds ?? [])];
    elements.push({
      id,
      type: input.type,
      props: input.props ?? {},
      frame: input.frame ?? { x: 0, y: 0, width: 1, height: 1 },
      zIndex: input.zIndex ?? 0,
      childIds,
    });
    return id;
  };
  const selectedElementIds = content.elements?.map(element);
  return {
    version: CLIPBOARD_BUNDLE_VERSION,
    blocks: content.blocks?.map(block) ?? [],
    elements,
    selectedElementIds,
  };
}
