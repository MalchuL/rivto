/** Resolves measured layout regions directly to stable destinations. */
import type { BlockDropPlacementOptions, DropAxis } from "../../../views/types";
import type { DropPlacement, PointerCoordinates } from "../types";
import type { CanonicalDropPlacement, DropBlock, ResolvedDropPlacementOptions } from "./types";
import { resolveAfterDropPlacement, resolveBlockDropPlacementOptions } from "./utils";

/** Numeric viewport geometry; callers need no DOM object or drag-library type. */
export type DropRect = Pick<DOMRectReadOnly, "top" | "bottom" | "left" | "right" | "width" | "height">;

/** Visible block geometry and the behavior of its child layout. */
export interface DropLayoutBlock {
  readonly id: string;
  readonly parentId: string | null;
  readonly row: DropRect;
  readonly rect: DropRect;
  readonly axis?: DropAxis;
  readonly fixed: boolean;
  readonly acceptsBody: boolean;
  readonly hasRenderedChildren?: boolean;
  readonly options?: BlockDropPlacementOptions;
}

/** Pointer policy, in viewport pixels. */
export interface DropLayoutOptions extends ResolvedDropPlacementOptions {
  readonly outerEdgeDropZone?: number;
  /** Keyboard stepping uses item halves instead of row-center nesting. */
  readonly keyboard?: boolean;
}

function contains(rect: DropRect, point: PointerCoordinates): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

/**
 * Walks owning child lists, never a global nearest-row list. A boundary carries
 * both neighbors from the moment it is selected, including through validation.
 */
