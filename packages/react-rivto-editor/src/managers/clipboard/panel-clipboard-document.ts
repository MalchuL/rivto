import type { BlockDestination } from "@chulane/document-model";
import type { DocumentEditorAPI } from "@chulane/rivto";
import type { PanelAPI } from "../../panels/types";
import type { PanelDestination } from "../../panels/panel-destination";

/**
 * Supplies the existing core paste algorithms with panel-bound mutations and real document destinations.
 * The adapter is private to one synchronous paste; definitions, transactions and selection resolution
 * remain owned by the document. It cannot register a new scope or change another panel's boundary.
 * @param panel - Receiving panel, retained throughout this paste.
 * @returns Document contract whose block reads and writes respect the receiving panel.
 */
export function panelClipboardDocument(panel: PanelAPI): DocumentEditorAPI {
  const document = panel.document;
  const destination = (target?: BlockDestination): PanelDestination => {
    if (!target || target.parentId === (panel.rootBlockId ?? null)) return { root: true, beforeId: target?.beforeId };
    if (target.parentId === null) throw new Error("Paste destination is outside panel");
    return { parentId: target.parentId, beforeId: target.beforeId };
  };
  const blocks = new Proxy(document.blocks, {
    get(target, key) {
      if (key === "getInsertionDestinationAfter") return (afterId?: string | null): BlockDestination => {
        if (afterId && !panel.blocks.canRemove(afterId) && panel.blocks.hasBlock(afterId)) {
          return { parentId: afterId, beforeId: document.blocks.getChildIds(afterId)[0] };
        }
        const local = panel.blocks.getInsertionDestinationAfter(afterId);
        return { parentId: "root" in local ? panel.rootBlockId ?? null : local.parentId, beforeId: local.beforeId };
      };
      if (key === "insertBlock") return ((input, place) => panel.blocks.insertBlock(input, destination(place))) satisfies DocumentEditorAPI["blocks"]["insertBlock"];
      if (key === "importForest") return ((input, place, onError, ids) => panel.blocks.importForest(input, destination(place), onError, ids)) satisfies DocumentEditorAPI["blocks"]["importForest"];
      if (key in panel.blocks) {
        const value = Reflect.get(panel.blocks, key);
        return typeof value === "function" ? value.bind(panel.blocks) : value;
      }
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return new Proxy(document, {
    get(target, key) {
      if (key === "blocks") return blocks;
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
