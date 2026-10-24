import { BLOCK_EDITOR_CLASSES } from "../../presentation/block-editor-classes";
import { blockLayoutRegion } from "../../presentation/components/block-layout/block-layout-regions";
import { blockGapIndicator } from "./block-gap-indicator";
import { blockDropDistance, nearestBlockDropTarget } from "./block-nearest-drop-target";
import type { BlockDropAcceptance } from "./types";
import type { BlockEditorApi } from "../block-editor-api";
import type { BlockDropDestination, BlockDropIndicator, ResolvedBlockDropTarget } from "./types";

/** Addressed data and current occurrence borrowed by outline hit testing. */
interface OutlineDropHost {
  readonly getRoot: BlockEditorApi["getRoot"];
  readonly dropTargets: Pick<BlockEditorApi["dropTargets"], "resolveHit">;
  readonly adapter: {
    readonly blocks: Pick<
      BlockEditorApi["adapter"]["blocks"],
      "getParentId" | "getBlockNode" | "getBlockIds" | "getRootIds"
    >;
  };
}

/** Resolves container rims, explicit child targets, and ordinary outline gaps within one occurrence. */
export class BlockOutlineDropTargets {
  /**
   * Borrows live hierarchy and DOM attachment without subscriptions or geometry caches.
   *
   * @param editor - Current occurrence, addressed model and explicit container regions.
   * @param rootParentId - Actual parent for empty display roots; null means document roots.
   * @param indent - Horizontal CSS pixels per nesting step; defaults to 24.
   * @param allowChildren - Whether ordinary rows accept nested insertion; defaults to true.
   * @param gapSize - CSS pixels reserved at row edges for sibling gaps; defaults to eight.
   * @param getScale - Live uniform host zoom; defaults to one. Invalid values use one.
   */
  constructor(
    private readonly editor: OutlineDropHost,
    private readonly rootParentId: string | null,
    private readonly indent = 24,
    private readonly allowChildren = true,
    private readonly gapSize = 8,
    private readonly getScale: () => number = () => 1,
  ) {}

