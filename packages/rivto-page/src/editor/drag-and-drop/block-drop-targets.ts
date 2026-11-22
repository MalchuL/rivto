import type { BlockLayoutRegions } from "../../presentation/components/block-layout/block-layout-regions";
import {
  containsDropPoint,
  containsDropRegion,
  dropRegionRank,
  dropRegionTarget,
} from "./block-drop-region-geometry";
import { BLOCK_DROP_EXCLUDE_ATTRIBUTE } from "./block-drop-attributes";
import {
  areDropAxesPerpendicular,
  isLocalOutlineEdge,
  prefersOuterSiblingEdge,
  resolveInnerLayoutGap,
  resolveLayoutGap,
  sameOutlineBoundary,
} from "./block-drop-layout-geometry";
import type { BlockEditorBlocks } from "../../adapter/types";
import type { BlockEditorResourceOwner } from "../extensions/block-editor-resource-owner";
import type { InputDocument, RegionIdentity } from "@chulane/rivto-root";
import { BlockDropMeasurements, DROP_MEASUREMENT_UNAVAILABLE } from "./block-drop-measurements";
import type {
  BlockDropAncestor,
  BlockDropLayoutRegistration,
  BlockDropAttachment,
  BlockDropPoint,
  BlockDropAcceptance,
  BlockDropTargetsApi,
  BlockDropTargetRegistration,
  BlockDropTargetEntry,
  BlockDropDestination,
  BetweenBlockDropDestination,
  ResolvedBlockDropTarget,
  BlockDropGeometryTarget,
  BlockDragHit,
  BlockDropGeometryReader,
} from "./types";

/** Editor-owned regions indexed by opaque identity, without a second block tree or geometry cache. */
export class BlockDropTargets implements BlockDropTargetsApi {
  private readonly layouts = new Map<object, BlockDropLayoutRegistration>();
  private readonly targets = new Map<object, Set<BlockDropTargetEntry>>();

