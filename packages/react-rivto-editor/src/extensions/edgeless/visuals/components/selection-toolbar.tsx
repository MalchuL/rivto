/**
 * Floating action bar for the current multi-object canvas selection.
 *
 * Sits above the create toolbar and exposes grouping, alignment,
 * distribution, and z-order commands through `EdgelessToolButton`s. Every
 * action is dispatched as an editor command so undo and collaboration see one
 * transaction per click.
 */
import { UI_SCOPE_CLASS } from "../../../../components/ui-scope";
import type { EdgelessVisualController } from "../controller";
import { EdgelessToolButton } from "./tool-button";

/** Bottom-centered bar; `edgeless-selection-toolbar` is a stable hook. */
const SELECTION_TOOLBAR_CLASS = `${UI_SCOPE_CLASS} edgeless-selection-toolbar absolute bottom-[62px] left-1/2 z-21 flex max-w-[calc(100%-48px)] -translate-x-1/2 gap-[3px] overflow-x-auto rounded-xl border border-border bg-background/95 p-[5px] shadow-(--rivto-edgeless-chrome-shadow)`;

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
  readonly controller: EdgelessVisualController;
  readonly items: readonly string[];
}) {
  const execute = (name: string, payload?: unknown) => controller.reactEditor.commands.execute(name, payload);
  return (
    <div className={SELECTION_TOOLBAR_CLASS} data-edgeless-ui="true" role="toolbar" aria-label="Selected objects">
      {items.length > 1 && <EdgelessToolButton label="Group" icon="group" onClick={() => execute("edgeless.selection.group")} />}
      {items.some((id) => controller.reactEditor.elements.getElement(id)?.type === "group") && (
        <EdgelessToolButton label="Ungroup" icon="ungroup" onClick={() => execute("edgeless.selection.ungroup")} />
      )}
      {items.length > 1 && alignments.map(([alignment, label, icon]) => (
        <EdgelessToolButton key={alignment} label={label} icon={icon} onClick={() => execute("edgeless.selection.align", alignment)} />
      ))}
      {items.length > 2 && (
        <>
          <EdgelessToolButton label="Distribute horizontally" icon="distribute-h" onClick={() => execute("edgeless.selection.distribute", "horizontal")} />
          <EdgelessToolButton label="Distribute vertically" icon="distribute-v" onClick={() => execute("edgeless.selection.distribute", "vertical")} />
        </>
      )}
      {(["front", "forward", "backward", "back"] as const).map((direction) => (
        <EdgelessToolButton key={direction} label={`Move ${direction}`} icon={direction} onClick={() => execute("edgeless.selection.reorder", direction)} />
      ))}
    </div>
  );
}
