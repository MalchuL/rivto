import type { InputRegion, InputRoot, RegionBounds } from "@chulane/rivto-root";
import { BLOCK_EDITOR_CLASSES } from "../../presentation/block-editor-classes";
import type { BlockLayoutRegions } from "../../presentation/components/block-layout/block-layout-regions";
import type { BlockSelectionHitTest } from "./types";

const BLOCK_ID_SELECTOR = "[data-block-id]";
const BLOCK_ID_ATTRIBUTE = "data-block-id";
const PANEL_SELECTOR = "[data-rivto-block-editor]";
const OWNER_BOUNDARIES = `${BLOCK_ID_SELECTOR}, ${PANEL_SELECTOR}`;

/** Occurrence-bound hit testing for structural selection. */
export class BlockPointerHitTest implements BlockSelectionHitTest {
  /**
   * Borrows point and layout capabilities for one mounted occurrence.
   *
   * @param root - Root capturing point hits and registered region identities.
   * @param regions - Layout registry resolving explicitly registered owner regions.
   */
  constructor(
    private readonly root: Pick<InputRoot, "capturePoint" | "captureRegionByIdentity">,
    private readonly regions: Pick<BlockLayoutRegions, "getRegionIdentity">,
  ) {}

  /**
   * Resolves the visible block container directly beneath viewport coordinates.
   *
   * Unlike text endpoint hit testing, this helper does not require editable
   * content. It therefore resolves contentless custom blocks such as Counter,
   * which still participate in structural pointer selection.
   *
   * The closest block is used because nested surfaces render one BlockView inside
   * another. A pointer over a child control must select that child, not its parent.
   *
   * Nested parents also wrap descendant geometry: vertical sibling margins and
   * the indent gutter are still inside the parent BlockView. Browser hit testing
   * therefore reports the parent when the pointer is only between nested rows.
   * That hit is valid CSS, but whole-block drags would then promote the parent
   * and cover its entire subtree. Hits outside the parent's own row snap to the
   * nearest nested row instead, so the parent joins the range only when the
   * pointer enters its content or chrome. Registered body slots also belong to
   * the block itself, rather than its ordinary outline descendants. Hits inside
   * another nested panel resolve to the enclosing block in this surface, keeping
   * the originating selection gesture within its own document occurrence.
   *
   * @param x - Horizontal viewport coordinate from a pointer event.
   * @param y - Vertical viewport coordinate from a pointer event.
   * @returns Stable block ID under the pointer, or undefined outside a block.
   * @throws Propagates browser hit testing, region lookup, and measurement failures.
   */
  readBlockIdAtPoint(x: number, y: number): string | undefined {
    const hit = this.root.capturePoint({
      x,
      y,
      ownerSelector: BLOCK_ID_SELECTOR,
      boundarySelector: PANEL_SELECTOR,
    });
    if (!hit) {
      return undefined;
    }
    const row = this.ownedRegion(hit.owner, "row");
    // Keep the closest block when the pointer is in its own row, or when a
    // custom shell has no row to distinguish wrapping descendants from chrome.
    // Body slots belong to that block even when it also has outline children.
    const body = this.ownedRegion(hit.owner, "body");
    if (row && !row.containsRegion(hit.target) && !body?.containsRegion(hit.target)) {
      const nested = this.nearestNestedBlock(hit.owner, x, y);
      if (nested) {
        return nested;
      }
    }
    return hit.owner.readAttribute(BLOCK_ID_ATTRIBUTE);
  }

  /**
   * Resolves a BlockView's own row or body without borrowing descendant regions.
   *
   * Registered owners use their exact layout registration, including custom
   * regions without standard markers. Unregistered shells use bounded traversal
   * through layout wrappers and stop at child blocks and nested occurrences.
   *
   * @param owner - Captured BlockView region.
   * @param role - Requested row or body region.
   * @returns The owned region, or undefined when a custom shell omitted it.
   * @throws Propagates region identity, selector, and ownership failures.
   */
  private ownedRegion(owner: InputRegion, role: "row" | "body"): InputRegion | undefined {
    const identity = owner.getIdentity();
    if (!identity) {
      return undefined;
    }
    const registered = this.regions.getRegionIdentity(owner, role, this.root);
    if (registered.registered) {
      return registered.identity
        ? this.root.captureRegionByIdentity(registered.identity)
        : undefined;
    }
    const selector =
      role === "row" ? `.${BLOCK_EDITOR_CLASSES.row}` : '[data-slot-position="body"]';
    return owner.findOwnedRegion(selector, OWNER_BOUNDARIES);
  }

  /**
   * Finds the nested BlockView whose own row is closest to a wrapping-parent hit.
   *
   * Distances use each descendant's row box, not the full BlockView. Parent
   * BlockViews include nested children in their bounding rect, so measuring the
   * wrapper would keep selecting the same parent we are trying to skip.
   *
   * @param parent - Closest BlockView that wrapped the pointer without owning the hit.
   * @param x - Horizontal viewport coordinate from a pointer event.
   * @param y - Vertical viewport coordinate from a pointer event.
   * @returns Nearest nested BlockView ID, or undefined when none have a row.
   * @throws Propagates region lookup and measurement failures.
   */
  private nearestNestedBlock(parent: InputRegion, x: number, y: number): string | undefined {
    let nearest: string | undefined;
    let nearestDistance = Infinity;
    for (const candidate of parent.findRegions(BLOCK_ID_SELECTOR, PANEL_SELECTOR)) {
      const id = candidate.readAttribute(BLOCK_ID_ATTRIBUTE);
      const rect = this.ownedRegion(candidate, "row")?.readBounds();
      if (!id || !rect) {
        continue;
      }
      const distance = this.distanceToRect(rect, x, y);
      if (distance < nearestDistance) {
        nearest = id;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  /**
   * Computes Euclidean distance from a viewport point to the nearest point inside a rectangle.
   *
   * Distance is zero when the point is already inside the rectangle.
   *
   * @param rect - Detached element bounds in viewport coordinates.
   * @param x - Client X in CSS pixels.
   * @param y - Client Y in CSS pixels.
   * @returns Distance in CSS pixels.
   */
  private distanceToRect(rect: RegionBounds, x: number, y: number): number {
    const dx = Math.max(rect.left - x, 0, x - rect.left - rect.width);
    const dy = Math.max(rect.top - y, 0, y - rect.top - rect.height);
    return Math.hypot(dx, dy);
  }
}
