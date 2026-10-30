import { useContext } from "react";
import { SurfaceContext } from "../../surfaces/surface";
/**
 * Shared ordered slot hosts for block rows and first-class canvas elements.
 *
 * The hosts add perimeter overlays or in-flow row and body containers. Extension
 * registrations remain in SurfaceManager so their lifecycle, mode filtering,
 * and invalidation match the surfaces that render them.
 *
 * Slot filtering uses SurfaceContext rather than useEditorMode: an embedding
 * can render a PageSurface while its document editor is in edgeless mode.
 * Here `mode` describes the surface displaying the owner, so page slots remain
 * active inside that embedding instead of inheriting the editor's canvas slots.
 *
 * @module
 */
import type { EditorElementNode } from "@chulane/rivto";
import { Fragment } from "react";
import { useReactPanel } from "../../hooks";
import {
  SLOT_POSITIONS,
  type BlockSlotPosition,
  type ElementSlotProps,
  type ResolvedSlot,
} from "../../managers";

const SLOT_CLASS = "rivto-slot";

/** Renders resolved components inside one public owner-slot host. */
function SlotHost<Props extends object>({
  owner,
  position,
  components,
  props,
}: {
  readonly owner: "block" | "element";
  readonly position: BlockSlotPosition;
  readonly components: readonly ResolvedSlot<Props>[];
  readonly props: Props;
}) {
  if (!components.length) {
    return null;
  }
  return (
    <div className={SLOT_CLASS} data-slot-owner={owner} data-slot-position={position}>
      {components.map(({ id, component: Component }) => (
        <Fragment key={id}>
          <Component {...props} />
        </Fragment>
      ))}
    </div>
  );
}

/**
 * Renders every populated slot belonging to one first-class canvas element.
 *
 * @param props - Current element snapshot and selection presentation.
 * @returns Layout-neutral populated slot hosts.
 */
export function ElementSlots({
  element,
  selected,
}: {
  readonly element: EditorElementNode;
  readonly selected: boolean;
}) {
  const reactPanel = useReactPanel();
  const mode = useContext(SurfaceContext);
  const slotProps: ElementSlotProps = { element, mode, selected };
  return (
    <>
      {SLOT_POSITIONS.map((position) => (
        <SlotHost
          key={position}
          owner="element"
          position={position}
          components={reactPanel.editor.surfaces.getElementSlotEntries(position, slotProps)}
          props={slotProps}
        />
      ))}
    </>
  );
}
