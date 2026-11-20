import type { BrowserInputMap, RegionIdentity } from "@chulane/rivto-root";
import type { BlockEditorResourceOwner } from "../extensions/block-editor-resource-owner";
import type {
  BlockRegionInputAttachment,
  BlockRegionInputObserver,
  BlockRegionInputRegistration,
  BlockRegionInputRoot,
} from "./types";

/** Retains region input registrations while Page borrows successive Roots. */
export class BlockRegionInputSubscriptions {
  private readonly registrations = new Set<BlockRegionInputRegistration>();
  private attachment?: BlockRegionInputAttachment;

  /**
   * Borrows the editor's guard and cleanup owner without owning its lifecycle.
   *
   * @param owner - Editor resource owner for individual registrations.
   */
  constructor(private readonly owner: BlockEditorResourceOwner) {}

  /**
   * Retains one typed region observer across Page attachment changes.
   *
   * @param identity - Opaque identity of the mounted region.
   * @param type - Browser input name to observe.
   * @param phase - Capture or bubble phase on the region.
   * @param observer - Receives normalized input and the owned region during synchronous delivery.
   * @returns Idempotent disposer removing this registration.
   * @throws Propagates editor lifecycle, setup, and cleanup failures.
   */
  observe<K extends keyof BrowserInputMap>(
    identity: RegionIdentity,
    type: K,
    phase: "capture" | "bubble",
    observer: BlockRegionInputObserver<K>,
  ): () => void {
    this.owner.assertActive();
    const registration: BlockRegionInputRegistration = {
      identity,
      active: true,
      /**
       * Installs the retained typed callback on the captured region.
       *
       * @param region - Region belonging to the current Page attachment.
       * @returns Listener disposer, or undefined after ownership ends.
       * @throws Propagates Root listener setup failures.
       */
      attach: (region) => region.observeInput(type, phase, (input) => observer(input, region)),
    };
    this.registrations.add(registration);
    try {
      if (this.attachment) {
        this.connect(registration, this.attachment);
      }
      return this.owner.registerCleanup(() => this.remove(registration));
    } catch (error) {
      try {
        this.remove(registration);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Region input registration rollback failed",
        );
      }
      throw error;
    }
  }

  /**
   * Installs retained observers on one borrowed Page occurrence.
   *
   * @param root - Current occurrence owned by the mounting host.
   * @returns Idempotent disposer detaching only this occurrence.
   * @throws If already attached or setup or rollback fails.
   */
  attach(root: BlockRegionInputRoot): () => void {
    if (this.attachment) {
      throw new Error("Region input is already attached");
    }
    const attachment: BlockRegionInputAttachment = { root };
    this.attachment = attachment;
    try {
      for (const registration of [...this.registrations]) {
        this.connect(registration, attachment);
      }
      if (this.attachment !== attachment || !root.isAttached() || this.attachment !== attachment) {
        throw new Error("Region input attachment ended during setup");
      }
    } catch (error) {
      try {
        this.detach(attachment);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Region input attachment rollback failed");
      }
      throw error;
    }
    return () => this.detach(attachment);
  }

  /**
   * Installs one retained observer if its region still belongs to this attachment.
   *
   * @param registration - Live region registration.
   * @param attachment - Exact Page occurrence being connected.
   * @returns A current region listener is retained when available.
   * @throws Propagates Root ownership, listener setup, and cleanup failures.
   */
  private connect(
    registration: BlockRegionInputRegistration,
    attachment: BlockRegionInputAttachment,
  ): void {
    if (!registration.active || this.attachment !== attachment || !attachment.root.isAttached()) {
      return;
    }
    const region = attachment.root.captureRegionByIdentity(
      registration.identity,
      () => registration.active && this.attachment === attachment,
    );
    if (!region || !registration.active || this.attachment !== attachment) {
      return;
    }
    const release = registration.attach(region);
    if (!release) {
      return;
    }
    if (
      !registration.active ||
      this.attachment !== attachment ||
      !attachment.root.isAttached() ||
      this.attachment !== attachment ||
      !registration.active
    ) {
      release();
      return;
    }
    registration.binding = { attachment, release };
  }

  /**
   * Withdraws all listeners for one attachment while retaining registrations.
   *
   * @param attachment - Exact occurrence being detached.
   * @returns All captured listeners have been offered cleanup.
   * @throws AggregateError when one or more listener cleanups fail.
   */
  private detach(attachment: BlockRegionInputAttachment): void {
    if (this.attachment !== attachment) {
      return;
    }
    this.attachment = undefined;
    const errors: unknown[] = [];
    const releases: Array<() => void> = [];
    for (const registration of [...this.registrations]) {
      const binding = registration.binding;
      if (binding?.attachment !== attachment) {
        continue;
      }
      registration.binding = undefined;
      releases.push(binding.release);
    }
    for (const release of releases) {
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Region input cleanup failed");
    }
  }

  /**
   * Removes one registration before releasing its installed listener.
   *
   * @param registration - Exact registration owned by the caller.
   * @returns The registration cannot deliver or reconnect again.
   * @throws Propagates listener cleanup failures.
   */
  private remove(registration: BlockRegionInputRegistration): void {
    if (!this.registrations.delete(registration)) {
      return;
    }
    registration.active = false;
    const binding = registration.binding;
    registration.binding = undefined;
    binding?.release();
  }
}
