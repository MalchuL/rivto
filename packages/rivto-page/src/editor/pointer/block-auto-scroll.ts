/** Client coordinates retained by a single pointer auto-scroll session. */
export interface BlockScrollPoint {
  readonly x: number;
  readonly y: number;
}

/** Physical scroll axes shared by selection and block dragging. */
type BlockScrollAxis = "x" | "y";

/** Advances the nearest scrollable ancestor on each axis, then the page vertically. */
export class BlockAutoScroll {
  private frame: number | undefined;
  private point: BlockScrollPoint | undefined;
  private readonly view: Window | null;

  /**
   * Creates an independent frame session for a selection or drag gesture.
   *
   * No work is scheduled until update supplies pointer coordinates. The owner
   * stops the session on completion, cancellation, detach and extension disposal.
   *
   * @param root - Occurrence whose document and scroll ancestors are used.
   * @param afterScroll - Resolves gesture geometry after scrolling changes the hit target.
   */
  constructor(
    private readonly root: HTMLElement,
    private readonly afterScroll: () => void,
  ) {
    this.view = root.ownerDocument.defaultView;
  }

  /**
   * Replaces the held pointer coordinates and schedules at most one animation frame.
   *
   * Browsers need not emit another pointermove while edge scrolling moves content.
   * The session repeats frames while scrolling can advance under the held pointer.
   *
   * @param point - Latest viewport coordinates in CSS pixels.
   * @param hit - Optional current, uncaptured native event target. When supplied,
   * an in-bounds pointer without a scrollable edge schedules no hit-test frame.
   * @returns The next frame will use the latest coordinates when a window exists.
   */
  update(point: BlockScrollPoint, hit?: Element): void {
    if (
      this.view &&
      hit?.isConnected &&
      hit.ownerDocument === this.root.ownerDocument &&
      !this.hasScrollableEdge(hit, point)
    ) {
      this.stop();
      return;
    }
    this.point = point;
    if (this.frame === undefined && this.view) {
      this.frame = this.view.requestAnimationFrame(this.tick);
    }
  }

  /**
   * Cancels pending animation work and releases the held pointer coordinates.
   *
   * @returns No frame remains scheduled; repeated stops are harmless.
   */
  stop(): void {
    if (this.frame !== undefined) {
      this.view?.cancelAnimationFrame(this.frame);
    }
    this.frame = undefined;
    this.point = undefined;
  }

  /**
   * Advances scroll under the latest pointer and refreshes gesture geometry.
   *
   * @returns A new frame is scheduled only while a scroll ancestor actually moves.
   */
  private tick = (): void => {
    this.frame = undefined;
    const point = this.point;
    if (!point || !this.view) {
      return;
    }
    if (this.scroll(point)) {
      this.afterScroll();
      if (this.point === point) {
        this.update(point);
      }
    }
  };

  /**
   * Checks the current native target's scroll ancestors without another hit test.
   *
   * This check only avoids idle work. Active frames still hit-test afresh so scrolling,
   * clipping and changing layouts cannot retain an obsolete target.
   *
   * @param hit - Connected element from the latest uncaptured pointer input.
   * @param point - Viewport pointer coordinates in CSS pixels.
   * @returns Whether an ancestor or page can advance on either axis at this point.
   */
  private hasScrollableEdge(hit: Element, point: BlockScrollPoint): boolean {
    let element: Element | null = hit;
    const page = this.root.ownerDocument.scrollingElement;
    while (element && element !== page) {
      for (const axis of ["x", "y"] as const) {
        if (this.canAdvance(element, this.elementStep(element, point, axis), axis)) {
          return true;
        }
      }
      element = element.parentElement;
    }
    return (
      !!page &&
      this.pageCanScroll() &&
      this.canAdvance(page, this.edgeStep(point.y, 0, this.view!.innerHeight), "y")
    );
  }

  /**
   * Checks whether an edge step can change this container's bounded scroll offset.
   *
   * @param element - Current scroll container.
   * @param step - Signed CSS pixel displacement requested by edge proximity.
   * @param axis - Physical axis whose offset and scroll range are inspected.
   * @returns Whether scrolling in that direction has remaining space, including negative RTL offsets.
   */
  private canAdvance(element: Element, step: number, axis: BlockScrollAxis): boolean {
    if (!step) {
      return false;
    }
    const horizontal = axis === "x";
    const offset = horizontal ? element.scrollLeft : element.scrollTop;
    const extent = horizontal
      ? element.scrollWidth - element.clientWidth
      : element.scrollHeight - element.clientHeight;
    const rtl = horizontal && this.view!.getComputedStyle(element).direction === "rtl";
    const minimum = rtl ? -extent : 0;
    const maximum = rtl ? 0 : extent;
    return step < 0 ? offset > minimum : offset < maximum;
  }

