import { BLOCK_EDITOR_CLASSES } from "../../../block-editor-classes";
import type { InputHit, InputRegion, InputRegionChildren, PointerInput } from "@chulane/rivto-root";
import type { BlockEditorEventsApi } from "../../../../editor/events/types";
import type { BlockInputEvent } from "../../../../editor/events/types";
import type { BlockLayoutRegions } from "../block-layout-regions";
import type { BlockHoverPoint, BlockHoverRoot } from "./types";

let nextHoverObserver = 0;

/** Resolves one hovered row from native hits and the bounds of mounted child layouts. */
export class BlockRowHover {
  private readonly rootIdentity: object;
  private hovered?: object;
  private releaseMarker?: () => void;
  private active = true;
  private point?: BlockHoverPoint;
  private cancelFrame?: () => void;
  private releaseScroll?: () => void;
  private releasePointerInput?: () => void;
  private releasePointerLeave?: () => void;
  private releaseDetach?: () => void;

  /**
   * Observes pointer input without adding hit areas or subscribing to document data.
   *
   * Native row/control hits win. Whitespace follows mounted lists, with ordinary
   * outlines inheriting their available width and explicit layouts bounding it.
   * Window activation does not discard the hovered target: an unchanged pointer
   * must still click its handle on return. Pointer leave/movement clears feedback.
   * The view creating this owner must destroy it before releasing the root.
   *
   * @param rootIdentity - Opaque identity of the view's occurrence boundary.
   * @param events - Occurrence event observations; registrations survive attachment replacement.
   * @param getRoot - Reads the live Root borrowed from this view's controller.
   * @param regions - Occurrence-local lookup of explicitly registered layout roles.
   * @throws If normalized input registration or listener attachment fails.
   */
  constructor(
    rootIdentity: object,
    events: Pick<BlockEditorEventsApi, "observe" | "onDetach">,
    private readonly getRoot: () => BlockHoverRoot | undefined,
    private readonly regions: Pick<
      BlockLayoutRegions,
      "getRegionIdentity" | "getRegistration" | "getIdentities"
    >,
  ) {
    this.rootIdentity = rootIdentity;
    const observer = `page.row-hover.${nextHoverObserver++}`;
    try {
      this.releasePointerInput = events.observe(
        `${observer}.move`,
        {
          type: "pointermove",
          target: "root",
          capture: true,
          priority: 0,
          scope: "including-nested",
        },
        ({ input }) => this.onPointerMove(input),
      );
      this.releasePointerLeave = events.observe(
        `${observer}.leave`,
        {
          type: "pointerleave",
          target: "root",
          capture: false,
          priority: 0,
          scope: "including-nested",
        },
        ({ input }) => this.onPointerLeave(input),
      );
      this.releaseScroll = events.observe(
        `${observer}.scroll`,
        { type: "scroll", target: "document", capture: true, priority: 0 },
        this.onScroll,
      );
      this.releaseDetach = events.onDetach(this.clear);
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  /**
   * Releases native observers and removes only this attachment's row feedback.
   *
   * @returns Listeners, pending scroll reconciliation, and the hover marker are removed.
   * @throws Propagates cleanup failures, aggregated when multiple releases fail.
   */
  destroy(): void {
    this.active = false;
    const errors: unknown[] = [];
    for (const cleanup of [
      this.releasePointerInput,
      this.releasePointerLeave,
      this.releaseScroll,
      this.releaseDetach,
      this.clear,
    ]) {
      try {
        cleanup?.();
      } catch (error) {
        errors.push(error);
      }
    }
    this.releaseScroll = undefined;
    this.releasePointerInput = undefined;
    this.releasePointerLeave = undefined;
    this.releaseDetach = undefined;
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Row hover cleanup failed");
    }
  }

  /**
   * Replaces row feedback only when its DOM identity changes.
   *
   * @param row - Captured row in this occurrence, or undefined to clear feedback.
   * @returns The previous marker is removed and the current row is marked.
   */
  private setRow(row?: InputRegion): void {
    const identity = row?.getIdentity();
    if (this.hovered === identity) {
      return;
    }
    this.releaseMarker?.();
    this.releaseMarker = undefined;
    this.hovered = undefined;
    if (row && identity) {
      this.releaseMarker = row.setTemporaryAttribute("data-block-row-hover", "");
      this.hovered = identity;
    }
  }

  /**
   * Resolves hit ownership before reading whitespace geometry.
   *
   * @param hit - Captured target; foreign nested editors never supply local rows.
   * @param point - Current viewport coordinates in CSS pixels.
   * @param inputRoot - Root captured for the current synchronous resolution.
   * @returns The owning row, or undefined outside rendered block content and gutters.
   * @throws Propagates hit, selector, and Root ownership failures.
   */
  private resolve(
    hit: InputHit | undefined,
    point: BlockHoverPoint,
    inputRoot: BlockHoverRoot,
  ): InputRegion | undefined {
    const rootIdentity = inputRoot.getElementIdentity?.();
    if (
      !hit ||
      !rootIdentity ||
      hit.getNearestAncestorIdentity("[data-rivto-block-editor]") !== rootIdentity
    ) {
      return;
    }
    const capture = (selector: string): InputRegion | undefined => {
      const identity = hit.getNearestAncestorIdentity(selector);
      return identity
        ? inputRoot.captureRegionByIdentity(identity, () => hit.isCurrent())
        : undefined;
    };
    const boundary = inputRoot.captureRegionByIdentity(rootIdentity, () => hit.isCurrent());
    const target = capture("*");
    if (!boundary || !target) {
      return;
    }
    const slotRow = this.resolveSlotRow(target, boundary, inputRoot);
    if (slotRow === null) {
      return;
    }
    const row = slotRow ?? capture(`.${BLOCK_EDITOR_CLASSES.row}`);
    if (row) {
      return row;
    }
    const shell = capture(`.${BLOCK_EDITOR_CLASSES.block}[data-block-id]`);
    const item = capture("[data-block-item-id]");
    if (
      item &&
      (!shell ||
        shell.containsRegion(item) ||
        item.readAttribute("data-block-item-id") === shell.readAttribute("data-block-id"))
    ) {
      return this.resolveItem(item, point, inputRoot);
    }
    if (shell) {
      return this.resolveShell(shell, point, inputRoot);
    }
    const list = capture("[data-block-root-list]");
    return list ? this.resolveList(list, point, false, inputRoot) : undefined;
  }

  /**
   * Resolves the registered slot or body owning a hit before its block boundary.
   *
   * @param target - Captured target inside the current occurrence.
   * @param boundary - Captured occurrence boundary for the ancestor walk.
   * @param inputRoot - Root used to capture the registered owner row.
   * @returns The registered owner row, undefined for an ordinary hit or omitted row,
   * or null when ownership changes during traversal.
   * @throws Propagates region traversal and ownership failures.
   */
  private resolveSlotRow(
    target: InputRegion,
    boundary: InputRegion,
    inputRoot: BlockHoverRoot,
  ): InputRegion | null | undefined {
    let row: InputRegion | undefined;
    const walked = target.someAncestorWithin(boundary, (region) => {
      const identity = region.getIdentity();
      const entry = identity && this.regions.getRegistration(identity);
      if (entry?.role === "slot" || entry?.role === "body") {
        const rowIdentity = this.regions.getIdentities(entry.blockId, "row")[0];
        row = rowIdentity ? inputRoot.captureRegionByIdentity(rowIdentity) : undefined;
        return true;
      }
      return region.matches("[data-block-id], [data-rivto-block-editor]") === true;
    });
    return walked === undefined ? null : row;
  }

  /**
   * Follows a shell's child host before choosing its own header or exposed gutter.
   *
   * @param shell - Captured block shell in this occurrence.
   * @param point - Viewport pointer coordinates in CSS pixels.
   * @param inputRoot - Root captured for the current synchronous resolution.
   * @returns Deepest matching row, the parent's exposed gutter row, or undefined.
   */
  private resolveShell(
    shell: InputRegion,
    point: BlockHoverPoint,
    inputRoot: BlockHoverRoot,
  ): InputRegion | undefined {
    const row = this.ownedRegion(shell, "row", inputRoot);
    const children = this.ownedRegion(shell, "children", inputRoot);
    const list = children?.readAttribute("hidden") === undefined ? children : undefined;
    if (list) {
      const rect = list.readBounds();
      if (!rect) {
        return undefined;
      }
      if (point.y >= rect.top && point.y <= rect.top + rect.height) {
        const bounded = list.readAttribute("data-block-hover-boundary") !== undefined;
        if (bounded && (point.x < rect.left || point.x > rect.left + rect.width)) {
          return row ?? undefined;
        }
        const child = this.resolveList(list, point, bounded, inputRoot);
        if (child) {
          return child;
        }
      }
    }
    if (row) {
      const rect = row.readBounds();
      if (rect && point.y >= rect.top && point.y <= rect.top + rect.height) {
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
   * @param inputRoot - Root captured for the current synchronous resolution.
   * @returns A matching descendant row, or undefined for gaps, controls, and virtual spacers.
   */
  private resolveList(
    host: InputRegion,
    point: BlockHoverPoint,
    bounded: boolean,
    inputRoot: BlockHoverRoot,
  ): InputRegion | undefined {
    const children = this.items(host);
    const count = children?.getLength();
    if (!children || count === undefined) {
      return undefined;
    }
    if (bounded) {
      const multiAxis = this.isMultiAxis(host);
      if (multiAxis === undefined) {
        return undefined;
      }
      if (multiAxis) {
        return this.resolveItemsAtPoint(children, point, inputRoot);
      }
    }
    let low = 0;
    let high = count;
    let candidate: InputRegion | undefined;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      let index = middle;
      let item = children.get(index);
      let rect = item?.readBounds();
      if (!rect) {
        return undefined;
      }
      while (rect.height === 0 && index + 1 < count) {
        index += 1;
        item = children.get(index);
        rect = item?.readBounds();
        if (!rect) {
          return undefined;
        }
      }
      if (rect.height === 0) {
        high = middle;
      } else if (rect.top <= point.y) {
        candidate = item;
        low = index + 1;
      } else {
        high = middle;
      }
    }
    return candidate ? this.resolveItem(candidate, point, inputRoot) : undefined;
  }

  /**
   * Checks whether a bounded host arranges its immediate items across both axes.
   *
   * @param host - Mounted host whose computed layout controls item search.
   * @returns True for grid or non-column/wrapping flex, false for linear flow,
   * or undefined when the host or attachment is no longer available.
   * @throws Propagates browser measurement and Root ownership failures.
   */
  private isMultiAxis(host: InputRegion): boolean | undefined {
    const style = host.readLayout(["display", "flex-direction", "flex-wrap"]);
    if (!style) {
      return undefined;
    }
    const properties = style.properties;
    return (
      properties.display === "grid" ||
      (properties.display === "flex" &&
        (properties["flex-direction"] !== "column" || properties["flex-wrap"] !== "nowrap"))
    );
  }

  /**
   * Reads direct items from a child host or the occurrence's virtual root wrapper.
   *
   * Virtual root wrappers retain their live collection. Zero-height gap wrappers
   * are skipped during vertical lookup; controls never supply a block shell.
   *
   * @param host - Layout host whose child order follows its current presentation order.
   * @returns Live indexed children without enumerating descendant block lists, or undefined when detached.
   */
  private items(host: InputRegion): InputRegionChildren | undefined {
    const children = host.captureChildren();
    const count = children?.getLength();
    if (!children || count === undefined) {
      return undefined;
    }
    if (host.readAttribute("data-block-root-list") !== undefined) {
      for (let index = 0; index < count; index += 1) {
        const child = children.get(index);
        if (!child) {
          return undefined;
        }
        if (child.matches(`.${BLOCK_EDITOR_CLASSES.tree}`)) {
          return child.captureChildren();
        }
      }
    }
    return children;
  }

  /**
   * Resolves only the item containing the pointer in a grid, row, or wrapping layout.
   *
   * @param items - Indexed immediate items, including controls and zero-area gap wrappers.
   * @param point - Viewport pointer coordinates in CSS pixels.
   * @param inputRoot - Root captured for the current synchronous resolution.
   * @returns A descendant row within one item, or undefined for unused layout space.
   */
  private resolveItemsAtPoint(
    items: InputRegionChildren,
    point: BlockHoverPoint,
    inputRoot: BlockHoverRoot,
  ): InputRegion | undefined {
    const count = items.getLength();
    if (count === undefined) {
      return undefined;
    }
    for (let index = 0; index < count; index += 1) {
      const item = items.get(index);
      const rect = item?.readBounds();
      if (!item || !rect) {
        return undefined;
      }
      if (
        point.x >= rect.left &&
        point.x <= rect.left + rect.width &&
        point.y >= rect.top &&
        point.y <= rect.top + rect.height
      ) {
        const row = this.resolveItem(item, point, inputRoot);
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
   * @param item - Captured block or placement wrapper; controls and spacers have no shell.
   * @param point - Viewport pointer coordinates in CSS pixels.
   * @param inputRoot - Root captured for the current synchronous resolution.
   * @returns The matching row, or undefined for a foreign occurrence or unmatched item.
   */
  private resolveItem(
    item: InputRegion,
    point: BlockHoverPoint,
    inputRoot: BlockHoverRoot,
  ): InputRegion | undefined {
    const selector = `.${BLOCK_EDITOR_CLASSES.block}[data-block-id]`;
    const shell = item.matches(selector)
      ? item
      : item.findOwnedRegion(selector, "[data-rivto-block-editor]");
    const rootIdentity = inputRoot.getElementIdentity?.();
    const boundary = rootIdentity && inputRoot.captureRegionByIdentity(rootIdentity);
    if (!shell || !boundary || !this.belongsToRoot(shell, boundary)) {
      return;
    }
    const itemId = item.readAttribute("data-block-item-id");
    const ownsShell = itemId !== undefined && itemId === shell.readAttribute("data-block-id");
    const rect = (ownsShell ? item : shell).readBounds();
    if (!rect) {
      return undefined;
    }
    if (
      point.y < rect.top ||
      point.y > rect.top + rect.height ||
      (ownsShell && (point.x < rect.left || point.x > rect.left + rect.width))
    ) {
      return;
    }
    const row = this.resolveShell(shell, point, inputRoot);
    if (row || !ownsShell) {
      return row;
    }
    return this.ownedRegion(shell, "row", inputRoot);
  }

  /**
   * Resolves an explicitly registered role or a bounded fallback for a custom shell.
   *
   * @param shell - Captured owner region within this occurrence.
   * @param role - Row or child-list role required by hover.
   * @param inputRoot - Root captured for the current synchronous resolution.
   * @returns The owned role, or undefined when absent or no longer attached.
   * @throws Propagates selector, region lookup, and Root ownership failures.
   */
  private ownedRegion(
    shell: InputRegion,
    role: "row" | "children",
    inputRoot: BlockHoverRoot,
  ): InputRegion | undefined {
    const registered = this.regions.getRegionIdentity(shell, role, inputRoot);
    if (registered.registered) {
      return registered.identity
        ? inputRoot.captureRegionByIdentity(registered.identity)
        : undefined;
    }
    const selector =
      role === "row" ? `.${BLOCK_EDITOR_CLASSES.row}` : `.${BLOCK_EDITOR_CLASSES.children}`;
    return shell.findOwnedRegion(selector, "[data-block-id], [data-rivto-block-editor]");
  }

  /**
   * Rejects a region whose nearest editor boundary is not the captured root.
   *
   * @param region - Region to check, potentially inside a nested occurrence.
   * @param boundary - Root region bounding the ancestor walk.
   * @returns True only when the nearest editor marker is the captured root.
   * @throws Propagates selector and Root ownership failures.
   */
  private belongsToRoot(region: InputRegion, boundary: InputRegion): boolean {
    let matches = false;
    const walked = region.someAncestorWithin(boundary, (ancestor) => {
      if (!ancestor.matches("[data-rivto-block-editor]")) {
        return false;
      }
      matches = ancestor.isSame(boundary);
      return true;
    });
    return walked === true && matches;
  }

  /**
   * Clears hover and cancels pending scroll reconciliation.
   *
   * @returns No retained pointer coordinates, animation frame, or row marker remain.
   */
  private readonly clear = (): void => {
    this.point = undefined;
    this.cancelFrame?.();
    this.cancelFrame = undefined;
    this.setRow();
  };

  /**
   * Uses normalized mouse/pen targets; pressed pointers and touch do not create hover feedback.
   *
   * @param input - Pointer movement captured by this occurrence root.
   * @returns At most one row marker changes; document state is untouched.
   */
  private readonly onPointerMove = (input: PointerInput<"pointermove">): void => {
    if (input.pointerType === "touch" || input.buttons !== 0) {
      this.clear();
      return;
    }
    const inputRoot = this.getRoot();
    if (!inputRoot?.isAttached() || inputRoot.getElementIdentity?.() !== this.rootIdentity) {
      this.clear();
      return;
    }
    const point = { x: input.clientX, y: input.clientY };
    this.point = point;
    const hit = input.target?.captureTargetHit();
    try {
      const row = this.resolve(hit, point, inputRoot);
      if (
        this.active &&
        this.point === point &&
        this.getRoot() === inputRoot &&
        inputRoot.isAttached()
      ) {
        this.setRow(row);
      }
    } finally {
      hit?.release();
    }
  };

  /**
   * Clears feedback when the pointer leaves the current occurrence.
   *
   * @param _input - Normalized pointer-leave delivery on the occurrence root.
   * @returns The current marker and pending scroll reconciliation are released.
   * @throws Propagates marker and frame cleanup failures.
   */
  private readonly onPointerLeave = (_input: PointerInput<"pointerleave">): void => {
    this.clear();
  };

  /**
   * Reconciles a stationary pointer after scrolling using fresh native hit testing.
   *
   * @param event - Normalized document scroll and its current occurrence Root.
   * @returns One pending frame updates hover after layout; repeated scroll events coalesce.
   * @throws Propagates Root capture and frame scheduling failures.
   */
  private readonly onScroll = (event: BlockInputEvent<"scroll">): void => {
    if (
      !this.point ||
      this.cancelFrame ||
      this.getRoot() !== event.root ||
      event.root.getElementIdentity?.() !== this.rootIdentity
    ) {
      return;
    }
    const document = event.root.captureDocument();
    const clock = event.root.captureFrameClock();
    if (!document || !clock) {
      return;
    }
    this.cancelFrame = clock.requestFrame(() => {
      this.cancelFrame = undefined;
      if (!this.point || !document.isCurrent()) {
        return;
      }
      const point = this.point;
      const hit = document.captureHit(point.x, point.y);
      try {
        if (!this.active || this.point !== point || !document.isCurrent()) {
          return;
        }
        const row = this.resolve(hit, point, event.root);
        if (
          this.active &&
          this.point === point &&
          this.getRoot() === event.root &&
          document.isCurrent()
        ) {
          this.setRow(row);
        }
      } finally {
        hit?.release();
      }
    });
  };
}
