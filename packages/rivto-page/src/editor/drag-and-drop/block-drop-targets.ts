import { BLOCK_EDITOR_CLASSES } from "../../presentation/block-editor-classes";
import { blockGapIndicator } from "./block-gap-indicator";
import { blockLayoutNeighbor } from "../../presentation/components/block-layout/block-layout-regions";
import type { BlockEditorBlocks } from "../../adapter/types";
import type { BlockEditorResourceOwner } from "../extensions/block-editor-resource-owner";
import type {
  BlockDropTargetsApi,
  BlockDropTargetRegistration,
  BlockDropDestination,
  ResolvedBlockDropTarget,
} from "./types";

/** Captured installation fields; destination reads remain live until this entry is disposed. */
interface DropTargetEntry extends BlockDropTargetRegistration {
  readonly priority: number;
}

/** Editor-owned regions indexed by DOM identity, without a second block tree or geometry cache. */
export class BlockDropTargets implements BlockDropTargetsApi {
  private readonly targets = new Map<HTMLElement, Set<DropTargetEntry>>();

  /**
   * Borrows the editor's data and current attachment without subscribing or measuring.
   *
   * @param owner - Resource lifecycle capturing synchronous extension registrations.
   * @param blocks - Data source used only to validate candidate parents and neighbors.
   * @param getRoot - Live attachment lookup; returns null while the view is detached.
   */
  constructor(
    private readonly owner: BlockEditorResourceOwner,
    private readonly blocks: Pick<BlockEditorBlocks, "getBlockNode" | "getRootIds">,
    private readonly getRoot: () => HTMLElement | null,
  ) {}

  /**
   * Captures an independently disposable target while retaining its live destination callback.
   *
   * @param registration - Mounted element, finite priority, and live destination getter.
   * @returns Idempotent disposer deleting this entry and its empty element bucket.
   * @throws If destroyed or priority is nonfinite.
   */
  register(registration: BlockDropTargetRegistration): () => void {
    this.owner.assertActive();
    const priority = registration.priority ?? 0;
    if (!Number.isFinite(priority)) {
      throw new Error("Drop target priority must be finite");
    }
    const entry = Object.freeze({ ...registration, priority });
    let entries = this.targets.get(entry.element);
    if (!entries) {
      entries = new Set();
      this.targets.set(entry.element, entries);
    }
    entries.add(entry);
    return this.owner.registerCleanup(() => {
      entries.delete(entry);
      if (entries.size === 0) {
        this.targets.delete(entry.element);
      }
    });
  }

  /**
   * Walks only the topmost browser hit's ancestors inside the current editor.
   *
   * @param clientX - Viewport X coordinate in CSS pixels.
   * @param clientY - Viewport Y coordinate in CSS pixels.
   * @param excluded - Captured moving roots omitted after validating the registered gap.
   * @param nativeHit - Connected uncaptured hit from the current native event; omitted to hit-test current geometry.
   * @returns Highest-priority valid candidate, preserving nearest/earliest tie order,
   * or undefined for detached, clipped, foreign, or invalid destinations.
   * @throws If destroyed or delegated DOM/data reads fail.
   */
  resolve(
    clientX: number,
    clientY: number,
    excluded?: ReadonlySet<string>,
    nativeHit?: Element,
  ): ResolvedBlockDropTarget | undefined {
    this.owner.assertActive();
    const root = this.getRoot();
    if (!root?.isConnected || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return undefined;
    }
    const hit =
      nativeHit?.isConnected && nativeHit.ownerDocument === root.ownerDocument
        ? nativeHit
        : root.ownerDocument.elementFromPoint(clientX, clientY);
    return this.resolveHit(hit, excluded);
  }

  /**
   * Resolves registered ancestors of an existing native hit without repeating hit testing.
   *
   * The caller supplies a hit from this synchronous resolution. Current attachment,
   * nested occurrence isolation and live destination validation are still checked.
   *
   * @param element - Current native hit, or null when no element was hit.
   * @param excluded - Moving roots removed from validated gap neighbors.
   * @returns Highest-priority eligible region, or undefined outside this occurrence.
   * @throws If destroyed or a destination read fails.
   */
  resolveHit(
    element: Element | null,
    excluded?: ReadonlySet<string>,
  ): ResolvedBlockDropTarget | undefined {
    this.owner.assertActive();
    const root = this.getRoot();
    if (!root?.isConnected || !element || !root.contains(element)) {
      return undefined;
    }
    const boundary = element.closest("[data-rivto-block-editor]");
    if (boundary && boundary !== root && root.contains(boundary)) {
      return undefined;
    }
    let selected: ResolvedBlockDropTarget | undefined;
    let priority = -Infinity;
    let indicatorAxis: BlockDropTargetRegistration["indicatorAxis"];
    while (element) {
      for (const entry of this.targets.get(element as HTMLElement) ?? []) {
        if (entry.priority <= priority) {
          continue;
        }
        const candidate = entry.getDestination();
        const destination = candidate && this.currentDestination(candidate, excluded);
        if (destination) {
          selected = { element: entry.element, destination };
          indicatorAxis = entry.indicatorAxis;
          priority = entry.priority;
        }
      }
      if (element === root) {
        break;
      }
      element = element.parentElement;
    }
    return selected && indicatorAxis && selected.destination.kind === "between"
      ? this.withIndicator(selected, indicatorAxis)
      : selected;
  }

