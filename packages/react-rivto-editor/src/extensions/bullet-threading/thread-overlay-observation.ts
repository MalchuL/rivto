import type { FrameClock, InputEvent, InputRegion, RegionBounds } from "@chulane/rivto-root";
import { buildThreadPath } from "./thread-path";
import type { ThreadObservationOptions, ThreadPoint } from "./types";
import { BLOCK_ID_SELECTOR } from "../../constants";
import { PANEL_SELECTOR } from "../../panels/panel-dom";

/**
 * Observes a mounted threading overlay and updates its path after browser changes.
 *
 * @param options - Borrowed occurrence and overlay, anchor resolver, and traversal rules.
 * @returns Disposer releasing listeners, observers, and pending animation frames.
 * @throws Propagates browser setup and cleanup failures.
 */
export function observeThreadOverlay(options: ThreadObservationOptions): () => void {
  const identity = options.inputRoot.getElementIdentity?.();
  const region = identity
    ? options.inputRoot.captureRegionByIdentity(identity, () =>
        options.inputRegistration.isCurrent(options.inputRoot),
      )
    : undefined;
  const clock = options.inputRoot.captureFrameClock();
  if (!region || !clock) {
    return () => {};
  }
  return new ThreadOverlayObservation(options, region, clock).start();
}

/** Owns browser observation for one mounted threading overlay. */
class ThreadOverlayObservation {
  private active = true;
  private cancelFrame?: () => void;
  private readonly observed = new Map<object, () => void>();
  private readonly cleanups: (() => void)[] = [];

  /**
   * Captures the overlay and its current browser occurrence.
   *
   * @param options - Mounted elements and threading configuration.
   * @param rootRegion - Occurrence-owned surface region.
   * @param clock - Frame scheduling borrowed from the occurrence.
   */
  constructor(
    private readonly options: ThreadObservationOptions,
    private readonly rootRegion: InputRegion,
    private readonly clock: FrameClock,
  ) {}

  /**
   * Installs browser notifications and schedules the initial path measurement.
   *
   * @returns Disposer ending this observation.
   * @throws Propagates setup failures, including failed rollback.
   */
  start(): () => void {
    const { inputRoot } = this.options;
    try {
      const identity = this.rootRegion.getIdentity();
      if (!identity || !this.options.inputRegistration.isCurrent(inputRoot)) {
        return this.destroy;
      }
      const releaseRoot = this.rootRegion.observeSize(this.schedule);
      if (!this.active) {
        releaseRoot();
        return this.destroy;
      }
      this.observed.set(identity, releaseRoot);
      if (!this.options.inputRegistration.isCurrent(inputRoot)) {
        this.destroy();
        return this.destroy;
      }
      this.retain(this.rootRegion.observeStructure(this.schedule));
      if (!this.active) {
        return this.destroy;
      }
      this.retain(inputRoot.observeWindowInput("focusin", "capture", this.onFocus));
      if (!this.active) {
        return this.destroy;
      }
      this.retain(inputRoot.observeWindowInput("focusout", "capture", this.onFocus));
      if (!this.active) {
        return this.destroy;
      }
      this.retain(inputRoot.observeWindowInput("scroll", "capture", this.onScroll));
      if (!this.active) {
        return this.destroy;
      }
      this.retain(inputRoot.observeWindowInput("resize", "bubble", this.schedule));
      this.schedule();
      return this.destroy;
    } catch (error) {
      try {
        this.destroy();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Thread observation setup failed");
      }
      throw error;
    }
  }

