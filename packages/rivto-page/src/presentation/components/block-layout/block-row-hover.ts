import { BLOCK_EDITOR_CLASSES } from "../../block-editor-classes";

/** Viewport coordinates retained only while a mouse or pen is over this occurrence. */
interface BlockHoverPoint {
  readonly x: number;
  readonly y: number;
}

/** Resolves one hovered row from native hits and the bounds of mounted child layouts. */
export class BlockRowHover {
  private readonly listeners: AbortController;
  private hovered?: HTMLElement;
  private point?: BlockHoverPoint;
  private frame?: number;

  /**
   * Observes pointer input without adding hit areas or subscribing to document data.
   *
   * Native row/control hits win. Whitespace follows mounted lists, with ordinary
   * outlines inheriting their available width and explicit layouts bounding it.
   * Window activation does not discard the hovered target: an unchanged pointer
   * must still click its handle on return. Pointer leave/movement clears feedback.
   * The view creating this owner must destroy it before releasing the root.
   *
   * @param root - Existing occurrence boundary, borrowed for this attachment.
   * @throws If the root has no browser window or native listener attachment fails.
   */
  constructor(private readonly root: HTMLElement) {
    const view = root.ownerDocument.defaultView;
    if (!view) {
      throw new Error("Block row hover requires a browser window");
    }
    this.listeners = new view.AbortController();
    const options = { signal: this.listeners.signal, capture: true, passive: true };
    try {
      root.addEventListener("pointermove", this.onPointerMove, options);
      root.addEventListener("pointerleave", this.clear, {
        signal: this.listeners.signal,
        passive: true,
      });
      root.ownerDocument.addEventListener("scroll", this.onScroll, options);
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  /**
   * Releases native observers and removes only this attachment's row feedback.
   *
   * @returns Listeners, pending scroll reconciliation, and the hover marker are removed.
   */
  destroy(): void {
    this.listeners.abort();
    this.clear();
  }

  /**
   * Replaces row feedback only when its DOM identity changes.
   *
   * @param row - Mounted row in this occurrence, or undefined to clear feedback.
   * @returns The previous marker is removed and the current row is marked.
   */
  private setRow(row?: HTMLElement): void {
    if (this.hovered === row) {
      return;
    }
    this.hovered?.removeAttribute("data-block-row-hover");
    this.hovered = row;
    row?.setAttribute("data-block-row-hover", "");
  }

  /**
   * Resolves native ownership before reading whitespace geometry.
   *
   * @param hit - Native pointer target; foreign nested editors never supply local rows.
   * @param point - Current viewport coordinates in CSS pixels.
   * @returns The owning row, or undefined outside rendered block content and gutters.
   */
  private resolve(hit: Element | null, point: BlockHoverPoint): HTMLElement | undefined {
    if (!hit || hit.closest("[data-rivto-block-editor]") !== this.root) {
      return;
    }
    const row = hit.closest<HTMLElement>(`.${BLOCK_EDITOR_CLASSES.row}`);
    if (row?.closest("[data-rivto-block-editor]") === this.root) {
      return row;
    }
    const shell = hit.closest<HTMLElement>(`.${BLOCK_EDITOR_CLASSES.block}[data-block-id]`);
    const item = hit.closest<HTMLElement>("[data-block-item-id]");
    if (
      item &&
      (!shell || shell.contains(item) || item.dataset.blockItemId === shell.dataset.blockId)
    ) {
      return this.resolveItem(item, point);
    }
    if (shell?.closest("[data-rivto-block-editor]") === this.root) {
      return this.resolveShell(shell, point);
    }
    const list = hit.closest<HTMLElement>("[data-block-root-list]");
    return list ? this.resolveList(list, point, false) : undefined;
  }

  /**
   * Follows a shell's child host before choosing its own header or exposed gutter.
   *
   * @param shell - Mounted block shell in this occurrence.
   * @param point - Viewport pointer coordinates in CSS pixels.
   * @returns Deepest matching row, the parent's exposed gutter row, or undefined.
   */
  private resolveShell(shell: HTMLElement, point: BlockHoverPoint): HTMLElement | undefined {
    const row = shell.querySelector<HTMLElement>(`:scope > .${BLOCK_EDITOR_CLASSES.row}`);
    const list = shell.querySelector<HTMLElement>(
      `:scope > .${BLOCK_EDITOR_CLASSES.children}:not([hidden])`,
    );
    if (list) {
      const rect = list.getBoundingClientRect();
      if (point.y >= rect.top && point.y <= rect.bottom) {
        const bounded = list.hasAttribute("data-block-hover-boundary");
        if (bounded && (point.x < rect.left || point.x > rect.right)) {
          return row ?? undefined;
        }
        const child = this.resolveList(list, point, bounded);
        if (child) {
          return child;
        }
      }
    }
    if (row) {
      const rect = row.getBoundingClientRect();
      if (point.y >= rect.top && point.y <= rect.bottom) {
        return row;
      }
    }
    return undefined;
  }

  /**
   * Reads one vertical branch or immediate multi-axis items without traversing their subtrees.
   *
   * @param host - Actual child host or occurrence-local root list.
   * @param point - Viewport pointer coordinates in CSS pixels.
   * @param bounded - Whether item width constrains ownership in this layout.
   * @returns A matching descendant row, or undefined for gaps, controls, and virtual spacers.
   */
  private resolveList(
    host: HTMLElement,
    point: BlockHoverPoint,
    bounded: boolean,
  ): HTMLElement | undefined {
    const children = this.items(host);
    if (bounded) {
      const style = this.root.ownerDocument.defaultView!.getComputedStyle(host);
      if (
        style.display === "grid" ||
        (style.display === "flex" &&
          (style.flexDirection !== "column" || style.flexWrap !== "nowrap"))
      ) {
        return this.resolveItemsAtPoint(children, point);
      }
    }
    let low = 0;
    let high = children.length;
    let candidate: Element | undefined;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      let index = middle;
      let rect = children[index]!.getBoundingClientRect();
      while (rect.height === 0 && index + 1 < children.length) {
        index += 1;
        rect = children[index]!.getBoundingClientRect();
      }
      if (rect.height === 0) {
        high = middle;
      } else if (rect.top <= point.y) {
        candidate = children[index]!;
        low = index + 1;
      } else {
        high = middle;
      }
    }
    return candidate ? this.resolveItem(candidate, point) : undefined;
  }

  /**
   * Reads direct items from a child host or the occurrence's virtual root wrapper.
   *
   * Virtual root wrappers retain their live collection. Zero-height gap wrappers
   * are skipped during vertical lookup; controls never supply a block shell.
   *
   * @param host - Layout host whose child order follows its current DOM order.
   * @returns Live immediate children without enumerating descendant block lists.
   */
  private items(host: HTMLElement): HTMLCollection {
    if (host.hasAttribute("data-block-root-list")) {
      for (const child of host.children) {
        if (child.classList.contains(BLOCK_EDITOR_CLASSES.tree)) {
          return child.children;
        }
      }
    }
    return host.children;
  }

  /**
   * Resolves only the item containing the pointer in a grid, row, or wrapping layout.
   *
   * @param items - Immediate mounted items, including controls and zero-area gap wrappers.
   * @param point - Viewport pointer coordinates in CSS pixels.
   * @returns A descendant row within one item, or undefined for unused layout space.
   */
  private resolveItemsAtPoint(
    items: HTMLCollection,
    point: BlockHoverPoint,
  ): HTMLElement | undefined {
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      if (
        point.x >= rect.left &&
        point.x <= rect.right &&
        point.y >= rect.top &&
        point.y <= rect.bottom
      ) {
        const row = this.resolveItem(item, point);
        if (row) {
          return row;
        }
      }
    }
    return undefined;
  }

