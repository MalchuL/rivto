import { useSyncExternalStore } from "react";
import type { EditorBlockNode } from "@chulane/rivto";
import {
  PAGE_BLOCK_DECORATIONS_KEY,
  type PageBlockDecorationAdapter,
} from "../../blocks/page-block-decorations";
import { useReactPanel } from "../editor/use-react-panel";

/**
 * Reads a node's collapse state through the editor's shared decoration adapter.
 *
 * The caller supplies the current node snapshot and owns its subscription. This
 * hook separately observes adapter replacement so mounted controls and layouts
 * update even when the persisted node has not changed. The built-in adapter reads
 * the persisted state even if the optional collapse extension is not installed.
 *
 * @param block - Current shallow block snapshot, or undefined after removal.
 * @returns Whether the adapter reports the block as collapsed; false for a missing block or adapter.
 * @throws If rendered outside a React editor panel or the adapter rejects the node.
 */
export function useBlockCollapsed(block: EditorBlockNode | undefined): boolean {
  const shared = useReactPanel().editor.extensions.shared;
  useSyncExternalStore(
    (listener) => shared.subscribe(PAGE_BLOCK_DECORATIONS_KEY, listener),
    () => shared.revision,
    () => shared.revision,
  );
  const adapter = shared.getValue<PageBlockDecorationAdapter>(PAGE_BLOCK_DECORATIONS_KEY)?.get();
  return block ? adapter?.read(block).collapsed === true : false;
}
