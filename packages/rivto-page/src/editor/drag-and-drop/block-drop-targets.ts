import type { BlockLayoutRegions } from "../../presentation/components/block-layout/block-layout-regions";
import {
  containsDropPoint,
  containsDropRegion,
  continuesDropOutline,
  dropEdgeRect,
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
  sameOutlineBoundary,
} from "./block-drop-layout-geometry";
import type { BlockEditorBlocks } from "../../adapter/types";
import type { BlockEditorResourceOwner } from "../extensions/block-editor-resource-owner";
import type {
  BlockDropLayoutRegistration,
  BlockDropPoint,
  BlockDropAcceptance,
  BlockDropTargetsApi,
  BlockDropTargetRegistration,
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
    const point = { x: clientX, y: clientY };
    // When all children move, the first-child seam also exposes the parent's
    // trailing depth choices. Otherwise resolve the ordinary hit geometry.
    // Both paths choose one candidate before destination and source validation.
    if (!hit || !root.contains(hit) || hit.closest("[data-rivto-block-editor]") !== root) {
      return undefined;
    }
    let candidate: ResolvedBlockDropTarget | undefined;
    // Exposes the parent's row boundary when all its children are being moved.
    // Only an ordinary outline participates. The live child list prevents hidden
    // or stationary children from being bypassed. Both sides of the first child
    // boundary share the parent's existing trailing depth choices and line.
    firstChildBoundary: {
      const hitShell = hit.closest<HTMLElement>("[data-block-id]");
      const hitId = hitShell?.dataset.blockId;
      // The pointer can be in an ancestor gutter outside the moving child's shell.
      const onlySource = excluded?.size === 1 ? excluded.values().next().value : undefined;
      const id = onlySource ? this.blocks.getParentId(onlySource) : hitId;
      const shell = id ? this.regions.get(id, "shell") : undefined;
      // A gutter hit may belong to an ancestor, but an unrelated block, excluded
      // control, or self-contained child layout must keep its own drop behavior.
      if (
        !shell ||
        !id ||
        !hitShell ||
        (!shell.contains(hitShell) && !hitShell.contains(shell)) ||
        !excluded?.size ||
        hit.closest(`[${BLOCK_DROP_EXCLUDE_ATTRIBUTE}]`) ||
        !continuesDropOutline(shell)
      ) {
        break firstChildBoundary;
      }
      const children = this.blocks.getBlockNode(id)?.childIds;
      const row = this.regions.get(id, "row", shell);
      // Use canonical children, including unmounted ones: a stationary child
      // must not be crossed by a sibling drop on the parent's row.
      if (!row || !children?.length || !children.every((child) => excluded.has(child))) {
        break firstChildBoundary;
      }
      const childId = children[0]!;
      const parentBlockId = shell.dataset.blockId!;
      const geometry = readDropGeometry(shell);
      const rowRect = row.getBoundingClientRect();
      // The shell includes descendants; substitute only the row bounds so the
      // existing trailing edge paints and resolves depth at the first-child seam.
      const rowGeometry = { ...geometry, rect: rowRect };
      for (const entry of this.targets.get(shell) ?? []) {
        for (const region of entry.getRegions()) {
          if (region.kind !== "edge" || region.side !== "block-end" || !region.depth) {
            continue;
          }
          const edge = dropEdgeRect(region, rowGeometry);
          const first = this.regions.get(childId, "row", shell)?.getBoundingClientRect();
          // Extend the same edge through the adjacent first-child strip, but do
          // not bridge a larger layout gap or target an unmounted first child.
          if (
            !first ||
            first.top - rowRect.bottom > edge.height ||
            point.y < edge.top ||
            point.y > first.top + edge.height
          ) {
            continue;
          }
          // Clamp only Y: the shared trailing-edge resolver still uses the actual
          // horizontal pointer position to choose sibling and ancestor depths.
          const edgePoint = { x: point.x, y: Math.min(point.y, rowRect.bottom) };
          if (!containsDropRegion(shell, region, rowGeometry, edgePoint, hit)) {
            continue;
          }
          const target = dropRegionTarget(entry, region, rowGeometry, edgePoint);
          if (
            target.destination.kind === "inside" &&
            target.destination.parentId === parentBlockId
          ) {
            // The child-depth choice here inserts before the first child, not after it.
            candidate = {
              ...target,
              destination: {
                kind: "between",
                parentId: parentBlockId,
                previousId: null,
                nextId: childId,
              },
            };
            break firstChildBoundary;
          }
          candidate = target;
          break firstChildBoundary;
        }
      }
    }
    if (!candidate) {
      let target: ResolvedBlockDropTarget | undefined;
      // Resolves local row gaps and exposed ancestor sibling rims across nested layouts.
      // Ancestor fallback considers only an actual edge beyond a nested layout;
      // ancestor body and background append declarations never gain priority.
      // An owner's bounded child layout also participates when a native hit lands
      // on its shell rather than the child host, so overlapping controls cannot
      // change which ancestor edge owns the same physical boundary.
      // A nearer explicit item edge retains its ordinary nesting unless a declared
      // local owner has a stationary sibling strip covering that same edge. This
      // reserves external shared boundaries without promoting ordinary outline
      // ancestors over their child edges.
      // An actual list-background gap wins within its cross-axis feedback span, including
      // endpoint padding. A containing perpendicular layout keeps the inner list's full
      // background cross axis available. Otherwise exposed gutters outside that span
      // retain ancestor sorting.
      // An outdent band may still normalize to its ancestor's shared sibling gap.
      // Indented inside choices retain
      // the nearer layout's ordinary resolution. The winning edge is normalized by
      // its containing layout, preserving shared feedback and canonical neighbors.
      // Exclusions stop this ancestor lookup before any outer declaration is read.
      nestedBoundary: {
        let innerLayout: BlockDropLayoutRegistration | undefined;
        let ancestorEdge: ResolvedBlockDropTarget | undefined;
        let nearestOutlineEdge: ResolvedBlockDropTarget | undefined;
        let hasOuterPerpendicularLayout = false;
        for (let element: Element | null = hit; element; element = element.parentElement) {
          if (element.hasAttribute(BLOCK_DROP_EXCLUDE_ATTRIBUTE)) {
            break nestedBoundary;
          }
          const layout = this.readLayout(element);
          hasOuterPerpendicularLayout ||= areDropAxesPerpendicular(innerLayout?.axis, layout?.axis);
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
            target = gap ?? resolveLayoutGap(layout, point, hit, ancestorEdge) ?? ancestorEdge;
            break nestedBoundary;
          }
          const entries = !ancestorEdge && this.targets.get(element as HTMLElement);
          const registeredTarget = entries ? this.resolveEntries(entries, point, hit) : undefined;
          if (!innerLayout && isLocalOutlineEdge(registeredTarget)) {
            nearestOutlineEdge ??= registeredTarget;
          }
          // Appending inside the parent and dropping after its last child share a seam.
          const sameAppend =
            registeredTarget?.region?.kind === "edge" &&
            registeredTarget.region.side === "block-end" &&
            registeredTarget.destination.kind === "inside" &&
            nearestOutlineEdge?.destination.kind === "between" &&
            nearestOutlineEdge.destination.nextId === null &&
            nearestOutlineEdge.destination.parentId === registeredTarget.destination.parentId;
          const siblingEdge =
            registeredTarget?.region?.kind === "edge" &&
            registeredTarget.destination.kind === "between";
          if (innerLayout && registeredTarget && (siblingEdge || sameAppend)) {
            if (
              nearestOutlineEdge &&
              !sameAppend &&
              !prefersOuterSiblingEdge(registeredTarget, nearestOutlineEdge, excluded)
            ) {
              break nestedBoundary;
            }
            ancestorEdge = registeredTarget;
          }
          innerLayout ??= layout;
          if (element === root) {
            break;
          }
        }
        target = ancestorEdge;
      }
      if (!target) {
        // Resolves the nearest declared edge or inside area within its owning layout.
        // The first edge stops further registration reads but can still be normalized
        // by its containing list. Inside feedback is retained while looking for that
        // edge. Exclusion stops the walk after any eligible descendant declaration.
        let inside: ResolvedBlockDropTarget | undefined;
        let edge: ResolvedBlockDropTarget | undefined;
        for (let element: Element | null = hit; element; element = element.parentElement) {
          if (element.hasAttribute(BLOCK_DROP_EXCLUDE_ATTRIBUTE)) {
            break;
          }
          const entries = this.targets.get(element as HTMLElement);
          const declaration =
            !edge && entries ? this.resolveEntries(entries, point, hit) : undefined;
          if (declaration && declaration.region?.kind !== "inside") {
            edge = declaration;
          }
          if (declaration?.region?.kind === "inside") {
            inside ??= declaration;
          }
          const layout = edge ? this.layouts.get(element as HTMLElement) : this.readLayout(element);
          // A contained block body owns its point. A wrapper spanning multiple anchors
          // still needs a gap lookup, as does an edge awaiting shared line geometry.
          if (layout) {
            const bodyOwnsPoint =
              inside &&
              inside.element !== layout.element &&
              (inside.element.hasAttribute("data-block-id") ||
                (inside.destination.kind === "inside" &&
                  inside.destination.parentId !== null &&
                  this.regions.get(inside.destination.parentId, "row")?.contains(inside.element)));
            if (edge || !bodyOwnsPoint) {
              const gap = resolveLayoutGap(layout, point, hit, edge);
              if (gap) {
                target = gap;
                break;
              }
            }
          }
          // Rounded corners can report a hit outside this layout's occupied bounds.
          if (
            element === root ||
            (layout &&
              (edge || inside || containsDropPoint(element.getBoundingClientRect(), point)))
          ) {
            break;
          }
        }
        target ??= edge ?? inside;
      }
      if (!target) {
        return undefined;
      }
      // Aligns an outline edge with the shared gap at its selected ancestor or append level.
      // A terminal descendant's gutter can select an ancestor boundary before that
      // ancestor's own inset strip starts. An equivalent merged sibling gap or a
      // terminal descendant sharing its physical bottom may replace its line;
      // destination, depth and declared hit ownership stay unchanged.
      // A local child layout can append to the same parent at a physically distinct
      // boundary; its own line must not jump to the enclosing owner's outer edge.
      // Terminal child append and parent-inside choices share that same physical seam,
      // even when the selected child edge remains local to its own list.
      // The walk uses mounted ancestor layouts and their bounded neighbor search;
      // exclusions, separate boundaries and virtual holes retain their existing rules.
      if (
        target.element !== root &&
        target.indicator &&
        target.region?.kind === "edge" &&
        target.region.depth
      ) {
        for (let element = target.element.parentElement; element; element = element.parentElement) {
          if (element.hasAttribute(BLOCK_DROP_EXCLUDE_ATTRIBUTE)) {
            break;
          }
          const layout = this.layouts.get(element);
          const gap = layout && resolveLayoutGap(layout, point, hit, target);
          const separateLocalBoundary =
            gap?.region?.kind === "gap" &&
            gap.indicator &&
            !continuesDropOutline(gap.region.previous.element) &&
            gap.region.previous.element.contains(target.element) &&
            target.destination.parentId === gap.region.previous.element.dataset.blockId &&
            Math.abs(gap.indicator.top - target.indicator.top) > 1;
          // A deeper destination can share the same physical seam without being the
          // ancestor gap's canonical destination; borrow its line, not its destination.
          if (
            gap?.region?.kind === "gap" &&
            !separateLocalBoundary &&
            (sameOutlineBoundary(gap.destination, target.destination) ||
              (gap.region.previous.element.contains(target.element) &&
                Math.abs(
                  gap.region.previous.element.getBoundingClientRect().bottom -
                    target.element.getBoundingClientRect().bottom,
                ) <= 1))
          ) {
            target = { ...target, indicator: gap.indicator };
            break;
          }
          if (element === root) {
            break;
          }
        }
      }
      candidate = target;
      // Extends a shared outline seam through its mounted terminal descendants.
      // The next sibling can own the native hit below a seam, so its preceding
      // anchor must supply the same descendant depth choices as the upper edge.
      // Only ordinary outline child lists ending at that physical seam participate.
      // The last mounted child must also be the last canonical child; an unmounted
      // terminal child cannot supply a depth choice. Each eligible descendant uses
      // the pointer's horizontal position, while the shared line keeps its vertical
      // position. Local child scopes and other layout axes retain their own behavior.
      if (target.region?.kind === "gap" && target.region.axis === "vertical" && target.indicator) {
        let entry = target.region.previous;

        let seam: number | undefined;
        while (true) {
          // Follow registered child lists only; local layouts do not continue the outline.
          const id = entry.element.dataset.blockId;
          const children = id && this.regions.get(id, "children", entry.element);
          const layout = children && this.layouts.get(children);
          if (!layout || layout.axis !== "vertical" || !continuesDropOutline(entry.element)) {
            break;
          }
          const items = layout.getItems();
          const child = items?.[items.length - 1];
          if (!child) {
            break;
          }
          seam ??= entry.element.getBoundingClientRect().bottom;
          const geometry = readDropGeometry(child.element);
          const region = child
            .getRegions()
            .find(
              (candidate) =>
                candidate.kind === "edge" && candidate.side === "block-end" && candidate.depth,
            );
          // A mounted last item is insufficient if another canonical child follows it.
          // The one-pixel tolerance accommodates fractional layout measurements.
          if (
            !region ||
            region.kind !== "edge" ||
            region.destination.kind !== "between" ||
            region.destination.nextId !== null ||
            Math.abs(geometry.rect.bottom - seam) > 1
          ) {
            break;
          }
          const bounds = dropEdgeRect(region, geometry);
          // Do not promote a descendant whose depth bands do not cover the pointer.
          if (point.x < bounds.left || point.x > bounds.right) {
            break;
          }
          const descendant = dropRegionTarget(child, region, geometry, point);
          if (descendant.indicator) {
            // Keep the descendant's destination and indentation on the shared seam.
            candidate = {
              ...descendant,
              indicator: { ...descendant.indicator, top: target.indicator.top },
            };
          }
          entry = child;
        }
      }
    }
    let destination = candidate.destination;
    // Walk only the destination's ancestry to reject a drop inside a moving subtree.
    if (excluded?.size) {
      for (
        let parent = destination.parentId;
        parent !== null;
        parent = this.blocks.getParentId(parent) ?? null
      ) {
        if (excluded.has(parent)) {
          return undefined;
        }
      }
    }
    const childIds =
      destination.parentId === null
        ? this.blocks.getRootIds()
        : this.blocks.getBlockNode(destination.parentId)?.childIds;
    if (!childIds) {
      return undefined;
    }
    if (destination.kind === "between") {
      // Validate the physical gap against live siblings before omitting moving neighbors.
      const index =
        destination.nextId === null ? childIds.length : childIds.indexOf(destination.nextId);
      if (index < 0 || (childIds[index - 1] ?? null) !== destination.previousId) {
        return undefined;
      }
      if (excluded?.size) {
        let previous = index - 1;
        let next = index;
        while (previous >= 0 && excluded.has(childIds[previous]!)) {
          previous--;
        }
        while (next < childIds.length && excluded.has(childIds[next]!)) {
          next++;
        }
        destination = {
          ...destination,
          previousId: childIds[previous] ?? null,
          nextId: childIds[next] ?? null,
        };
      }
    }
    const target = { ...candidate, destination };
    if (accepts && !accepts(target.destination)) {
      return undefined;
    }
    // A boundary retains its insertion line. A body hit highlights the receiving shell.
    if (destination.kind === "inside" && !target.indicator) {
      return {
        ...target,
        outlineElement:
          destination.parentId === null
            ? undefined
            : this.regions.get(destination.parentId, "shell"),
      };
    }
    return target;
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
    if (layout && layout.axis !== "grid" && layout.gaps && (layout.gutterSize ?? "row") === "row") {
      return { ...layout, element: element as HTMLElement };
    }
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
        if (entry.priority < priority || (entry.priority === priority && regionRank <= rank)) {
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
}
