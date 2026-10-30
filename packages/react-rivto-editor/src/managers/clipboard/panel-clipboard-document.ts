import type { BlockDestination } from "@chulane/document-model";
import type { DocumentEditorAPI } from "@chulane/rivto";
import type { ReactPanelApi } from "../../panels/types";
import type { PanelDestination } from "@chulane/rivto";

/**
 * Supplies the existing core paste algorithms with panel-bound mutations and real document destinations.
 * The adapter is private to one synchronous paste; definitions, transactions and selection resolution
 * remain owned by the document. It cannot register a new scope or change another panel's boundary.
 * @param reactPanel - Receiving panel, retained throughout this paste.
 * @returns Document contract whose block reads and writes respect the receiving panel.
 */
export function panelClipboardDocument(reactPanel: ReactPanelApi): DocumentEditorAPI {
  const document = reactPanel.document;
  const destination = (target?: BlockDestination): PanelDestination => {
    if (!target || target.parentId === (reactPanel.rootBlockId ?? null)) {
      return { root: true, beforeId: target?.beforeId };
    }
    if (target.parentId === null) {
      throw new Error("Paste destination is outside panel");
    }
    return { parentId: target.parentId, beforeId: target.beforeId };
  };
  const blocks = new Proxy(document.blocks, {
    /**
     * Routes clipboard block operations through panel boundaries and binds other methods to their original owners.
     *
     * @param target - DOM host or proxied owner being accessed.
     * @param key - Property or attribute key to access.
     * @returns Panel-aware operation or bound document block member.
     */
    get(target, key) {
      if (key === "getInsertionDestinationAfter") {
        return (afterId?: string | null): BlockDestination => {
          if (
            afterId &&
            !reactPanel.blocks.canRemove(afterId) &&
            reactPanel.blocks.hasBlock(afterId)
          ) {
            return { parentId: afterId, beforeId: document.blocks.getChildIds(afterId)[0] };
          }
          const local = reactPanel.blocks.getInsertionDestinationAfter(afterId);
          return {
            parentId: "root" in local ? (reactPanel.rootBlockId ?? null) : local.parentId,
            beforeId: local.beforeId,
          };
        };
      }
      if (key === "insertBlock") {
        return ((input, place) =>
          reactPanel.blocks.insertBlock(
            input,
            destination(place),
          )) satisfies DocumentEditorAPI["blocks"]["insertBlock"];
      }
      if (key === "importForest") {
        return ((input, place, onError, ids) =>
          reactPanel.blocks.importForest(
            input,
            destination(place),
            onError,
            ids,
          )) satisfies DocumentEditorAPI["blocks"]["importForest"];
      }
      if (key in reactPanel.blocks) {
        const value = Reflect.get(reactPanel.blocks, key);
        return typeof value === "function" ? value.bind(reactPanel.blocks) : value;
      }
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return new Proxy(document, {
    /**
     * Exposes panel-aware block operations while binding other document members to the document.
     *
     * @param target - DOM host or proxied owner being accessed.
     * @param key - Property or attribute key to access.
     * @returns Panel block proxy or the requested bound document member.
     */
    get(target, key) {
      if (key === "blocks") {
        return blocks;
      }
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
