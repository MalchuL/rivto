import { BLOCK_EDITOR_CLASSES } from "../block-editor-classes";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import type { BlockSlotProps } from "./types";

/** Shared public geometry overrides shadcn defaults; theme resizing does not animate layout. */
const BLOCK_CONTROL_CLASS_NAME =
  "page:size-[var(--rivto-block-control-size,20px)] page:p-0 page:m-0 page:transition-colors";

/**
 * Displays a live checkbox or a CSS-counter marker independently of content type.
 *
 * Checkbox writes go through the borrowed node. Numbers are derived by structural
 * CSS counters; they are not stored on nodes or projected by scanning sibling data.
 *
 * @param props - Current owner snapshot and its live node commands.
 * @param props.block - Snapshot selecting the marker type and checkbox state.
 * @param props.node - ID-bound commands delegated to the host mutation boundary.
 * @returns Checkbox, numbered marker, or null for an ordinary/absent list mode.
 * @throws Propagates host mutation failures from checkbox activation.
 */
export function BlockListSlot({ block, node }: BlockSlotProps) {
  if (block.listType === "checkbox") {
    return (
      <Checkbox
        className={BLOCK_CONTROL_CLASS_NAME}
        data-block-control="checkbox"
        aria-label={`Check ${block.id}`}
        checked={block.checked === true}
        onPointerDown={(event) => event.stopPropagation()}
        onCheckedChange={(checked) => node.setChecked(checked === true)}
      />
    );
  }
  if (
    block.listType === "numbered_list" ||
    block.listType === "start_numbered_list" ||
    block.listType === "continue_numbered_list"
  ) {
    return (
      <span
        className={BLOCK_EDITOR_CLASSES.marker}
        data-list-marker={block.listType}
        aria-hidden="true"
      />
    );
  }
  return null;
}

/**
 * Displays an accessible collapse toggle for an owner with direct children.
 *
 * Activation reads the live flag instead of toggling a captured snapshot. Pointer
 * activation preserves existing text focus; keyboard activation remains native.
 *
 * @param props - Current owner, commands, and occurrence-local child container ID.
 * @param props.block - Own snapshot determining whether the control is present.
 * @param props.node - Live collapse state and host-delegated mutation command.
 * @param props.childrenId - Controlled child container, retained while collapsed.
 * @returns A collapse button for a branch, or null for a leaf.
 * @throws Propagates host mutation failures from activation.
 */
export function BlockCollapseSlot({ block, node, childrenId }: BlockSlotProps) {
  if (!block.childIds.length) {
    return null;
  }
  const collapsed = block.collapsed === true;
  return (
    <Button
      variant="ghost"
      size="icon"
      className={BLOCK_CONTROL_CLASS_NAME}
      type="button"
      data-block-control="collapse"
      aria-label={`${collapsed ? "Expand" : "Collapse"} ${block.id}`}
      aria-expanded={!collapsed}
      aria-controls={childrenId}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={() => node.setCollapsed(node.collapsed !== true)}
    >
      <span aria-hidden="true">{collapsed ? "▸" : "▾"}</span>
    </Button>
  );
}
