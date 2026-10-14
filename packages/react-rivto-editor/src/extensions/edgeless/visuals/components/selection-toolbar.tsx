/**
 * Floating action bar for the current multi-object canvas selection.
 *
 * Sits above the create toolbar and exposes grouping, alignment,
 * distribution, and z-order commands through `EdgelessToolButton`s. Every
 * action is dispatched as an editor command so undo and collaboration see one
 * transaction per click.
 */
import { UI_SCOPE_CLASS } from "../../../../components/ui-scope";
import type { EdgelessOperations } from "../../../../managers/elements/edgeless-operations";
import { EdgelessToolButton } from "../../../../components/edgeless/tool-button";

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
 * @param props - The edgeless operations and the selected element IDs.
 * @returns A toolbar region, or one with only reorder actions for a single item.
 */
export function SelectionToolbar({
  edgelessOperation,
  items,
}: {
  readonly edgelessOperation: EdgelessOperations;
  readonly items: readonly string[];
}) {
  return (
    <div
      className={SELECTION_TOOLBAR_CLASS}
      data-edgeless-ui="true"
      role="toolbar"
      aria-label="Selected objects"
    >
      {items.length > 1 && (
        <EdgelessToolButton label="Group" icon="group" onClick={() => edgelessOperation.group()} />
      )}
      {items.some((id) => edgelessOperation.elements.getElementNode(id)?.type === "group") && (
        <EdgelessToolButton
          label="Ungroup"
          icon="ungroup"
          onClick={() => edgelessOperation.ungroup()}
        />
      )}
      {items.length > 1 &&
        alignments.map(([alignment, label, icon]) => (
          <EdgelessToolButton
            key={alignment}
            label={label}
            icon={icon}
            onClick={() => edgelessOperation.align(alignment)}
          />
        ))}
      {items.length > 2 && (
        <>
          <EdgelessToolButton
            label="Distribute horizontally"
            icon="distribute-h"
            onClick={() => edgelessOperation.distribute("horizontal")}
          />
          <EdgelessToolButton
            label="Distribute vertically"
            icon="distribute-v"
            onClick={() => edgelessOperation.distribute("vertical")}
          />
        </>
      )}
      {(["front", "forward", "backward", "back"] as const).map((direction) => (
        <EdgelessToolButton
          key={direction}
          label={`Move ${direction}`}
          icon={direction}
          onClick={() => edgelessOperation.reorder(direction)}
        />
      ))}
    </div>
  );
}
