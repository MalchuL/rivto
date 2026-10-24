import {
  containsDropPoint,
  dropEdgeRect,
  dropRegionTarget,
  isDropBackground,
  readDropGeometry,
} from "./block-drop-region-geometry";
import { BLOCK_DROP_EXCLUDE_ATTRIBUTE } from "./block-drop-attributes";
import { resolveLayoutGap } from "./block-drop-layout-geometry";
import type { BlockEditorBlocks } from "../../adapter/types";
import type { BlockEditorResourceOwner } from "../extensions/block-editor-resource-owner";
import type {
  BlockDropLayoutRegistration,
  BlockDropPoint,
  BlockDropAcceptance,
  BlockDropTargetsApi,
  BlockDropTargetRegistration,
  BlockDropDestination,
  ResolvedBlockDropTarget,
} from "./types";

/** Captured installation fields; region declarations remain live until this entry is disposed. */
interface DropTargetEntry extends BlockDropTargetRegistration {
  readonly priority: number;
}

/** Editor-owned regions indexed by DOM identity, without a second block tree or geometry cache. */
export class BlockDropTargets implements BlockDropTargetsApi {
  private readonly layouts = new Map<HTMLElement, BlockDropLayoutRegistration>();
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
    private readonly blocks: Pick<BlockEditorBlocks, "getBlockNode" | "getRootIds" | "getParentId">,
    private readonly getRoot: () => HTMLElement | null,
  ) {}

  /**
   * Captures an independently disposable anchor while retaining its live region declarations.
   *
   * @param registration - Mounted element, finite priority, and getter of committed region declarations.
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
   * @param accepts - Optional source policy applied to the winner without searching alternative regions.
   * @returns Highest-priority valid candidate, preserving nearest/earliest tie order,
   * or undefined for detached, clipped, foreign, or invalid destinations.
   * @throws If destroyed or delegated DOM/data reads fail.
   */
  resolve(
    clientX: number,
    clientY: number,
    excluded?: ReadonlySet<string>,
    nativeHit?: Element,
    accepts?: BlockDropAcceptance,
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
    const candidate = this.resolvePoint(hit, { x: clientX, y: clientY });
    const destination = candidate && this.currentDestination(candidate.destination, excluded);
    const target = candidate && destination ? { ...candidate, destination } : undefined;
    return target && (!accepts || accepts(target.destination)) ? target : undefined;
  }

  /**
   * Registers layout metadata without creating DOM or subscribing to global geometry changes.
   *
   * @param registration - Borrowed host and its mounted, ordered anchors.
   * @returns Disposer releasing only this attachment, protected against stale cleanup.
   * @throws If the editor has been destroyed.
   */
  registerLayout(registration: BlockDropLayoutRegistration): () => void {
    this.owner.assertActive();
    this.layouts.set(registration.element, registration);
    return this.owner.registerCleanup(() => {
      if (this.layouts.get(registration.element) === registration) {
        this.layouts.delete(registration.element);
      }
    });
  }

  /**
   * Walks visible hit ancestors, resolving local geometry before validating any destination.
   *
   * A nearer layout bounds discovery even when its source policy later rejects the
   * candidate. Explicitly excluded areas and inert virtual space never redirect
   * to an outer target. A matching descendant region remains eligible before that
   * boundary; exclusion wins over registrations on its own element. Control
   * semantics do not imply drop exclusion.
   * The nearest inside declaration is retained while checking placement edges up
   * to that layout boundary; content must not shadow its wrapper's declared edge.
   * The first edge is retained until the layout can normalize shared feedback;
   * unrelated ancestor registrations cannot replace that winner. A contained
   * block-shell inside hit needs no sibling search because its coordinate is not
   * a gap. Custom inside wrappers can span several anchors and still require it.
   *
   * @param hit - Connected native hit from the current occurrence.
   * @param point - Current viewport position.
   * @returns First local winner, or undefined for neutral/occluded/foreign geometry.
   */
  private resolvePoint(
    hit: Element | null,
    point: BlockDropPoint,
  ): ResolvedBlockDropTarget | undefined {
    const root = this.getRoot();
    if (!root || !hit || !root.contains(hit) || hit.closest("[data-rivto-block-editor]") !== root) {
      return;
    }
    let inside: ResolvedBlockDropTarget | undefined;
    let edge: ResolvedBlockDropTarget | undefined;
    for (let element: Element | null = hit; element; element = element.parentElement) {
      if (element.hasAttribute(BLOCK_DROP_EXCLUDE_ATTRIBUTE)) {
        return edge ?? inside;
      }
      const entries = this.targets.get(element as HTMLElement);
      const layout = this.layouts.get(element as HTMLElement);
      const target = !edge && entries ? this.resolveEntries(entries, point, hit) : undefined;
      if (target && target.region?.kind !== "inside") {
        edge = target;
      }
      if (target?.region?.kind === "inside") {
        inside ??= target;
      }
      const gap =
        layout &&
        (!inside?.element.hasAttribute("data-block-id") ||
          inside.element === layout.element ||
          edge)
          ? resolveLayoutGap(layout, point, hit, edge)
          : undefined;
      if (gap) {
        return gap;
      }
      if (layout || element === root) {
        return edge ?? inside;
      }
    }
    return edge ?? inside;
  }

  /**
   * Chooses one declared area on a measured anchor, preserving explicit priority and edge order.
   *
   * @param entries - Independent registrations attached to the same existing element.
   * @param point - Viewport pointer position.
   * @param hit - Native hit used to distinguish unoccupied background from child content.
   * @returns Physical winner without permission fallback or canonical mutation.
   */
  private resolveEntries(
    entries: Set<DropTargetEntry>,
    point: BlockDropPoint,
    hit: Element,
  ): ResolvedBlockDropTarget | undefined {
    let selected: ResolvedBlockDropTarget | undefined;
    let priority = -Infinity;
    let rank = -1;
    const geometry = readDropGeometry(entries.values().next().value!.element);
    for (const entry of entries) {
      for (const region of entry.getRegions()) {
        let regionRank = 0;
        if (region.kind === "edge") {
          regionRank = region.side.startsWith("block") ? 2 : 1;
        }
        if (entry.priority < priority || (entry.priority === priority && regionRank <= rank)) {
          continue;
        }
        const rect = region.kind === "edge" ? dropEdgeRect(region, geometry) : geometry.rect;
        if (
          !containsDropPoint(rect, point) ||
          (region.kind === "inside" &&
            region.coverage === "background" &&
            !isDropBackground(entry.element, hit, point))
        ) {
          continue;
        }
        selected = dropRegionTarget(entry, region, geometry, point);
        priority = entry.priority;
        rank = regionRank;
      }
    }
    return selected;
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
    if (excluded?.size) {
      for (
        let parent = destination.parentId;
        parent !== null;
        parent = this.blocks.getParentId(parent) ?? null
      ) {
        if (excluded?.has(parent)) {
          return;
        }
      }
    }
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
