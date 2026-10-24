import { BLOCK_EDITOR_CLASSES } from "../../block-editor-classes";
import { BlockDropTarget } from "../../drag-and-drop/block-drop-target";
import { useBlockRootPlacement } from "../../drag-and-drop/block-root-node";

/** Canonical identity of the final root displayed by this occurrence. */
export interface BlockEditorEndProps {
  readonly blockId: string;
}

/**
 * Keeps a full-height insertion area after the forest, including virtual reserved space.
 *
 * The destination follows actual siblings, so a projected view cannot accidentally
 * append to the document or skip a hidden next sibling. No block DOM is required;
 * the shared placement hook owns addressed subscriptions and their cleanup.
 *
 * @param props - Last displayed root, independent of the mounted virtual window.
 * @param props.blockId - Root whose canonical trailing boundary receives the insertion.
 * @returns Theme-sized ending space with feedback on its top edge; absent placements disable dropping.
 * @throws If outside an editor or delegated placement reads fail.
 */
export function BlockEditorEnd({ blockId }: BlockEditorEndProps) {
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
                  previousId: blockId,
                  nextId: placement.nextId,
                },
              },
            ]
          : []
      }
    >
      <div className={BLOCK_EDITOR_CLASSES.end} />
    </BlockDropTarget>
  );
}
