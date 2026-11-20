import { expect, test } from "@playwright/test";
import type { ReactEditor } from "@chulane/rivto-react";

/** Demo runtime used to observe event routing in the production editor. */
interface DemoWindow extends Window {
  readonly __rivtoDemo: { readonly reactEditor: ReactEditor };
}

test("routes each dispatch of a reused pointer event to its gesture's panel", async ({ page }) => {
  await page.goto("/");
  const surfaces = page.locator(".page-surface");
  await expect(surfaces).toHaveCount(3);
  const result = await page.evaluate(() => {
    const roots = [...document.querySelectorAll(".page-surface")];
    const first = roots[0];
    const second = roots[1];
    if (!first || !second) {
      throw new Error("Expected two mounted Page occurrences");
    }
    const editor = (window as unknown as DemoWindow).__rivtoDemo.reactEditor;
    const downs: unknown[] = [];
    const moves: unknown[] = [];
    const releaseDown = editor.events.register(
      { id: "test.pointer-down", type: "pointerdown" },
      (event) => {
        downs.push(event.reactPanel);
      },
    );
    const releaseMove = editor.events.register(
      { id: "test.pointer-move", type: "pointermove", target: "window" },
      (event) => {
        moves.push(event.reactPanel);
      },
    );
    /**
     * Dispatches one gesture phase for the fixture's primary pointer.
     *
     * @param target - Occurrence receiving the synthetic pointer phase.
     * @param type - Pointer phase to deliver.
     * @returns The browser has synchronously delivered the phase.
     */
    const dispatch = (target: Element, type: "pointerdown" | "pointerup") => {
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 23,
          pointerType: "mouse",
          isPrimary: true,
        }),
      );
    };
    try {
      const move = new PointerEvent("pointermove", {
        bubbles: true,
        pointerId: 23,
        pointerType: "mouse",
        isPrimary: true,
      });
      dispatch(first, "pointerdown");
      second.dispatchEvent(move);
      dispatch(second, "pointerup");
      dispatch(second, "pointerdown");
      second.dispatchEvent(move);
      dispatch(second, "pointerup");
      return {
        downCount: downs.length,
        moveCount: moves.length,
        distinct: downs[0] !== downs[1],
        firstMatches: moves[0] === downs[0],
        secondMatches: moves[1] === downs[1],
      };
    } finally {
      releaseMove();
      releaseDown();
    }
  });
  expect(result).toEqual({
    downCount: 2,
    moveCount: 2,
    distinct: true,
    firstMatches: true,
    secondMatches: true,
  });
});
