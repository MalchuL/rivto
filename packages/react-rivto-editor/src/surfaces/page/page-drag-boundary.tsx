import { useLayoutEffect, useSyncExternalStore } from "react";
import { BlockDragExtension } from "@chulane/rivto-page";
import { useReactPanelContext } from "../../hooks/editor/use-react-panel-context";
import type { PageDragBoundaryProps } from "./types";
import { PageDragContext } from "./page-drag-context";
import { useEditorRootIdentity } from "../../hooks/editor/use-editor-root-identity";
import { PageBlockDrag } from "./page-block-drag";
import { PageDragAttachment } from "./page-drag-attachment";

/**
 * Installs Page's pointer owner against the existing occurrence and panel commands.
 *
 * The effect owns the drag adapter attachment and extension registration. Removing
 * the host extension cancels its gesture, unregisters its receiving occurrence and
 * releases listeners; the panel continues to own its Page controller.
 *
 * @param props - Existing surface content, without an additional DOM wrapper.
 * @param props.children - Subtree rendered by the surface boundary.
 * @param props.activationDistance - Pointer travel in CSS pixels before activation.
 * @returns The same subtree with optional pointer dragging installed after commit.
 * @throws If the mounted occurrence does not match, or drag installation or cleanup fails.
 */
export function PageDragBoundary({ children, activationDistance = 4 }: PageDragBoundaryProps) {
  usePageDrag(activationDistance);
  return <PageDragContext.Provider value={true}>{children}</PageDragContext.Provider>;
}

/**
 * Installs drag input for the currently registered surface and releases it when routing ends.
 *
 * @param activationDistance - Pointer travel in CSS pixels required to start dragging.
 * @returns The panel owns a drag installation while its registration remains current.
 * @throws If the mounted surface does not match, or installation or cleanup fails.
 */
function usePageDrag(activationDistance: number): void {
  const { reactPanel } = useReactPanelContext();
  const rootIdentity = useEditorRootIdentity();
  const inputRoot = useSyncExternalStore(
    reactPanel.subscribeAvailability,
    () => reactPanel.inputRoot,
    () => undefined,
  );
  const inputRegistration = useSyncExternalStore(
    reactPanel.subscribeAvailability,
    () => reactPanel.inputRegistration,
    () => undefined,
  );
  useLayoutEffect(() => {
    if (
      !rootIdentity ||
      !inputRoot ||
      !inputRegistration ||
      reactPanel.inputRoot !== inputRoot ||
      reactPanel.inputRegistration !== inputRegistration
    ) {
      return;
    }
    if (
      !inputRegistration.isCurrent(inputRoot) ||
      inputRoot.getElementIdentity?.() !== rootIdentity ||
      !inputRegistration.isCurrent(inputRoot) ||
      reactPanel.inputRoot !== inputRoot
    ) {
      throw new Error("Page drag Root does not match the mounted surface");
    }
    const drag = new PageBlockDrag(reactPanel);
    const detach = drag.attach(reactPanel.page.dropTargets, inputRoot, inputRegistration);
    try {
      const extension = new BlockDragExtension(drag, drag, activationDistance);
      const stop = reactPanel.page.extensions.register("host.drag", extension);
      const attachment = new PageDragAttachment(inputRoot, inputRegistration, stop, detach);
      attachment.observe(reactPanel);
      return attachment.destroy;
    } catch (error) {
      try {
        detach();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Page drag setup failed during cleanup");
      }
      throw error;
    }
  }, [reactPanel, rootIdentity, inputRoot, inputRegistration, activationDistance]);
}
