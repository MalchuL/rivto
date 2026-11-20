import type { BentoResizeController } from "../bento-resize-controller";
import type { BentoResizeEdge, BentoResizePlacement, BentoResizeInputAttachment } from "../types";
import type { BrowserInputMap, InputRegion, RegionIdentity } from "@chulane/rivto-root";
import type { PanelInputRoot, ReactPanelSurfaceApi } from "../../../../panels/types";
import { BENTO_TILE_ITEM_CLASS } from "../bento-constants";

/**
 * Connects one mounted resize separator to normalized Root input.
 *
 * The separator owns this listener attachment; the shared controller owns the
 * active gesture and the cancellation registrations borrowed from this attachment.
 *
 * @param handle - Opaque identity of the mounted separator.
 * @param edge - Side represented by the separator.
 * @param controller - Borrowed resize operations for this tile.
 * @param panel - Borrowed occurrence and availability notifications.
 * @returns Disposer removing the separator's listeners without destroying the controller.
 * @throws If Root observation setup, rollback, or cleanup fails.
 */
export function attachBentoResizeInput(
  handle: RegionIdentity,
  edge: BentoResizeEdge,
  controller: Pick<BentoResizeController, "start" | "move" | "finish" | "resizeWithKeyboard">,
  panel: Pick<ReactPanelSurfaceApi, "inputRoot" | "subscribeAvailability">,
): () => void {
  return new BentoResizeInputBinding(handle, edge, controller, panel).attach();
}

/** Owns one separator's subscriptions across successive panel Roots. */
class BentoResizeInputBinding {
  private active = true;
  private revision = 0;
  private attachment: BentoResizeInputAttachment | undefined;

  /**
   * Retains the separator identity and borrows the controller and panel.
   *
   * @param handle - Opaque identity of the mounted separator.
   * @param edge - Tile edge represented by the separator.
   * @param controller - Resize policy and gesture owner.
   * @param panel - Panel providing the current Root and availability changes.
   */
  constructor(
    private readonly handle: RegionIdentity,
    private readonly edge: BentoResizeEdge,
    private readonly controller: Pick<
      BentoResizeController,
      "start" | "move" | "finish" | "resizeWithKeyboard"
    >,
    private readonly panel: Pick<ReactPanelSurfaceApi, "inputRoot" | "subscribeAvailability">,
  ) {}

  /**
   * Subscribes to Root replacement and connects the current separator.
   *
   * @returns Idempotent cleanup releasing availability and region listeners.
   * @throws Propagates subscription, setup, and rollback failures.
   */
  attach(): () => void {
    const stopAvailability = this.panel.subscribeAvailability(this.reconcile);
    try {
      this.reconcile();
    } catch (error) {
      try {
        this.active = false;
        const attachment = this.attachment;
        this.attachment = undefined;
        releaseBentoInput([stopAvailability, ...(attachment?.releases ?? [])]);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Bento input setup failed");
      }
      throw error;
    }
    return () => {
      if (!this.active) {
        return;
      }
      this.active = false;
      this.revision += 1;
      const attachment = this.attachment;
      this.attachment = undefined;
      releaseBentoInput([stopAvailability, ...(attachment?.releases ?? [])]);
    };
  }

  /**
   * Reconnects the separator when its panel's exact Root changes.
   *
   * @returns The current Root owns the region listeners when available.
   * @throws Propagates ownership, registration, and cleanup failures.
   */
  private readonly reconcile = (): void => {
    const revision = ++this.revision;
    const root = this.panel.inputRoot;
    const previous = this.attachment;
    // Root availability checks can synchronously install a replacement.
    if (
      previous?.root === root &&
      root?.isAttached() &&
      this.active &&
      revision === this.revision &&
      this.attachment === previous &&
      this.panel.inputRoot === root &&
      revision === this.revision &&
      this.active
    ) {
      return;
    }
    if (!this.active || revision !== this.revision) {
      return;
    }
    this.releaseAttachment(previous);
    if (
      !this.active ||
      revision !== this.revision ||
      !root?.isAttached() ||
      this.panel.inputRoot !== root ||
      revision !== this.revision ||
      !this.active
    ) {
      return;
    }
    this.attachRoot(root);
  };

