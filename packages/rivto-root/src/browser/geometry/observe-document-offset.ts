/**
 * Observes an element's document offset and follows the end during remeasurement.
 *
 * This browser mounting operation retains the supplied elements until cleanup.
 * Captured scroll runs before windowing can replace content; resize measurements
 * schedule at most one end adjustment and scrolling away cancels following.
 *
 * @param host - Element whose top defines the document offset.
 * @param root - Occurrence whose size is observed alongside the document body.
 * @param onOffset - Receives the measured top in document CSS pixels.
 * @param isCurrent - Checks whether the region still belongs to its occurrence.
 * @returns Idempotent disposer releasing listeners, observation, and pending frame.
 * @throws Propagates browser setup, measurement, callback, and cleanup failures.
 */
export function observeDocumentOffsetAndFollowEnd(
  host: Element,
  root: HTMLElement,
  onOffset: (offset: number) => void,
  isCurrent: () => boolean = () => true,
): () => void {
  return new DocumentOffsetObserver(host, root, onOffset, isCurrent).start();
}

/** Owns browser measurement and end-following resources for one mounted host. */
class DocumentOffsetObserver {
  private readonly document: Document;
  private readonly view: Window;
  private followingEnd = false;
  private frame: number | undefined;
  private active = true;
  private observer: ResizeObserver | undefined;

  /**
   * Captures the mounted host and document used for measurements.
   *
   * @param host - Element whose top defines the document offset.
   * @param root - Occurrence whose size is observed alongside the document body.
   * @param onOffset - Receives the measured top in document CSS pixels.
   * @param isCurrent - Checks whether the region still belongs to its occurrence.
   */
  constructor(
    private readonly host: Element,
    private readonly root: HTMLElement,
    private readonly onOffset: (offset: number) => void,
    private readonly isCurrent: () => boolean,
  ) {
    this.document = root.ownerDocument;
    this.view = this.document.defaultView!;
  }

  /**
   * Installs measurement and scroll observation, rolling back partial setup.
   *
   * @returns Idempotent disposer releasing all installed browser resources.
   * @throws Propagates setup failures and aggregates failed rollback.
   */
  start(): () => void {
    try {
      this.measure();
      if (!this.isAvailable()) {
        return () => this.dispose();
      }
      this.observer =
        typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(this.measure);
      this.observer?.observe(this.root);
      this.observer?.observe(this.document.body);
      this.view.addEventListener("resize", this.measure);
      this.view.addEventListener("scroll", this.captureScroll, true);
      return () => this.dispose();
    } catch (error) {
      try {
        this.dispose();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Document offset observation setup failed");
      }
      throw error;
    }
  }

  /**
   * Reports the current document offset before adjusting the end position.
   *
   * @returns The current offset is delivered while this observation is active.
   * @throws Propagates browser measurement and callback failures.
   */
  private measure = (): void => {
    if (this.isAvailable()) {
      const offset = this.host.getBoundingClientRect().top + this.view.scrollY;
      if (this.isAvailable()) {
        this.onOffset(offset);
      }
      if (this.isAvailable()) {
        this.scheduleEndAdjustment();
      }
    }
  };

  /**
   * Captures whether scrolling reached the end before windowing updates content.
   *
   * @returns Scrolling away disables end following until the end is reached again.
   */
  private captureScroll = (): void => {
    if (!this.isAvailable()) {
      return;
    }
    this.followingEnd =
      this.view.scrollY + this.view.innerHeight >= this.document.documentElement.scrollHeight - 2;
  };

  /**
   * Preserves the end position after measured content changes.
   *
   * @returns One pending frame is scheduled when end following is active.
   */
  private scheduleEndAdjustment(): void {
    if (!this.followingEnd || this.frame !== undefined) {
      return;
    }
    this.frame = this.view.requestAnimationFrame(() => {
      this.frame = undefined;
      if (this.isAvailable() && this.followingEnd) {
        this.view.scrollTo({
          top: this.document.documentElement.scrollHeight,
          behavior: "instant",
        });
      }
    });
  }

  /**
   * Releases all geometry observation resources once.
   *
   * @returns Every installed listener and the pending frame have been offered cleanup.
   * @throws AggregateError if any browser cleanup fails.
   */
  private dispose(): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    const frame = this.frame;
    this.frame = undefined;
    const errors: unknown[] = [];
    for (const release of [
      () => this.observer?.disconnect(),
      () => this.view.removeEventListener("resize", this.measure),
      () => this.view.removeEventListener("scroll", this.captureScroll, true),
      () => {
        if (frame !== undefined) {
          this.view.cancelAnimationFrame(frame);
        }
      },
    ]) {
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Document offset observation cleanup failed");
    }
  }

  /**
   * Checks the captured occurrence and document before browser work continues.
   *
   * @returns False after disposal, document adoption, or occurrence replacement.
   * @throws Propagates the occurrence ownership check.
   */
  private isAvailable(): boolean {
    return (
      this.active &&
      this.host.ownerDocument === this.document &&
      this.root.ownerDocument === this.document &&
      this.isCurrent() &&
      this.active &&
      this.host.ownerDocument === this.document &&
      this.root.ownerDocument === this.document
    );
  }
}
