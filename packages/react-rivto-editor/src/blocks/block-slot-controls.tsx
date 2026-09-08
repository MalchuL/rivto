/**
 * Built-in list and collapse contributions for the shared block left slot.
 *
 * These controls interpret extension-owned list properties but do not own
 * traversal or persistence. BlockTree remains responsible for descendants,
 * while useBlock supplies transactional mutations for the current row.
 *
 * @module
 */
import { resolveBlockListNumbers } from "../extensions/page/list-properties";
import { useBlock, useReactEditor } from "../hooks";
import type { BlockSlotProps } from "../managers";

const LIST_CHECKBOX_CLASS = "page-list-checkbox";
const LIST_MARKER_CLASS = "page-list-marker";
const COLLAPSE_TOGGLE_CLASS = "page-collapse-toggle";

/**
 * Renders a checkbox or resolved number for one list-decorated block.
 *
 * @param props - Current block-slot context.
 * @returns Interactive checkbox, numeric marker, or nothing for ordinary lists.
 */
export function BlockListSlot({ block }: BlockSlotProps) {
  const { operations } = useBlock(block.id);
  const reactEditor = useReactEditor();
  const parentId = reactEditor.editor.blocks.getParentId(block.id);
  const siblingIds = parentId === null
    ? reactEditor.editor.blocks.getRootIds()
    : parentId === undefined ? [] : reactEditor.editor.blocks.getChildIds(parentId);
  const siblings = siblingIds.flatMap((id) => {
    const sibling = reactEditor.editor.blocks.getBlock(id);
    return sibling ? [sibling] : [];
  });
  const listNumber = resolveBlockListNumbers(siblings).get(block.id);

  if (block.listProps.type === "checkbox") {
    return (
      <input
        type="checkbox"
        className={LIST_CHECKBOX_CLASS}
        aria-label={`Mark block as ${block.listProps.checked ? "incomplete" : "complete"}: ${block.content || block.type}`}
        checked={block.listProps.checked === true}
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => operations.update({ listProps: { checked: event.currentTarget.checked } })}
      />
    );
  }
  return listNumber === undefined ? null : (
    <span className={LIST_MARKER_CLASS} aria-hidden="true">
      {listNumber}.
    </span>
  );
}

/**
 * Renders the accessible expand/collapse button for a block with descendants.
 *
 * @param props - Current block-slot context.
 * @returns Collapse toggle for a branch block, otherwise nothing.
 */
export function BlockCollapseSlot({ block }: BlockSlotProps) {
  const { operations } = useBlock(block.id);
  if (!block.children.length) return null;
  const childrenId = `block-children-${block.id}`;
  return (
    <button
      type="button"
      className={COLLAPSE_TOGGLE_CLASS}
      data-collapse-toggle="true"
      aria-label={`${block.listProps.collapsed === true ? "Expand" : "Collapse"} block: ${block.content || block.type}`}
      aria-expanded={block.listProps.collapsed !== true}
      aria-controls={childrenId}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={() => operations.update({ listProps: { collapsed: block.listProps.collapsed !== true } })}
    >
      {block.listProps.collapsed === true ? "▸" : "▾"}
    </button>
  );
}
