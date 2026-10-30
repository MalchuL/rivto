import type { Locator } from "@playwright/test";

/** Physical test area measured from existing layout rather than generated hitbox DOM. */
export interface DropRegionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** Existing anchor with live physical edge geometry. */
export interface DropRegion {
  /**
   * Reads the current edge after layout/scroll changes.
   *
   * @returns Viewport rectangle whose center exercises the declared action.
   */
  boundingBox(): Promise<DropRegionBox>;
  /**
   * Scrolls the real anchor into view.
   *
   * @returns Resolves after scrolling settles.
   */
  scrollIntoViewIfNeeded(): Promise<void>;
}

/**
 * Derives a gesture point from existing block geometry, independently of target registration.
 *
 * @param block - Existing block shell or its row descendant.
 * @param position - Sibling boundary or explicit append area to exercise.
 * @returns Live geometry without requiring any dedicated drop-region element.
 */
export async function blockDropRegion(
  block: Locator,
  position: "before" | "after" | "inside",
): Promise<DropRegion> {
  const shell = block.locator("xpath=ancestor-or-self::*[@data-block-id][1]");
  return {
    /**
     * Makes the existing shell visible for the next measurement.
     *
     * @returns Resolves when scrolling finishes.
     */
    scrollIntoViewIfNeeded: () => shell.scrollIntoViewIfNeeded(),
    /**
     * Measures the existing layout without consulting the editor's target resolver.
     *
     * @returns A physical edge or background hit area.
     */
    boundingBox: () =>
      shell.evaluate((node, position) => {
        const element = node as HTMLElement;
        const wrapper = element.closest<HTMLElement>(".rivto-block-drop-wrapper");
        const item = wrapper?.dataset.blockItemId === element.dataset.blockId ? wrapper : null;
        const layout = element.parentElement?.closest<HTMLElement>("[data-block-drop-axis]");
        const rect = (item ?? element).getBoundingClientRect();
        if (position === "inside") {
          const children = element.querySelector<HTMLElement>(":scope > .rivto-block-children");
          if (children) {
            const bounds = children.getBoundingClientRect();
            for (const [x, y] of [
              [bounds.left + 2, bounds.top + 2],
              [bounds.left + 2, bounds.bottom - 2],
              [bounds.right - 2, bounds.bottom - 2],
            ]) {
              if (document.elementFromPoint(x, y) === children) {
                return { x: x - 1, y: y - 1, width: 2, height: 2 };
              }
            }
          }
          const content = item?.querySelector<HTMLElement>(
            ":scope > .rivto-block-drop-wrapper-content",
          );
          const bounds = content?.getBoundingClientRect() ?? rect;
          return {
            x: bounds.left + bounds.width * 0.75,
            y: bounds.bottom - 3,
            width: 2,
            height: 2,
          };
        }
        if (layout?.dataset.blockDropAxis === "horizontal") {
          const end = (position === "after") !== (getComputedStyle(element).direction === "rtl");
          return {
            x: end ? rect.right - 4 : rect.left + 2,
            y: rect.top + rect.height / 2,
            width: 2,
            height: 2,
          };
        }
        return {
          x: rect.left + 3,
          y: position === "after" ? rect.bottom - 4 : rect.top + 2,
          width: 2,
          height: 2,
        };
      }, position),
  };
}
