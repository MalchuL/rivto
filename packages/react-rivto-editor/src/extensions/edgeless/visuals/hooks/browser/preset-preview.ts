import { createPortal } from "react-dom";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import type { PresetPreview } from "../types";
import type { ReactPanelSurfaceApi } from "../../../../../panels/types";

/**
 * Captures a preview factory for one exact mounted editor occurrence.
 *
 * The browser portal host and document remain private to this adapter. A Root
 * replacement, detachment, or document move invalidates the captured factory.
 *
 * @param panel - Panel providing its current borrowed input Root.
 * @param host - Native portal host retained at the React mounting boundary.
 * @param surfaceIdentity - Opaque identity of the currently rendered surface.
 * @param toolId - Tool identity used by the preview marker.
 * @returns A factory for the captured occurrence, or undefined when it is unavailable.
 * @throws Propagates Root ownership and identity checks.
 */
export function capturePresetPreview(
  panel: Pick<ReactPanelSurfaceApi, "inputRoot">,
  host: HTMLElement | null,
  surfaceIdentity: object | undefined,
  toolId: string,
): (() => PresetPreview | undefined) | undefined {
  const root = panel.inputRoot;
  if (!host || !root || !surfaceIdentity) {
    return undefined;
  }
  const document = host.ownerDocument;
  const isCurrent = () =>
    host.isConnected &&
    host.ownerDocument === document &&
    panel.inputRoot === root &&
    root.isAttached() &&
    root.getElementIdentity?.() === surfaceIdentity &&
    getBrowserElementIdentity(host) === surfaceIdentity &&
    panel.inputRoot === root &&
    root.isAttached() &&
    host.isConnected &&
    host.ownerDocument === document &&
    panel.inputRoot === root;
  if (!isCurrent()) {
    return undefined;
  }
  return () => {
    if (!isCurrent()) {
      return undefined;
    }
    const preview = createPresetPreview(document, toolId);
    try {
      if (isCurrent()) {
        return preview;
      }
    } catch (error) {
      try {
        preview.remove();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Preset preview setup failed");
      }
      throw error;
    }
    preview.remove();
    return undefined;
  };
}

/**
 * Mounts an inert preset preview in the originating browser document.
 *
 * @param document - Browser document that owns the initiating toolbar button.
 * @param toolId - Tool identity used by the existing preview marker.
 * @returns Preview operations that keep the host element private.
 * @throws If browser creation or mounting fails.
 */
export function createPresetPreview(document: Document, toolId: string): PresetPreview {
  const host = document.createElement("div");
  host.className = "edgeless-preset-ghost";
  host.dataset.edgelessUi = "true";
  host.dataset.kind = toolId;
  document.body.append(host);
  return {
    /**
     * Mounts the detached creation content into this preview.
     *
     * @param content - React content representing the prospective element.
     * @returns Portal targeting the mounted preview host.
     */
    render(content) {
      return createPortal(content, host);
    },
    /**
     * Paints world geometry using the supplied client origin and scale.
     *
     * @param frame - Prospective world-space placement frame.
     * @param origin - World origin in browser client CSS pixels.
     * @param zoom - Current canvas scale.
     * @returns Preview width, height and transform reflect the frame.
     * @throws If browser style mutation fails.
     */
    position(frame, origin, zoom) {
      host.style.width = `${frame.width}px`;
      host.style.height = `${frame.height}px`;
      host.style.transform = `translate(${origin.x + frame.x * zoom}px, ${origin.y + frame.y * zoom}px) scale(${zoom})`;
    },
    /**
     * Removes the preview host from its document.
     *
     * @returns The host has been offered removal.
     * @throws If browser removal fails.
     */
    remove() {
      host.remove();
    },
  };
}
