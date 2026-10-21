import { Fragment, type ReactNode } from "react";
import { BLOCK_EDITOR_CLASSES } from "../block-editor-classes";
import {
  SLOT_POSITIONS,
  type BlockSlotEntry,
  type BlockSlotPosition,
  type BlockSlotProps,
} from "./types";

/** Current bounded owner context plus a requested position and registry snapshot. */
export interface BlockSlotHostProps extends BlockSlotProps {
  readonly position: BlockSlotPosition;
  readonly entries: readonly BlockSlotEntry[];
}

/** Current bounded owner context plus main renderer output and registry snapshot. */
export interface BlockSlotsProps extends BlockSlotProps {
  readonly entries: readonly BlockSlotEntry[];
  readonly children: ReactNode;
}

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
 * @returns A start host, a populated other host, or null for an empty non-start anchor.
 * @throws Propagates predicate and contribution render failures.
 */
export function BlockSlotHost({ position, entries, ...props }: BlockSlotHostProps) {
  const matches = entries.filter(
    (entry) => entry.position === position && (!entry.when || entry.when(props)),
  );
  if (!matches.length && position !== "start") {
    return null;
  }
  return (
    <div
      className={BLOCK_EDITOR_CLASSES.slot}
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
