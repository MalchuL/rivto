import { createContext, useContext, useMemo, useCallback, type ReactNode } from "react";
import type {
  BetweenBlockDropDestination,
  BlockDropDestination,
} from "../../editor/drag-and-drop/types";
import type { BlockChildPlacement } from "../components/block-layout/block-item-context";
import { useBlockDropRegions } from "./block-drop-layout";
import { useBlockEditorController } from "../hooks/use-block-editor-controller";
import type { BlockDropRegion } from "../../editor/drag-and-drop/types";

/** Terminal outer-to-inner insertion levels borrowed by an item's child list. */
export const BlockDropDepthContext = createContext<readonly BetweenBlockDropDestination[] | null>(
  null,
);

/** Stable empty ancestry for lists that do not continue a terminal outline branch. */
const EMPTY_DEPTH: readonly BetweenBlockDropDestination[] = [];

/** A mounted item and the canonical placement supplied by its list. */
export interface BlockDropItemProps {
  readonly placement: BlockChildPlacement;
  readonly axis: "vertical" | "horizontal";
  readonly outline: boolean;
  readonly allowChildPlacement?: boolean;
  readonly children: ReactNode;
}

/**
 * Mounts insertion boundaries with their item so filtering removes both together.
 *
 * A terminal child may expose its enclosing item's trailing levels. Nonterminal
 * children reset these levels, preventing outdent areas in the middle of a subtree.
 * The provider adds no DOM box and does not own counters or child traversal.
 * Unchanged terminal destinations retain context identity, so reordering unrelated
 * roots does not publish depth changes throughout their mounted descendants.
 *
 * @param props - Canonical placement, flow and the existing child node.
 * @param props.placement - Actual parent and adjacent model IDs, independent of visibility.
 * @param props.axis - Direction in which the surrounding list arranges siblings.
 * @param props.children - Existing subtree, rendered once inside its terminal depth context.
 * @param props.outline - Whether trailing gaps expose child and terminal ancestor bands.
 * @param props.allowChildPlacement - False suppresses the child append band.
 * @returns Before/content/after regions without another block shell.
 */
export function BlockDropItem({
  placement,
  axis,
  outline,
  allowChildPlacement,
  children,
}: BlockDropItemProps) {
  const inherited = useContext(BlockDropDepthContext);
  const { parentId, blockId, previousId, nextId } = placement;
  const after = useMemo<BetweenBlockDropDestination>(
    () => ({
      kind: "between",
      parentId: parentId ?? null,
      previousId: blockId,
      nextId,
    }),
    [parentId, blockId, nextId],
  );
  const ancestors = outline && nextId === null ? (inherited ?? EMPTY_DEPTH) : EMPTY_DEPTH;
  const depth = useMemo(
    () => (outline ? [...ancestors, after] : null),
    [outline, ancestors, after],
  );
  const editor = useBlockEditorController();
  const anchor = useCallback(() => editor.regions.get(blockId, "shell") ?? null, [editor, blockId]);
  const before = {
    kind: "between" as const,
    parentId: parentId ?? null,
    previousId,
    nextId: blockId,
  };
  const declarations = useMemo<readonly BlockDropRegion[]>(() => {
    if (parentId === undefined) {
      return [];
    }
    const destinations: BlockDropDestination[] = [...ancestors, after];
    if (outline && allowChildPlacement !== false) {
      destinations.push({ kind: "inside", parentId: blockId });
    }
    return [
      {
        kind: "edge",
        side: axis === "vertical" ? "block-start" : "inline-start",
        destination: before,
      },
      {
        kind: "edge",
        side: axis === "vertical" ? "block-end" : "inline-end",
        destination: after,
        depth: outline ? { destinations, ancestors: ancestors.length } : undefined,
      },
    ];
  }, [parentId, previousId, blockId, axis, after, ancestors, outline, allowChildPlacement]);
  useBlockDropRegions(anchor, declarations, blockId);
  return <BlockDropDepthContext.Provider value={depth}>{children}</BlockDropDepthContext.Provider>;
}
