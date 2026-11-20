import type { PanelInputRegistration } from "../../panels/types";
import { PAGE_SURFACE_CLASS } from "../../surfaces/page/constants";
import { observeThreadOverlay } from "./thread-overlay-observation";
import { ThreadOverlayAttachment } from "./thread-overlay-attachment";
import type { BulletThreadingOptions, ThreadOverlayPanel, ThreadOverlayRoot } from "./types";

const DEFAULT_ROOT_LINE_OFFSET = 12;

/**
 * Mounts a threading path for the current Page occurrence.
 *
 * @param panel - Borrowed current Root reference for replacement checks.
 * @param inputRoot - Routed occurrence whose document owns the overlay.
 * @param options - Anchor resolver and traversal settings.
 * @param inputRegistration - Routing lifetime owning this overlay.
 * @returns Cleanup for observation and overlay, or undefined outside the current Page.
 * @throws Propagates mounting and cleanup failures, including failed rollback.
 */
export function mountThreadOverlay(
  panel: ThreadOverlayPanel,
  inputRoot: ThreadOverlayRoot,
  options: BulletThreadingOptions,
  inputRegistration: PanelInputRegistration,
): (() => void) | undefined {
  if (!inputRegistration.isCurrent(inputRoot) || panel.inputRoot !== inputRoot) {
    return undefined;
  }
  const identity = inputRoot.getElementIdentity?.();
  const root = identity
    ? inputRoot.captureRegionByIdentity(identity, () => inputRegistration.isCurrent(inputRoot))
    : undefined;
  if (
    !root?.matches(`.${PAGE_SURFACE_CLASS}`) ||
    !inputRegistration.isCurrent(inputRoot) ||
    panel.inputRoot !== inputRoot
  ) {
    return undefined;
  }
  const overlay = inputRoot.createPathOverlay({
    className: "rivto-bullet-threading",
    attributes: { "data-bullet-threading": "true" },
  });
  let stop: () => void;
  try {
    if (
      !overlay.create() ||
      !inputRegistration.isCurrent(inputRoot) ||
      panel.inputRoot !== inputRoot
    ) {
      overlay.remove();
      return undefined;
    }
    stop = observeThreadOverlay({
      inputRoot,
      inputRegistration,
      overlay,
      anchor: options.anchor,
      rootLineOffset: options.rootLineOffset ?? DEFAULT_ROOT_LINE_OFFSET,
      excluded: new Set(options.excludeBlockTypes),
      continued: options.continueBlockTypes ? new Set(options.continueBlockTypes) : null,
    });
  } catch (error) {
    try {
      overlay.remove();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Thread overlay setup and cleanup failed");
    }
    throw error;
  }
  const attachment = new ThreadOverlayAttachment(inputRoot, inputRegistration, stop, overlay);
  attachment.observe(panel);
  return attachment.destroy;
}
