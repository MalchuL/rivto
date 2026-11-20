import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import type { RegionIdentity } from "@chulane/rivto-root";
import { BLOCK_CONTENT_ATTRIBUTE, BLOCK_SELECTION_ANCHOR_ATTRIBUTE } from "../../constants";
import { usePanel } from "../editor/use-panel";
import { createTextEditingHandlers } from "./browser/text-editing-handlers";
import type { BlockTextEditingAttributes, UseBlockEditingOptions } from "./types";
export type { BlockTextEditingAttributes } from "./types";
import { BlockEditingController } from "./block-editing-controller";
import { useEditableTextTarget } from "./use-editable-text-target";
import { useRestoreBlockFocus } from "./use-block-selection-anchor";

/**
 * Synchronizes one browser-owned plain-text editable without subscribing to the document.
 * External commands, undo/redo, and remote CRDT updates reconcile before paint.
 * DOM selection offsets are saved and restored when replacement is necessary;
 * IME composition owns the DOM until composition end. React must not supply text children.
 * @param blockId - Stable persisted ID receiving native input through the block manager.
 * @param content - Current reactive content from useBlockNode; undefined means missing/deleted.
 * @param runTextInput - Optional synchronous transaction around input and composition completion.
 * @returns Stable DOM attributes to spread on exactly one editable div.
 * @throws If called outside an EditorPanel or EditorEmbed subtree.
 */
export function useBlockTextEditing(
  blockId: string,
  content: string | undefined,
  runTextInput?: UseBlockEditingOptions["runTextInput"],
): BlockTextEditingAttributes {
  const panel = usePanel();
  const setContent = useCallback(
    (value: string) => {
      panel.blocks.updateBlock(blockId, { content: value });
    },
    [panel, blockId],
  );
  const controller = useMemo(() => new BlockEditingController(setContent), [setContent]);
  const handlers = useMemo(
    () => createTextEditingHandlers(controller, runTextInput),
    [controller, runTextInput],
  );
  const identityRef = useRef<RegionIdentity | undefined>(undefined);
  const ref = useEditableTextTarget(controller, identityRef);
  // Reconcile command-driven or remote content without treating the detached
  // block snapshot as mutable React state. Run after each commit so replacing
  // the editable DOM node also synchronizes unchanged document text.
  useLayoutEffect(() => controller.synchronize(content ?? ""));
  useRestoreBlockFocus(blockId, identityRef);
  return useMemo(
    () => ({
      ref,
      contentEditable: "plaintext-only" as const,
      suppressContentEditableWarning: true as const,
      [BLOCK_SELECTION_ANCHOR_ATTRIBUTE]: "" as const,
      [BLOCK_CONTENT_ATTRIBUTE]: "" as const,
      ...handlers,
    }),
    [handlers, ref],
  );
}
