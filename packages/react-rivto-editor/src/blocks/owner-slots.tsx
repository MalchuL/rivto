/**
 * Shared ordered slot hosts for block rows and first-class canvas elements.
 *
 * The hosts add only absolutely positioned presentation containers. Extension
 * registrations remain in SurfaceManager so their lifecycle, mode filtering,
 * and invalidation match the surfaces that render them.
 *
 * @module
 */
import type { EditorBlock, EditorElement } from "@chulane/rivto";
import { Fragment, type ComponentType, type ReactNode } from "react";
import { useEditorMode, useReactEditor } from "../hooks";
import {
  SLOT_POSITIONS,
  type BlockSlotPosition,
  type BlockSlotProps,
  type ElementSlotProps,
} from "../managers";

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
  readonly components: readonly ComponentType<Props>[];
  readonly props: Props;
}) {
  if (!components.length) return null;
  return (
    <div
      className={SLOT_CLASS}
      data-slot-owner={owner}
      data-slot-position={position}
    >
      {components.map((Component, index) => (
        <Fragment key={`${(Component.displayName ?? Component.name) || "slot"}-${index}`}>
          <Component {...props} />
        </Fragment>
      ))}
    </div>
  );
}

/**
 * Renders one block's content between its logical slots plus perimeter hosts.
 *
 * @param props - Current block snapshot, selection presentation, and renderer output.
 * @returns Ordered row content and every populated block-slot host.
 */
export function BlockSlots({
  block,
  selected,
  children,
}: {
  readonly block: EditorBlock;
  readonly selected: boolean;
  readonly children: ReactNode;
}) {
  const reactEditor = useReactEditor();
  const { mode } = useEditorMode();
  const slotProps: BlockSlotProps = { block, mode, selected };
  return <>
    <SlotHost
      owner="block"
      position="start"
      components={reactEditor.surfaces.getBlockSlots("start", slotProps)}
      props={slotProps}
    />
    {children}
    <SlotHost
      owner="block"
      position="end"
      components={reactEditor.surfaces.getBlockSlots("end", slotProps)}
      props={slotProps}
    />
    {SLOT_POSITIONS.map((position) => (
      <SlotHost
        key={position}
        owner="block"
        position={position}
        components={reactEditor.surfaces.getBlockSlots(position, slotProps)}
        props={slotProps}
      />
    ))}
  </>;
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
  readonly element: EditorElement;
  readonly selected: boolean;
}) {
  const reactEditor = useReactEditor();
  const { mode } = useEditorMode();
  const slotProps: ElementSlotProps = { element, mode, selected };
  return <>{SLOT_POSITIONS.map((position) => (
    <SlotHost
      key={position}
      owner="element"
      position={position}
      components={reactEditor.surfaces.getElementSlots(position, slotProps)}
      props={slotProps}
    />
  ))}</>;
}
