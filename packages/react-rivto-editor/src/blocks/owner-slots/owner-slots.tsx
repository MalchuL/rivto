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
import type { EditorBlockNode, EditorElement } from "@chulane/rivto";
import { Fragment, type ComponentType, type ReactNode } from "react";
import { useReactEditor } from "../../hooks";
import {
  SLOT_POSITIONS,
  type BlockSlotPosition,
  type BlockSlotProps,
  type ElementSlotProps,
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
 * Renders the main content and registered controls inside a block's row.
 *
 * The caller places this component inside `.page-block-row`. The `start` slot
 * precedes the supplied content, the `end` slot follows it, and perimeter slots
 * provide controls around the row, such as a drag handle or settings button.
 * Components are resolved through SurfaceManager for the surrounding surface.
 *
 * This component does not render the `body` slot or the block's child blocks.
 * Those appear below the row; {@link BlockBodySlot} renders the body separately.
 * `children` here is the main renderer output, not the persisted child blocks.
 *
 * @param props - Current block snapshot, selection presentation, and renderer output.
 * @param props.block - Current snapshot of the block that owns these slots.
 * @param props.selected - Whether the owner is selected, passed to slot components and filters.
 * @param props.children - Main block content to place between the start and end slots.
 * @returns Ordered row content and every populated row-slot host.
 * @throws If called outside an EditorView subtree.
 */
export function BlockSlots({
  block,
  selected,
  children,
}: {
  readonly block: EditorBlockNode;
  readonly selected: boolean;
  readonly children: ReactNode;
}) {
  const reactEditor = useReactEditor();
  const mode = useContext(SurfaceContext);
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
 * Renders registered `body` content below a block's row, before its child blocks.
 *
 * The BlockTree component mounts this separately from {@link BlockSlots}, outside
 * the row controls and structural selection anchor. For example, embedding uses
 * this slot for its nested PageSurface, while its reference anchor and settings
 * button remain in the row. This placement keeps the nested editor outside the
 * parent row's selection region; event handling belongs to that nested view.
 *
 * SurfaceManager resolves the registered body components for the surrounding
 * surface. This component does not render persisted child blocks or decide
 * whether they are collapsed; the block tree renders those after this slot.
 *
 * @param props - Owning block snapshot and current selection presentation.
 * @param props.block - Current snapshot of the block that owns the body slot.
 * @param props.selected - Whether the owner is selected, passed to slot components and filters.
 * @returns A body-slot host that renders registered components, or nothing when the slot is empty.
 * @throws If called outside an EditorView subtree.
 */
export function BlockBodySlot({ block, selected }: Omit<BlockSlotProps, "mode">) {
  const reactEditor = useReactEditor();
  const mode = useContext(SurfaceContext);
  const props = { block, mode, selected };
  return <SlotHost
    owner="block"
    position="body"
    components={reactEditor.surfaces.getBlockSlots("body", props)}
    props={props}
  />;
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
  const mode = useContext(SurfaceContext);
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