  /**
   * Centers a line on the shared sibling gap or outer item edge, falling back to the winning region.
   *
   * @param target - Validated between region selected by native hit testing.
   * @param axis - Fallback line orientation when both neighboring placements are unavailable.
   * @returns Target with viewport geometry for this synchronous resolution only.
   */
  private withIndicator(
    target: ResolvedBlockDropTarget,
    axis: "horizontal" | "vertical",
  ): ResolvedBlockDropTarget {
    const shared = this.sharedGapIndicator(target) ?? this.listEndIndicator(target, axis);
    if (shared) {
      return shared;
    }
    const rect = target.element.getBoundingClientRect();
    const horizontal = axis === "horizontal";
    return {
      ...target,
      indicator: {
        left: horizontal ? rect.left : rect.left + rect.width / 2 - 1,
        top: horizontal ? rect.top + rect.height / 2 - 1 : rect.top,
        width: horizontal ? rect.width : 2,
        height: horizontal ? 2 : rect.height,
      },
    };
  }

  /**
   * Places first/last insertion feedback on the complete item rather than its padded strip.
   *
   * The region remains the native hit target. Only a matching placement identity
   * supplies its edge; arbitrary regions without a placement keep their own geometry.
   *
   * @param target - Validated canonical gap with at most one neighboring item.
   * @param axis - Orientation supplied by the mounted insertion strip.
   * @returns Outer-edge feedback, or undefined for interior gaps or unrelated placements.
   */
  private listEndIndicator(
    target: ResolvedBlockDropTarget,
    axis: "horizontal" | "vertical",
  ): ResolvedBlockDropTarget | undefined {
    const destination = target.destination;
    if (destination.kind !== "between" || (destination.previousId && destination.nextId)) {
      return;
    }
    const neighbor = destination.previousId ?? destination.nextId;
    const list = target.element.closest<HTMLElement>(`.${BLOCK_EDITOR_CLASSES.children}`);
    const item =
      list && neighbor
        ? blockLayoutNeighbor(list, neighbor)
        : target.element.closest<HTMLElement>("[data-block-item-id]");
    if (!neighbor || !item || (!list && item.dataset.blockItemId !== neighbor)) {
      return;
    }
    const rect = item.getBoundingClientRect();
    const before = !destination.previousId;
    if (axis === "horizontal") {
      return {
        ...target,
        indicator: {
          left: rect.left,
          top: (before ? rect.top : rect.bottom) - 1,
          width: rect.width,
          height: 2,
        },
      };
    }
    const rtl = item.ownerDocument.defaultView?.getComputedStyle(item).direction === "rtl";
    return {
      ...target,
      indicator: {
        left: (before !== rtl ? rect.left : rect.right) - 1,
        top: rect.top,
        width: 2,
        height: rect.height,
      },
    };
  }

  /**
   * Gives both wrapper edges the same feedback for their canonical sibling gap.
   *
   * Only addressed mounted placement identities and the two neighboring rectangles are read.
   * Wrapped grid rows use a horizontal line; neighbors in one row use a vertical line.
   *
   * @param target - Validated destination of the winning mounted boundary.
   * @returns Shared gap geometry, or undefined at list ends or without both mounted neighbors.
   */
  private sharedGapIndicator(target: ResolvedBlockDropTarget): ResolvedBlockDropTarget | undefined {
    const destination = target.destination;
    if (destination.kind !== "between" || !destination.previousId || !destination.nextId) {
      return;
    }
    const list = target.element.closest<HTMLElement>(`.${BLOCK_EDITOR_CLASSES.children}`);
    if (!list) {
      return;
    }
    const previous = blockLayoutNeighbor(list, destination.previousId);
    const next = blockLayoutNeighbor(list, destination.nextId);
    if (!previous || !next) {
      return;
    }
    let following = previous.nextElementSibling;
    while (following?.classList.contains(BLOCK_EDITOR_CLASSES.listGap)) {
      following = following.nextElementSibling;
    }
    if (following !== next) {
      return;
    }
    const a = previous.getBoundingClientRect();
    const b = next.getBoundingClientRect();
    const axis =
      list.dataset.blockDropAxis ??
      target.element.closest<HTMLElement>("[data-drop-wrapper-axis]")?.dataset.dropWrapperAxis ??
      "vertical";
    const indicator = blockGapIndicator(
      a,
      b,
      axis === "horizontal" || axis === "grid" ? axis : "vertical",
    );
    return { ...target, indicator };
  }

  /**
   * Validates a candidate against live actual children rather than displayed roots or CSS.
   *
   * @param destination - Candidate owned by a mounted region.
   * @param excluded - Captured roots omitted from neighbors after checking the original gap.
   * @returns Current destination with moving roots omitted, or undefined for a stale parent or gap.
   * @throws Propagates delegated node-read failures.
   */
  private currentDestination(
    destination: BlockDropDestination,
    excluded?: ReadonlySet<string>,
  ): BlockDropDestination | undefined {
    const childIds =
      destination.parentId === null
        ? this.blocks.getRootIds()
        : this.blocks.getBlockNode(destination.parentId)?.childIds;
    if (!childIds) {
      return;
    }
    if (destination.kind === "inside") {
      return destination;
    }
    const index =
      destination.nextId === null ? childIds.length : childIds.indexOf(destination.nextId);
    if (index < 0 || (childIds[index - 1] ?? null) !== destination.previousId) {
      return;
    }
    if (!excluded?.size) {
      return destination;
    }
    let previous = index - 1;
    let next = index;
    while (previous >= 0 && excluded.has(childIds[previous]!)) {
      previous -= 1;
    }
    while (next < childIds.length && excluded.has(childIds[next]!)) {
      next += 1;
    }
    return {
      kind: "between",
      parentId: destination.parentId,
      previousId: childIds[previous] ?? null,
      nextId: childIds[next] ?? null,
    };
  }
}
