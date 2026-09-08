/**
 * Property editor for selected edgeless block cards.
 *
 * Block cards reuse the same right-side panel chrome as visual elements while
 * persisting layout behavior through their existing opaque element props.
 */
import type { EditorElement } from "@chulane/rivto";
import type { EdgelessVisualController } from "../controller";
import { EdgelessPropertiesPanel, PropertyGroup, PropertyRow } from "./properties-panel";

const AUTO_HEIGHT_INPUT_CLASS = "edgeless-block-auto-height";

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
  return (
    <EdgelessPropertiesPanel
      title="Block card"
      count={elements.length}
      ariaLabel="Block properties"
      onClose={() => controller.reactEditor.editor.execute("edgeless.selection.clear")}
    >
      <PropertyGroup title="Layout">
        <PropertyRow label="Height">
          <label>
            <input
              className={AUTO_HEIGHT_INPUT_CLASS}
              type="checkbox"
              aria-label="Automatic card height"
              checked={autoHeight}
              onChange={(event) => controller.setBlockAutoHeight(ids, event.currentTarget.checked)}
            />
            Automatic
          </label>
        </PropertyRow>
      </PropertyGroup>
    </EdgelessPropertiesPanel>
  );
}