  /**
   * Tries nested scroll containers from the hit element outwards before the page.
   *
   * @param point - Current viewport pointer coordinates.
   * @returns Whether an eligible container's scroll offset changed.
   */
  private scroll(point: BlockScrollPoint): boolean {
    const hit = this.root.ownerDocument.elementFromPoint(point.x, point.y);
    const movedX = this.scrollAxis(hit, point, "x");
    const movedY = this.scrollAxis(hit, point, "y");
    return movedX || movedY;
  }

  /**
   * Advances the nearest eligible scroll ancestor on one physical axis.
   *
   * Each axis resolves independently so a horizontal board does not prevent its
   * vertically scrolling ancestor from advancing during a diagonal gesture.
   *
   * @param hit - Fresh native hit, or null when the pointer is outside rendered content.
   * @param point - Held viewport coordinates in CSS pixels.
   * @param axis - Physical axis to advance.
   * @returns Whether an ancestor changed its offset, or the unlocked page advanced vertically.
   */
  private scrollAxis(hit: Element | null, point: BlockScrollPoint, axis: BlockScrollAxis): boolean {
    const page = this.root.ownerDocument.scrollingElement;
    for (let element = hit; element && element !== page; element = element.parentElement) {
      if (this.advance(element, this.elementStep(element, point, axis), axis)) {
        return true;
      }
    }
    return (
      axis === "y" &&
      !!page &&
      this.pageCanScroll() &&
      this.advance(page, this.edgeStep(point.y, 0, this.view!.innerHeight), axis)
    );
  }

  /**
   * Computes an edge step only for native scroll containers with overflowing content.
   *
   * @param element - Candidate ancestor of the native hit.
   * @param point - Held viewport coordinates in CSS pixels.
   * @param axis - Physical scroll axis to inspect.
   * @returns Signed step, or zero without overflow or edge proximity; bounds are clipped to the viewport.
   */
  private elementStep(element: Element, point: BlockScrollPoint, axis: BlockScrollAxis): number {
    const horizontal = axis === "x";
    const style = this.view!.getComputedStyle(element);
    const overflow = horizontal ? style.overflowX : style.overflowY;
    const extent = horizontal
      ? element.scrollWidth - element.clientWidth
      : element.scrollHeight - element.clientHeight;
    if (!/(auto|scroll)/.test(overflow) || extent <= 0) {
      return 0;
    }
    const rect = element.getBoundingClientRect();
    return this.edgeStep(
      point[axis],
      Math.max(0, horizontal ? rect.left : rect.top),
      Math.min(
        horizontal ? this.view!.innerWidth : this.view!.innerHeight,
        horizontal ? rect.right : rect.bottom,
      ),
    );
  }

  /**
   * Respects document overflow locks while allowing scroll inside modal content.
   *
   * Browsers permit programmatic scrolling even when a modal locks native page
   * scrolling. Both preflight and frame delivery must honor that same lock.
   *
   * @returns False while the body or document element clips vertical overflow.
   */
  private pageCanScroll(): boolean {
    const document = this.root.ownerDocument;
    return [document.body, document.documentElement].every(
      (element) => !/^(hidden|clip)$/.test(this.view!.getComputedStyle(element).overflowY),
    );
  }

  /**
   * Applies an edge step on one axis, preserving browser scroll limits.
   *
   * @param element - Scroll container to advance.
   * @param step - Signed CSS pixel displacement from edge proximity.
   * @param axis - Physical axis whose native scroll offset changes.
   * @returns Whether the browser accepted a nonzero scroll movement.
   */
  private advance(element: Element, step: number, axis: BlockScrollAxis): boolean {
    if (!step) {
      return false;
    }
    const property = axis === "x" ? "scrollLeft" : "scrollTop";
    const before = element[property];
    element[property] += step;
    return element[property] !== before;
  }

  /**
   * Computes a capped edge step shared by both axes, preflight and actual scrolling.
   *
   * @param position - Pointer coordinate along the requested axis in CSS pixels.
   * @param start - Visible leading coordinate in CSS pixels.
   * @param end - Visible trailing coordinate in CSS pixels.
   * @returns Signed step, or zero outside the edge bands or for an empty viewport.
   */
  private edgeStep(position: number, start: number, end: number): number {
    const threshold = Math.min(96, (end - start) * 0.2);
    if (threshold <= 0) {
      return 0;
    }
    let distance = 0;
    if (position < start + threshold) {
      distance = position - start - threshold;
    } else if (position > end - threshold) {
      distance = position - end + threshold;
    }
    if (!distance) {
      return 0;
    }
    return (
      Math.sign(distance) *
      Math.min(40, Math.max(2, Math.ceil((Math.abs(distance) / threshold) * 20)))
    );
  }
}
