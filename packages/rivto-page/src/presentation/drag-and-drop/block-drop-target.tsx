import { Slot } from "radix-ui";
import { BLOCK_DROP_EXCLUDE_ATTRIBUTE } from "../../editor/drag-and-drop/block-drop-attributes";
import { useCallback, useLayoutEffect, useRef, type HTMLAttributes } from "react";
import { useBlockEditorController } from "../hooks/use-block-editor-controller";
import type { BlockDropRegion, BlockDropDestination } from "../../editor/drag-and-drop/types";

/** Declarative geometry composed onto one existing child element. */
export interface BlockDropTargetProps extends HTMLAttributes<HTMLDivElement> {
  readonly destination?: BlockDropDestination;
  /** Explicit data-only geometry; omission uses the supplied destination over existing bounds. */
  readonly regions?: readonly BlockDropRegion[];
  readonly priority?: number;
  /** False by default; true excludes this anchor and ancestor fallback, while descendant regions remain eligible. */
  readonly exclude?: boolean;
  /** Composes attributes and ref onto one child instead of adding a wrapper. */
  readonly asChild: true;
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
 * @param props.exclude - Excludes this anchor, default false; descendant regions may accept drops without ancestor fallback.
 * @param props.asChild - Required true: registration always uses the existing child element.
 * @param props.children - Target contents, or exactly one ref-forwarding child with asChild.
 * @returns The same child with composed attributes and registration ref.
 * @throws If outside BlockEditor, priority is invalid, or child ref composition fails.
 */
export function BlockDropTarget({
  destination,
  regions,
  priority,
  exclude = false,
  asChild,
  children,
  ...attributes
}: BlockDropTargetProps) {
  const editor = useBlockEditorController();
  const release = useRef<(() => void) | undefined>(undefined);
  const declarations = regions ?? (destination ? [{ kind: "inside" as const, destination }] : []);
  const current = useRef(declarations);
  useLayoutEffect(() => {
    current.current = declarations;
  }, [declarations]);
  const attach = useCallback(
    (element: HTMLDivElement | null) => {
      release.current?.();
      release.current = undefined;
      if (element) {
        release.current = editor.dropTargets.register({
          element,
          priority,

          /**
           * Reads only the latest committed JSX region declarations.
           *
           * @returns Current owner declarations without allocating a replacement.
           */
          getRegions: () => current.current,
        });
      }
    },
    [editor, priority],
  );
  if (!asChild) {
    throw new Error("BlockDropTarget requires asChild and an existing layout element");
  }
  const Component = Slot.Root;
  return (
    <Component
      {...attributes}
      {...{ [BLOCK_DROP_EXCLUDE_ATTRIBUTE]: exclude ? "" : undefined }}
      ref={attach}
    >
      {children}
    </Component>
  );
}