  /**
   * Captures the separator and installs listeners for one exact Root.
   *
   * @param root - Current panel Root whose lifetime bounds the new attachment.
   * @returns The attachment is retained only while its Root stays current.
   * @throws Propagates capture, listener setup, and rollback failures.
   */
  private attachRoot(root: PanelInputRoot): void {
    const attachment: BentoResizeInputAttachment = { root, releases: [] };
    this.attachment = attachment;
    try {
      const region = root.captureRegionByIdentity(this.handle, () => this.isCurrent(attachment));
      if (!region || !this.isCurrent(attachment)) {
        this.releaseAttachment(attachment);
        return;
      }
      this.observeRegion(attachment, region);
      if (!this.isCurrent(attachment)) {
        this.releaseAttachment(attachment);
      }
    } catch (error) {
      try {
        this.releaseAttachment(attachment);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Bento input attachment failed");
      }
      throw error;
    }
  }

  /**
   * Installs the pointer and keyboard handlers on the captured separator.
   *
   * @param attachment - Exact Root and cleanup owner for these registrations.
   * @param region - Separator region bounded by that Root.
   * @returns Every input subscription is retained by the attachment.
   * @throws Propagates listener setup and ownership failures.
   */
  private observeRegion(attachment: BentoResizeInputAttachment, region: InputRegion): void {
    this.observe(attachment, region, "pointerdown", (event) => {
      this.controller.start(this.edge, event, {
        feedback: region,
        placement: captureBentoResizePlacement(region),
        subscribeCancellation: (cancel) =>
          observeBentoResizeLifetime(this.panel, attachment.root, cancel),
      });
    });
    this.observe(attachment, region, "pointermove", (event) => this.controller.move(event));
    this.observe(attachment, region, "pointerup", (event) => this.controller.finish(event, true));
    this.observe(attachment, region, "pointercancel", (event) =>
      this.controller.finish(event, false),
    );
    this.observe(attachment, region, "lostpointercapture", (event) =>
      this.controller.finish(event, false),
    );
    this.observe(attachment, region, "keydown", (event) =>
      this.controller.resizeWithKeyboard(this.edge, event),
    );
  }

  /**
   * Retains one region subscription only while its attachment stays current.
   *
   * @param attachment - Exact Root that owns this subscription.
   * @param region - Captured separator receiving input.
   * @param type - Normalized input name to observe.
   * @param deliver - Controller callback for the input.
   * @returns The cleanup is retained or immediately released after replacement.
   * @throws Propagates listener setup and cleanup failures.
   */
  private observe<K extends keyof BrowserInputMap>(
    attachment: BentoResizeInputAttachment,
    region: InputRegion,
    type: K,
    deliver: (input: BrowserInputMap[K]) => void,
  ): void {
    if (!this.isCurrent(attachment)) {
      return;
    }
    const release = region.observeInput(type, "bubble", (input) => {
      if (this.isCurrent(attachment)) {
        deliver(input);
      }
    });
    if (!release) {
      if (!this.isCurrent(attachment)) {
        return;
      }
      throw new Error("Bento resize separator is no longer attached");
    }
    if (!this.isCurrent(attachment)) {
      release();
      return;
    }
    attachment.releases.push(release);
  }

  /**
   * Checks the exact panel Root and separator attachment.
   *
   * @param attachment - Attachment whose ownership is being checked.
   * @returns True only while the same Root remains active.
   * @throws Propagates Root availability checks.
   */
  private isCurrent(attachment: BentoResizeInputAttachment): boolean {
    return (
      this.active &&
      this.attachment === attachment &&
      this.panel.inputRoot === attachment.root &&
      attachment.root.isAttached() &&
      this.panel.inputRoot === attachment.root &&
      this.attachment === attachment &&
      this.active
    );
  }

