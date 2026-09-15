/** Collision detection configuration shared by page drag provider and surface target. */
import { closestCenter, type CollisionDetection } from "@dnd-kit/core";

export const PAGE_DRAG_SURFACE_ID = "rivto-page-drag-surface";

/** Uses all row rectangles for keyboard movement and one surface target for pointers. */
export const pageDragCollisionDetection: CollisionDetection = (params) => {
  const blockTargets = params.droppableContainers.filter(({ id }) => id !== PAGE_DRAG_SURFACE_ID);
  return closestCenter({
    ...params,
    droppableContainers: blockTargets.length ? blockTargets : params.droppableContainers,
  });
};
