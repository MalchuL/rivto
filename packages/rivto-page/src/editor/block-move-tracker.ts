/** Tracks overlapping structural moves until their owning operations release them. */
export class BlockMoveTracker {
  private readonly moving = new Map<string, Set<symbol>>();

  /**
   * Marks IDs as moving until this exact operation releases them.
   *
   * @param ids - Block IDs being reparented or reordered.
   * @returns An idempotent release that preserves overlapping marks.
   */
  mark(ids: readonly string[]): () => void {
    const token = Symbol();
    for (const id of ids) {
      const marks = this.moving.get(id) ?? new Set<symbol>();
      marks.add(token);
      this.moving.set(id, marks);
    }
    return () => {
      for (const id of ids) {
        const marks = this.moving.get(id);
        marks?.delete(token);
        if (marks?.size === 0) {
          this.moving.delete(id);
        }
      }
    };
  }

  /**
   * Checks whether an operation currently marks this ID as moving.
   *
   * @param id - Block identity to check.
   * @returns True while at least one move owns a mark.
   */
  has(id: string): boolean {
    return this.moving.has(id);
  }

  /**
   * Releases all marks when the owning controller is destroyed.
   *
   * @returns No moving IDs remain tracked.
   */
  clear(): void {
    this.moving.clear();
  }
}
