import type { InputRoot, RegionIdentity } from "@chulane/rivto-root";
import type {
  BlockVirtualizationApi,
  BlockVirtualizationBinding,
  BlockVirtualizationEntry,
  BlockVirtualizationView,
} from "./types";

/** Owns mounted windowing-view registrations for one block editor. */
export class BlockVirtualizationRegistry {
  private readonly views = new Map<RegionIdentity, BlockVirtualizationEntry>();
  private readonly entries = new Set<BlockVirtualizationEntry>();
  private binding: BlockVirtualizationBinding | undefined;
  private destroyed = false;

  /**
   * Registers one view for an exact mounted editor root.
   *
   * A later registration replaces the old lookup, even for the same view. Each
   * view owns its own Root observation until released; an old disposer cannot
   * remove a replacement. A failed initial observation restores the previous lookup.
   *
   * @param identity - Opaque mounted surface identity whose view is registered.
   * @param view - Borrowed view operations owned by the mounted view.
   * @returns Idempotent disposer releasing only this registration and its observation.
   * @throws If destroyed, or observation setup and rollback fail.
   */
  register(identity: RegionIdentity, view: BlockVirtualizationView): () => void {
    if (this.destroyed) {
      throw new Error("Virtualization registry is destroyed");
    }
    const previous = this.views.get(identity);
    const entry: BlockVirtualizationEntry = { identity, view };
    if (previous) {
      this.views.delete(previous.identity);
    }
    this.views.set(identity, entry);
    this.entries.add(entry);
    try {
      const binding = this.binding;
      if (
        binding &&
        identity === binding.identity &&
        binding.occurrence.isAttached() &&
        this.binding === binding &&
        this.entries.has(entry) &&
        !this.destroyed
      ) {
        this.connect(entry, binding);
      }
      if (this.destroyed) {
        throw new Error("Virtualization registry was destroyed during registration");
      }
    } catch (error) {
      this.entries.delete(entry);
      if (this.views.get(identity) === entry) {
        this.views.delete(identity);
        if (previous && this.entries.has(previous)) {
          this.views.set(previous.identity, previous);
        }
      }
      throw error;
    }
    return () => {
      if (!this.entries.delete(entry)) {
        return;
      }
      if (this.views.get(identity) === entry) {
        this.views.delete(identity);
      }
      this.disconnect(entry);
    };
  }

  /**
   * Reads the current view for one exact editor occurrence.
   *
   * @param occurrence - Borrowed Root identity associated with the editor attachment.
   * @returns Borrowed mounting capability, or undefined when detached or without a matching binding or view.
   * @throws Propagates occurrence attachment checks.
   */
  get(occurrence: Pick<InputRoot, "isAttached">): BlockVirtualizationApi | undefined {
    const binding = this.binding;
    if (
      binding?.occurrence !== occurrence ||
      !occurrence.isAttached() ||
      this.binding !== binding
    ) {
      return undefined;
    }
    const entry = this.views.get(binding.identity);
    if (
      !entry ||
      this.binding !== binding ||
      !occurrence.isAttached() ||
      this.binding !== binding ||
      this.views.get(entry.identity) !== entry
    ) {
      return undefined;
    }
    return entry.view;
  }

  /**
   * Binds matching views to the exact mounted editor occurrence.
   *
   * Views may register before or after this binding. Initial observation reads
   * current focus and selection; releasing the binding disconnects every view.
   *
   * @param identity - Exact mounted surface identity used by view registration.
   * @param occurrence - Borrowed Root owned by the editor attachment.
   * @returns Idempotent disposer releasing only this binding and its observations.
   * @throws If destroyed, already bound, or observation setup or rollback fails.
   */
  bind(
    identity: RegionIdentity,
    occurrence: Pick<InputRoot, "observeTextOwners" | "captureRegionByIdentity" | "isAttached">,
  ): () => void {
    if (this.destroyed) {
      throw new Error("Virtualization registry is destroyed");
    }
    if (this.binding) {
      throw new Error("Virtualization registry is already bound");
    }
    const binding: BlockVirtualizationBinding = { identity, occurrence };
    this.binding = binding;
    try {
      for (const entry of [...this.entries]) {
        if (this.binding !== binding) {
          throw new Error("Virtualization binding ended during setup");
        }
        if (
          this.entries.has(entry) &&
          entry.identity === identity &&
          occurrence.isAttached() &&
          this.binding === binding &&
          this.entries.has(entry)
        ) {
          this.connect(entry, binding);
        }
      }
      if (this.binding !== binding) {
        throw new Error("Virtualization binding ended during setup");
      }
    } catch (error) {
      try {
        this.unbind(binding);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Virtualization binding setup failed");
      }
      throw error;
    }
    return () => this.unbind(binding);
  }

  /**
   * Invalidates all registrations and rejects future registrations.
   *
   * View owners still release their own geometry and model subscriptions on unmount.
   *
   * @returns All Root observations have been offered cleanup and lookup is invalidated.
   * @throws AggregateError if one or more Root observation disposers fail.
   */
  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    const binding = this.binding;
    this.views.clear();
    try {
      if (binding) {
        this.unbind(binding);
      }
    } finally {
      this.entries.clear();
    }
  }

  /**
   * Connects one still-current view to a matching occurrence.
   *
   * Initial observation may synchronously remove the view or binding; in that
   * case the newly acquired disposer is released instead of being retained.
   *
   * @param entry - Registered view to connect.
   * @param binding - Exact occurrence binding used for observation.
   * @returns The observation is retained only while both identities remain current.
   * @throws Propagates observation setup or stale-observation cleanup failures.
   */
  private connect(entry: BlockVirtualizationEntry, binding: BlockVirtualizationBinding): void {
    const release = entry.view.observeRoot(binding.occurrence);
    if (this.binding !== binding || !this.entries.has(entry) || this.destroyed) {
      release();
      return;
    }
    entry.binding = binding;
    entry.releaseObservation = release;
  }

  /**
   * Releases one view's retained observation without changing its registration.
   *
   * @param entry - Registered view whose observation should end.
   * @returns The observation is no longer retained.
   * @throws Propagates observation cleanup failures.
   */
  private disconnect(entry: BlockVirtualizationEntry): void {
    const release = entry.releaseObservation;
    entry.binding = undefined;
    entry.releaseObservation = undefined;
    release?.();
  }

  /**
   * Releases every observation belonging to one exact binding.
   *
   * @param binding - Binding identity captured by its owner.
   * @returns All matching observations have been offered cleanup.
   * @throws AggregateError if one or more observation disposers fail.
   */
  private unbind(binding: BlockVirtualizationBinding): void {
    if (this.binding !== binding) {
      return;
    }
    this.binding = undefined;
    const errors: unknown[] = [];
    for (const entry of [...this.entries]) {
      if (entry.binding !== binding) {
        continue;
      }
      try {
        this.disconnect(entry);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Virtualization observation cleanup failed");
    }
  }
}
