import type { ReactElement } from "react";
import { BlockDropTarget } from "../../drag-and-drop/block-drop-target";
import { useBlockRootPlacement } from "../../drag-and-drop/block-root-node";

/** Canonical identity of the final root displayed by this occurrence. */
export interface BlockEditorEndProps {
  readonly blockId: string | undefined;
  /** Existing ref-forwarding trailing element whose own layout supplies the hit area. */
  readonly children: ReactElement;
}

/**
 * Declares end insertion on an existing trailing element without adding layout.
 *
 * The host owns whether a trailing area exists and its dimensions. The destination
 * follows actual siblings, so a projected view cannot accidentally append to the
 * document or skip a hidden next sibling. No block DOM is required; the shared
 * placement hook owns addressed subscriptions and their cleanup. Virtual reserves
 * remain owned by the tree and precede the host's trailing element.
 *
 * @param props - Last displayed root and the host-owned trailing presentation.
 * @param props.blockId - Root whose canonical trailing boundary receives insertion; undefined disables dropping while preserving the child in an empty view.
 * @param props.children - One existing ref-forwarding element, rendered once with its dimensions unchanged.
 * @returns The same child with a full-bounds insertion declaration and top-edge feedback; absent placements disable dropping.
 * @throws If outside an editor, delegated placement reads or child ref composition fail.
 */
export function BlockEditorEnd({ blockId, children }: BlockEditorEndProps) {
  const placement = useBlockRootPlacement(blockId);
  return (
    <BlockDropTarget
      asChild
      regions={
        placement
          ? [
              {
                kind: "edge",
                side: "block-start",
                coverage: "bounds",
                destination: {
                  kind: "between",
                  parentId: placement.parentId ?? null,
                  previousId: placement.blockId,
                  nextId: placement.nextId,
                },
              },
            ]
          : []
      }
    >
      {children}
    </BlockDropTarget>
  );
}
