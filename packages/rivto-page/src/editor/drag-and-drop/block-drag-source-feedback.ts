/** Owns temporary source appearance for one pointer gesture and one mounted occurrence. */
export class BlockDragSourceFeedback {
  private readonly previous = new Map<HTMLElement, string | null>();

  /**
   * Borrows the occurrence and the source shell resolved by pointerdown.
   *
   * No DOM lookup or mutation happens before activation. The gesture owner must
   * clear this feedback on completion, cancellation, detach and delivery failure.
   *
   * @param root - Exact editor occurrence, excluding nested editor roots.
   * @param active - Already resolved shell whose handle reserved the pointer.
   */
  constructor(
    private readonly root: HTMLElement,
    private readonly active: HTMLElement,
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
    const activeId = this.active.getAttribute("data-block-id");
    if (activeId && selected.has(activeId)) {
      this.mark(this.active);
    }
    if (ids.length === 1 && ids[0] === activeId) {
      return;
    }
    for (const element of this.root.querySelectorAll<HTMLElement>("[data-block-selected]")) {
      if (selected.has(element.getAttribute("data-block-id") ?? "")) {
        this.mark(element);
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
    for (const [element, value] of this.previous) {
      try {
        if (value === null) {
          element.removeAttribute("data-dragging");
        } else {
          element.setAttribute("data-dragging", value);
        }
      } catch (error) {
        errors.push(error);
      }
    }
    this.previous.clear();
    if (errors.length) {
      throw new AggregateError(errors, "Block drag source feedback cleanup failed");
    }
  }

  /**
   * Retains the previous marker before decorating a shell owned by this occurrence.
   *
   * @param element - Candidate source shell; shells outside root or in nested editors are ignored.
   * @returns One owned marker is acquired at most once for the shell.
   * @throws DOM mutation failures after retaining the original value for cleanup.
   */
  private mark(element: HTMLElement): void {
    if (
      this.previous.has(element) ||
      !this.root.contains(element) ||
      element.closest("[data-rivto-block-editor]") !== this.root
    ) {
      return;
    }
    this.previous.set(element, element.getAttribute("data-dragging"));
    element.setAttribute("data-dragging", "true");
  }
}
