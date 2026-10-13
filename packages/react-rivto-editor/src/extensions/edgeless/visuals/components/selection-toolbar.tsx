/**
 * Floating action bar for the current multi-object canvas selection.
 *
 * Sits above the create toolbar and exposes grouping, alignment,
 * distribution, and z-order commands through `EdgelessToolButton`s. Every
 * action is dispatched as an editor command so undo and collaboration see one
 * transaction per click.
 */
import { UI_SCOPE_CLASS } from "../../../../components/ui-scope";
import type { EdgelessOperations } from "../../edgeless-operations";
import { EdgelessToolButton } from "./tool-button";

/** Bottom-centered bar; `edgeless-selection-toolbar` is a stable hook. */
const SELECTION_TOOLBAR_CLASS = `${UI_SCOPE_CLASS} edgeless-selection-toolbar`;

const alignments = [
  ["left", "Align left", "align-left"],
  ["center", "Align horizontal centers", "align-center"],
  ["right", "Align right", "align-right"],
  ["top", "Align top", "align-top"],
  ["middle", "Align vertical centers", "align-middle"],
  ["bottom", "Align bottom", "align-bottom"],
] as const;

/**
 * Renders actions for the current multi-object canvas selection.
 *
 * @param props - The visual controller and the selected element IDs.
 * @returns A toolbar region, or one with only reorder actions for a single item.
 */
export function SelectionToolbar({
  controller,
  items,
}: {
  readonly controller: EdgelessOperations;
  readonly items: readonly string[];
}) {
  return (
    <div className={SELECTION_TOOLBAR_CLASS} data-edgeless-ui="true" role="toolbar" aria-label="Selected objects">
      {items.length > 1 && <EdgelessToolButton label="Group" icon="group" onClick={() => controller.group()} />}
      {items.some((id) => controller.elements.getElementNode(id)?.type === "group") && (
        <EdgelessToolButton label="Ungroup" icon="ungroup" onClick={() => controller.ungroup()} />
      )}
      {items.length > 1 && alignments.map(([alignment, label, icon]) => (
        <EdgelessToolButton key={alignment} label={label} icon={icon} onClick={() => controller.align(alignment)} />
      ))}
      {items.length > 2 && (
        <>
          <EdgelessToolButton label="Distribute horizontally" icon="distribute-h" onClick={() => controller.distribute("horizontal")} />
          <EdgelessToolButton label="Distribute vertically" icon="distribute-v" onClick={() => controller.distribute("vertical")} />
        </>
      )}
      {(["front", "forward", "backward", "back"] as const).map((direction) => (
        <EdgelessToolButton key={direction} label={`Move ${direction}`} icon={direction} onClick={() => controller.reorder(direction)} />
      ))}
    </div>
  );
}
