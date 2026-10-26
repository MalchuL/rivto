/** Client coordinates retained by a single pointer auto-scroll session. */
export interface BlockScrollPoint {
  readonly x: number;
  readonly y: number;
}

/** Advances the nearest scrollable ancestor and then the page at pointer edges. */
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
      !this.hasScrollableEdge(hit, point.y)
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
   * @param y - Viewport pointer height in CSS pixels.
   * @returns Whether an ancestor or page can advance at this pointer height.
   */
  private hasScrollableEdge(hit: Element, y: number): boolean {
    let element: Element | null = hit;
    const page = this.root.ownerDocument.scrollingElement;
    while (element && element !== page) {
      if (
        /(auto|scroll)/.test(this.view!.getComputedStyle(element).overflowY) &&
        element.scrollHeight > element.clientHeight
      ) {
        const rect = element.getBoundingClientRect();
        if (this.canAdvance(element, this.edgeStep(y, rect.top, rect.bottom))) {
          return true;
        }
      }
      element = element.parentElement;
    }
    return (
      !!page &&
      this.pageCanScroll() &&
      this.canAdvance(page, this.edgeStep(y, 0, this.view!.innerHeight))
    );
  }

  /**
   * Checks whether an edge step can change this container's bounded scroll offset.
   *
   * @param element - Current scroll container.
   * @param step - Signed CSS pixel displacement requested by edge proximity.
   * @returns Whether scrolling in that direction has remaining space.
   */
  private canAdvance(element: Element, step: number): boolean {
    return step < 0
      ? element.scrollTop > 0
      : step > 0 && element.scrollTop < element.scrollHeight - element.clientHeight;
  }

  /**
   * Tries nested scroll containers from the hit element outwards before the page.
   *
   * @param point - Current viewport pointer coordinates.
   * @returns Whether an eligible container's scroll offset changed.
   */
  private scroll(point: BlockScrollPoint): boolean {
    const document = this.root.ownerDocument;
    let element = document.elementFromPoint(point.x, point.y);
    while (element && element !== document.scrollingElement) {
      const style = this.view!.getComputedStyle(element);
      if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight) {
        const rect = element.getBoundingClientRect();
        if (this.advance(element, point.y, rect.top, rect.bottom)) {
          return true;
        }
      }
      element = element.parentElement;
    }
    const page = document.scrollingElement;
    return !!page && this.pageCanScroll() && this.advance(page, point.y, 0, this.view!.innerHeight);
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
   * Applies a bounded vertical edge step, preserving browser scroll limits.
   *
   * @param element - Scroll container to advance.
   * @param y - Pointer position in viewport CSS pixels.
   * @param top - Visible top edge in viewport CSS pixels.
   * @param bottom - Visible bottom edge in viewport CSS pixels.
   * @returns Whether the browser accepted a nonzero scroll movement.
   */
  private advance(element: Element, y: number, top: number, bottom: number): boolean {
    const step = this.edgeStep(y, top, bottom);
    if (!step) {
      return false;
    }
    const before = element.scrollTop;
    element.scrollTop += step;
    return element.scrollTop !== before;
  }

  /**
   * Computes a capped vertical edge step shared by preflight and actual scrolling.
   *
   * @param y - Viewport pointer height in CSS pixels.
   * @param top - Visible top edge in CSS pixels.
   * @param bottom - Visible bottom edge in CSS pixels.
   * @returns Signed step, or zero outside the edge bands or for an empty viewport.
   */
  private edgeStep(y: number, top: number, bottom: number): number {
    const threshold = Math.min(96, (bottom - top) * 0.2);
    if (threshold <= 0) {
      return 0;
    }
    let distance = 0;
    if (y < top + threshold) {
      distance = y - top - threshold;
    } else if (y > bottom - threshold) {
      distance = y - bottom + threshold;
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
