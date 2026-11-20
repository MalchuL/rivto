import type { RegionIdentity } from "@chulane/rivto-root";
import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { useEditorRootContext } from "../../hooks/editor/use-editor-root-context";
import { useEditorRootIdentity } from "../../hooks/editor/use-editor-root-identity";
import type { PanelInputRoot } from "../../panels/types";
import type { EdgelessGridSpotlight } from "./edgeless-grid-spotlight";
import type { EdgelessSurfaceController } from "./edgeless-surface-controller";
import type { EdgelessRootPanel, EdgelessSurfaceRootBindings } from "./types";

/**
 * Connects the mounted viewport and overlay to their current occurrence Root.
 *
 * @param panel - Borrowed occurrence availability and current Root.
 * @param controller - Owner of occurrence-bound pan markers.
 * @param spotlight - Owner of viewport observation and overlay styles.
 * @returns Mounting references, the matching Page scope, and current Root.
 * @throws Propagates attachment, observation, and cleanup failures.
 */
export function useEdgelessSurfaceRoots(
  panel: EdgelessRootPanel,
  controller: EdgelessSurfaceController,
  spotlight: EdgelessGridSpotlight,
): EdgelessSurfaceRootBindings {
  const inputRoot = useSyncExternalStore(
    panel.subscribeAvailability,
    () => panel.inputRoot,
    () => undefined,
  );
  const [overlayIdentity, setOverlayIdentity] = useState<RegionIdentity>();
  const spotlightRef = useCallback((node: HTMLDivElement | null) => {
    setOverlayIdentity(node ? getBrowserElementIdentity(node) : undefined);
  }, []);
  const { ref: registerRoot } = useEditorRootContext();
  const rootIdentity = useEditorRootIdentity();
  const viewportIdentity = useRef<object | undefined>(undefined);
  const viewportRef = useCallback(
    (node: HTMLElement | null) => {
      viewportIdentity.current = node ? getBrowserElementIdentity(node) : undefined;
      registerRoot(node);
    },
    [registerRoot],
  );
  usePanRoot(panel, rootIdentity, inputRoot, controller);
  useSpotlightRoot(panel, rootIdentity, inputRoot, overlayIdentity, spotlight);
  return {
    scopeInputRoot:
      rootIdentity &&
      rootIdentity === viewportIdentity.current &&
      inputRoot?.isAttached() &&
      inputRoot.getElementIdentity?.() === rootIdentity &&
      panel.inputRoot === inputRoot
        ? inputRoot
        : undefined,
    viewportRef,
    spotlightRef,
    inputRoot,
  };
}

/**
 * Attaches pan markers only when the Root matches this mounted viewport.
 *
 * @param panel - Borrowed occurrence availability and current Root.
 * @param rootIdentity - Identity of the current viewport, if mounted.
 * @param inputRoot - Root observed during this render, if attached.
 * @param controller - Owner of pan marker leases.
 * @returns The effect releases markers when the captured occurrence changes.
 * @throws Propagates attachment and cleanup failures.
 */
function usePanRoot(
  panel: EdgelessRootPanel,
  rootIdentity: object | undefined,
  inputRoot: PanelInputRoot | undefined,
  controller: EdgelessSurfaceController,
): void {
  useLayoutEffect(() => {
    if (
      !rootIdentity ||
      !inputRoot?.isAttached() ||
      inputRoot.getElementIdentity?.() !== rootIdentity ||
      panel.inputRoot !== inputRoot
    ) {
      return;
    }
    return controller.attachPanRoot(inputRoot);
  }, [rootIdentity, inputRoot, panel, controller]);
}

/**
 * Attaches spotlight resources to the same occurrence as the mounted viewport.
 *
 * @param panel - Borrowed occurrence availability and current Root.
 * @param rootIdentity - Identity of the current viewport, if mounted.
 * @param inputRoot - Root observed during this render, if attached.
 * @param overlayIdentity - Opaque identity of the mounted spotlight overlay.
 * @param spotlight - Owner of bounds observation, frame, and style cleanup.
 * @returns The effect releases the captured spotlight resources on replacement.
 * @throws Propagates region capture, observation, and cleanup failures.
 */
function useSpotlightRoot(
  panel: EdgelessRootPanel,
  rootIdentity: object | undefined,
  inputRoot: PanelInputRoot | undefined,
  overlayIdentity: RegionIdentity | undefined,
  spotlight: EdgelessGridSpotlight,
): void {
  useLayoutEffect(() => {
    const identity = inputRoot?.getElementIdentity?.();
    if (
      !rootIdentity ||
      !inputRoot ||
      !identity ||
      identity !== rootIdentity ||
      !overlayIdentity ||
      !inputRoot.isAttached()
    ) {
      return;
    }
    const viewport = inputRoot.captureRegionByIdentity(identity);
    const overlay = inputRoot.captureRegionByIdentity(overlayIdentity);
    const clock = inputRoot.captureFrameClock();
    if (!viewport || !overlay || !clock || panel.inputRoot !== inputRoot) {
      return;
    }
    return spotlight.attach(inputRoot, viewport, overlay, clock);
  }, [rootIdentity, inputRoot, overlayIdentity, panel, spotlight]);
}
