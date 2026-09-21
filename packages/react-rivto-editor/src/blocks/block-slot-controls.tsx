/**
 * Built-in list and collapse contributions for the shared block left slot.
 *
 * These controls interpret extension-owned list properties but do not own
 * traversal or persistence. BlockTree remains responsible for descendants,
 * while the editor manager supplies transactional mutations for the current row.
 *
 * @module
 */
import { useReactEditor } from "../hooks";
import type { BlockSlotProps } from "../managers";

const LIST_CHECKBOX_CLASS = "page-list-checkbox";
const LIST_MARKER_CLASS = "page-list-marker";
const COLLAPSE_TOGGLE_CLASS = "page-collapse-toggle";

/**
 * Renders a checkbox or CSS-counter marker for one list-decorated block.
 *
 * @param props - Current block-slot context.
 * @returns Interactive checkbox, numeric marker, or nothing for ordinary lists.
 */
export function BlockListSlot({ block }: BlockSlotProps) {
  const reactEditor = useReactEditor();

  if (block.listProps.type === "checkbox") {
    return (
      <input
        type="checkbox"
        className={LIST_CHECKBOX_CLASS}
        aria-label={`Mark block as ${block.listProps.checked ? "incomplete" : "complete"}: ${block.content || block.type}`}
        checked={block.listProps.checked === true}
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => reactEditor.blocks.updateBlock(block.id, { listProps: { checked: event.currentTarget.checked } })}
      />
    );
  }
  return (
    <span
      className={LIST_MARKER_CLASS}
      data-list-type={String(block.listProps.type)}
      aria-hidden="true"
    />
  );
}

/**
 * Renders the accessible expand/collapse button for a block with descendants.
 *
 * @param props - Current block-slot context.
 * @returns Collapse toggle for a branch block, otherwise nothing.
 */
export function BlockCollapseSlot({ block }: BlockSlotProps) {
  const reactEditor = useReactEditor();
  if (!block.childIds.length) return null;
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
      onClick={() => reactEditor.blocks.updateBlock(block.id, { listProps: { collapsed: block.listProps.collapsed !== true } })}
    >
      {block.listProps.collapsed === true ? "▸" : "▾"}
    </button>
  );
}
