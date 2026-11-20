import type { ForwardedRef } from "react";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import type { RegionIdentity } from "@chulane/rivto-root";
import type { BlockLayoutRegion, BlockLayoutRegions } from "../block-layout-regions";

/** Owns one committed layout registration and its forwarded identity cleanup. */
export class BlockRegionRef {
  private generation = 0;
  private release: (() => void) | undefined;
  private forwardedCleanup: unknown;

  /**
   * Borrows the registry and caller ref for one stable React ref callback.
   *
   * @param regions - Editor-owned layout registry borrowed for registration.
   * @param blockId - Block owning the mounted region.
   * @param role - Layout role independent of DOM nesting.
   * @param forwarded - Optional ref receiving the region identity.
   */
  constructor(
    private readonly regions: Pick<BlockLayoutRegions, "register">,
    private readonly blockId: string,
    private readonly role: BlockLayoutRegion,
    private readonly forwarded?: ForwardedRef<RegionIdentity>,
  ) {}

  /**
   * Registers the committed region and forwards its opaque identity.
   *
   * A reentrant replacement invalidates the earlier delivery and releases any
   * cleanup it returns late. Registration is rolled back if forwarding fails.
   *
   * @param element - Mounted browser element, or null after unmount.
   * @returns The current registration is retained or all obsolete work is released.
   * @throws Propagates registration, forwarding, and cleanup failures.
   */
  readonly commit = (element: HTMLDivElement | null): void => {
    const current = ++this.generation;
    if (!this.releasePrevious(element, current) || !element) {
      return;
    }
    const identity = getBrowserElementIdentity(element);
    const registration = this.regions.register(this.blockId, this.role, identity);
    if (this.generation !== current) {
      registration();
      return;
    }
    this.release = registration;
    try {
      this.notify(identity, current);
    } catch (error) {
      if (this.generation !== current) {
        throw error;
      }
      this.release = undefined;
      try {
        registration();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Block region ref rollback failed");
      }
      throw error;
    }
  };

  /**
   * Delivers one identity while rejecting cleanup returned after replacement.
   *
   * @param identity - Mounted region identity, or null during ref cleanup.
   * @param current - Delivery generation that owns this notification.
   * @returns The current cleanup is retained, or stale cleanup is released.
   * @throws Propagates ref callback or cleanup failures.
   */
  private notify(identity: RegionIdentity | null, current: number): void {
    if (typeof this.forwarded === "function") {
      const cleanup: unknown = this.forwarded(identity);
      if (this.generation === current) {
        this.forwardedCleanup = cleanup;
      } else if (typeof cleanup === "function") {
        cleanup();
      }
    } else if (this.forwarded) {
      this.forwarded.current = identity;
    }
  }

  /**
   * Releases the previous region and ref cleanup before another mount.
   *
   * @param element - Next browser element, or null on unmount.
   * @param current - Delivery generation that owns this cleanup.
   * @returns False when cleanup replaced this delivery reentrantly.
   * @throws Cleanup failures after all applicable cleanup has been attempted.
   */
  private releasePrevious(element: HTMLDivElement | null, current: number): boolean {
    const previousRelease = this.release;
    const previousCleanup = this.forwardedCleanup;
    this.release = undefined;
    this.forwardedCleanup = undefined;
    const errors: unknown[] = [];
    try {
      previousRelease?.();
    } catch (error) {
      errors.push(error);
    }
    try {
      if (typeof previousCleanup === "function") {
        previousCleanup();
      }
    } catch (error) {
      errors.push(error);
    }
    if (this.generation === current && (!element || errors.length > 0)) {
      try {
        if (typeof previousCleanup !== "function" || typeof this.forwarded !== "function") {
          this.notify(null, current);
        }
      } catch (error) {
        errors.push(error);
      }
    }
    throwBlockRegionRefErrors(errors);
    return this.generation === current;
  }
}

/**
 * Reports cleanup failures without discarding any of them.
 *
 * @param errors - Failures collected while releasing one region ref.
 * @returns All applicable cleanup completed when no failures were collected.
 * @throws The original failure or an AggregateError when multiple cleanups fail.
 */
function throwBlockRegionRefErrors(errors: readonly unknown[]): void {
  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, "Block region ref cleanup failed");
  }
}
