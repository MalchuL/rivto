import { createContext, useContext, useMemo, useCallback, type ReactNode } from "react";
import type {
  BetweenBlockDropDestination,
  BlockDropDestination,
  BlockDropEdgeRegion,
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
 * @returns Before/content/after regions without another block shell.
 */
export function BlockDropItem({ placement, axis, outline, children }: BlockDropItemProps) {
  const { regions, depth } = useBlockDropEdges({ placement, axis, outline });
  const editor = useBlockEditorController();
  const anchor = useCallback(
    () => editor.regions.get(placement.blockId, "shell") ?? null,
    [editor, placement.blockId],
  );
  useBlockDropRegions(anchor, regions, placement.blockId);
  return <BlockDropDepthContext.Provider value={depth}>{children}</BlockDropDepthContext.Provider>;
}

/** Shared placement policy consumed by linear shells and wrapping items. */
interface BlockDropEdgesOptions {
  readonly placement: BlockChildPlacement;
  readonly axis: "vertical" | "horizontal" | "grid";
  readonly outline: boolean;
  readonly size?: number;
}

/**
 * Builds canonical edge declarations and terminal ancestry for any item layout.
 *
 * Linear shells and wrapping items use identical nesting depth choices. Grid
 * block-end edges expose outline depth; their inline seams retain sibling order.
 * These declarations own no DOM, registrations, permission or pointer listeners.
 *
 * @param options - Canonical placement, flow and the containing list's placement policy.
 * @param options.placement - Real parent and adjacent model IDs, independent of mounted siblings.
 * @param options.axis - Edges to declare; grid enables block and inline boundaries.
 * @param options.outline - Enables child append and terminal ancestor bands.
 * @param options.size - Optional local-pixel edge size; omission inherits the theme.
 * @returns Edge declarations and ancestry to provide around the existing subtree.
 */
export function useBlockDropEdges({ placement, axis, outline, size }: BlockDropEdgesOptions) {
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
  const regions = useMemo<readonly BlockDropRegion[]>(() => {
    const destinations: BlockDropDestination[] = [...ancestors, after];
    if (outline) {
      destinations.push({ kind: "inside", parentId: blockId });
    }
    const trailing = outline ? { destinations, ancestors: ancestors.length } : undefined;
    return blockDropEdges(placement, axis, trailing, size);
  }, [parentId, previousId, blockId, nextId, axis, after, ancestors, outline, size]);
  return { regions, depth };
}

/**
 * Maps canonical placement to declared logical boundaries without reading DOM.
 *
 * @param placement - Real parent and adjacent canonical IDs.
 * @param axis - Linear flow or wrapping grid boundaries.
 * @param depth - Optional nesting choices on the trailing flow edge.
 * @param size - Optional local CSS-pixel thickness, inherited when omitted.
 * @returns Before/after declarations, empty for projected lists with no real parent.
 */
function blockDropEdges(
  placement: BlockChildPlacement,
  axis: BlockDropEdgesOptions["axis"],
  depth?: BlockDropEdgeRegion["depth"],
  size?: number,
): readonly BlockDropRegion[] {
  const { parentId, previousId, blockId, nextId } = placement;
  if (parentId === undefined) {
    return [];
  }
  const before = { kind: "between" as const, parentId, previousId, nextId: blockId };
  const after = { kind: "between" as const, parentId, previousId: blockId, nextId };
  const regions: BlockDropRegion[] = [];
  if (axis !== "horizontal") {
    regions.push(
      { kind: "edge", side: "block-start", size, destination: before },
      { kind: "edge", side: "block-end", size, destination: after, depth },
    );
  }
  if (axis !== "vertical") {
    regions.push(
      { kind: "edge", side: "inline-start", size, destination: before },
      {
        kind: "edge",
        side: "inline-end",
        size,
        destination: after,
        depth: axis === "horizontal" ? depth : undefined,
      },
    );
  }
  return regions;
}