  /**
   * Releases every browser observer and event listener, including pending work.
   *
   * @returns This observation no longer updates the overlay.
   * @throws Aggregates failures after offering all resources cleanup.
   */
  private readonly destroy = (): void => {
    if (!this.active) {
      return;
    }
    this.active = false;
    const errors: unknown[] = [];
    const releases = [
      this.cancelFrame,
      ...this.cleanups.splice(0).reverse(),
      ...this.observed.values(),
    ];
    this.cancelFrame = undefined;
    this.observed.clear();
    for (const release of releases) {
      try {
        release?.();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Thread observation cleanup failed");
    }
  };

  /**
   * Schedules at most one path measurement for the next animation frame.
   *
   * @returns The next frame will refresh the path while this observation is active.
   */
  private readonly schedule = (): void => {
    if (
      this.active &&
      this.options.inputRegistration.isCurrent(this.options.inputRoot) &&
      !this.cancelFrame
    ) {
      this.cancelFrame = this.clock.requestFrame(this.measure);
    }
  };

  /**
   * Schedules a refresh for focus changes within this surface.
   *
   * @param input - Normalized focus transition from the occurrence's window.
   * @returns Focus changes inside the surface schedule path measurement.
   */
  private readonly onFocus = (input: InputEvent): void => {
    if (input.target && this.rootRegion.containsTarget(input.target)) {
      this.schedule();
    }
  };

  /**
   * Schedules geometry after nested scrolling while ignoring document scrolling.
   *
   * @param input - Normalized scroll target without a browser event.
   * @returns Element scrolling schedules a refresh.
   */
  private readonly onScroll = (input: InputEvent): void => {
    // The body-hosted SVG scrolls with the document; only nested scrollers need new coordinates.
    if (input.target?.isElement?.()) {
      this.schedule();
    }
  };

  /**
   * Retains a new subscription or releases it after synchronous teardown.
   *
   * @param release - Subscription cleanup returned by Root.
   * @returns The subscription is owned by this observation or already released.
   */
  private retain(release: () => void): void {
    if (this.active) {
      this.cleanups.push(release);
      if (!this.options.inputRegistration.isCurrent(this.options.inputRoot)) {
        this.destroy();
      }
    } else {
      release();
    }
  }

  /**
   * Measures each visible anchor once and reconciles the observed regions.
   *
   * @returns The SVG path and observed regions reflect the focused block ancestry.
   */
  private readonly measure = (): void => {
    this.cancelFrame = undefined;
    if (!this.active || !this.options.inputRegistration.isCurrent(this.options.inputRoot)) {
      return;
    }
    const { inputRoot, overlay, rootLineOffset, excluded, continued } = this.options;
    const origin = overlay.readBounds();
    if (!origin) {
      return;
    }
    const next = new Map<object, InputRegion>();
    // Measure each block once per frame and observe the exact regions supplying its geometry.
    const cache = new Map<object, ThreadPoint | null>();
    this.addRegion(next, this.rootRegion);
    const point = (block: InputRegion) => this.measurePoint(block, origin, next, cache);
    const focused = inputRoot.captureFocusedRegion(BLOCK_ID_SELECTOR, PANEL_SELECTOR);
    const nextPath = focused
      ? buildThreadPath({
          root: this.rootRegion,
          inputRoot,
          focused,
          rootLineOffset,
          excluded,
          continued,
          point,
        })
      : "";
    if (
      !this.active ||
      !this.options.inputRegistration.isCurrent(inputRoot) ||
      (focused && !focused.getIdentity())
    ) {
      return;
    }
    this.reconcile(next);
    if (
      this.active &&
      this.options.inputRegistration.isCurrent(inputRoot) &&
      (!focused || focused.getIdentity()) &&
      this.options.inputRegistration.isCurrent(inputRoot)
    ) {
      overlay.update(nextPath);
    }
  };

  /**
   * Measures one block anchor and records the regions needed for later updates.
   *
   * @param block - Rendered block whose anchor is requested.
   * @param origin - Overlay rectangle in viewport coordinates.
   * @param regions - Region observations required by this frame.
   * @param cache - Measurements already made during this frame.
   * @returns Overlay-relative anchor, or null when it is unavailable or invisible.
   */
  private measurePoint(
    block: InputRegion,
    origin: RegionBounds,
    regions: Map<object, InputRegion>,
    cache: Map<object, ThreadPoint | null>,
  ): ThreadPoint | null {
    const blockIdentity = block.getIdentity();
    if (!blockIdentity) {
      return null;
    }
    if (cache.has(blockIdentity)) {
      return cache.get(blockIdentity)!;
    }
    const { inputRoot, anchor } = this.options;
    const identity = anchor(block)?.getIdentity();
    const control = identity
      ? inputRoot.captureRegionByIdentity(
          identity,
          () => this.active && this.options.inputRegistration.isCurrent(inputRoot),
        )
      : undefined;
    if (!control || !block.containsRegion(control)) {
      cache.set(blockIdentity, null);
      return null;
    }
    this.addRegion(regions, block);
    this.addRegion(regions, control);
    const bounds = control.readBounds();
    if (!bounds || !bounds.width || !bounds.height) {
      cache.set(blockIdentity, null);
      return null;
    }
    const value = {
      x: bounds.left + bounds.width / 2 - origin.left,
      y: bounds.top + bounds.height / 2 - origin.top,
      bottom: bounds.top + bounds.height - origin.top,
    };
    cache.set(blockIdentity, value);
    return value;
  }

  /**
   * Adds an active region to this frame's size-observation set.
   *
   * @param regions - Regions required by the current path.
   * @param region - Captured occurrence region.
   * @returns An identifiable region is retained for reconciliation.
   */
  private addRegion(regions: Map<object, InputRegion>, region: InputRegion): void {
    const identity = region.getIdentity();
    if (identity) {
      regions.set(identity, region);
    }
  }

  /**
   * Replaces size observations after the current frame's geometry has been read.
   *
   * @param regions - Regions needed until the next path measurement.
   * @returns Removed observations are released and new regions are observed.
   * @throws Propagates observer setup and cleanup failures.
   */
  private reconcile(regions: ReadonlyMap<object, InputRegion>): void {
    for (const [identity, release] of this.observed) {
      if (!regions.has(identity)) {
        this.observed.delete(identity);
        release();
      }
    }
    for (const [identity, region] of regions) {
      if (!this.observed.has(identity)) {
        const release = region.observeSize(this.schedule);
        if (!this.active) {
          release();
          return;
        }
        this.observed.set(identity, release);
      }
    }
  }
}
