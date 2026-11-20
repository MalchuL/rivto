import { CanvasMarquee } from "@chulane/rivto-edgeless";
import type { InputRoot } from "@chulane/rivto-root";
import type { CanvasApi } from "@chulane/rivto-edgeless";
import type { ReactPanelApi } from "../../../panels/types";
import type { EdgelessSelectionRuntime } from "../../built-ins/selection/edgeless-runtime";
import { groupParentByChild, outermostGroupId } from "../edgeless-geometry";

const RECTANGLE_CLASS = "edgeless-selection-rectangle";

/**
 * Creates the browser-owned marquee for one mounted canvas occurrence.
 *
 * The returned marquee owns its rectangle; the caller must destroy it. Geometry
 * and host group ownership are captured only when a gesture crosses slop.
 *
 * @param root - Mounted occurrence providing an overlay and its viewport region.
 * @param elements - Borrowed host group records.
 * @param selection - Borrowed selection publication capability.
 * @param canvas - Surface-owned geometry and coordinate conversion, when available.
 * @returns Marquee that owns its rectangle and borrows selection and scene data.
 * @throws If the occurrence is inactive or rectangle creation fails.
 */
export function createEdgelessMarquee(
  root: Pick<
    InputRoot,
    "isAttached" | "getElementIdentity" | "captureRegionByIdentity" | "createRectangleOverlay"
  >,
  elements: Pick<ReactPanelApi["elements"], "getElementNodes">,
  selection: Pick<EdgelessSelectionRuntime, "set">,
  canvas?: Pick<CanvasApi, "getElements" | "toViewport"> | null,
): CanvasMarquee {
  const identity = root.getElementIdentity?.();
  const region = identity && root.captureRegionByIdentity(identity);
  if (!region || !root.isAttached()) {
    throw new Error("Cannot create a marquee for an inactive input root");
  }
  const rectangle = root.createRectangleOverlay({
    className: RECTANGLE_CLASS,
    attributes: { "data-edgeless-selection-rectangle": "true" },
  });
  return new CanvasMarquee(rectangle, {
    /**
     * Captures canvas bounds and lifts child hits to their persisted outermost group.
     *
     * @returns Host selection identities paired with each child's captured bounds.
     * @throws Propagates host group and canvas geometry failures.
     */
    capture: () => {
      if (!canvas) {
        return [];
      }
      const parents = groupParentByChild(elements.getElementNodes());
      return CanvasMarquee.snapshot(region, canvas)?.map((hit) => ({
        ...hit,
        id: outermostGroupId(hit.id, parents),
      }));
    },
    /**
     * Commits marquee identities to the panel's authoritative selection.
     *
     * @param ids - Distinct base and intersecting object identities.
     * @returns Host selection and its observers reflect this pointer sample.
     * @throws Propagates host selection failures.
     */
    select: (ids) => selection.set(ids),
  });
}
