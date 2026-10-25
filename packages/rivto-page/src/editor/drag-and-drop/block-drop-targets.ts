import type { BlockLayoutRegions } from "../../presentation/components/block-layout/block-layout-regions";
import {
  containsDropPoint,
  containsDropRegion,
  dropRegionRank,
  dropRegionTarget,
  readDropGeometry,
} from "./block-drop-region-geometry";
import { BLOCK_DROP_EXCLUDE_ATTRIBUTE } from "./block-drop-attributes";
import {
  areDropAxesPerpendicular,
  isLocalOutlineEdge,
  prefersOuterSiblingEdge,
  resolveInnerLayoutGap,
  resolveLayoutGap,
} from "./block-drop-layout-geometry";
import type { BlockEditorBlocks } from "../../adapter/types";
import type { BlockEditorResourceOwner } from "../extensions/block-editor-resource-owner";
import type {
  BlockDropLayoutRegistration,
  BlockDropPoint,
  BlockDropAcceptance,
  BlockDropTargetsApi,
  BlockDropTargetRegistration,
  BlockDropDestination,
  BetweenBlockDropDestination,
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
   * @param regions - Borrowed occurrence-local lookup of already registered hierarchy shells for inside outlines and owned child hosts for linear-list background scope; no registration or teardown capability is retained.
   */
  constructor(
    private readonly owner: BlockEditorResourceOwner,
    private readonly blocks: Pick<BlockEditorBlocks, "getBlockNode" | "getRootIds" | "getParentId">,
    private readonly getRoot: () => HTMLElement | null,
    private readonly regions: Pick<BlockLayoutRegions, "get">,
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
   * Inside feedback uses the receiving parent's registered complete shell. The
   * hit anchor remains separate, so outline ownership cannot affect gap discovery
   * or canonical validation. Body/background destinations outline this hierarchy;
   * boundaries retain their measured line, including indented child append choices.
   * Missing shells retain anchor feedback.
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
    // Geometry chooses exactly one candidate before model and source policy run.
    const candidate = this.resolvePoint(hit, { x: clientX, y: clientY }, excluded);
    if (!candidate) {
      return undefined;
    }
    const destination = this.currentDestination(candidate.destination, excluded);
    if (!destination) {
      return undefined;
    }
    const target = { ...candidate, destination };
    if (accepts && !accepts(target.destination)) {
      return undefined;
    }
    return this.withInsideOutline(target);
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
   * A rounded hit outside a layout's physical bounds can reach an explicitly
   * registered ancestor layout or region; occupied layouts still bound discovery.
   * The nearest inside declaration is retained while checking placement edges up
   * to that layout boundary; content must not shadow its wrapper's declared edge.
   * Ancestor sibling rims are checked before local body/background discovery,
   * keeping outer boundaries reachable through nested lists without promoting
   * ancestor inside bands. An actual nearer item edge keeps its explicit depth
   * choices before ancestor fallback. Exclusions still stop that bounded ancestor walk.
   * The first local edge is retained until the layout can normalize shared feedback;
   * unrelated ancestor registrations cannot replace that winner. A contained
   * block-shell inside hit needs no sibling search because its coordinate is not
   * a gap. Custom inside wrappers can span several anchors and still require it.
   *
   * @param hit - Connected native hit from the current occurrence.
   * @param point - Current viewport position.
   * @param excluded - Captured moving roots; their adjacent boundary does not reserve a stationary shared seam.
   * @returns First local winner, or undefined for neutral/occluded/foreign geometry.
   */
  private resolvePoint(
    hit: Element | null,
    point: BlockDropPoint,
    excluded?: ReadonlySet<string>,
  ): ResolvedBlockDropTarget | undefined {
    const root = this.getRoot();
    if (!root || !hit || !this.isEditorHit(root, hit)) {
      return;
    }
    // Reserve shared sibling seams before a nested body or list can consume them.
    return (
      this.resolveNestedBoundary(hit, point, root, excluded) ??
      this.resolveLocalTarget(hit, point, root)
    );
  }

  /**
   * Checks that a native hit belongs to this occurrence rather than a nested editor.
   *
   * @param root - Current editor attachment.
   * @param hit - Native hit whose registered ancestors may be inspected.
   * @returns True only for a contained hit whose nearest editor is this attachment.
   */
  private isEditorHit(root: HTMLElement, hit: Element): boolean {
    return root.contains(hit) && hit.closest("[data-rivto-block-editor]") === root;
  }

  /**
   * Resolves the nearest declared edge or inside area within its owning layout.
   *
   * The first edge stops further registration reads but can still be normalized
   * by its containing list. Inside feedback is retained while looking for that
   * edge. Exclusion stops the walk after any eligible descendant declaration.
   *
   * @param hit - Native hit already checked against the current editor occurrence.
   * @param point - Viewport coordinates tested against live geometry.
   * @param root - Attached editor bounding ancestor discovery.
   * @returns Nearest target or shared gap, or undefined without a matching declaration.
   */
  private resolveLocalTarget(
    hit: Element,
    point: BlockDropPoint,
    root: HTMLElement,
  ): ResolvedBlockDropTarget | undefined {
    let inside: ResolvedBlockDropTarget | undefined;
    let edge: ResolvedBlockDropTarget | undefined;
    for (let element: Element | null = hit; element; element = element.parentElement) {
      if (element.hasAttribute(BLOCK_DROP_EXCLUDE_ATTRIBUTE)) {
        return edge ?? inside;
      }
      const entries = this.targets.get(element as HTMLElement);
      const target = !edge && entries ? this.resolveEntries(entries, point, hit) : undefined;
      if (target && target.region?.kind !== "inside") {
        edge = target;
      }
      if (target?.region?.kind === "inside") {
        inside ??= target;
      }
      const layout = edge ? this.layouts.get(element as HTMLElement) : this.readLayout(element);
      const gap = this.resolveLocalGap(layout, point, hit, edge, inside);
      if (gap) {
        return gap;
      }
      if (element === root || this.stopsLocalSearch(element, layout, point, edge ?? inside)) {
        return edge ?? inside;
      }
    }
    return edge ?? inside;
  }

  /**
   * Searches list gaps unless a contained block body has already claimed this point.
   *
   * An inside wrapper spanning multiple anchors still needs gap discovery. A
   * selected edge also needs the list to normalize its physical feedback.
   *
   * @param layout - Registered or owner-bounded list, absent outside list scope.
   * @param point - Viewport coordinates tested by the list resolver.
   * @param hit - Native hit limiting background and adjacent-anchor ownership.
   * @param edge - First matched edge, retained while walking ancestors.
   * @param inside - First matched inside declaration, if any.
   * @returns Matching shared gap, or undefined when the body owns the point or no gap matches.
   */
  private resolveLocalGap(
    layout: BlockDropLayoutRegistration | undefined,
    point: BlockDropPoint,
    hit: Element,
    edge?: ResolvedBlockDropTarget,
    inside?: ResolvedBlockDropTarget,
  ): ResolvedBlockDropTarget | undefined {
    if (!layout) {
      return;
    }
    const bodyOwnsPoint =
      inside?.element.hasAttribute("data-block-id") && inside.element !== layout.element;
    if (bodyOwnsPoint && !edge) {
      return;
    }
    return resolveLayoutGap(layout, point, hit, edge);
  }

  /**
   * Stops local discovery at an occupied layout without trapping rounded outside hits.
   *
   * A rounded native hit can enter a child layout while the point remains in its
   * ancestor's free space. Only occupied layout bounds stop lookup when no target
   * has matched; an already matched target needs no extra rectangle read.
   *
   * @param element - Current ancestor, also the measured host for this decision.
   * @param layout - List associated with that ancestor, if any.
   * @param point - Viewport pointer coordinates.
   * @param target - First edge or inside declaration retained by the walk.
   * @returns True for a list with a retained target or containing physical bounds.
   */
  private stopsLocalSearch(
    element: Element,
    layout: BlockDropLayoutRegistration | undefined,
    point: BlockDropPoint,
    target?: ResolvedBlockDropTarget,
  ): boolean {
    return Boolean(layout && (target || containsDropPoint(element.getBoundingClientRect(), point)));
  }

  /**
   * Resolves local row gaps and exposed ancestor sibling rims across nested layouts.
   *
   * Ancestor fallback considers only an actual edge beyond a nested layout;
   * ancestor body and background append declarations never gain priority.
   * A nearer explicit item edge retains its ordinary nesting unless a declared
   * local owner has a stationary sibling strip covering that same edge. This
   * reserves external shared boundaries without promoting ordinary outline
   * ancestors over their child edges.
   * An actual list-background gap wins within its cross-axis feedback span, including
   * endpoint padding. A containing perpendicular layout keeps the inner list's full
   * background cross axis available. Otherwise exposed gutters outside that span
   * retain ancestor sorting.
   * An outdent band may still normalize to its ancestor's shared sibling gap.
   * Indented inside choices retain
   * the nearer layout's ordinary resolution. The winning edge is normalized by
   * its containing layout, preserving shared feedback and canonical neighbors.
   * Exclusions stop this ancestor lookup before any outer declaration is read.
   *
   * @param hit - Connected native hit in this editor occurrence.
   * @param point - Viewport pointer tested against existing inset declarations.
   * @param root - Attached editor bounding the ancestor walk.
   * @param excluded - Captured moving roots omitted when classifying shared sibling neighbors.
   * @returns A local row gap, an ancestor sibling edge or its merged gap, or
   * undefined without a matching boundary that needs priority over local resolution.
   */
  private resolveNestedBoundary(
    hit: Element,
    point: BlockDropPoint,
    root: HTMLElement,
    excluded?: ReadonlySet<string>,
  ): ResolvedBlockDropTarget | undefined {
    let innerLayout: BlockDropLayoutRegistration | undefined;
    let ancestorEdge: ResolvedBlockDropTarget | undefined;
    let nearestOutlineEdge: ResolvedBlockDropTarget | undefined;
    let hasOuterPerpendicularLayout = false;
    for (let element: Element | null = hit; element; element = element.parentElement) {
      if (element.hasAttribute(BLOCK_DROP_EXCLUDE_ATTRIBUTE)) {
        return;
      }
      const layout = this.layouts.get(element as HTMLElement);
      // Normalize only after reaching the ancestor edge's containing list.
      if (ancestorEdge && layout && innerLayout) {
        const gap = resolveInnerLayoutGap(
          innerLayout,
          ancestorEdge,
          point,
          hit,
          hasOuterPerpendicularLayout,
          excluded,
        );
        return gap ?? resolveLayoutGap(layout, point, hit, ancestorEdge) ?? ancestorEdge;
      }
      hasOuterPerpendicularLayout ||= areDropAxesPerpendicular(innerLayout?.axis, layout?.axis);
      const entries = !ancestorEdge && this.targets.get(element as HTMLElement);
      const target = entries ? this.resolveEntries(entries, point, hit) : undefined;
      if (!innerLayout && isLocalOutlineEdge(target)) {
        nearestOutlineEdge ??= target;
      }
      if (innerLayout && this.isSiblingEdge(target)) {
        if (nearestOutlineEdge && !prefersOuterSiblingEdge(target, nearestOutlineEdge, excluded)) {
          return;
        }
        ancestorEdge = target;
      }
      innerLayout ??= layout;
      if (element === root) {
        return ancestorEdge;
      }
    }
    return ancestorEdge;
  }

  /**
   * Reads a mounted list or its owner's available linear-list background scope.
   *
   * Registered child lists also own their block's unoccupied padding and remaining
   * height. Their existing declarations and mounted anchors are reused for this
   * synchronous query; no extra registration, DOM node or cached geometry is added.
   * Actual content and nested blocks remain protected by native background checks.
   * Grid layouts and numeric/disabled continuation keep their own
   * clipping and distance bounds. This child scope never captures an already
   * selected shell edge: that edge belongs to the shell's containing list.
   *
   * @param element - Native ancestor inside the attached editor occurrence.
   * @returns Its registered layout, an owner-bounded linear-list view, or undefined
   * when no enabled owned child layout is registered in this shell.
   */
  private readLayout(element: Element): BlockDropLayoutRegistration | undefined {
    const registered = this.layouts.get(element as HTMLElement);
    if (registered) {
      return registered;
    }
    const blockId = element.getAttribute("data-block-id");
    const children = blockId
      ? this.regions.get(blockId, "children", element as HTMLElement)
      : undefined;
    const layout = children && this.layouts.get(children);
    if (this.canUseOwnerBounds(layout)) {
      return { ...layout, element: element as HTMLElement };
    }
  }

  /**
   * Identifies child lists whose row continuation includes the owner's free space.
   *
   * Numeric and disabled gutters retain their own distance bounds; grid layouts
   * keep their wrapping background rather than borrowing the whole owner shell.
   *
   * @param layout - Owned child registration, absent when its host is not mounted.
   * @returns True for a linear list with enabled gaps and full-row continuation.
   */
  private canUseOwnerBounds(
    layout: BlockDropLayoutRegistration | undefined,
  ): layout is BlockDropLayoutRegistration {
    return Boolean(
      layout && layout.axis !== "grid" && layout.gaps && (layout.gutterSize ?? "row") === "row",
    );
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
        const regionRank = dropRegionRank(region);
        if (this.isShadowedRegion(entry.priority, regionRank, priority, rank)) {
          continue;
        }
        if (!containsDropRegion(entry.element, region, geometry, point, hit)) {
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
    if (this.isMovingSubtree(destination.parentId, excluded)) {
      return;
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
    // Validate the declared physical seam before omitting any moving neighbors.
    return this.omitMovingNeighbors(destination, childIds, index, excluded);
  }

  /**
   * Detects destinations inside a captured moving root through live parent links.
   *
   * @param parentId - Receiving parent, or null for document roots.
   * @param excluded - Captured moving roots; absent or empty skips all parent reads.
   * @returns True when this parent or one of its ancestors belongs to the moving group.
   * @throws Propagates delegated parent-read failures.
   */
  private isMovingSubtree(parentId: string | null, excluded?: ReadonlySet<string>): boolean {
    if (!excluded?.size) {
      return false;
    }
    for (let parent = parentId; parent !== null; parent = this.blocks.getParentId(parent) ?? null) {
      if (excluded.has(parent)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Removes contiguous moving neighbors from an already validated canonical gap.
   *
   * Feedback remains at the original physical seam; only destination IDs change.
   *
   * @param destination - Gap whose original neighbors were checked against childIds.
   * @param childIds - Live ordered children of the receiving parent.
   * @param index - Position of the gap's original next child, or childIds.length at the end.
   * @param excluded - Nonempty captured moving roots to skip on both sides.
   * @returns A new gap bounded by the nearest stationary children or null endpoints.
   */
  private omitMovingNeighbors(
    destination: BetweenBlockDropDestination,
    childIds: readonly string[],
    index: number,
    excluded: ReadonlySet<string>,
  ): BetweenBlockDropDestination {
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

  /**
   * Recognizes a matched edge whose selected destination sorts canonical siblings.
   *
   * @param target - Current ancestor candidate, possibly absent or an inside area.
   * @returns True for an explicit edge selecting a between destination.
   */
  private isSiblingEdge(
    target: ResolvedBlockDropTarget | undefined,
  ): target is ResolvedBlockDropTarget {
    return target?.region?.kind === "edge" && target.destination.kind === "between";
  }

  /**
   * Preserves the selected region against lower priority or later equal-rank declarations.
   *
   * Priority precedes axis rank. Equal priority and rank retain registration order.
   *
   * @param priority - Finite priority of the registration currently being tested.
   * @param rank - Axis rank of its live region.
   * @param selectedPriority - Winning priority, or negative infinity before any match.
   * @param selectedRank - Winning rank, or negative one before any match.
   * @returns True when the tested region cannot replace the current selection.
   */
  private isShadowedRegion(
    priority: number,
    rank: number,
    selectedPriority: number,
    selectedRank: number,
  ): boolean {
    return priority < selectedPriority || (priority === selectedPriority && rank <= selectedRank);
  }

  /**
   * Adds complete hierarchy feedback to an accepted body or background destination.
   *
   * Boundary-derived inside destinations keep their insertion line. Missing shells
   * retain anchor feedback; document-root append has no parent hierarchy outline.
   *
   * @param target - Geometry winner after live destination and source-policy checks.
   * @returns The original boundary target, or an inside target with its registered shell.
   */
  private withInsideOutline(target: ResolvedBlockDropTarget): ResolvedBlockDropTarget {
    if (target.destination.kind !== "inside" || target.indicator) {
      return target;
    }
    const parentId = target.destination.parentId;
    return {
      ...target,
      outlineElement: parentId === null ? undefined : this.regions.get(parentId, "shell"),
    };
  }
}