  /**
   * Borrows the editor's data and current attachment without subscribing or measuring.
   *
   * @param owner - Resource lifecycle capturing synchronous extension registrations.
   * @param blocks - Data source used only to validate candidate parents and neighbors.
   * @param getAttachment - Live attachment identity; undefined while the view is detached.
   * @param regions - Borrowed occurrence-local lookup of already registered hierarchy shells for inside outlines and owned child hosts for linear-list background scope; no registration or teardown capability is retained.
   */
  constructor(
    private readonly owner: BlockEditorResourceOwner,
    private readonly blocks: Pick<BlockEditorBlocks, "getBlockNode" | "getRootIds" | "getParentId">,
    private readonly getAttachment: () => BlockDropAttachment | undefined,
    private readonly regions: Pick<BlockLayoutRegions, "getIdentities" | "getRegionIdentity">,
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
    const identity = entry.identity;
    let entries = this.targets.get(identity);
    if (!entries) {
      entries = new Set();
      this.targets.set(identity, entries);
    }
    entries.add(entry);
    return this.owner.registerCleanup(() => {
      entries.delete(entry);
      if (entries.size === 0) {
        this.targets.delete(identity);
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
   * The nearest editor identity must match this occurrence, so hits belonging to
   * nested editors cannot select its registered ancestors.
   *
   * @param clientX - Viewport X coordinate in CSS pixels.
   * @param clientY - Viewport Y coordinate in CSS pixels.
   * @param excluded - Captured moving roots omitted after validating the registered gap.
   * @param hitHint - Uncaptured hit from the current input; omitted to hit-test current geometry.
   * @param accepts - Optional source policy applied to the winner without searching alternative regions.
   * @returns Highest-priority valid candidate, preserving nearest/earliest tie order,
   * or undefined for detached, clipped, foreign, or invalid destinations.
   * @throws If destroyed or delegated DOM/data reads fail.
   */
  resolve(
    clientX: number,
    clientY: number,
    excluded?: ReadonlySet<string>,
    hitHint?: BlockDragHit,
    accepts?: BlockDropAcceptance,
  ): ResolvedBlockDropTarget | undefined {
    this.owner.assertActive();
    const attachment = this.getAttachment();
    if (!attachment || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return undefined;
    }
    const document = attachment.inputRoot.captureDocument();
    if (!document) {
      return undefined;
    }
    const capturedHit = document.captureHit(clientX, clientY, hitHint);
    try {
      if (!capturedHit || !this.belongsToAttachment(attachment, document, capturedHit)) {
        return undefined;
      }
      const measurements = new BlockDropMeasurements(
        attachment.inputRoot,
        () =>
          this.getAttachment() === attachment &&
          document.isCurrent() &&
          this.getAttachment() === attachment,
        capturedHit,
        this.regions,
      );
      // Geometry chooses exactly one candidate before model and source policy run.
      const candidate = this.resolvePoint(
        { x: clientX, y: clientY },
        attachment.inputRoot.getElementIdentity?.(),
        measurements,
        excluded,
      );
      if (!candidate || !measurements.isCurrent()) {
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
      if (
        this.getAttachment() !== attachment ||
        !attachment.inputRoot.isAttached() ||
        !document.isCurrent()
      ) {
        return undefined;
      }
      const resolved = this.withInsideOutline(target, attachment);
      return document.isCurrent() && this.getAttachment() === attachment ? resolved : undefined;
    } catch (error) {
      if (error === DROP_MEASUREMENT_UNAVAILABLE) {
        return undefined;
      }
      throw error;
    } finally {
      if (capturedHit !== hitHint) {
        capturedHit?.release();
      }
    }
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
    const identity = registration.identity;
    this.layouts.set(identity, registration);
    return this.owner.registerCleanup(() => {
      if (this.layouts.get(identity) === registration) {
        this.layouts.delete(identity);
      }
    });
  }

  /**
   * Checks whether the hit belongs to this exact Page attachment.
   *
   * Nested editors have their own boundaries. Ownership is checked again after
   * browser ancestry lookup because that lookup can synchronously replace Page.
   *
   * @param attachment - Page attachment captured at the start of resolution.
   * @param document - Document capability captured from the same Root.
   * @param hit - Current opaque hit, if any.
   * @returns True only while the nearest editor and attachment remain current.
   * @throws Propagates browser ancestry and ownership-check failures.
   */
  private belongsToAttachment(
    attachment: BlockDropAttachment,
    document: Pick<InputDocument, "isCurrent">,
    hit: BlockDragHit | undefined,
  ): boolean {
    if (this.getAttachment() !== attachment || !document.isCurrent()) {
      return false;
    }
    const hitOwner = hit?.getNearestAncestorIdentity("[data-rivto-block-editor]");
    const rootIdentity = attachment.inputRoot.getElementIdentity?.();
    return Boolean(
      rootIdentity &&
      hitOwner === rootIdentity &&
      this.getAttachment() === attachment &&
      document.isCurrent() &&
      this.getAttachment() === attachment,
    );
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
   * @param point - Current viewport position.
   * @param rootIdentity - Surface identity already matched to the nearest editor boundary.
   * @param measurements - Query-local Root measurements for registered geometry.
   * @param excluded - Captured moving roots; their adjacent boundary does not reserve a stationary shared seam.
   * @returns First local winner, or undefined for neutral/occluded/foreign geometry.
   */
  private resolvePoint(
    point: BlockDropPoint,
    rootIdentity: object | undefined,
    measurements: BlockDropGeometryReader,
    excluded?: ReadonlySet<string>,
  ): BlockDropGeometryTarget | undefined {
    // Reserve shared sibling seams before a nested body or list can consume them.
    const nested = this.resolveNestedBoundary(point, measurements, excluded);
    if (!measurements.isCurrent()) {
      return undefined;
    }
    const target = nested ?? this.resolveLocalTarget(point, measurements);
    if (!target || !measurements.isCurrent()) {
      return undefined;
    }
    return this.normalizeOutlineBoundary(target, point, rootIdentity, measurements);
  }

  /**
   * Aligns an outline edge with the shared gap at its selected ancestor or append level.
   *
   * A terminal descendant's gutter can select an ancestor boundary before that
   * ancestor's own inset strip starts. Only an equivalent merged sibling gap may
   * replace its line; destination, depth and declared hit ownership stay unchanged.
   * Terminal child append and parent-inside choices share that same physical seam,
   * even when the selected child edge remains local to its own list.
   * The walk uses mounted ancestor layouts and their bounded neighbor search;
   * exclusions, separate boundaries and virtual holes retain their existing rules.
   *
   * @param target - Physical winner before live destination and source-policy checks.
   * @param point - Viewport coordinates selecting the existing outline depth.
   * @param rootIdentity - Identity of the attached editor bounding the ancestor walk.
   * @param measurements - Query-local Root measurements for registered geometry.
   * @returns Original target with shared line geometry, or unchanged without an equivalent gap.
   */
  private normalizeOutlineBoundary(
    target: BlockDropGeometryTarget,
    point: BlockDropPoint,
    rootIdentity: object | undefined,
    measurements: BlockDropGeometryReader,
  ): BlockDropGeometryTarget {
    if (
      target.identity === rootIdentity ||
      !target.indicator ||
      target.region?.kind !== "edge" ||
      !target.region.depth
    ) {
      return target;
    }
    let first = true;
    let normalized = target;
    measurements.walkAncestors(target.identity, (region) => {
      if (first) {
        first = false;
        return false;
      }
      if (region.readAttribute(BLOCK_DROP_EXCLUDE_ATTRIBUTE) !== undefined) {
        return true;
      }
      const identity = region.getIdentity();
      if (!identity) {
        throw DROP_MEASUREMENT_UNAVAILABLE;
      }
      const layout = this.layouts.get(identity);
      const gap = layout && resolveLayoutGap(layout, point, measurements, target);
      if (!measurements.isCurrent()) {
        throw DROP_MEASUREMENT_UNAVAILABLE;
      }
      if (gap?.region?.kind === "gap" && sameOutlineBoundary(gap.destination, target.destination)) {
        normalized = { ...target, indicator: gap.indicator };
        return true;
      }
      return false;
    });
    return normalized;
  }

  /**
   * Resolves the nearest declared edge or inside area within its owning layout.
   *
   * The first edge stops further registration reads but can still be normalized
   * by its containing list. Inside feedback is retained while looking for that
   * edge. Exclusion stops the walk after any eligible descendant declaration.
   *
   * @param point - Viewport coordinates tested against live geometry.
   * @param measurements - Query-local Root measurements for registered geometry.
   * @returns Nearest target or shared gap, or undefined without a matching declaration.
   */
  private resolveLocalTarget(
    point: BlockDropPoint,
    measurements: BlockDropGeometryReader,
  ): BlockDropGeometryTarget | undefined {
    let inside: BlockDropGeometryTarget | undefined;
    let edge: BlockDropGeometryTarget | undefined;
    let result: BlockDropGeometryTarget | undefined;
    measurements.walkHitAncestors((region) => {
      if (region.readAttribute(BLOCK_DROP_EXCLUDE_ATTRIBUTE) !== undefined) {
        result = edge ?? inside;
        return true;
      }
      const identity = region.getIdentity();
      if (!identity) {
        throw DROP_MEASUREMENT_UNAVAILABLE;
      }
      const entries = this.targets.get(identity);
      const target =
        !edge && entries ? this.resolveEntries(entries, point, measurements) : undefined;
      if (!measurements.isCurrent()) {
        throw DROP_MEASUREMENT_UNAVAILABLE;
      }
      if (target && target.region?.kind !== "inside") {
        edge = target;
      }
      if (target?.region?.kind === "inside") {
        inside ??= target;
      }
      const layout = edge ? this.layouts.get(identity) : this.readLayout(region, measurements);
      const gap = this.resolveLocalGap(layout, point, measurements, edge, inside);
      if (!measurements.isCurrent()) {
        throw DROP_MEASUREMENT_UNAVAILABLE;
      }
      if (gap) {
        result = gap;
        return true;
      }
      if (this.stopsLocalSearch(identity, layout, point, measurements, edge ?? inside)) {
        result = edge ?? inside;
        return true;
      }
      return false;
    });
    return result ?? edge ?? inside;
  }

  /**
   * Searches list gaps unless a contained block body has already claimed this point.
   *
   * An inside wrapper spanning multiple anchors still needs gap discovery. A
   * selected edge also needs the list to normalize its physical feedback.
   *
   * @param layout - Registered or owner-bounded list, absent outside list scope.
   * @param point - Viewport coordinates tested by the list resolver.
   * @param measurements - Query-local Root measurements for registered geometry.
   * @param edge - First matched edge, retained while walking ancestors.
   * @param inside - First matched inside declaration, if any.
   * @returns Matching shared gap, or undefined when the body owns the point or no gap matches.
   */
  private resolveLocalGap(
    layout: BlockDropLayoutRegistration | undefined,
    point: BlockDropPoint,
    measurements: BlockDropGeometryReader,
    edge?: BlockDropGeometryTarget,
    inside?: BlockDropGeometryTarget,
  ): BlockDropGeometryTarget | undefined {
    if (!layout) {
      return;
    }
    let bodyOwnsPoint = false;
    const layoutIdentity = layout.identity;
    if (inside && inside.identity !== layoutIdentity) {
      bodyOwnsPoint = measurements.readAttribute(inside.identity, "data-block-id") !== undefined;
      if (
        !bodyOwnsPoint &&
        inside.destination.kind === "inside" &&
        inside.destination.parentId !== null
      ) {
        const row = this.regions.getIdentities(inside.destination.parentId, "row")[0];
        bodyOwnsPoint = !!row && measurements.contains(row, inside.identity);
      }
    }
    if (bodyOwnsPoint && !edge) {
      return;
    }
    return resolveLayoutGap(layout, point, measurements, edge);
  }

  /**
   * Stops local discovery at an occupied layout without trapping rounded outside hits.
   *
   * A rounded native hit can enter a child layout while the point remains in its
   * ancestor's free space. Only occupied layout bounds stop lookup when no target
   * has matched; an already matched target needs no extra rectangle read.
   *
   * @param regionIdentity - Opaque identity of the current ancestor, also the measured host for this decision.
   * @param layout - List associated with that ancestor, if any.
   * @param point - Viewport pointer coordinates.
   * @param measurements - Root-backed measurements for the current query.
   * @param target - First edge or inside declaration retained by the walk.
   * @returns True for a list with a retained target or containing physical bounds.
   * @throws If an attachment ends during measurement or a browser geometry read fails.
   */
  private stopsLocalSearch(
    regionIdentity: RegionIdentity,
    layout: BlockDropLayoutRegistration | undefined,
    point: BlockDropPoint,
    measurements: Pick<BlockDropGeometryReader, "readBounds">,
    target?: BlockDropGeometryTarget,
  ): boolean {
    return Boolean(
      layout && (target || containsDropPoint(measurements.readBounds(regionIdentity), point)),
    );
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
   * @param point - Viewport pointer tested against existing inset declarations.
   * @param measurements - Query-local Root measurements for registered geometry.
   * @param excluded - Captured moving roots omitted when classifying shared sibling neighbors.
   * @returns A local row gap, an ancestor sibling edge or its merged gap, or
   * undefined without a matching boundary that needs priority over local resolution.
   */
  private resolveNestedBoundary(
    point: BlockDropPoint,
    measurements: BlockDropGeometryReader,
    excluded?: ReadonlySet<string>,
  ): BlockDropGeometryTarget | undefined {
    let innerLayout: BlockDropLayoutRegistration | undefined;
    let ancestorEdge: BlockDropGeometryTarget | undefined;
    let nearestOutlineEdge: BlockDropGeometryTarget | undefined;
    let hasOuterPerpendicularLayout = false;
    let result: BlockDropGeometryTarget | undefined;
    const stopped = measurements.walkHitAncestors((region) => {
      if (region.readAttribute(BLOCK_DROP_EXCLUDE_ATTRIBUTE) !== undefined) {
        return true;
      }
      const identity = region.getIdentity();
      if (!identity) {
        throw DROP_MEASUREMENT_UNAVAILABLE;
      }
      const layout = this.layouts.get(identity);
      hasOuterPerpendicularLayout ||= areDropAxesPerpendicular(innerLayout?.axis, layout?.axis);
      // Normalize only after reaching the ancestor edge's containing list.
      if (ancestorEdge && layout && innerLayout) {
        const gap = resolveInnerLayoutGap(
          innerLayout,
          ancestorEdge,
          point,
          measurements,
          hasOuterPerpendicularLayout,
          excluded,
        );
        result = gap ?? resolveLayoutGap(layout, point, measurements, ancestorEdge) ?? ancestorEdge;
        return true;
      }
      const entries = !ancestorEdge && this.targets.get(identity);
      const target = entries ? this.resolveEntries(entries, point, measurements) : undefined;
      if (!measurements.isCurrent()) {
        throw DROP_MEASUREMENT_UNAVAILABLE;
      }
      if (!innerLayout && isLocalOutlineEdge(target)) {
        nearestOutlineEdge ??= target;
      }
      const sameAppend = this.isSameAppendBoundary(target, nearestOutlineEdge);
      if (innerLayout && target && (this.isSiblingEdge(target) || sameAppend)) {
        if (
          nearestOutlineEdge &&
          !sameAppend &&
          !prefersOuterSiblingEdge(target, nearestOutlineEdge, measurements, excluded)
        ) {
          return true;
        }
        ancestorEdge = target;
      }
      innerLayout ??= layout;
      return false;
    });
    return stopped ? result : ancestorEdge;
  }

  /**
   * Recognizes equivalent terminal append choices at two outline levels.
   *
   * An inside choice on the parent's trailing edge and a gap after its last
   * child describe the same append. Normalizing through the parent's containing
   * list keeps their shared line stationary while crossing the physical seam.
   *
   * @param outer - Ancestor edge, absent before reaching a matching declaration.
   * @param inner - Nearest outline edge, absent outside a child boundary.
   * @returns True for a trailing parent-inside choice matching a terminal child gap.
   */
  private isSameAppendBoundary(
    outer: BlockDropGeometryTarget | undefined,
    inner: BlockDropGeometryTarget | undefined,
  ): boolean {
    return (
      outer?.region?.kind === "edge" &&
      outer.region.side === "block-end" &&
      outer.destination.kind === "inside" &&
      inner?.destination.kind === "between" &&
      inner.destination.nextId === null &&
      inner.destination.parentId === outer.destination.parentId
    );
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
   * @param element - Ancestor region inside the attached editor occurrence.
   * @param measurements - Attachment-bound containment checks for registered child hosts.
   * @returns Its registered layout, an owner-bounded linear-list view, or undefined
   * when no enabled owned child layout is registered in this shell.
   */
  private readLayout(
    element: Pick<BlockDropAncestor, "getIdentity" | "readAttribute" | "containsRegion">,
    measurements: Pick<BlockDropGeometryReader, "containsIdentity">,
  ): BlockDropLayoutRegistration | undefined {
    const identity = element.getIdentity();
    if (!identity) {
      throw DROP_MEASUREMENT_UNAVAILABLE;
    }
    const registered = this.layouts.get(identity);
    if (registered) {
      return registered;
    }
    const blockId = element.readAttribute("data-block-id");
    for (const child of blockId ? this.regions.getIdentities(blockId, "children") : []) {
      if (!measurements.containsIdentity(element, child)) {
        continue;
      }
      const layout = this.layouts.get(child);
      if (this.canUseOwnerBounds(layout)) {
        return { ...layout, identity };
      }
      return undefined;
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
   * @param measurements - Query-local Root measurements for registered geometry.
   * @returns Physical winner without permission fallback or canonical mutation.
   */
  private resolveEntries(
    entries: Set<BlockDropTargetEntry>,
    point: BlockDropPoint,
    measurements: Pick<BlockDropGeometryReader, "read" | "isCurrent" | "isBackground">,
  ): BlockDropGeometryTarget | undefined {
    let selected: BlockDropGeometryTarget | undefined;
    let priority = -Infinity;
    let rank = -1;
    const geometry = measurements.read(entries.values().next().value!.identity);
    if (!measurements.isCurrent()) {
      return undefined;
    }
    for (const entry of entries) {
      for (const region of entry.getRegions()) {
        const regionRank = dropRegionRank(region);
        if (this.isShadowedRegion(entry.priority, regionRank, priority, rank)) {
          continue;
        }
        if (!containsDropRegion(entry.identity, region, geometry, point, measurements)) {
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
    target: BlockDropGeometryTarget | undefined,
  ): target is BlockDropGeometryTarget {
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
   * @param attachment - Exact attachment that resolved the geometry.
   * @returns A bounded anchor and, for eligible inside targets, its registered shell;
   * undefined if the attachment or anchor becomes unavailable during capture.
   */
  private withInsideOutline(
    target: BlockDropGeometryTarget,
    attachment: BlockDropAttachment,
  ): ResolvedBlockDropTarget | undefined {
    const { identity, ...geometry } = target;
    /**
     * Checks that this Page attachment still owns its borrowed Root.
     *
     * @returns False if ownership changes during the Root check.
     * @throws Propagates Root ownership-check failures.
     */
    const isAttached = () =>
      this.getAttachment() === attachment &&
      attachment.inputRoot.isAttached() &&
      this.getAttachment() === attachment;
    const anchor = attachment.inputRoot.captureRegionByIdentity(identity, isAttached);
    if (!anchor || !isAttached()) {
      return undefined;
    }
    if (target.destination.kind !== "inside" || target.indicator) {
      return { ...geometry, anchor };
    }
    const parentId = target.destination.parentId;
    const shell = parentId === null ? undefined : this.regions.getIdentities(parentId, "shell")[0];
    if (!shell) {
      return isAttached() ? { ...geometry, anchor } : undefined;
    }
    const outline = attachment.inputRoot.captureRegionByIdentity(shell, isAttached);
    if (!isAttached()) {
      return undefined;
    }
    return {
      ...geometry,
      anchor,
      ...(outline ? { outline } : {}),
    };
  }
}
