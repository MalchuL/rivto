import { useCallback, useLayoutEffect, useRef, type RefCallback, type RefObject } from "react";
import type { RegionIdentity } from "@chulane/rivto-root";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { useReactPanelContext } from "../editor/use-react-panel-context";
import { useEditorRootIdentity } from "../editor/use-editor-root-identity";
import { useEditorRootContext } from "../editor/use-editor-root-context";
import { PANEL_SELECTOR } from "../../panels/panel-dom";
import type { BlockEditingController } from "./block-editing-controller";

/**
 * Binds a mounted editable to its occurrence's text capability.
 *
 * Each commit checks for host replacement without interrupting an unchanged
 * composition. Cleanup releases only the current binding, including after a
 * Root replacement on the same surface element.
 *
 * @param controller - Borrowed editing policy receiving the current target.
 * @param identityRef - Receives the opaque identity of the current editable host.
 * @returns React callback ref for mounting exactly one editable host.
 * @throws Propagates identity and Root attachment failures during commit.
 */
export function useEditableTextTarget(
  controller: Pick<BlockEditingController, "acceptsInput" | "attach">,
  identityRef: RefObject<RegionIdentity | undefined>,
): RefCallback<HTMLDivElement> {
  const { reactPanel } = useReactPanelContext();
  const rootIdentity = useEditorRootIdentity();
  const { mountedRoot: contextRoot } = useEditorRootContext();
  const mountedRoot = contextRoot ?? reactPanel.mountedRoot;
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      identityRef.current = element ? getBrowserElementIdentity(element) : undefined;
    },
    [identityRef],
  );
  const releaseTarget = useRef<(() => void) | undefined>(undefined);
  useLayoutEffect(() => {
    const identity = identityRef.current;
    const root = mountedRoot;
    if (
      !identity ||
      !rootIdentity ||
      !root?.isAttached() ||
      root.getElementIdentity?.() !== rootIdentity
    ) {
      releaseTarget.current?.();
      releaseTarget.current = undefined;
      return;
    }
    if (controller.acceptsInput(identity)) {
      return;
    }
    releaseTarget.current?.();
    releaseTarget.current = undefined;
    const target = root.captureEditableTextByIdentity(identity, PANEL_SELECTOR);
    if (target) {
      releaseTarget.current = controller.attach(target);
    }
  });
  useLayoutEffect(
    () => () => {
      releaseTarget.current?.();
      releaseTarget.current = undefined;
    },
    [controller],
  );
  return ref;
}
