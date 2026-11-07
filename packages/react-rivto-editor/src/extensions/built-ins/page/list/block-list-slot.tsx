/**
 * Built-in list contribution for the shared block left slot.
 *
 * This control interprets extension-owned list properties but does not own
 * traversal or persistence. Page remains responsible for descendants,
 * while the editor manager supplies transactional mutations for the current row.
 * The public `.page-list-checkbox` and `.page-list-marker` classes remain stable
 * slot-geometry hooks styled in `block-slot-controls.css`; presentation uses shadcn/ui primitives.
 *
 * @module
 */
import { editorControlProps } from "../../../../constants";
import { useBlockOperations } from "../../../../hooks";
import type { BlockSlotProps } from "../../../../managers";
import { Checkbox } from "../../../../components/ui/checkbox";
import { cn } from "cn";

const LIST_CHECKBOX_CLASS = "page-list-checkbox";
const LIST_MARKER_CLASS = "page-list-marker";

/**
 * Renders a checkbox or CSS-counter marker for one list-decorated block.
 *
 * @param props - Current block-slot context.
 * @returns Interactive checkbox, numeric marker, or nothing for ordinary lists.
 */
export function BlockListSlot({ block }: BlockSlotProps) {
  const operations = useBlockOperations(block.id);

  if (block.listProps.type === "checkbox") {
    return (
      <Checkbox
        {...editorControlProps}
        className={cn(LIST_CHECKBOX_CLASS, "size-[18px] rounded-[5px]")}
        aria-label={`Mark block as ${block.listProps.checked ? "incomplete" : "complete"}: ${block.content || block.type}`}
        checked={block.listProps.checked === true}
        onPointerDown={(event) => event.stopPropagation()}
        onCheckedChange={(checked) =>
          operations.update({ listProps: { checked: checked === true } })
        }
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
