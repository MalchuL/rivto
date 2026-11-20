import { Fragment } from "react";
import { useBlockRegion } from "../components/block-layout/use-block-region";
import { useBlockLayoutState } from "../components/block-layout/block-layout-context";
import { BLOCK_EDITOR_CLASSES } from "../block-editor-classes";
import {
  SLOT_POSITIONS,
  type BlockSlotHostProps,
  type BlockSlotPlacementProps,
  type BlockSlotsProps,
} from "./types";

export type { BlockSlotHostProps, BlockSlotPlacementProps, BlockSlotsProps } from "./types";

/**
 * Renders matching contributions with registration keys independent of their index.
 *
 * Filters receive only the current owner context, without a surface mode, whole
 * editor, or panel. The host chooses which contributions to register. Neighbors
 * can be installed without remounting retained keys.
 *
 * The start host reserves the configured gutter even when its filters match no
 * controls, keeping content alignment independent of optional registrations.
 *
 * @param props - Bounded owner context, registry snapshot, and anchor.
 * @param props.position - One supported row, body, or perimeter position.
 * @param props.entries - Cached immutable registrations, already priority ordered.
 * @param props.attributes - Optional native host styles and attributes; ownership markers remain package-owned.
 * @param props.bindInput - Optional normalized input binding for this mounted slot.
 * @returns A start host, a populated other host, or null for an empty non-start anchor.
 * @throws Propagates predicate, contribution render, input binding, and cleanup failures.
 */
export function BlockSlotHost({
  position,
  entries,
  attributes,
  bindInput,
  ...props
}: BlockSlotHostProps) {
  const slotRef = useBlockRegion(
    props.block.id,
    position === "body" ? "body" : "slot",
    undefined,
    bindInput,
  );
  const matches = entries.filter(
    (entry) => entry.position === position && (!entry.when || entry.when(props)),
  );
  if (!matches.length && position !== "start") {
    return null;
  }
  return (
    <div
      {...attributes}
      ref={slotRef}
      className={[BLOCK_EDITOR_CLASSES.slot, attributes?.className].filter(Boolean).join(" ")}
      data-slot-owner="block"
      data-slot-position={position}
    >
      {matches.map(({ id, component: Component }) => (
        <Fragment key={id}>
          <Component {...props} />
        </Fragment>
      ))}
    </div>
  );
}

/**
 * Places contributions for the current block at an explicit JSX location.
 *
 * Use with BlockRow slots="manual" to avoid mounting the same contributions
 * twice. Ownership follows the block context, independently of wrapper depth.
 * Existing slot classes and CSS custom properties still control positioning.
 *
 * @param props - Requested owner-bound contribution position.
 * @param props.position - Inline, body, or perimeter anchor to mount.
 * @param props.className - Optional class for the explicit anchor's presentation.
 * @param props.style - Native styles, including position overrides when a perimeter slot is placed in flow.
 * @param props.bindInput - Optional normalized input setup for this mounted slot.
 * @returns The matching contributions, or null for an empty non-start slot.
 * @throws If outside a block layout, or contribution rendering, input binding, or cleanup fails.
 */
export function BlockSlot({ position, bindInput, ...attributes }: BlockSlotPlacementProps) {
  return (
    <BlockSlotHost
      {...useBlockLayoutState()}
      position={position}
      bindInput={bindInput}
      attributes={attributes}
    />
  );
}

/**
 * Composes in-flow start/end controls around content and perimeter controls around its row.
 *
 * The body slot is deliberately rendered outside this row, before document children.
 * No per-position subscription is installed; all hosts share one owner registry read.
 *
 * @param props - Current bounded owner, registry snapshot, and main renderer output.
 * @param props.children - Content placed between start and end slots.
 * @returns Row contents and all populated perimeter hosts without an outer wrapper.
 */
export function BlockSlots({ children, ...props }: BlockSlotsProps) {
  return (
    <>
      <BlockSlotHost {...props} position="start" />
      {children}
      <BlockSlotHost {...props} position="end" />
      {SLOT_POSITIONS.map((position) => (
        <BlockSlotHost {...props} key={position} position={position} />
      ))}
    </>
  );
}
