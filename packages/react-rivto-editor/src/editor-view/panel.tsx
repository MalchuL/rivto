import type { ModeManagerApi } from "@chulane/rivto";
import { useCallback } from "react";
import { EditorView, type EditorViewProps } from "./editor-view";

/**
 * Application-owned navigation record selecting roots in the block and element trees.
 *
 * The host persists Panel IDs, navigation, and titles independently of document
 * snapshots. Null roots create no records. Several Panels can display the same
 * roots; edits then affect their shared document data. A missing non-null root
 * remains selected rather than falling back to document roots, allowing undo to
 * restore the original view. Element coordinates are not changed by opening a Panel.
 */
export interface Panel {
  /** Stable application identity for this Panel, separate from the document identity. */
  id: string;
  /** Document whose runtime must be passed to EditorPanel. */
  documentId: string;
  /** Null displays document blocks; an ID displays that block's children, excluding the block itself. */
  rootBlockId: string | null;
  /** Null displays document element roots; an element ID displays its descendants, excluding that container. */
  rootElementId: string | null;
}

/** Requests navigation without prescribing a window, tab, or persistence mechanism. */
export type OpenPanelBlock = (blockId: string) => void;

/** Panel identity and the block requested by an interaction in that panel. */
export interface OpenPanelBlockRequest {
  panel: Panel;
  documentId: string;
  blockId: string;
}

/** Existing surface options with an explicit application Panel and optional navigation. */
export interface EditorPanelProps extends Omit<EditorViewProps, "rootBlockId" | "panel" | "openBlock" | "mode"> {
  panel: Panel;
  mode?: ModeManagerApi;
  onOpenBlock?: (request: OpenPanelBlockRequest) => void;
}

/**
 * Displays document roots or a block's children using the Panel's selected element subtree.
 * The host owns navigation, titles, persistence, and runtime lifetime.
 * @param props - Panel, its document runtime, surfaces, and host navigation callback.
 * @returns An EditorView using the selected block and element roots.
 * @throws If the runtime document does not match the Panel. Missing roots remain empty until restored.
 */
export function EditorPanel({ panel, onOpenBlock, ...props }: EditorPanelProps) {
  const openBlock = useCallback((blockId: string) => {
    if (props.runtime.blocks.hasBlock(blockId)) onOpenBlock?.({ panel, documentId: panel.documentId, blockId });
  }, [panel, props.runtime, onOpenBlock]);
  if (panel.documentId !== props.runtime.getDocument().id) {
    throw new Error("Panel document must match its runtime");
  }
  return <EditorView {...props} panel={panel} rootBlockId={panel.rootBlockId ?? undefined}
    openBlock={onOpenBlock ? openBlock : undefined} />;
}
