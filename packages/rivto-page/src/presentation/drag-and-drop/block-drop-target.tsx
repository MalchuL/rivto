import { Slot } from "radix-ui";
import { useCallback, useLayoutEffect, useRef, type HTMLAttributes } from "react";
import { useBlockEditorController } from "../hooks/use-block-editor-controller";
import type { BlockDropDestination } from "../../editor/drag-and-drop/types";

/** Declarative destination attached to a wrapper or an existing child element. */
export interface BlockDropTargetProps extends HTMLAttributes<HTMLDivElement> {
  readonly destination: BlockDropDestination;
  readonly priority?: number;
  /** Optional insertion-line orientation through a between region; does not change hit geometry. */
  readonly indicatorAxis?: "horizontal" | "vertical";
  /** Composes attributes and ref onto one child instead of adding a wrapper. */
  readonly asChild?: boolean;
}

/**
 * Declares a mounted hover region without implementing gestures or document mutations.
 *
 * The committed destination stays live without reinstalling the DOM registration.
 * asChild uses Radix ref composition so the child's own measurement ref is preserved.
 * No drop handlers, dimensions, or synthetic block identities are added.
 *
 * @param props - Native attributes, destination, priority, and region contents.
 * @param props.destination - Real parent or canonical child gap checked at resolution.
 * @param props.priority - Finite overlap priority, default zero.
 * @param props.indicatorAxis - Optional line orientation; omitted regions retain outline feedback.
 * @param props.asChild - Attach to an existing child element when true.
 * @param props.children - Target contents, or exactly one ref-forwarding child with asChild.
 * @returns A registered div or the composed child element.
 * @throws If outside BlockEditor, priority is invalid, or child ref composition fails.
 */
export function BlockDropTarget({
  destination,
  priority,
  indicatorAxis,
  asChild = false,
  children,
  ...attributes
}: BlockDropTargetProps) {
  const editor = useBlockEditorController();
  const release = useRef<(() => void) | undefined>(undefined);
  const current = useRef(destination);
  useLayoutEffect(() => {
    current.current = destination;
  }, [destination]);
  const attach = useCallback(
    (element: HTMLDivElement | null) => {
      release.current?.();
      release.current = undefined;
      if (element) {
        release.current = editor.dropTargets.register({
          element,
          priority,
          indicatorAxis,
          /**
           * Reads only the latest committed JSX destination.
           *
           * @returns Current owner destination without allocating a replacement.
           */
          getDestination: () => current.current,
        });
      }
    },
    [editor, priority, indicatorAxis],
  );
  const Component = asChild ? Slot.Root : "div";
  return (
    <Component {...attributes} ref={attach}>
      {children}
    </Component>
  );
}
