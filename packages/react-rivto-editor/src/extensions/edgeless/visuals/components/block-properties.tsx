/**
 * Property editor for selected edgeless block cards.
 *
 * Block cards reuse the same right-side panel chrome as visual elements while
 * persisting layout behavior through their existing opaque element props.
 */
import type { EditorElement } from "@chulane/rivto";
import { useId } from "react";
import { Checkbox } from "../../../../components/ui/checkbox";
import { Label } from "../../../../components/ui/label";
import type { EdgelessVisualController } from "../controller";
import { EdgelessPropertiesPanel, PropertyGroup, PropertyRow } from "./properties-panel";

const AUTO_HEIGHT_FIELD_CLASS = "flex items-center gap-2";
const AUTO_HEIGHT_INPUT_CLASS = "edgeless-block-auto-height";
const AUTO_HEIGHT_LABEL_CLASS = "text-xs font-normal text-secondary-foreground";

/**
 * Edits layout behavior shared by one or more selected block cards.
 *
 * @param props - Selected cards and their owning edgeless controller.
 * @returns The shared right-side properties panel.
 */
export function BlockProperties({
  elements,
  controller,
}: {
  readonly elements: readonly EditorElement[];
  readonly controller: EdgelessVisualController;
}) {
  const ids = elements.map((element) => element.id);
  const autoHeight = elements.every((element) => element.props.autoHeight !== false);
  const autoHeightId = useId();
  return (
    <EdgelessPropertiesPanel
      title="Block card"
      count={elements.length}
      ariaLabel="Block properties"
      onClose={() => controller.reactEditor.commands.execute("edgeless.selection.clear")}
    >
      <PropertyGroup title="Layout">
        <PropertyRow label="Height">
          <div className={AUTO_HEIGHT_FIELD_CLASS}>
            <Checkbox
              id={autoHeightId}
              className={AUTO_HEIGHT_INPUT_CLASS}
              aria-label="Automatic card height"
              checked={autoHeight}
              onCheckedChange={(checked) => controller.setBlockAutoHeight(ids, checked === true)}
            />
            <Label htmlFor={autoHeightId} className={AUTO_HEIGHT_LABEL_CLASS}>Automatic</Label>
          </div>
        </PropertyRow>
      </PropertyGroup>
    </EdgelessPropertiesPanel>
  );
}
