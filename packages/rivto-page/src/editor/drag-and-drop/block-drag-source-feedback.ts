import type { InputRegion, InputRoot } from "@chulane/rivto-root";

/** Attribute temporarily applied to the dragged source shells. */
const DRAGGING_ATTRIBUTE = "data-dragging";

/** Owns temporary source appearance for one pointer gesture and one mounted occurrence. */
export class BlockDragSourceFeedback {
  private readonly markers = new Map<string, Map<InputRegion, () => void>>();
  private releaseActive?: () => void;

  /**
   * Borrows the occurrence and the source shell resolved by pointerdown.
   *
   * No DOM lookup or mutation happens before activation. The gesture owner must
   * clear this feedback on completion, cancellation, detach and delivery failure.
   *
   * @param root - Borrowed occurrence capability, excluding nested editor roots.
   * @param active - Captured region whose handle reserved the pointer.
   * @param activeId - Stable block identity of the captured region.
   */
  constructor(
    private readonly root: Pick<InputRoot, "findRegions">,
    private readonly active: Pick<InputRegion, "setTemporaryAttribute">,
    private readonly activeId: string,
  ) {}

  /**
   * Marks mounted source roots after target geometry has been resolved.
   *
   * A single active source requires no query. Groups inspect mounted structural
   * selection feedback once, filtering it through captured canonical source IDs.
   * This visual lookup never determines membership or commands; hidden sources
   * remain in the gesture even though they have no shell to decorate.
   *
   * @param ids - Normalized source roots, excluding descendants of selected ancestors.
   * @returns Mounted source shells are dimmed until clear; nested occurrences are untouched.
   * @throws DOM mutation failures, leaving acquired markers available for cleanup.
   */
  show(ids: readonly string[]): void {
    const selected = new Set(ids);
    if (selected.has(this.activeId) && !this.releaseActive) {
      this.releaseActive = this.active.setTemporaryAttribute(DRAGGING_ATTRIBUTE, "true");
    }
    if (ids.length === 1 && ids[0] === this.activeId) {
      return;
    }
    for (const region of this.root.findRegions(
      "[data-block-selected]",
      "[data-rivto-block-editor]",
    )) {
      const id = region.readAttribute("data-block-id");
      if (id && id !== this.activeId && selected.has(id)) {
        this.mark(id, region);
      }
    }
  }

  /**
   * Restores every borrowed attribute even when one DOM operation fails.
   *
   * @returns All captured shells, including detached shells, have been offered restoration.
   * @throws AggregateError containing all failed restorations.
   */
  clear(): void {
    const errors: unknown[] = [];
    try {
      this.releaseActive?.();
    } catch (error) {
      errors.push(error);
    }
    this.releaseActive = undefined;
    for (const regions of this.markers.values()) {
      for (const release of regions.values()) {
        try {
          release();
        } catch (error) {
          errors.push(error);
        }
      }
    }
    this.markers.clear();
    if (errors.length) {
      throw new AggregateError(errors, "Block drag source feedback cleanup failed");
    }
  }

  /**
   * Retains the previous marker before decorating a shell owned by this occurrence.
   *
   * @param id - Stable block identity used to limit duplicate checks.
   * @param region - Candidate region belonging to the current occurrence.
   * @returns One owned marker is acquired at most once for the region.
   * @throws DOM mutation failures after attempting to restore the original value.
   */
  private mark(id: string, region: InputRegion): void {
    let regions = this.markers.get(id);
    if (!regions) {
      regions = new Map();
      this.markers.set(id, regions);
    }
    if ([...regions.keys()].some((marked) => marked.isSame(region))) {
      return;
    }
    regions.set(region, region.setTemporaryAttribute(DRAGGING_ATTRIBUTE, "true"));
  }
}
