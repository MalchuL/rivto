import { Slot } from "radix-ui";
import type { HTMLAttributes, ReactElement } from "react";
import { BLOCK_DROP_EXCLUDE_ATTRIBUTE } from "../../editor/drag-and-drop/block-drop-attributes";

/** Explicit exclusion composed onto one existing element without registering a target. */
export interface BlockDropExcludeProps extends HTMLAttributes<HTMLElement> {
  readonly asChild: true;
  /** Defaults to true; false removes this boundary without declaring a new drop region. */
  readonly exclude?: boolean;
  readonly children: ReactElement;
}

/**
 * Bounds drop discovery at an existing element without adding DOM.
 *
 * No editor instance or subscription is borrowed. The child keeps its own ref,
 * handlers and layout. A matching descendant drop region remains eligible; otherwise
 * exclusion prevents fallback to an enclosing target. Exclusion wins on its own
 * element and does not prevent clicks, editing or starting other gestures.
 *
 * @param props - Existing element and native attributes composed onto it.
 * @param props.asChild - Required true; the primitive never creates a wrapper.
 * @param props.exclude - Whether this declaration excludes drops; defaults to true.
 * @param props.children - Single element forwarding attributes to its DOM host.
 * @returns The same element with an explicit exclusion marker while enabled.
 * @throws If asChild is not true or the child cannot be composed by Radix Slot.
 */
export function BlockDropExclude({
  asChild,
  exclude = true,
  children,
  ...attributes
}: BlockDropExcludeProps) {
  if (!asChild) {
    throw new Error("BlockDropExclude requires asChild and an existing element");
  }
  return (
    <Slot.Root {...attributes} {...{ [BLOCK_DROP_EXCLUDE_ATTRIBUTE]: exclude ? "" : undefined }}>
      {children}
    </Slot.Root>
  );
}