  /**
   * Uses native hit testing and adjacent boundary rectangles to resolve a current outline insertion.
   *
   * Explicit child regions retain their destination even at a container rim; exposed
   * container rims preserve whole-container sorting at their own header/empty host.
   * Nested occurrences and dragged subtrees are excluded; source IDs are removed
   * from canonical neighbors without reading text. Declared container axes resolve
   * child gaps and unused body space; undeclared grids retain their outer boundaries.
   * Vertical child lists reuse ordinary outline depth projection inside the
   * container's preserved outer boundary, including leading and trailing gaps.
   * List-owned controls and placement padding use the same geometry as the child
   * host background; hits inside actual child shells retain row targeting.
   * Custom-layout header chrome compares nearby insertion feedback after applying
   * the optional source policy, descending the nearest structural branch when
   * necessary. Explicit sibling strips remain authoritative; commit authorization
   * remains with the host and is never implied by a geometric candidate.
   *
   * @param x - Viewport X coordinate in CSS pixels.
   * @param y - Viewport Y coordinate in CSS pixels.
   * @param excluded - Captured source roots, including unmounted selected roots.
   * @param nativeHit - Connected, uncaptured target of the current pointer event; omitted for fresh geometric reconciliation.
   * @param allowNestedBoundary - Whether the host has routed a nested occurrence edge to this enclosing editor; defaults to false so ordinary hits cannot cross occurrence boundaries.
   * @param accepts - Optional live source permission check used to compare nearby layout insertions; commit still revalidates the winner.
   * @returns Current destination and feedback element, or undefined outside this occurrence.
   */
  resolve(
    x: number,
    y: number,
    excluded: ReadonlySet<string> = new Set(),
    nativeHit?: Element,
    allowNestedBoundary = false,
    accepts?: BlockDropAcceptance,
  ): ResolvedBlockDropTarget | undefined {
    const root = this.editor.getRoot();
    if (!root?.isConnected || !Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    const hit = nativeHit?.isConnected ? nativeHit : root.ownerDocument.elementFromPoint(x, y);
    if (!hit || !root.contains(hit)) {
      return;
    }
    if (hit.closest("[data-rivto-block-editor]") !== root) {
      return allowNestedBoundary ? this.nestedBoundary(root, hit, x, y, excluded) : undefined;
    }
    const header = this.layoutHeader(hit);
    if (header && !this.isExcluded(header.dataset.blockId, excluded)) {
      return this.headerTarget(root, hit, header, x, y, excluded, accepts);
    }
    const region = this.regionTarget(root, hit, x, y, excluded);
    if (region) {
      return region;
    }
    const list = hit.closest<HTMLElement>(`.${BLOCK_EDITOR_CLASSES.children}`);
    const shell = hit.closest<HTMLElement>(`.${BLOCK_EDITOR_CLASSES.block}[data-block-id]`);
    // Layout controls and item padding belong to the list, not its enclosing row.
    const listBackground = list && (!shell || !list.contains(shell));
    if (list?.dataset.blockDropAxis && listBackground) {
      if (list.dataset.blockDropAxis === "vertical") {
        return this.listGap(list, x, y, excluded, accepts);
      }
      return this.containerGap(list, x, y, excluded);
    }
    if (shell && listBackground && !this.hasOutlineLayout(shell)) {
      const rect = shell.getBoundingClientRect();
      if (y < rect.bottom - this.gapSize || this.isExcluded(shell.dataset.blockId, excluded)) {
        return;
      }
      return this.boundaryTarget(shell, rect, x, false, excluded);
    }
    if (!shell || listBackground) {
      const roots = hit.closest<HTMLElement>("[data-block-root-list]");
      return list || roots ? this.listGap(list ?? roots!, x, y, excluded, accepts) : undefined;
    }
    return this.rowTarget(shell, x, y, excluded, accepts);
  }

  /**
   * Converts local outline indentation to current viewport pixels without measuring DOM.
   *
   * @returns Positive host zoom applied to the configured indentation; invalid zoom uses one.
   */
  private get viewportIndent(): number {
    const scale = this.getScale();
    return this.indent * (Number.isFinite(scale) && scale > 0 ? scale : 1);
  }

  /**
   * Finds layout-owned chrome outside the actual child host without inspecting block types.
   *
   * @param hit - Native hit in this occurrence, including wrapped title and body slots.
   * @returns Owning shell for custom-layout chrome, or undefined for child content and ordinary outlines.
   */
  private layoutHeader(hit: Element): HTMLElement | undefined {
    const shell = hit.closest<HTMLElement>(`.${BLOCK_EDITOR_CLASSES.block}[data-block-id]`);
    const children = shell && blockLayoutRegion(shell, "children");
    if (shell && children && !this.hasOutlineLayout(shell) && !children.contains(hit)) {
      return shell;
    }
    return undefined;
  }

  /**
   * Preserves explicit insertion strips before ranking a header's permitted nearby gaps.
   *
   * @param root - Current occurrence boundary.
   * @param hit - Native header or body-chrome hit.
   * @param shell - Canonical layout owning that chrome.
   * @param x - Pointer viewport X in CSS pixels.
   * @param y - Pointer viewport Y in CSS pixels.
   * @param excluded - Moving roots omitted from candidates.
   * @param accepts - Optional source policy, checked before ranking.
   * @returns Explicit gap or nearest permitted candidate, or undefined when none is allowed.
   */
  private headerTarget(
    root: HTMLElement,
    hit: Element,
    shell: HTMLElement,
    x: number,
    y: number,
    excluded: ReadonlySet<string>,
    accepts?: BlockDropAcceptance,
  ): ResolvedBlockDropTarget | undefined {
    const explicit = this.editor.dropTargets.resolveHit(hit, excluded);
    if (explicit?.destination.kind === "between") {
      return explicit;
    }
    return nearestBlockDropTarget(
      [
        this.nearestLayoutTarget(shell, x, y, excluded, accepts),
        this.outerBoundary(root, hit, x, y, excluded),
      ],
      x,
      y,
      accepts,
    );
  }

  /**
   * Compares outer sibling boundaries with nearby child insertions around layout chrome.
   *
   * Header halves never choose a distant container bottom. Every candidate uses
   * its actual insertion line; only the pointed layout's nearest child branch is
   * descended when structural policy rejects insertion at the immediate level.
   *
   * @param shell - Layout owning the native title/body hit.
   * @param x - Viewport pointer X in CSS pixels.
   * @param y - Viewport pointer Y in CSS pixels.
   * @param excluded - Moving roots and their subtrees omitted from candidates.
   * @param accepts - Borrowed synchronous permission check, if supplied.
   * @returns Nearest permitted insertion, or undefined when the local candidates are forbidden.
   */
  private nearestLayoutTarget(
    shell: HTMLElement,
    x: number,
    y: number,
    excluded: ReadonlySet<string>,
    accepts?: BlockDropAcceptance,
  ): ResolvedBlockDropTarget | undefined {
    const children = blockLayoutRegion(shell, "children");
    const within = blockDropDistance(shell.getBoundingClientRect(), x, y) === 0;
    const child =
      within && children ? this.nearestChildTarget(children, x, y, excluded, accepts) : undefined;
    return nearestBlockDropTarget(
      [
        this.placementBoundary(shell, false, x, y, excluded),
        child,
        this.placementBoundary(shell, true, x, y, excluded),
      ],
      x,
      y,
      accepts,
    );
  }

  /**
   * Finds a permitted insertion in the nearest mounted child branch.
   *
   * Empty hosts propose inside placement. Populated hosts propose canonical gaps;
   * only rejected structural levels descend further, retaining ordinary outline
   * semantics for native child hits and avoiding a whole-document target scan.
   *
   * @param list - Current owned child host, possibly hidden by collapse.
   * @param x - Viewport pointer X in CSS pixels.
   * @param y - Viewport pointer Y in CSS pixels.
   * @param excluded - Moving roots excluded from geometry and receiving parents.
   * @param accepts - Optional permission check for this source group.
   * @returns Nearest permitted local child insertion, or undefined for hidden/forbidden branches.
   */
  private nearestChildTarget(
    list: HTMLElement,
    x: number,
    y: number,
    excluded: ReadonlySet<string>,
    accepts?: BlockDropAcceptance,
  ): ResolvedBlockDropTarget | undefined {
    if (list.hidden) {
      return;
    }
    const items = this.mountedItems(list);
    const parentId = list.closest<HTMLElement>("[data-block-id]")?.dataset.blockId;
    if (!parentId || this.isExcluded(parentId, excluded)) {
      return;
    }
    if (!items.length) {
      return nearestBlockDropTarget(
        [{ element: list, destination: { kind: "inside", parentId } }],
        x,
        y,
        accepts,
      );
    }
    const shell = this.nearestChildShell(list, items, x, y, excluded);
    if (!shell) {
      return;
    }
    const candidate = nearestBlockDropTarget(
      [
        this.placementBoundary(shell, false, x, y, excluded),
        this.placementBoundary(shell, true, x, y, excluded),
      ],
      x,
      y,
      accepts,
    );
    if (candidate) {
      return candidate;
    }
    const children = blockLayoutRegion(shell, "children");
    return children && this.nearestChildTarget(children, x, y, excluded, accepts);
  }

  /**
   * Locates nearby children using vertical binary search or the local multi-axis placements.
   *
   * @param list - Host declaring the actual child flow.
   * @param items - Immediate mounted placement elements, without their descendants.
   * @param x - Viewport pointer X in CSS pixels.
   * @param y - Viewport pointer Y in CSS pixels.
   * @param excluded - Moving roots that cannot supply receiving geometry.
   * @returns Nearest stationary shell, or undefined when no mounted child remains.
   */
  private nearestChildShell(
    list: HTMLElement,
    items: readonly HTMLElement[],
    x: number,
    y: number,
    excluded: ReadonlySet<string>,
  ): HTMLElement | undefined {
    let candidates = items;
    if (!list.dataset.blockDropAxis || list.dataset.blockDropAxis === "vertical") {
      const low = this.firstItemAfter(items, y);
      const index = this.stationaryItemIndex(items, low, y, excluded);
      candidates = items.slice(Math.max(0, index), index + 2);
    }
    let nearest: HTMLElement | undefined;
    let distance = Infinity;
    for (const item of candidates) {
      const shell = this.itemShell(item);
      if (!shell || this.isExcluded(shell.dataset.blockId, excluded)) {
        continue;
      }
      const rect = item.getBoundingClientRect();
      const current = blockDropDistance(rect, x, y);
      if (rect.height > 0 && current < distance) {
        nearest = shell;
        distance = current;
      }
    }
    return nearest;
  }

  /**
   * Builds canonical sibling feedback along the parent's actual placement axis.
   *
   * Grid endpoints compare both physical edges; RTL reverses inline edges only.
   * Adjacent stationary items share one line, while retained sources keep the
   * candidate at the stationary item's own edge.
   *
   * @param shell - Stationary shell bordering the proposed insertion.
   * @param after - True selects its following canonical gap.
   * @param x - Pointer X used to choose a grid endpoint's nearest edge.
   * @param y - Pointer Y used to choose a grid endpoint's nearest edge.
   * @param excluded - Moving roots omitted from canonical adjacency.
   * @returns Between target with viewport feedback, or undefined for stale hierarchy.
   */
  private placementBoundary(
    shell: HTMLElement,
    after: boolean,
    x: number,
    y: number,
    excluded: ReadonlySet<string>,
  ): ResolvedBlockDropTarget | undefined {
    const destination = this.siblingGap(shell.dataset.blockId!, after, excluded);
    if (!destination || destination.kind !== "between") {
      return;
    }
    const item = this.placementItem(shell);
    const rect = this.placementRect(shell);
    const list = shell.parentElement?.closest<HTMLElement>(`.${BLOCK_EDITOR_CLASSES.children}`);
    const axis = list?.dataset.blockDropAxis ?? "vertical";
    const neighbor = this.adjacentShell(
      shell,
      after ? destination.nextId : destination.previousId,
      !after,
    );
    if (neighbor) {
      const other = this.placementRect(neighbor);
      const indicator = blockGapIndicator(
        after ? rect : other,
        after ? other : rect,
        axis === "grid" || axis === "horizontal" ? axis : "vertical",
      );
      return { element: shell, destination, indicator };
    }
    const rtl = shell.ownerDocument.defaultView?.getComputedStyle(item).direction === "rtl";
    return nearestBlockDropTarget(
      this.placementEndpoints(rect, axis, after, rtl).map((indicator) => ({
        element: shell,
        destination,
        indicator,
      })),
      x,
      y,
    );
  }

  /**
   * Supplies endpoint lines along the declared flow without measuring additional elements.
   *
   * @param rect - Complete stationary placement bounds in viewport pixels.
   * @param axis - Child host flow; undeclared flow uses vertical boundaries.
   * @param after - Whether the insertion follows the stationary block.
   * @param rtl - Whether inline progression runs from right to left.
   * @returns Both endpoint orientations for grids, otherwise the single flow boundary.
   */
  private placementEndpoints(
    rect: DOMRect,
    axis: string,
    after: boolean,
    rtl: boolean,
  ): BlockDropIndicator[] {
    const block = {
      left: rect.left,
      top: (after ? rect.bottom : rect.top) - 1,
      width: rect.width,
      height: 2,
    };
    const inline = {
      left: (after !== rtl ? rect.right : rect.left) - 1,
      top: rect.top,
      width: 2,
      height: rect.height,
    };
    let indicators = [block];
    if (axis === "grid") {
      indicators = [block, inline];
    } else if (axis === "horizontal") {
      indicators = [inline];
    }
    return indicators;
  }

  /**
   * Measures explicit placement chrome or the canonical shell beneath neutral wrappers.
   *
   * Virtual root wrappers may include flow spacing; that spacing must not move
   * the shared gap midpoint when approached from the opposite block.
   *
   * @param shell - Canonical stationary shell whose boundary is requested.
   * @returns Full item bounds for an identified placement, otherwise full shell bounds.
   */
  private placementRect(shell: HTMLElement): DOMRect {
    const item = this.placementItem(shell);
    return (
      item.dataset.blockItemId === shell.dataset.blockId ? item : shell
    ).getBoundingClientRect();
  }

  /**
   * Keeps a child's explicit region ahead of its ancestor's heuristic outer rim.
   *
   * A container's own header or empty host still exposes its outer sorting edge.
   * A separately owned child shell or placement region keeps its destination,
   * even when its geometry touches that ancestor edge.
   *
   * @param root - Current occurrence boundary.
   * @param hit - Native pointer target in this occurrence.
   * @param x - Viewport horizontal coordinate in CSS pixels.
   * @param y - Viewport vertical coordinate in CSS pixels.
   * @param excluded - Moving subtrees omitted from destinations.
   * @returns Explicit child region, outer rim, or undefined when neither applies.
   */
  private regionTarget(
    root: HTMLElement,
    hit: Element,
    x: number,
    y: number,
    excluded: ReadonlySet<string>,
  ): ResolvedBlockDropTarget | undefined {
    const explicit = this.editor.dropTargets.resolveHit(hit, excluded);
    const outer = this.outerBoundary(root, hit, x, y, excluded);
    const owner = explicit?.element.closest<HTMLElement>("[data-block-id], [data-block-item-id]");
    const ownerId = owner?.dataset.blockId ?? owner?.dataset.blockItemId;
    if (explicit && ownerId !== outer?.element.dataset.blockId) {
      return explicit;
    }
    return outer ?? explicit;
  }

  /**
   * Reserves exposed container rims for sorting the whole container among siblings.
   *
   * Child-owned explicit regions take precedence; the container's own regions
   * retain outer sorting edges. Only
   * native-hit ancestors are inspected; unrelated containers are never measured.
   *
   * @param root - Exact occurrence boundary.
   * @param hit - Current native hit in this occurrence.
   * @param x - Viewport pointer X in CSS pixels.
   * @param y - Viewport pointer Y in CSS pixels.
   * @param excluded - Moving subtrees that cannot receive a target.
   * @returns Outermost matching container rim, or undefined for interior content.
   */
  private outerBoundary(
    root: HTMLElement,
    hit: Element,
    x: number,
    y: number,
    excluded: ReadonlySet<string>,
  ): ResolvedBlockDropTarget | undefined {
    let result: ResolvedBlockDropTarget | undefined;
    const pointed = hit.closest<HTMLElement>(`.${BLOCK_EDITOR_CLASSES.block}[data-block-id]`);
    const outlineHit =
      pointed &&
      this.hasOutlineLayout(pointed) &&
      !this.isExcluded(pointed.dataset.blockId, excluded);
    for (
      let current: Element | null = hit;
      current && current !== root;
      current = current.parentElement
    ) {
      if (!current.matches(`.${BLOCK_EDITOR_CLASSES.block}[data-block-id]`)) {
        continue;
      }
      const shell = current as HTMLElement;
      if (this.hasOutlineLayout(shell) || this.isExcluded(shell.dataset.blockId, excluded)) {
        continue;
      }
      const rect = shell.getBoundingClientRect();
      const edge = Math.min(this.gapSize, rect.height / 3);
      // A final outline row can share the container bottom; its interior still owns depth projection.
      if (
        outlineHit &&
        y > rect.bottom - edge &&
        x > rect.left + edge &&
        x < rect.right - edge &&
        x < pointed.getBoundingClientRect().left + this.viewportIndent
      ) {
        continue;
      }
      if (
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom &&
        (y < rect.top + edge || y > rect.bottom - edge)
      ) {
        result = this.boundaryTarget(shell, rect, x, y < rect.top + edge, excluded);
      }
    }
    return result;
  }

  /**
   * Resolves the enclosing block boundary after host routing has selected this occurrence.
   *
   * Interior routing remains with the host. The nested root directly below this
   * editor determines the edge; its enclosing block supplies canonical neighbors.
   * No nested document IDs or display-root IDs are interpreted as local hierarchy.
   *
   * @param root - Current enclosing editor attachment.
   * @param hit - Native hit in a nested occurrence whose outer edge was routed here.
   * @param x - Viewport pointer X coordinate in CSS pixels.
   * @param y - Viewport pointer Y coordinate in CSS pixels.
   * @param excluded - Moving roots that cannot receive their own insertion.
   * @returns A depth-constrained gap around the reference, or undefined when its shell is unavailable.
   */
  private nestedBoundary(
    root: HTMLElement,
    hit: Element,
    x: number,
    y: number,
    excluded: ReadonlySet<string>,
  ): ResolvedBlockDropTarget | undefined {
    let nested = hit.closest<HTMLElement>("[data-rivto-block-editor]");
    while (nested) {
      const parent = nested.parentElement?.closest<HTMLElement>("[data-rivto-block-editor]");
      if (parent === root) {
        break;
      }
      nested = parent ?? null;
    }
    const shell = nested?.parentElement?.closest<HTMLElement>(
      `.${BLOCK_EDITOR_CLASSES.block}[data-block-id]`,
    );
    const id = shell?.dataset.blockId;
    if (!nested || !shell || !id || this.isExcluded(id, excluded)) {
      return;
    }
    const inner = nested.getBoundingClientRect();
    const before = y < (inner.top + inner.bottom) / 2;
    return this.boundaryTarget(shell, shell.getBoundingClientRect(), x, before, excluded);
  }

  /**
   * Interprets one stationary row and its lower outline boundary.
   *
   * @param shell - Hit block shell in this occurrence.
   * @param x - Viewport pointer X coordinate.
   * @param y - Viewport pointer Y coordinate.
   * @param excluded - Captured moving roots whose descendants cannot receive a drop.
   * @param accepts - Live source policy carried through neutral placement wrappers.
   * @returns Current row destination, or undefined inside a moving subtree.
   */
  private rowTarget(
    shell: HTMLElement,
    x: number,
    y: number,
    excluded: ReadonlySet<string>,
    accepts?: BlockDropAcceptance,
  ): ResolvedBlockDropTarget | undefined {
    const id = shell.dataset.blockId;
    if (!id) {
      return;
    }
    if (this.isExcluded(id, excluded)) {
      return this.movingChildBoundary(shell, x, y, excluded);
    }
    const row = blockLayoutRegion(shell, "row") ?? shell;
    let rect = row.getBoundingClientRect();
    const rowBottom = rect.bottom;
    const body = blockLayoutRegion(shell, "body");
    if (body && y > rect.bottom) {
      const bodyRect = body.getBoundingClientRect();
      rect = bodyRect;
    }
    if (!this.hasOutlineLayout(shell)) {
      const root = this.editor.getRoot();
      const rim = root && this.outerBoundary(root, shell, x, y, excluded);
      return rim ?? this.nearestLayoutTarget(shell, x, y, excluded, accepts);
    }
    const outline = this.outlineChildren(shell);
    if (outline && y > rect.bottom) {
      return this.listGap(outline, x, y, excluded, accepts);
    }
    const edge = Math.min(Math.max(0, this.gapSize), rect.height / 3);
    let destination: BlockDropDestination | undefined;
    const before = y < rect.top + edge;
    if (before) {
      return this.boundaryTarget(shell, rect, x, true, excluded);
    } else if (
      this.allowChildren &&
      y < rowBottom &&
      y < rect.bottom - edge &&
      x >= rect.left + this.viewportIndent
    ) {
      destination = { kind: "inside", parentId: id };
    } else {
      return this.boundaryTarget(shell, rect, x, false, excluded);
    }
    return { element: row, destination };
  }

  /**
   * Resolves a stationary parent's bottom rim covered by a moving child.
   *
   * Moving DOM retains its space. Interior hits remain unavailable; only the
   * outer rim of the first stationary ancestor can supply a sibling destination.
   * The destination is the ancestor's sibling gap, so stationary children cannot
   * turn the outer rim into a child-list insertion.
   * The DOM ancestor chain is visited once; only the stationary shell is measured.
   *
   * @param shell - Hit shell belonging to a moving subtree.
   * @param x - Viewport pointer X coordinate.
   * @param y - Viewport pointer Y coordinate.
   * @param excluded - Captured moving roots.
   * @returns The enclosing bottom boundary, or undefined outside its rim.
   */
  private movingChildBoundary(
    shell: HTMLElement,
    x: number,
    y: number,
    excluded: ReadonlySet<string>,
  ): ResolvedBlockDropTarget | undefined {
    const root = this.editor.getRoot();
    let stationary: HTMLElement | undefined;
    let needsStationary = false;
    const selector = `.${BLOCK_EDITOR_CLASSES.block}[data-block-id]`;
    for (
      let current: HTMLElement | null = shell;
      current && current !== root;
      current = current.parentElement
    ) {
      if (!current.matches(selector)) {
        continue;
      }
      if (excluded.has(current.dataset.blockId!)) {
        stationary = undefined;
        needsStationary = true;
      } else if (needsStationary) {
        stationary = current;
        needsStationary = false;
      }
    }
    if (!stationary) {
      return;
    }
    const rect = stationary.getBoundingClientRect();
    if (y < rect.bottom - this.gapSize || y > rect.bottom || x < rect.left || x > rect.right) {
      return;
    }
    const id = stationary.dataset.blockId!;
    const destination = this.siblingGap(id, true, excluded);
    if (!destination) {
      return;
    }
    return {
      element: stationary,
      destination,
      indicator: this.gapIndicator(id, destination, rect, false),
    };
  }

  /**
   * Resolves one shared gap from either adjacent shell, including body-slot edges.
   *
   * Horizontal movement selects canonical depth. Only an adjacent mounted sibling
   * is measured; nested editor contents never supply local hierarchy identities.
   * A row above an expanded outline shares the first stationary child's upper edge
   * when that child owns the destination. Excluded first children keep the row edge
   * rather than centering a line across their retained subtree space.
   *
   * @param shell - Stationary shell bordering the requested gap.
   * @param rect - Already measured row or body extent in viewport pixels.
   * @param x - Pointer X coordinate used to select outline depth.
   * @param before - Whether the upper boundary is requested.
   * @param excluded - Captured moving roots omitted from adjacency.
   * @returns Canonical destination and a two-pixel line, or undefined for stale data.
   */
  private boundaryTarget(
    shell: HTMLElement,
    rect: DOMRect,
    x: number,
    before: boolean,
    excluded: ReadonlySet<string>,
  ): ResolvedBlockDropTarget | undefined {
    const id = shell.dataset.blockId!;
    const gap = this.siblingGap(id, !before, excluded);
    if (!gap || gap.kind !== "between") {
      return;
    }
    const neighborId = before ? gap.previousId : gap.nextId;
    const adjacent = this.adjacentShell(shell, neighborId, before);
    const adjacentRect = adjacent?.getBoundingClientRect();
    let destination: BlockDropDestination = gap;
    let anchor = id;
    let anchorRect = rect;
    if (before && adjacent && adjacentRect) {
      anchor = adjacent.dataset.blockId!;
      anchorRect = adjacentRect;
      destination = this.beforeGap(adjacent, x, adjacentRect.left, gap, excluded);
    } else if (!before) {
      const depth = Math.floor((x - rect.left) / Math.max(1, this.viewportIndent));
      destination = this.afterGap(id, depth, excluded, gap, this.hasOutlineLayout(shell)) ?? gap;
    }
    if (destination === gap && !this.outlineChildren(shell)) {
      const bounds = this.hasOutlineLayout(shell) ? shell.getBoundingClientRect() : rect;
      const indicator = adjacentRect
        ? blockGapIndicator(
            before ? adjacentRect : bounds,
            before ? bounds : adjacentRect,
            "vertical",
          )
        : this.gapIndicator(id, gap, bounds, before);
      return { element: shell, destination, indicator };
    }
    const shared =
      this.childGapIndicator(shell, destination) ??
      (adjacent && this.childGapIndicator(adjacent, destination)) ??
      this.outdentIndicator(shell, destination);
    if (shared) {
      return { element: shell, destination, indicator: shared };
    }
    const indicator = this.gapIndicator(anchor, destination, anchorRect, before && !adjacent);
    const edge = before ? rect.top : rect.bottom;
    const startsChildren =
      !before &&
      destination.kind === "between" &&
      destination.parentId === id &&
      destination.nextId !== null;
    const precedesOutline = !before && !!this.outlineChildren(shell);
    const top =
      adjacentRect && !startsChildren && !precedesOutline
        ? (edge + (before ? adjacentRect.bottom : adjacentRect.top)) / 2 - 1
        : edge - 1;
    return { element: shell, destination, indicator: { ...indicator, top } };
  }

  /**
   * Uses a child-list edge for the same insertion approached from either side.
   *
   * The parent's lower row and first child's upper row share the first insertion;
   * the last child's lower edge and following root can share a child append.
   * Only the edge placement is inspected. Excluded edge children retain their
   * space instead of moving feedback across dragged placeholders.
   *
   * @param shell - Possible owner of the destination's ordinary child outline.
   * @param destination - Canonical gap after depth projection and source exclusion.
   * @returns Matching child-edge feedback, or undefined for other gaps or missing DOM.
   */
  private childGapIndicator(
    shell: HTMLElement,
    destination: BlockDropDestination,
  ): BlockDropIndicator | undefined {
    if (
      destination.kind !== "between" ||
      destination.parentId !== shell.dataset.blockId ||
      (destination.previousId !== null && destination.nextId !== null)
    ) {
      return;
    }
    const before = destination.previousId === null;
    const id = before ? destination.nextId : destination.previousId;
    const list = this.outlineChildren(shell);
    let item = (before ? list?.firstElementChild : list?.lastElementChild) as
      HTMLElement | null | undefined;
    while (item) {
      const child = this.itemShell(item);
      if (child) {
        if (!id || child.dataset.blockId !== id) {
          return;
        }
        return this.gapIndicator(id, destination, child.getBoundingClientRect(), before);
      }
      item = (before ? item.nextElementSibling : item.previousElementSibling) as HTMLElement | null;
    }
    return undefined;
  }

  /**
   * Centers an outdented insertion between its actual ancestor and next sibling.
   *
   * The same gap approached from the next sibling already uses these rectangles.
   * Walk only mounted ancestors; do not scan the editor for canonical IDs or span
   * an intervening moving placement when the next stationary sibling is not adjacent.
   *
   * @param shell - Descendant row from which depth projection outdented the gap.
   * @param destination - Projected canonical gap after source exclusion.
   * @returns Shared sibling-gap feedback, or undefined without mounted adjacent anchors.
   */
  private outdentIndicator(
    shell: HTMLElement,
    destination: BlockDropDestination,
  ): BlockDropIndicator | undefined {
    if (
      destination.kind !== "between" ||
      !destination.previousId ||
      !destination.nextId ||
      destination.previousId === shell.dataset.blockId
    ) {
      return;
    }
    let previous = shell.parentElement?.closest<HTMLElement>(
      `.${BLOCK_EDITOR_CLASSES.block}[data-block-id]`,
    );
    while (previous) {
      if (previous.closest("[data-rivto-block-editor]") !== this.editor.getRoot()) {
        return;
      }
      if (previous.dataset.blockId === destination.previousId) {
        break;
      }
      previous = previous.parentElement?.closest<HTMLElement>(
        `.${BLOCK_EDITOR_CLASSES.block}[data-block-id]`,
      );
    }
    const next = previous && this.adjacentShell(previous, destination.nextId, false);
    if (!previous || !next) {
      return;
    }
    const a = previous.getBoundingClientRect();
    const b = next.getBoundingClientRect();
    return { left: a.left, top: (a.bottom + b.top) / 2 - 1, width: a.width, height: 2 };
  }

  /**
   * Selects a child append destination from the upper edge of the following row.
   *
   * Only the excluded suffix and final stationary child are read. Collapsed nodes,
   * explicit container layouts and horizontal sibling positions retain the gap.
   *
   * @param previous - Mounted shell immediately before the gap.
   * @param x - Viewport pointer X coordinate.
   * @param left - Already measured left edge of the previous shell.
   * @param gap - Canonical sibling insertion to preserve when nesting is unavailable.
   * @param excluded - Moving roots omitted from child adjacency.
   * @returns Child append destination or the supplied sibling gap.
   */
  private beforeGap(
    previous: HTMLElement,
    x: number,
    left: number,
    gap: BlockDropDestination,
    excluded: ReadonlySet<string>,
  ): BlockDropDestination {
    if (!this.allowChildren || x < left + this.viewportIndent || !this.hasOutlineLayout(previous)) {
      return gap;
    }
    const id = previous.dataset.blockId!;
    const node = this.editor.adapter.blocks.getBlockNode(id);
    if (!node || node.collapsed) {
      return gap;
    }
    let previousId: string | null = null;
    for (let index = node.childIds.length - 1; index >= 0; index -= 1) {
      const child = node.childIds[index]!;
      if (!excluded.has(child)) {
        previousId = child;
        break;
      }
    }
    return { kind: "between", parentId: id, previousId, nextId: null };
  }

  /**
   * Reads the immediate mounted neighbor only when it is the canonical gap anchor.
   *
   * Moving roots keep their DOM space during a gesture. A line beside one stays
   * at the stationary edge instead of spanning the source to another sibling.
   *
   * @param shell - Stationary shell, optionally wrapped in a placement item.
   * @param id - Canonical stationary neighbor, or null at the list boundary.
   * @param before - Whether to inspect the previous sibling.
   * @returns The adjacent shell when identities match, otherwise undefined.
   */
  private adjacentShell(
    shell: HTMLElement,
    id: string | null,
    before: boolean,
  ): HTMLElement | undefined {
    const item = this.placementItem(shell);
    let neighbor = before ? item.previousElementSibling : item.nextElementSibling;
    while (neighbor?.classList.contains(BLOCK_EDITOR_CLASSES.listGap)) {
      neighbor = before ? neighbor.previousElementSibling : neighbor.nextElementSibling;
    }
    const adjacent = neighbor && this.itemShell(neighbor as HTMLElement);
    return adjacent?.dataset.blockId === id ? adjacent : undefined;
  }

  /**
   * Finds the direct placement item around a shell without traversing its subtree.
   *
   * Host wrappers may add DOM without using BlockItem. Their outermost element
   * remains the sibling geometry within the current root or child list.
   *
   * @param shell - Mounted canonical block shell.
   * @returns The shell itself or its outer wrapper below a structural list.
   */
  private placementItem(shell: HTMLElement): HTMLElement {
    let item = shell;
    const root = this.editor.getRoot();
    while (
      item.parentElement &&
      item.parentElement !== root &&
      !item.parentElement.classList.contains(BLOCK_EDITOR_CLASSES.children) &&
      !item.parentElement.classList.contains(BLOCK_EDITOR_CLASSES.tree) &&
      !item.parentElement.hasAttribute("data-block-root-list")
    ) {
      item = item.parentElement;
    }
    return item;
  }

  /**
   * Distinguishes ordinary outline nesting from a host's explicit container layout.
   *
   * @param shell - Current block shell in this occurrence.
   * @returns False when an owned child host uses a non-outline layout; true for leaves and ordinary outlines regardless of wrapper depth.
   */
  private hasOutlineLayout(shell: HTMLElement): boolean {
    const children = blockLayoutRegion(shell, "children");
    return !children || children.classList.contains("rivto-block-outline");
  }

  /**
   * Reads the owner's visible ordinary outline through arbitrary layout wrappers.
   *
   * @param shell - Canonical mounted block shell.
   * @returns Expanded outline host, or undefined for custom and collapsed layouts.
   */
  private outlineChildren(shell: HTMLElement): HTMLElement | undefined {
    const children = blockLayoutRegion(shell, "children");
    if (children && !children.hidden && children.classList.contains("rivto-block-outline")) {
      return children;
    }
    return undefined;
  }

  /**
   * Places sibling feedback outside the complete shell, including padding and descendants.
   *
   * Both sides of the same gap use the same adjacent bounds. Retained source
   * placeholders interrupt adjacency and keep feedback at the stationary edge.
   *
   * @param shell - Stationary block at one side of the gap.
   * @param after - True inserts after this block; false inserts before it.
   * @param excluded - Moving roots omitted from canonical adjacency.
   * @returns Canonical sibling destination and line, or undefined for stale data.
   */
  private siblingBoundary(
    shell: HTMLElement,
    after: boolean,
    excluded: ReadonlySet<string>,
  ): ResolvedBlockDropTarget | undefined {
    const id = shell.dataset.blockId!;
    const destination = this.siblingGap(id, after, excluded);
    if (!destination || destination.kind !== "between") {
      return;
    }
    const neighbor = this.adjacentShell(
      shell,
      after ? destination.nextId : destination.previousId,
      !after,
    );
    const rect = shell.getBoundingClientRect();
    let indicator = this.gapIndicator(id, destination, rect, !after);
    if (neighbor) {
      const other = neighbor.getBoundingClientRect();
      indicator = blockGapIndicator(after ? rect : other, after ? other : rect, "vertical");
    }
    return { element: shell, destination, indicator };
  }

  /**
   * Places a horizontal boundary at the resolved canonical nesting depth.
   *
   * Reuses the hit row rectangle; only ancestor IDs are read when an insertion
   * outdents. The lower edge remains below the final visible descendant, while
   * the left endpoint follows the actual destination rather than raw pointer X.
   *
   * @param id - Stationary row from which the gap was resolved.
   * @param destination - Validated between destination, including any constrained depth.
   * @param rect - Already measured row rectangle in viewport CSS pixels.
   * @param before - Whether the upper edge of this row was selected.
   * @returns Two-pixel line without additional DOM measurements or descendant reads.
   */
  private gapIndicator(
    id: string,
    destination: BlockDropDestination,
    rect: DOMRect,
    before: boolean,
  ): BlockDropIndicator {
    let offset = 0;
    if (destination.parentId === id) {
      offset = this.viewportIndent;
    } else {
      let parent = this.editor.adapter.blocks.getParentId(id) ?? null;
      while (parent !== destination.parentId && parent !== null) {
        offset -= this.viewportIndent;
        parent = this.editor.adapter.blocks.getParentId(parent) ?? null;
      }
    }
    return {
      left: rect.left + offset,
      top: (before ? rect.top : rect.bottom) - 1,
      width: Math.max(0, rect.width - offset),
      height: 2,
    };
  }

  /**
   * Resolves whitespace among mounted siblings without scanning their subtrees.
   *
   * Binary search measures logarithmically many mounted sibling rectangles. Virtual
   * spacers do not become model destinations; neighboring mounted blocks retain
   * their real canonical parents. Grid bodies must supply explicit drop regions.
   *
   * @param list - Current root or outline child host hit by native geometry.
   * @param x - Viewport pointer X coordinate.
   * @param y - Viewport pointer Y coordinate.
   * @param excluded - Captured moving roots omitted from the insertion context.
   * @param accepts - Live source policy forwarded to nearby custom-layout candidates.
   * @returns Neighboring row destination or an empty-list append destination.
   */
  private listGap(
    list: HTMLElement,
    x: number,
    y: number,
    excluded: ReadonlySet<string>,
    accepts?: BlockDropAcceptance,
  ): ResolvedBlockDropTarget | undefined {
    const items = this.mountedItems(list);
    if (!items.length) {
      if (list === this.editor.getRoot() && this.editor.adapter.blocks.getBlockIds().length) {
        return;
      }
      const parentId =
        list.closest<HTMLElement>("[data-block-id]")?.dataset.blockId ?? this.rootParentId;
      return parentId && this.isExcluded(parentId, excluded)
        ? undefined
        : { element: list, destination: { kind: "inside", parentId } };
    }
    const low = this.firstItemAfter(items, y);
    const index = this.stationaryItemIndex(items, low, y, excluded);
    const follows = index < low;
    const item = items[index];
    let shell = item && this.itemShell(item);
    if (!shell) {
      return;
    }
    if (list.dataset.blockDropPlacement === "siblings") {
      return this.siblingBoundary(shell, follows, excluded);
    }
    if (follows) {
      shell = this.lastVisibleShell(shell, excluded);
    }
    return this.rowTarget(shell, x, y, excluded, accepts);
  }

  /**
   * Chooses the nearer stationary boundary when moving items retain intervening space.
   *
   * Ordinary gaps keep the preceding item for outline depth projection. If moving
   * items cover that position, compare the nearest stationary siblings on both
   * sides instead of always snapping back above the source. Only skipped moving
   * siblings and at most two boundary rectangles are inspected.
   *
   * @param items - Mounted placements in vertical order.
   * @param low - First placement beginning below the pointer.
   * @param y - Pointer Y coordinate in viewport pixels.
   * @param excluded - Moving roots omitted from receiving geometry.
   * @returns Stationary index, or items.length when no stationary item remains.
   */
  private stationaryItemIndex(
    items: readonly HTMLElement[],
    low: number,
    y: number,
    excluded: ReadonlySet<string>,
  ): number {
    let before = low - 1;
    while (
      before >= 0 &&
      this.isExcluded(this.itemShell(items[before]!)?.dataset.blockId, excluded)
    ) {
      before -= 1;
    }
    if (before >= 0 && before === low - 1) {
      return before;
    }
    let after = low;
    while (
      after < items.length &&
      this.isExcluded(this.itemShell(items[after]!)?.dataset.blockId, excluded)
    ) {
      after += 1;
    }
    if (before < 0) {
      return after;
    }
    if (after >= items.length) {
      return before;
    }
    const above = items[before]!.getBoundingClientRect();
    const below = items[after]!.getBoundingClientRect();
    return y - above.bottom <= below.top - y ? before : after;
  }

  /**
   * Resolves exposed container gaps along their declared axis, preserving canonical neighbors.
   *
   * Only immediate mounted items are inspected. Grid background away from a shared
   * sibling gap accepts an append to its owning container, never an editor-root fallback.
   *
   * @param list - Explicit layout-owned child host.
   * @param x - Viewport pointer X in CSS pixels.
   * @param y - Viewport pointer Y in CSS pixels.
   * @param excluded - Moving roots omitted from receiving geometry.
   * @returns Sibling-gap feedback, or an inside destination for unused body space.
   */
  private containerGap(
    list: HTMLElement,
    x: number,
    y: number,
    excluded: ReadonlySet<string>,
  ): ResolvedBlockDropTarget | undefined {
    const owner = list.closest<HTMLElement>("[data-block-id]");
    const parentId = owner?.dataset.blockId;
    if (!owner || !parentId || this.isExcluded(parentId, excluded)) {
      return;
    }
    const outer = owner.getBoundingClientRect();
    if (y < outer.top + this.gapSize || y > outer.bottom - this.gapSize) {
      return this.boundaryTarget(owner, outer, x, y < outer.top + this.gapSize, excluded);
    }
    const items = this.mountedItems(list).filter(
      (item) => !this.isExcluded(this.itemShell(item)?.dataset.blockId, excluded),
    );
    const axis = list.dataset.blockDropAxis;
    for (let index = 0; index + 1 < items.length; index++) {
      const first = items[index]!;
      const second = items[index + 1]!;
      const a = first.getBoundingClientRect();
      const b = second.getBoundingClientRect();
      const horizontal =
        axis === "horizontal" ||
        (axis === "grid" && Math.max(a.top, b.top) < Math.min(a.bottom, b.bottom));
      const inGap = horizontal
        ? x >= Math.min(a.right, b.right) &&
          x <= Math.max(a.left, b.left) &&
          y >= Math.min(a.top, b.top) &&
          y <= Math.max(a.bottom, b.bottom)
        : y >= a.bottom && y <= b.top;
      if (!inGap) {
        continue;
      }
      const destination = this.siblingGap(this.itemShell(first)!.dataset.blockId!, true, excluded);
      if (!destination) {
        return;
      }
      const indicator = blockGapIndicator(a, b, horizontal ? "horizontal" : "vertical");
      return { element: list, destination, indicator };
    }
    return { element: list, destination: { kind: "inside", parentId } };
  }

  /**
   * Finds the first mounted sibling starting below the pointer using binary search.
   *
   * Each comparison measures one item; no descendant rectangles are visited.
   *
   * @param items - Mounted sibling placements ordered vertically by the outline.
   * @param y - Pointer Y coordinate in viewport pixels.
   * @returns Insertion index from zero through the number of mounted items.
   */
  private firstItemAfter(items: readonly HTMLElement[], y: number): number {
    let low = 0;
    let high = items.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (items[middle]!.getBoundingClientRect().top <= y) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return low;
  }

  /**
   * Reads direct placement children without querying descendants of large containers.
   *
   * CSS querySelectorAll can inspect entire descendant subtrees even with a direct
   * child selector. Iterating children bounds this work to mounted sibling items.
   *
   * @param list - Mounted root or child-list host.
   * @returns Its block shells and host wrapper items in DOM order, excluding foreign editor occurrences.
   */
  private mountedItems(list: HTMLElement): HTMLElement[] {
    const ElementType = list.ownerDocument.defaultView!.HTMLElement;
    const tree =
      list === this.editor.getRoot()
        ? Array.from(list.children).find((child) =>
            child.classList.contains(BLOCK_EDITOR_CLASSES.tree),
          )
        : undefined;
    return Array.from((tree ?? list).children).filter(
      (child): child is HTMLElement =>
        child instanceof ElementType &&
        this.itemShell(child)?.closest("[data-rivto-block-editor]") === this.editor.getRoot(),
    );
  }

  /**
   * Finds the actual block shell inside an optional layout-owned placement item.
   *
   * @param item - Direct mounted sibling item.
   * @returns Its existing block shell, or undefined for a non-block layout item.
   */
  private itemShell(item: HTMLElement): HTMLElement | undefined {
    return item.matches("[data-block-id]")
      ? item
      : (item.querySelector<HTMLElement>("[data-block-id]") ?? undefined);
  }

  /**
   * Follows only the last visible child chain for a gap beneath an expanded subtree.
   *
   * @param shell - Mounted stationary subtree before the pointer gap.
   * @param excluded - Captured moving roots skipped from the receiving outline.
   * @returns Deepest stationary mounted trailing shell, or the original shell.
   */
  private lastVisibleShell(shell: HTMLElement, excluded: ReadonlySet<string>): HTMLElement {
    const children = this.outlineChildren(shell);
    let item = children?.lastElementChild as HTMLElement | null | undefined;
    while (item) {
      const child = this.itemShell(item);
      if (child?.dataset.blockId && !this.isExcluded(child.dataset.blockId, excluded)) {
        return this.lastVisibleShell(child, excluded);
      }
      item = item.previousElementSibling as HTMLElement | null;
    }
    return shell;
  }

  /**
   * Rejects a source and its descendants by walking only their current ancestry.
   *
   * @param id - Candidate block, or undefined for a non-block DOM item.
   * @param excluded - Captured moving roots.
   * @returns Whether the candidate belongs to a moving subtree or lacks an identity.
   */
  private isExcluded(id: string | undefined, excluded: ReadonlySet<string>): boolean {
    if (!id) {
      return true;
    }
    for (
      let ancestor: string | undefined = id;
      ancestor;
      ancestor = this.editor.adapter.blocks.getParentId(ancestor)
    ) {
      if (excluded.has(ancestor)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Resolves insertion depth without crossing an ancestor's following sibling.
   *
   * An expanded parent's lower row gap starts its child list. A trailing leaf can
   * outdent through ancestors only while each list ends there. The panel boundary
   * remains a destination parent and is never itself used as an outside anchor.
   *
   * @param id - Stationary row immediately before the gap.
   * @param depth - Requested relative depth from horizontal pointer displacement.
   * @param excluded - Moving roots removed from canonical neighbor checks.
   * @param gap - Already resolved sibling gap after this row, reused without another sibling scan.
   * @param outline - Whether the shell uses ordinary outline nesting rather than an explicit container layout.
   * @returns Current depth-constrained destination, or undefined for stale model data.
   */
  private afterGap(
    id: string,
    depth: number,
    excluded: ReadonlySet<string>,
    gap: BlockDropDestination,
    outline: boolean,
  ): BlockDropDestination | undefined {
    const blocks = this.editor.adapter.blocks;
    const node = blocks.getBlockNode(id);
    if (!node) {
      return;
    }
    const firstChild = node.collapsed
      ? undefined
      : node.childIds.find((child) => !excluded.has(child));
    if (outline && this.allowChildren && (firstChild || depth > 0) && !node.collapsed) {
      return { kind: "between", parentId: id, previousId: null, nextId: firstChild ?? null };
    }
    let anchor = id;
    let destination: BlockDropDestination | undefined = gap;
    for (let level = Math.min(depth, 0); level < 0; level += 1) {
      if (!destination || destination.kind !== "between" || destination.nextId !== null) {
        break;
      }
      const parent = blocks.getParentId(anchor);
      if (!parent || parent === this.rootParentId) {
        break;
      }
      anchor = parent;
      destination = this.siblingGap(anchor, true, excluded);
    }
    return destination;
  }

  /**
   * Computes neighbors from the actual parent rather than the displayed root list.
   *
   * @param id - Stationary block adjacent to the requested gap.
   * @param after - Whether insertion follows this block.
   * @param excluded - Moving roots omitted from the receiving siblings.
   * @returns Canonical gap, or undefined when its parent or anchor is unavailable.
   */
  private siblingGap(
    id: string,
    after: boolean,
    excluded: ReadonlySet<string>,
  ): BlockDropDestination | undefined {
    const blocks = this.editor.adapter.blocks;
    const parentId = blocks.getParentId(id) ?? null;
    const siblings =
      parentId === null ? blocks.getRootIds() : blocks.getBlockNode(parentId)?.childIds;
    const remaining = siblings?.filter((sibling) => !excluded.has(sibling));
    const index = remaining?.indexOf(id) ?? -1;
    if (!remaining || index < 0) {
      return;
    }
    const gap = index + Number(after);
    return {
      kind: "between",
      parentId,
      previousId: remaining[gap - 1] ?? null,
      nextId: remaining[gap] ?? null,
    };
  }
}
