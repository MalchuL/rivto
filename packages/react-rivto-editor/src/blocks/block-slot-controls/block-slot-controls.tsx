/**
 * Built-in list and collapse contributions for the shared block left slot.
 *
 * These controls interpret extension-owned list properties but do not own
 * traversal or persistence. BlockTree remains responsible for descendants,
 * while the editor manager supplies transactional mutations for the current row.
 * The public `.page-list-checkbox`, `.page-list-marker`, and
 * `.page-collapse-toggle` classes remain stable slot-geometry hooks styled in
 * `block-slot-controls.css`; presentation uses shadcn/ui primitives.
 *
 * @module
 */
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useBlockNode } from "../../hooks";
import type { BlockSlotProps } from "../../managers";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { cn } from "cn";

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
  const { operations } = useBlockNode(block.id);

  if (block.listProps.type === "checkbox") {
    return (
      <Checkbox
        className={cn(LIST_CHECKBOX_CLASS, "size-[18px] rounded-[5px]")}
        aria-label={`Mark block as ${block.listProps.checked ? "incomplete" : "complete"}: ${block.content || block.type}`}
        checked={block.listProps.checked === true}
        onPointerDown={(event) => event.stopPropagation()}
        onCheckedChange={(checked) => operations.update({ listProps: { checked: checked === true } })}
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
  const { operations } = useBlockNode(block.id);
  if (!block.childIds.length) return null;
  const childrenId = `block-children-${block.id}`;
  const collapsed = block.listProps.collapsed === true;
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className={cn(COLLAPSE_TOGGLE_CLASS, "h-6 w-5 rounded text-muted-foreground select-none hover:bg-transparent hover:text-foreground")}
      data-collapse-toggle="true"
      aria-label={`${collapsed ? "Expand" : "Collapse"} block: ${block.content || block.type}`}
      aria-expanded={!collapsed}
      aria-controls={childrenId}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={() => operations.update({ listProps: { collapsed: !collapsed } })}
    >
      {collapsed ? <ChevronRightIcon aria-hidden="true" /> : <ChevronDownIcon aria-hidden="true" />}
    </Button>
  );
}