  /**
   * Releases the subscriptions of one captured Root attachment.
   *
   * @param attachment - Attachment to release, or undefined when none exists.
   * @returns All retained listeners have been offered cleanup.
   * @throws Propagates listener cleanup failures.
   */
  private releaseAttachment(attachment: BentoResizeInputAttachment | undefined): void {
    if (!attachment) {
      return;
    }
    if (this.attachment === attachment) {
      this.attachment = undefined;
    }
    const releases = attachment.releases.splice(0);
    releaseBentoInput(releases);
  }
}

/**
 * Releases each owned input resource, retaining multiple failures.
 *
 * @param releases - Availability or listener disposers for one attachment.
 * @returns Every supplied resource has been offered cleanup.
 * @throws A cleanup failure, or an AggregateError for multiple failures.
 */
function releaseBentoInput(releases: readonly (() => void)[]): void {
  const errors: unknown[] = [];
  for (const release of releases) {
    try {
      release();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, "Bento input cleanup failed");
  }
}

/**
 * Cancels a resize on window cancellation or replacement of its panel occurrence.
 *
 * @param panel - Borrowed panel availability subscription.
 * @param root - Exact occurrence which started the gesture.
 * @param cancel - Releases the active gesture without committing.
 * @returns Disposer releasing both subscriptions.
 * @throws Propagates registration or cleanup failures, including failed rollback.
 */
function observeBentoResizeLifetime(
  panel: Pick<ReactPanelSurfaceApi, "inputRoot" | "subscribeAvailability">,
  root: PanelInputRoot,
  cancel: () => void,
): () => void {
  const stopWindow = observeBentoResizeCancellation(root, cancel);
  let stopAvailability: (() => void) | undefined;
  const stop = () => {
    const errors: unknown[] = [];
    for (const release of [stopAvailability, stopWindow]) {
      try {
        release?.();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Bento resize lifetime cleanup failed");
    }
  };
  const cancelIfReplaced = () => {
    if (panel.inputRoot !== root || !root.isAttached()) {
      cancel();
    }
  };
  try {
    stopAvailability = panel.subscribeAvailability(cancelIfReplaced);
    cancelIfReplaced();
    return stop;
  } catch (error) {
    try {
      stop();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Bento lifetime setup and cleanup failed");
    }
    throw error;
  }
}

/**
 * Captures the mounted separator's tile and sibling lane as opaque regions.
 *
 * @param handle - Separator region bound to the current panel occurrence.
 * @returns Borrowed regions, or undefined after detachment or without a lane.
 */
export function captureBentoResizePlacement(
  handle: Pick<InputRegion, "captureAncestorWithParent">,
): BentoResizePlacement | undefined {
  const placement = handle.captureAncestorWithParent(`.${BENTO_TILE_ITEM_CLASS}`);
  if (!placement) {
    return undefined;
  }
  return {
    tile: placement.ancestor,
    lane: placement.parent,
  };
}

/**
 * Cancels an active resize before Escape dismisses its surrounding modal, or on window blur.
 *
 * Both registrations belong to the current gesture and are removed together.
 * Escape prevents the browser default and stops propagation; unrelated keys retain
 * their native delivery. Failed setup rolls back already installed listeners.
 *
 * @param root - Borrowed occurrence providing window observations.
 * @param cancel - Restores the active gesture without a model write.
 * @returns Idempotent disposer releasing both cancellation registrations.
 * @throws If listener setup or cleanup fails; failed rollback retains both errors.
 */
export function observeBentoResizeCancellation(
  root: Pick<PanelInputRoot, "observeWindowInput">,
  cancel: () => void,
): () => void {
  const stopBlur = root.observeWindowInput("blur", "bubble", cancel);
  let stopKey: () => void;
  try {
    stopKey = root.observeWindowInput("keydown", "capture", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    });
  } catch (error) {
    try {
      stopBlur();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Bento cancellation setup failed");
    }
    throw error;
  }
  return () => {
    const errors: unknown[] = [];
    for (const stop of [stopKey, stopBlur]) {
      try {
        stop();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Bento cancellation cleanup failed");
    }
  };
}
