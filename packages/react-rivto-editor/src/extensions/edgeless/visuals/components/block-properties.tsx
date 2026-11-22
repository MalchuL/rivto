/**
 * Property editor for selected edgeless block cards.
 *
 * Block cards reuse the same right-side panel chrome as visual elements while
 * persisting layout behavior through their existing opaque element props.
 */
import type { EditorElementNode } from "@chulane/rivto";
import { useCallback, useId, useSyncExternalStore } from "react";
import { Checkbox } from "../../../../components/ui/checkbox";
import { Label } from "../../../../components/ui/label";
import { editorControlProps } from "../../../../constants";
import type { EdgelessOperations } from "../../../../managers/elements/edgeless-operations";
import { blockIdsOf } from "../../../../elements/block-element-projection";
import { useRootBlockIds } from "../../../../hooks";
import { useHasSingleNonDefaultWritingRoot } from "../../../../surfaces/edgeless/use-single-non-default-writing-root";
import {
  EdgelessPropertiesPanel,
  PropertyGroup,
  PropertyRow,
} from "../../../../components/edgeless/properties-panel";

const AUTO_HEIGHT_FIELD_CLASS = "flex items-center gap-2";
const AUTO_HEIGHT_INPUT_CLASS = "edgeless-block-auto-height";
const AUTO_HEIGHT_LABEL_CLASS = "text-xs font-normal text-secondary-foreground";

/**
 * Edits layout behavior shared by one or more selected block cards.
 *
 * @param props - Selected cards and their owning edgeless edgeless operations.
 * @returns The shared right-side properties panel.
 */
export function BlockProperties({
  elements,
  edgelessOperation,
}: {
  readonly elements: readonly EditorElementNode[];
  readonly edgelessOperation: EdgelessOperations;
}) {
  const ids = elements.map((element) => element.id);
  const autoHeight = elements.every((element) => element.props.autoHeight !== false);
  const autoHeightId = useId();
  const borderlessId = useId();
  const selectedId = elements.length === 1 ? elements[0]?.id : undefined;
  const subscribe = useCallback(
    (listener: () => void) => edgelessOperation.elements.subscribe(listener),
    [edgelessOperation],
  );
  const getElement = useCallback(
    () => (selectedId ? edgelessOperation.elements.getElementNode(selectedId) : undefined),
    [edgelessOperation, selectedId],
  );
  const selected = useSyncExternalStore(subscribe, getElement, getElement);
  const rootIds = useRootBlockIds();
  const blockIds = selected ? blockIdsOf(selected, rootIds) : [];
  const defaultBorderless = useHasSingleNonDefaultWritingRoot(blockIds);
  const borderless = (selected?.props.borderless ?? defaultBorderless) === true;
  return (
    <EdgelessPropertiesPanel
      title="Block card"
      count={elements.length}
      ariaLabel="Block properties"
      onClose={() => edgelessOperation.clearSelection()}
    >
      <PropertyGroup title="Layout">
        {selected && blockIds.length === 1 && (
          <PropertyRow label="Border">
            <div className={AUTO_HEIGHT_FIELD_CLASS}>
              <Checkbox
                {...editorControlProps}
                id={borderlessId}
                aria-label="Borderless card"
                checked={borderless}
                onCheckedChange={(checked) =>
                  edgelessOperation.elements.updateElement(selected.id, {
                    props: { borderless: checked === true },
                  })
                }
              />
              <Label htmlFor={borderlessId} className={AUTO_HEIGHT_LABEL_CLASS}>
                Borderless
              </Label>
            </div>
          </PropertyRow>
        )}
        <PropertyRow label="Height">
          <div className={AUTO_HEIGHT_FIELD_CLASS}>
            <Checkbox
              {...editorControlProps}
              id={autoHeightId}
              className={AUTO_HEIGHT_INPUT_CLASS}
              aria-label="Automatic card height"
              checked={autoHeight}
              onCheckedChange={(checked) =>
                edgelessOperation.setBlockAutoHeight(ids, checked === true)
              }
            />
            <Label htmlFor={autoHeightId} className={AUTO_HEIGHT_LABEL_CLASS}>
              Automatic
            </Label>
          </div>
        </PropertyRow>
      </PropertyGroup>
    </EdgelessPropertiesPanel>
  );
}
