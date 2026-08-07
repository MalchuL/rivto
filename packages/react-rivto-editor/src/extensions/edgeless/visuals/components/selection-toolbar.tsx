import type { EdgelessVisualController } from "../controller";
import { EdgelessToolButton } from "./tool-button";

const alignments = [
  ["left", "Align left", "align-left"],
  ["center", "Align horizontal centers", "align-center"],
  ["right", "Align right", "align-right"],
  ["top", "Align top", "align-top"],
  ["middle", "Align vertical centers", "align-middle"],
  ["bottom", "Align bottom", "align-bottom"],
] as const;

/** Actions for the current multi-object canvas selection. */
export function SelectionToolbar({
  controller,
  items,
}: {
  controller: EdgelessVisualController;
  items: readonly string[];
}) {
  const execute = (name: string, payload?: unknown) => controller.reactEditor.editor.execute(name, payload);
  return (
    <div className="edgeless-selection-toolbar" data-edgeless-ui="true" role="toolbar" aria-label="Selected objects">
      {items.length > 1 && <EdgelessToolButton label="Group" icon="group" onClick={() => execute("edgeless.selection.group")} />}
      {items.some((id) => controller.reactEditor.editor.elements.getElement(id)?.type === "group") && (
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
