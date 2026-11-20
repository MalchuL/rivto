import type { InputRegion, InputRoot, RegionIdentity } from "@chulane/rivto-root";
import type { BlockLayoutRegion, MountedRegion, RegisteredLayoutRegion } from "./types";
export type { BlockLayoutRegion } from "./types";

/** Owns addressed layout identities for one editor occurrence; refs own their registrations. */
export class BlockLayoutRegions {
  private readonly owners = new Map<string, Set<MountedRegion>>();
  private readonly identities = new WeakMap<RegionIdentity, MountedRegion>();

  /**
   * Registers the identity supplied by a primitive's committed ref.
   *
   * Multiple slots/items are allowed. Disposing an older registration cannot
   * erase a replacement registration for the same identity.
   *
   * @param blockId - Owner within this editor occurrence.
   * @param role - Layout responsibility, independent of DOM depth.
   * @param identity - Opaque identity of the mounted primitive.
   * @returns Idempotent disposer releasing only this registration.
   */
  register(blockId: string, role: BlockLayoutRegion, identity: RegionIdentity): () => void {
    const previous = this.identities.get(identity);
    if (previous) {
      const previousOwners = this.owners.get(previous.blockId);
      previousOwners?.delete(previous);
      if (!previousOwners?.size) {
        this.owners.delete(previous.blockId);
      }
    }
    const entry = { blockId, role, identity };
    const entries = this.owners.get(blockId) ?? new Set<MountedRegion>();
    entries.add(entry);
    this.owners.set(blockId, entries);
    this.identities.set(identity, entry);
    return () => {
      if (this.identities.get(identity) !== entry) {
        return;
      }
      this.identities.delete(identity);
      entries.delete(entry);
      if (!entries.size) {
        this.owners.delete(blockId);
      }
    };
  }

  /**
   * Resolves a role within an active owner without exposing its browser element.
   *
   * Only registered regions contained by this exact owner are eligible. Root
   * captures each candidate for the current occurrence before containment is checked.
   *
   * @param owner - Attachment-bound region for the registered owner.
   * @param role - Layout role to find within that owner.
   * @param root - Borrowed Root capable of capturing registered identities.
   * @returns Registration status and the matching region identity when present.
   * @throws Propagates Root ownership and containment failures.
   */
  getRegionIdentity(
    owner: InputRegion,
    role: BlockLayoutRegion,
    root: Pick<InputRoot, "captureRegionByIdentity">,
  ): RegisteredLayoutRegion {
    const identity = owner.getIdentity();
    const entry = identity && this.identities.get(identity);
    if (!entry) {
      return { registered: false };
    }
    for (const candidate of this.getIdentities(entry.blockId, role)) {
      const region = root.captureRegionByIdentity(candidate);
      if (region && owner.containsRegion(region)) {
        return { registered: true, identity: candidate };
      }
    }
    return { registered: true, identity: undefined };
  }

  /**
   * Reads the owner and role registered for an opaque mounted identity.
   *
   * @param identity - Identity of a region in this editor occurrence.
   * @returns Its active registration, or undefined when it is not registered.
   */
  getRegistration(
    identity: RegionIdentity,
  ): Readonly<Pick<MountedRegion, "blockId" | "role">> | undefined {
    return this.identities.get(identity);
  }

  /**
   * Lists the registered identities for one block and layout role in registration order.
   *
   * @param blockId - Owner within this editor occurrence.
   * @param role - Layout responsibility to find.
   * @returns Opaque identities of the matching mounted regions.
   */
  getIdentities(blockId: string, role: BlockLayoutRegion): readonly RegionIdentity[] {
    const identities: RegionIdentity[] = [];
    for (const entry of this.owners.get(blockId) ?? []) {
      if (entry.role === role) {
        identities.push(entry.identity);
      }
    }
    return identities;
  }

  /**
   * Releases region references when the host destroys this editor.
   *
   * @returns No mounted identities remain owned by this registry.
   */
  destroy(): void {
    for (const entries of this.owners.values()) {
      for (const entry of entries) {
        this.identities.delete(entry.identity);
      }
    }
    this.owners.clear();
  }
}