export function resolveDropPlacement(
  measured: readonly DropLayoutBlock[],
  blocks: readonly DropBlock[],
  pointer: PointerCoordinates,
  defaults: DropLayoutOptions,
  accepts: (destination: CanonicalDropPlacement) => boolean,
): DropPlacement | null {
  const byId = new Map(measured.map((block) => [block.id, block]));
  const children = new Map<string | null, DropLayoutBlock[]>();
  const depths = new Map<string, number>();
  const visit = (list: readonly DropBlock[], parentId: string | null, depth: number): void => {
    const visible = list.flatMap((block) => {
      const item = byId.get(block.id);
      if (!item) return [];
      depths.set(item.id, depth);
      visit(block.children, block.id, depth + 1);
      return [item];
    });
    children.set(parentId, visible);
  };
  visit(blocks, null, 0);
  const visibleTree = (parentId: string | null): DropBlock[] => (children.get(parentId) ?? [])
    .map(({ id }) => ({ id, children: visibleTree(id) }));
  const outlineBlocks = visibleTree(null);
  const options = (item?: DropLayoutBlock): ResolvedDropPlacementOptions => resolveBlockDropPlacementOptions(
    defaults.childDropIndent, defaults.gapDropZone, item?.options, defaults.allowChildPlacement,
  );
  // When all children are being moved, an ordinary parent's exposed boundary
  // is its row. Container bodies keep their explicit empty-field geometry.
  const bounds = (item: DropLayoutBlock): DropRect =>
    !item.acceptsBody && !item.fixed && item.hasRenderedChildren && !children.get(item.id)?.length ? item.row : item.rect;
  const finish = (destination: CanonicalDropPlacement): DropPlacement | null => {
    if (!accepts(destination)) return null;
    const indicatorId = destination.kind === "inside"
      ? destination.parentId
      : destination.nextId ?? destination.previousId ?? destination.parentId;
    return indicatorId ? { ...destination, indicatorId } : null;
  };
  const inside = (item: DropLayoutBlock): DropPlacement | null => options(item).allowChildPlacement
    ? finish({ kind: "inside", parentId: item.id }) : null;

  const gap = (
    parent: DropLayoutBlock | undefined,
    index: number,
    outline = false,
    boundaryAxis: "horizontal" | "vertical" = "horizontal",
  ): DropPlacement | null => {
    const list = children.get(parent?.id ?? null) ?? [];
    const previous = list[index - 1];
    const next = list[index];
    let destination: CanonicalDropPlacement = {
      kind: "between", parentId: parent?.id ?? null,
      previousId: previous?.id ?? null, nextId: next?.id ?? null,
      depth: parent ? (depths.get(parent.id) ?? 0) + 1 : 0,
    };
    if (outline && previous && !previous.acceptsBody && !previous.fixed && !next?.acceptsBody && !next?.fixed && !parent?.fixed) {
      let last = previous;
      while (children.get(last.id)?.length && !last.fixed && !last.acceptsBody) {
        last = children.get(last.id)!.at(-1)!;
      }
      const offset = Math.floor((pointer.x - last.row.left) / options(parent).childDropIndent);
      const projected = resolveAfterDropPlacement(outlineBlocks, last.id, offset);
      // A child layout is an explicit floor. Outdenting must not cross it.
      let boundary = parent;
      while (boundary && !boundary.acceptsBody && !boundary.fixed) {
        boundary = boundary.parentId ? byId.get(boundary.parentId) : undefined;
      }
      const floor = boundary ? (depths.get(boundary.id) ?? 0) + 1 : 0;
      const mayNest = options(parent).allowChildPlacement && options(last).allowChildPlacement;
      if (projected && projected.depth >= floor && (mayNest || projected.depth <= (depths.get(last.id) ?? 0))) {
        destination = projected;
      }
    }
    const owner = destination.parentId ? byId.get(destination.parentId) : undefined;
    const axis = owner?.axis ?? "vertical";
    const result = finish(destination);
    if (!result || destination.kind !== "between") return result;
    const before = destination.previousId ? byId.get(destination.previousId) : undefined;
    const after = destination.nextId ? byId.get(destination.nextId) : undefined;
    const a = before ? bounds(before) : undefined;
    const b = after ? bounds(after) : undefined;
    const horizontal = axis === "horizontal" || (axis === "grid" && (a && b
      ? Math.max(a.top, b.top) < Math.min(a.bottom, b.bottom)
      : boundaryAxis === "vertical"));
    const ownerRect = owner ? bounds(owner) : undefined;
    const anchor = b ?? a ?? ownerRect;
    if (!anchor) return result;
    const start = horizontal ? a?.right : a?.bottom;
    const end = horizontal ? b?.left : b?.top;
    const cursor = horizontal ? pointer.x : pointer.y;
    const coordinate = start !== undefined && end !== undefined
      ? end - start <= defaults.childDropIndent ? (start + end) / 2
        : Math.abs(cursor - start) <= Math.abs(cursor - end) ? start : end
      : start ?? end ?? anchor.bottom;
    const emptyChildren = !before && !after && owner;
    const indent = emptyChildren ? options(owner).childDropIndent : 0;
    return {
      ...result,
      indicatorId: before && start === coordinate ? before.id : result.indicatorId,
      line: horizontal
        ? { axis: "vertical", x: coordinate, y: anchor.top, length: anchor.height }
        : { axis: "horizontal", x: anchor.left + indent, y: coordinate, length: Math.max(0, anchor.width - indent) },
    };
  };

  const resolveList = (parent?: DropLayoutBlock): DropPlacement | null => {
    const list = children.get(parent?.id ?? null) ?? [];
    if (!list.length) return parent ? (parent.acceptsBody ? inside(parent) : null) : null;
    const axis = parent?.axis ?? "vertical";
    const horizontal = axis === "horizontal";
    const coordinate = horizontal ? pointer.x : pointer.y;
    const start = (item: DropLayoutBlock): number => horizontal ? bounds(item).left : bounds(item).top;
    const end = (item: DropLayoutBlock): number => horizontal ? bounds(item).right : bounds(item).bottom;
    const item = list.find((entry) => contains(bounds(entry), pointer));
    if (!item) {
      // Only direct-child gaps belong to this layout. Background never falls
      // through into a lane or a cell that the pointer did not enter.
      if (axis === "grid") {
        for (let index = 1; index < list.length; index++) {
          const a = bounds(list[index - 1]!);
          const b = bounds(list[index]!);
          const sameRow = Math.max(a.top, b.top) < Math.min(a.bottom, b.bottom);
          const inGap = sameRow
            ? pointer.x >= a.right && pointer.x <= b.left
              && pointer.y >= Math.max(a.top, b.top) && pointer.y <= Math.min(a.bottom, b.bottom)
            : pointer.y >= a.bottom && pointer.y <= b.top;
          if (inGap) return gap(parent, index);
        }
        const rim = options(parent).gapDropZone;
        for (let index = 0; index < list.length; index++) {
          const rect = bounds(list[index]!);
          if (pointer.x >= rect.left && pointer.x <= rect.right) {
            if (pointer.y >= rect.bottom && pointer.y <= rect.bottom + rim) return gap(parent, index + 1);
            if (pointer.y <= rect.top && pointer.y >= rect.top - rim) return gap(parent, index);
          }
          if (pointer.y >= rect.top && pointer.y <= rect.bottom) {
            if (pointer.x >= rect.right && pointer.x <= rect.right + rim) return gap(parent, index + 1, false, "vertical");
            if (pointer.x <= rect.left && pointer.x >= rect.left - rim) return gap(parent, index, false, "vertical");
          }
        }
        return parent?.acceptsBody ? inside(parent) : null;
      }
      const index = list.findIndex((entry) => coordinate < start(entry));
      const insertion = index < 0 ? list.length : index;
      const previous = list[insertion - 1];
      const next = list[insertion];
      const across = horizontal
        ? list.some((entry) => pointer.y >= bounds(entry).top && pointer.y <= bounds(entry).bottom)
        : true;
      if (across && previous && next && coordinate >= end(previous)) return gap(parent, insertion, axis === "vertical");
      if (!parent) return gap(parent, insertion, true);
      const distance = Math.min(previous ? Math.abs(coordinate - end(previous)) : Infinity, next ? Math.abs(start(next) - coordinate) : Infinity);
      if (across && distance <= options(parent).gapDropZone) return gap(parent, insertion, !parent.fixed);
      return parent.acceptsBody ? inside(parent) : null;
    }
    const index = list.indexOf(item);
    const rect = bounds(item);
    const size = horizontal ? rect.width : rect.height;
    const edge = Math.min(item.acceptsBody || item.fixed ? defaults.outerEdgeDropZone ?? 8 : options(parent).gapDropZone, size / 3);
    const before = coordinate <= start(item) + edge;
    const after = coordinate >= end(item) - edge;
    if (before || after) {
      const boundary = gap(parent, index + (after ? 1 : 0), !item.acceptsBody && !item.fixed && axis === "vertical");
      if (boundary) return boundary;
    }
    if (axis === "grid") {
      const xEdge = Math.min(options(parent).gapDropZone, rect.width / 4);
      if (pointer.x <= rect.left + xEdge || pointer.x >= rect.right - xEdge) {
        return gap(parent, index + (pointer.x >= rect.right - xEdge ? 1 : 0), false, "vertical");
      }
    }
    // A shell that cannot enter this item can still sort in its owning list.
    // This is destination acceptance, not a comparison of the source's axis.
    const sortsShell = parent?.fixed && axis !== "grid" && !accepts({ kind: "inside", parentId: item.id });
    if (defaults.keyboard || sortsShell) {
      const boundary = gap(parent, index + (coordinate >= (start(item) + end(item)) / 2 ? 1 : 0));
      if (boundary) return boundary;
    }
    if (contains(item.row, pointer)) {
      if (item.fixed) return gap(parent, index + (pointer.y >= item.row.top + item.row.height / 2 ? 1 : 0));
      const rowEdge = Math.min(options(parent).gapDropZone, item.row.height / 3);
      if (pointer.y < item.row.top + rowEdge) return gap(parent, index, true);
      if (pointer.y > item.row.bottom - rowEdge) {
        return children.get(item.id)?.length ? gap(item, 0) : gap(parent, index + 1, true);
      }
      if (!options(parent).allowChildPlacement || !options(item).allowChildPlacement) {
        return gap(parent, index + (pointer.y >= item.row.top + item.row.height / 2 ? 1 : 0));
      }
      return inside(item);
    }
    if (axis === "grid" && !children.get(item.id)?.length) return inside(item);
    return resolveList(item);
  };
  return resolveList();
}
