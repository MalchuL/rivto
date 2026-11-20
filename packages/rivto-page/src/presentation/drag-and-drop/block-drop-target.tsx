import { Slot } from "radix-ui";
import { getDropTargetIdentity } from "./browser/drop-target-identity";
import { BLOCK_DROP_EXCLUDE_ATTRIBUTE } from "../../editor/drag-and-drop/block-drop-attributes";
import { useCallback, useContext, useLayoutEffect, useRef } from "react";
import { BlockEditorContext } from "../components/block-editor/block-editor-context";
import type { BlockDropTargetsApi } from "../../editor/drag-and-drop/types";
import type { BlockDropTargetProps } from "./types";

export type { BlockDropTargetProps } from "./types";

/**
 * Declares a mounted hover region without implementing gestures or document mutations.
 *
 * The committed destination stays live without reinstalling the DOM registration.
 * asChild uses Radix ref composition so the child's own ref is preserved. DOM
 * children supply their mounted element; Page shells supply an opaque identity.
 * No drop handlers, dimensions, or synthetic block identities are added.
 *
 * @param props - Destination, priority, and an existing child element.
 * @param props.destination - Real parent or canonical child gap checked at resolution.
 * @param props.regions - Explicit drop regions; omission uses the destination over the child's bounds.
 * @param props.priority - Finite overlap priority, default zero.
 * @param props.exclude - Excludes this anchor, default false; descendant regions may accept drops without ancestor fallback.
 * @param props.asChild - Required true: registration always uses the existing child element.
 * @param props.children - One child forwarding its mounted element or region identity, or no content while a target is absent.
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
}: BlockDropTargetProps) {
  const editor = useContext(BlockEditorContext);
  if (!editor) {
    throw new Error("Block editor hooks require a BlockEditor");
  }
  const targets: Pick<BlockDropTargetsApi, "register"> = editor.dropTargets;
  const release = useRef<(() => void) | undefined>(undefined);
  const declarations = regions ?? (destination ? [{ kind: "inside" as const, destination }] : []);
  const current = useRef(declarations);
  useLayoutEffect(() => {
    current.current = declarations;
  }, [declarations]);
  const attach = useCallback(
    (element: object | null) => {
      release.current?.();
      release.current = undefined;
      if (element) {
        release.current = targets.register({
          identity: getDropTargetIdentity(element),
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
    [targets, priority],
  );
  if (!asChild) {
    throw new Error("BlockDropTarget requires asChild and an existing layout element");
  }
  const Component = Slot.Root;
  return (
    <Component {...{ [BLOCK_DROP_EXCLUDE_ATTRIBUTE]: exclude ? "" : undefined }} ref={attach}>
      {children}
    </Component>
  );
}
