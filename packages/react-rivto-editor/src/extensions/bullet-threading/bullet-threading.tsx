/**
 * Optional page-surface overlay connecting rendered block anchors.
 *
 * @module
 */
import { useEffect, useSyncExternalStore } from "react";
import { useReactPanelContext } from "../../hooks/editor/use-react-panel-context";
import type { ReactEditorExtension } from "../../managers";
import { mountThreadOverlay } from "./mount-thread-overlay";
import type { BulletThreadingOptions } from "./types";
export type { BulletThreadingAnchor, BulletThreadingOptions } from "./types";

/**
 * Observes the current Page occurrence and mounts its threading overlay.
 *
 * Measurements are cached for each animation frame. Resize, mutation, focus,
 * nested-scroll, and viewport events schedule a new frame rather than measuring
 * synchronously inside the event handler.
 *
 * @param options - Anchor resolver, offset, and traversal rules.
 * @returns No rendered content; Root owns the body-hosted path overlay.
 * @throws Propagates overlay setup and cleanup failures.
 */
function ThreadOverlay(options: BulletThreadingOptions) {
  const { reactPanel } = useReactPanelContext();
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
  const { anchor, rootLineOffset, excludeBlockTypes, continueBlockTypes } = options;
  useEffect(() => {
    if (!inputRoot || !inputRegistration) {
      return;
    }
    return mountThreadOverlay(
      reactPanel,
      inputRoot,
      { anchor, rootLineOffset, excludeBlockTypes, continueBlockTypes },
      inputRegistration,
    );
  }, [
    reactPanel,
    inputRoot,
    inputRegistration,
    anchor,
    rootLineOffset,
    excludeBlockTypes,
    continueBlockTypes,
  ]);
  return null;
}

/**
 * Installs optional page threading with anchor and block-type rules.
 *
 * @param options - Anchor resolver and optional rendering constraints.
 * @returns React editor extension mounting the page overlay after the surface.
 * @throws When the anchor or root-line offset is invalid.
 */
export function bulletThreadingExtension(options: BulletThreadingOptions): ReactEditorExtension {
  const { anchor } = options;
  if (typeof anchor !== "function") {
    throw new Error("Bullet threading anchor must be a function");
  }
  if (
    options.rootLineOffset !== undefined &&
    (!Number.isFinite(options.rootLineOffset) || options.rootLineOffset < 0)
  ) {
    throw new Error(`Invalid bullet threading root line offset: ${options.rootLineOffset}`);
  }
  return {
    id: "block.bullet-threading",
    setup: (reactEditor) =>
      reactEditor.extensions.mount(() => <ThreadOverlay {...options} />, "afterSurface"),
  };
}
