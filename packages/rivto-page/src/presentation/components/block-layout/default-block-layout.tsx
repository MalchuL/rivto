import { BlockRow } from "./block-row";
import { BlockBody } from "./block-body";
import { BlockContent } from "./block-content";
import { BlockChildren } from "./block-children";
import { BLOCK_EDITOR_CLASSES } from "../../block-editor-classes";

/**
 * Composes the standard outline while custom layouts may arrange the same primitives freely.
 *
 * Outline indentation belongs to this layout, not the shared child-list primitive.
 *
 * @returns The standard row, body contributions, and indented child group.
 */
export function DefaultBlockLayout() {
  return (
    <>
      <BlockRow>
        <BlockContent />
      </BlockRow>
      <BlockBody />
      <BlockChildren
        className={BLOCK_EDITOR_CLASSES.outline}
        dropScope="outline"
        renderEmpty={false}
        hoverBoundary={false}
      />
    </>
  );
}