  /**
   * Unwraps placement geometry and uses owned item chrome as a fallback for its row.
   *
   * Native rows and matching descendants retain priority. Only an explicitly
   * identified item contributes padding and insertion strips to hover; virtual
   * wrappers retain the shell's vertical bounds and inherited outline width.
   *
   * @param item - Mounted block or placement wrapper; controls and spacers have no shell.
   * @param point - Viewport pointer coordinates in CSS pixels.
   * @returns The matching row, or undefined for a foreign occurrence or unmatched item.
   */
  private resolveItem(item: Element, point: BlockHoverPoint): HTMLElement | undefined {
    const selector = `.${BLOCK_EDITOR_CLASSES.block}[data-block-id]`;
    const shell = item.matches(selector)
      ? (item as HTMLElement)
      : item.querySelector<HTMLElement>(selector);
    if (!shell || shell.closest("[data-rivto-block-editor]") !== this.root) {
      return;
    }
    const ownsShell = item.getAttribute("data-block-item-id") === shell.dataset.blockId;
    const rect = (ownsShell ? item : shell).getBoundingClientRect();
    if (
      point.y < rect.top ||
      point.y > rect.bottom ||
      (ownsShell && (point.x < rect.left || point.x > rect.right))
    ) {
      return;
    }
    const row = this.resolveShell(shell, point);
    if (row || !ownsShell) {
      return row;
    }
    return shell.querySelector<HTMLElement>(`:scope > .${BLOCK_EDITOR_CLASSES.row}`) ?? undefined;
  }

  /**
   * Clears hover and cancels pending scroll reconciliation.
   *
   * @returns No retained pointer coordinates, animation frame, or row marker remain.
   */
  private readonly clear = (): void => {
    this.point = undefined;
    if (this.frame !== undefined) {
      this.root.ownerDocument.defaultView!.cancelAnimationFrame(this.frame);
      this.frame = undefined;
    }
    this.setRow();
  };

  /**
   * Uses native mouse/pen targets; pressed pointers and touch do not create hover feedback.
   *
   * @param event - Native pointer movement captured by this occurrence root.
   * @returns At most one row marker changes; document state is untouched.
   */
  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === "touch" || event.buttons !== 0) {
      this.clear();
      return;
    }
    this.point = { x: event.clientX, y: event.clientY };
    const target =
      event.target instanceof this.root.ownerDocument.defaultView!.Element ? event.target : null;
    this.setRow(this.resolve(target, this.point));
  };

  /**
   * Reconciles a stationary pointer after scrolling using fresh native hit testing.
   *
   * @returns One pending frame updates hover after layout; repeated scroll events coalesce.
   */
  private readonly onScroll = (): void => {
    if (!this.point || this.frame !== undefined) {
      return;
    }
    this.frame = this.root.ownerDocument.defaultView!.requestAnimationFrame(() => {
      this.frame = undefined;
      if (this.point) {
        const { x, y } = this.point;
        this.setRow(this.resolve(this.root.ownerDocument.elementFromPoint(x, y), this.point));
      }
    });
  };
}
